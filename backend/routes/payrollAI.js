/**
 * AI Payroll Assistant
 *
 * HR describes changes in natural language, AI analyzes and shows calculations.
 * HR can approve to apply changes or request modifications.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * POST /api/payroll/ai/analyze
 * Analyze HR's natural language request and show proposed changes
 * Enhanced: Supports individual changes, bulk changes with conditions (proration), and editable preview
 */
router.post('/analyze', authenticateAdmin, async (req, res) => {
  try {
    const { run_id, instruction, conversation = [] } = req.body;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!run_id || !instruction) {
      return res.status(400).json({ error: 'run_id and instruction are required' });
    }

    // Get current payroll run with items
    const runResult = await pool.query(`
      SELECT pr.*, d.name as department_name
      FROM payroll_runs pr
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE pr.id = $1 AND pr.company_id = $2
    `, [run_id, companyId]);

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];

    if (run.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot modify finalized payroll' });
    }

    // Get current items WITH join_date for proration calculation
    const itemsResult = await pool.query(`
      SELECT pi.*, e.name as employee_name, e.employee_id as emp_code,
             e.join_date, e.position, d.name as department_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.payroll_run_id = $1
      ORDER BY e.name
    `, [run_id]);

    const currentItems = itemsResult.rows;

    // Calculate employment months for each employee (for proration)
    const payrollDate = new Date(run.year, run.month - 1, 1);

    // Get previous month payroll for comparison
    let prevMonth = run.month - 1;
    let prevYear = run.year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }

    const prevRunResult = await pool.query(`
      SELECT pi.employee_id, pi.basic_salary, pi.fixed_allowance, pi.ot_amount,
             pi.commission_amount, pi.gross_salary, pi.net_pay
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
        AND (pr.department_id = $4 OR ($4 IS NULL AND pr.department_id IS NULL))
    `, [companyId, prevMonth, prevYear, run.department_id]);

    // Build simplified context for AI (faster processing)
    const payrollContext = currentItems.map(item => {
      const joinDate = item.join_date ? new Date(item.join_date) : null;
      let monthsEmployed = null;

      if (joinDate) {
        const diffMs = payrollDate - joinDate;
        monthsEmployed = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
      }

      return {
        id: item.id,
        name: item.employee_name,
        dept: item.department_name,
        months: monthsEmployed,
        basic: parseFloat(item.basic_salary) || 0,
        allowance: parseFloat(item.fixed_allowance) || 0,
        bonus: parseFloat(item.bonus) || 0,
        commission: parseFloat(item.commission_amount) || 0,
        gross: parseFloat(item.gross_salary) || 0,
        net: parseFloat(item.net_pay) || 0
      };
    });

    // Call Claude AI to analyze the instruction (simplified prompt for speed)
    const systemPrompt = `Payroll AI. Return JSON only.
Data fields: id, name, dept, months (employment), basic, allowance, bonus, commission, gross, net.
Field mapping for changes (MUST use these exact field names):
  basic → basic_salary, allowance → fixed_allowance, bonus → bonus, commission → commission_amount
Also editable: incentive_amount, other_deductions.
Proration: bonus × (months/12) if <12 months.
IMPORTANT: Only include employees that need changes. Skip employees already at target value.

JSON format:
{"understood":true,"summary":"...","changes":[{"item_id":1,"employee_name":"X","field":"basic_salary","current_value":1800,"new_value":2000,"reason":"..."}],"impact":{"total_additional_cost":0,"affected_employees":0}}`;

    const userMessage = `Payroll ${run.month}/${run.year}: ${JSON.stringify(payrollContext)}
Instruction: "${instruction}"`;

    // Build messages with conversation history
    const messages = [];
    for (const msg of conversation) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: userMessage });

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1500,
      messages: messages,
      system: systemPrompt
    });

    // Parse AI response
    let aiResponse;
    try {
      const responseText = response.content[0].text;
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
                        responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText;
      aiResponse = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      return res.status(500).json({
        error: 'AI response parsing failed',
        raw_response: response.content[0].text
      });
    }

    // If AI understood, calculate detailed impact with full breakdown
    if (aiResponse.understood && aiResponse.changes && aiResponse.changes.length > 0) {
      // Calculate preview of changes with full calculation breakdown
      const preview = aiResponse.changes.map(change => {
        const item = currentItems.find(i => i.id === change.item_id);
        if (!item) return null;

        const currentNet = parseFloat(item.net_pay) || 0;
        const currentGross = parseFloat(item.gross_salary) || 0;
        const currentValue = parseFloat(change.current_value) || 0;
        const newValue = parseFloat(change.new_value) || 0;
        const diff = newValue - currentValue;

        // Calculate estimated new gross and net
        let estimatedNewGross = currentGross;
        let estimatedNewNet = currentNet;

        if (['basic_salary', 'bonus', 'commission_amount', 'fixed_allowance', 'incentive_amount'].includes(change.field)) {
          // These add to gross (and net minus statutory ~20%)
          estimatedNewGross = currentGross + diff;
          estimatedNewNet = currentNet + (diff * 0.8);
        } else if (change.field === 'other_deductions') {
          // Deductions reduce net but not gross
          estimatedNewNet = currentNet - diff;
        }

        // Get join date and employment duration
        const joinDate = item.join_date ? new Date(item.join_date).toISOString().split('T')[0] : null;
        const ctx = payrollContext.find(p => p.id === item.id);

        return {
          ...change,
          employee_id: item.employee_id,
          department: item.department_name,
          position: item.position,
          join_date: joinDate,
          months_employed: ctx?.months_employed,
          years_employed: ctx?.years_employed,
          current_gross: currentGross,
          current_net: currentNet,
          estimated_new_gross: Math.round(estimatedNewGross * 100) / 100,
          estimated_new_net: Math.round(estimatedNewNet * 100) / 100,
          gross_difference: Math.round((estimatedNewGross - currentGross) * 100) / 100,
          net_difference: Math.round((estimatedNewNet - currentNet) * 100) / 100,
          editable: true // Flag that this change can be edited
        };
      }).filter(Boolean);

      aiResponse.preview = preview;

      // Calculate totals
      const totalGrossIncrease = preview.reduce((sum, p) => sum + (p.gross_difference || 0), 0);
      const totalNetIncrease = preview.reduce((sum, p) => sum + (p.net_difference || 0), 0);

      aiResponse.impact = {
        ...aiResponse.impact,
        total_gross_increase: Math.round(totalGrossIncrease * 100) / 100,
        total_net_increase: Math.round(totalNetIncrease * 100) / 100,
        affected_employees: preview.length
      };
    }

    res.json({
      run_id,
      instruction,
      analysis: aiResponse,
      current_totals: {
        gross: run.total_gross,
        net: run.total_net,
        employee_count: currentItems.length
      },
      needs_confirmation: true // Always require confirmation for changes
    });

  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({ error: 'AI analysis failed: ' + error.message });
  }
});

/**
 * POST /api/payroll/ai/apply
 * Apply the AI-suggested changes after HR approval
 * Enhanced: Full recalculation of statutory deductions, better result tracking
 */
router.post('/apply', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const { run_id, changes } = req.body;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!run_id || !changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'run_id and changes array required' });
    }

    // Verify run exists and is draft
    const runResult = await client.query(
      'SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2',
      [run_id, companyId]
    );

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];

    if (run.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot modify finalized payroll' });
    }

    // Get company settings for statutory calculation
    const settingsResult = await client.query(
      'SELECT payroll_settings FROM companies WHERE id = $1',
      [companyId]
    );
    const companySettings = settingsResult.rows[0]?.payroll_settings || {};
    const statutory = {
      epf_enabled: true,
      socso_enabled: true,
      eis_enabled: true,
      pcb_enabled: true,
      statutory_on_ot: false,
      statutory_on_ph_pay: false,
      statutory_on_allowance: false,
      statutory_on_incentive: false,
      ...companySettings.statutory
    };

    await client.query('BEGIN');

    const results = [];
    const appliedChanges = [];

    for (const change of changes) {
      const { item_id, field, new_value, employee_name } = change;

      // Validate field is allowed
      const allowedFields = ['basic_salary', 'fixed_allowance', 'bonus', 'commission_amount',
                            'incentive_amount', 'other_deductions', 'deduction_remarks',
                            'trade_commission_amount', 'outstation_amount', 'pcb'];

      if (!allowedFields.includes(field)) {
        results.push({ item_id, employee_name, success: false, error: `Field ${field} not allowed` });
        continue;
      }

      // Update the item
      try {
        await client.query(
          `UPDATE payroll_items SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
          [new_value, item_id]
        );
        results.push({ item_id, employee_name, success: true, field, new_value });
        appliedChanges.push({ item_id, field, new_value });
      } catch (e) {
        results.push({ item_id, employee_name, success: false, error: e.message });
      }
    }

    // Recalculate all modified items with full statutory recalculation
    const itemIds = [...new Set(changes.map(c => c.item_id))];

    // Track items with explicit PCB overrides (don't recalculate PCB for these)
    const pcbOverrides = {};
    changes.filter(c => c.field === 'pcb').forEach(c => {
      pcbOverrides[c.item_id] = parseFloat(c.new_value) || 0;
    });

    for (const itemId of itemIds) {
      // Get item data with employee info for statutory calculation
      const itemData = await client.query(`
        SELECT pi.*, pr.month, pr.year,
               e.ic_number, e.date_of_birth, e.marital_status, e.spouse_working, e.children_count
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        JOIN employees e ON pi.employee_id = e.id
        WHERE pi.id = $1
      `, [itemId]);

      if (itemData.rows.length === 0) continue;

      const item = itemData.rows[0];

      // Get all earnings
      const basicSalary = parseFloat(item.basic_salary) || 0;
      const fixedAllowance = parseFloat(item.fixed_allowance) || 0;
      const otAmount = parseFloat(item.ot_amount) || 0;
      const phPay = parseFloat(item.ph_pay) || 0;
      const incentiveAmount = parseFloat(item.incentive_amount) || 0;
      const commissionAmount = parseFloat(item.commission_amount) || 0;
      const tradeCommission = parseFloat(item.trade_commission_amount) || 0;
      const outstationAmount = parseFloat(item.outstation_amount) || 0;
      const bonus = parseFloat(item.bonus) || 0;
      const claimsAmount = parseFloat(item.claims_amount) || 0;
      const unpaidDeduction = parseFloat(item.unpaid_leave_deduction) || 0;
      const advanceDeduction = parseFloat(item.advance_deduction) || 0;
      const otherDeductions = parseFloat(item.other_deductions) || 0;

      // Calculate gross salary
      const grossSalary = basicSalary + fixedAllowance + otAmount + phPay + incentiveAmount +
                          commissionAmount + tradeCommission + outstationAmount + bonus + claimsAmount - unpaidDeduction;

      // Calculate statutory base
      let statutoryBase = basicSalary + commissionAmount + tradeCommission + bonus;
      if (statutory.statutory_on_ot) statutoryBase += otAmount;
      if (statutory.statutory_on_ph_pay) statutoryBase += phPay;
      if (statutory.statutory_on_allowance) statutoryBase += fixedAllowance;
      if (statutory.statutory_on_incentive) statutoryBase += incentiveAmount;

      // Recalculate statutory deductions
      const { calculateAllStatutory } = require('../utils/statutory');
      const statutoryResult = calculateAllStatutory(statutoryBase, item, item.month, null);

      const epfEmployee = statutory.epf_enabled ? statutoryResult.epf.employee : 0;
      const epfEmployer = statutory.epf_enabled ? statutoryResult.epf.employer : 0;
      const socsoEmployee = statutory.socso_enabled ? statutoryResult.socso.employee : 0;
      const socsoEmployer = statutory.socso_enabled ? statutoryResult.socso.employer : 0;
      const eisEmployee = statutory.eis_enabled ? statutoryResult.eis.employee : 0;
      const eisEmployer = statutory.eis_enabled ? statutoryResult.eis.employer : 0;

      // Use PCB override if explicitly set, otherwise use calculated
      const pcb = pcbOverrides[itemId] !== undefined
        ? pcbOverrides[itemId]
        : (statutory.pcb_enabled ? statutoryResult.pcb : 0);

      const totalDeductions = unpaidDeduction + epfEmployee + socsoEmployee + eisEmployee + pcb + advanceDeduction + otherDeductions;
      const netPay = grossSalary + unpaidDeduction - totalDeductions;
      const employerCost = grossSalary + epfEmployer + socsoEmployer + eisEmployer;

      await client.query(`
        UPDATE payroll_items SET
          gross_salary = $1, statutory_base = $2,
          epf_employee = $3, epf_employer = $4,
          socso_employee = $5, socso_employer = $6,
          eis_employee = $7, eis_employer = $8,
          pcb = $9,
          total_deductions = $10, net_pay = $11, employer_total_cost = $12,
          updated_at = NOW()
        WHERE id = $13
      `, [grossSalary, statutoryBase, epfEmployee, epfEmployer, socsoEmployee, socsoEmployer,
          eisEmployee, eisEmployer, pcb, totalDeductions, netPay, employerCost, itemId]);
    }

    // Update run totals
    await client.query(`
      UPDATE payroll_runs SET
        total_gross = (SELECT COALESCE(SUM(gross_salary), 0) FROM payroll_items WHERE payroll_run_id = $1),
        total_net = (SELECT COALESCE(SUM(net_pay), 0) FROM payroll_items WHERE payroll_run_id = $1),
        total_deductions = (SELECT COALESCE(SUM(total_deductions), 0) FROM payroll_items WHERE payroll_run_id = $1),
        total_employer_cost = (SELECT COALESCE(SUM(employer_total_cost), 0) FROM payroll_items WHERE payroll_run_id = $1),
        updated_at = NOW()
      WHERE id = $1
    `, [run_id]);

    await client.query('COMMIT');

    // Log the AI payroll changes
    const successfulChanges = results.filter(r => r.success);
    if (successfulChanges.length > 0) {
      const changeCategories = [...new Set(successfulChanges.map(c => c.field))];
      const summary = successfulChanges.length === 1
        ? `Changed ${successfulChanges[0].field} for ${successfulChanges[0].employee_name}`
        : `Changed ${changeCategories.join(', ')} for ${successfulChanges.length} employees`;

      await pool.query(`
        INSERT INTO ai_change_logs (company_id, change_type, category, summary, changes, affected_employees, payroll_run_id, changed_by, changed_by_name)
        VALUES ($1, 'payroll', $2, $3, $4, $5, $6, $7, $8)
      `, [
        companyId,
        changeCategories.join(', '),
        summary,
        JSON.stringify(successfulChanges),
        successfulChanges.length,
        run_id,
        req.adminId,
        req.adminName || 'Admin'
      ]);
    }

    // Get updated run and items for display
    const updatedRun = await pool.query('SELECT * FROM payroll_runs WHERE id = $1', [run_id]);

    // Get updated items that were changed
    const updatedItems = await pool.query(`
      SELECT pi.*, e.name as employee_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.id = ANY($1)
    `, [itemIds]);

    res.json({
      success: true,
      message: `Applied ${results.filter(r => r.success).length} of ${changes.length} changes`,
      results,
      applied_changes: appliedChanges,
      updated_items: updatedItems.rows.map(item => ({
        id: item.id,
        employee_name: item.employee_name,
        basic_salary: parseFloat(item.basic_salary) || 0,
        bonus: parseFloat(item.bonus) || 0,
        gross_salary: parseFloat(item.gross_salary) || 0,
        epf_employee: parseFloat(item.epf_employee) || 0,
        socso_employee: parseFloat(item.socso_employee) || 0,
        eis_employee: parseFloat(item.eis_employee) || 0,
        pcb: parseFloat(item.pcb) || 0,
        total_deductions: parseFloat(item.total_deductions) || 0,
        net_pay: parseFloat(item.net_pay) || 0
      })),
      updated_totals: {
        gross: parseFloat(updatedRun.rows[0].total_gross) || 0,
        net: parseFloat(updatedRun.rows[0].total_net) || 0,
        deductions: parseFloat(updatedRun.rows[0].total_deductions) || 0,
        employer_cost: parseFloat(updatedRun.rows[0].total_employer_cost) || 0
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Apply changes error:', error);
    res.status(500).json({ error: 'Failed to apply changes: ' + error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/payroll/ai/preview-calculation
 * Preview calculation breakdown for a proposed change (without applying)
 */
router.post('/preview-calculation', authenticateAdmin, async (req, res) => {
  try {
    const { item_id, field, new_value } = req.body;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!item_id || !field || new_value === undefined) {
      return res.status(400).json({ error: 'item_id, field, and new_value are required' });
    }

    // Get current item
    const itemResult = await pool.query(`
      SELECT pi.*, pr.month, pr.year, pr.company_id, pr.status,
             e.name as employee_name, e.ic_number, e.date_of_birth,
             e.marital_status, e.spouse_working, e.children_count
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.id = $1
    `, [item_id]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll item not found' });
    }

    const item = itemResult.rows[0];

    if (item.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get company settings
    const settingsResult = await pool.query(
      'SELECT payroll_settings FROM companies WHERE id = $1',
      [companyId]
    );
    const companySettings = settingsResult.rows[0]?.payroll_settings || {};
    const statutory = {
      epf_enabled: true,
      socso_enabled: true,
      eis_enabled: true,
      pcb_enabled: true,
      statutory_on_ot: false,
      statutory_on_ph_pay: false,
      statutory_on_allowance: false,
      statutory_on_incentive: false,
      ...companySettings.statutory
    };

    // Create a copy with the proposed change
    const proposed = { ...item };
    proposed[field] = new_value;

    // Calculate current values
    const currentBasic = parseFloat(item.basic_salary) || 0;
    const currentAllowance = parseFloat(item.fixed_allowance) || 0;
    const currentOT = parseFloat(item.ot_amount) || 0;
    const currentPH = parseFloat(item.ph_pay) || 0;
    const currentIncentive = parseFloat(item.incentive_amount) || 0;
    const currentCommission = parseFloat(item.commission_amount) || 0;
    const currentTradeComm = parseFloat(item.trade_commission_amount) || 0;
    const currentOutstation = parseFloat(item.outstation_amount) || 0;
    const currentBonus = parseFloat(item.bonus) || 0;
    const currentClaims = parseFloat(item.claims_amount) || 0;
    const unpaidDeduction = parseFloat(item.unpaid_leave_deduction) || 0;
    const advanceDeduction = parseFloat(item.advance_deduction) || 0;
    const otherDeductions = parseFloat(item.other_deductions) || 0;

    // Calculate proposed values
    const proposedBasic = parseFloat(proposed.basic_salary) || 0;
    const proposedAllowance = parseFloat(proposed.fixed_allowance) || 0;
    const proposedOT = parseFloat(proposed.ot_amount) || 0;
    const proposedPH = parseFloat(proposed.ph_pay) || 0;
    const proposedIncentive = parseFloat(proposed.incentive_amount) || 0;
    const proposedCommission = parseFloat(proposed.commission_amount) || 0;
    const proposedTradeComm = parseFloat(proposed.trade_commission_amount) || 0;
    const proposedOutstation = parseFloat(proposed.outstation_amount) || 0;
    const proposedBonus = parseFloat(proposed.bonus) || 0;
    const proposedClaims = parseFloat(proposed.claims_amount) || 0;
    const proposedOther = parseFloat(proposed.other_deductions) || 0;

    // Calculate gross
    const currentGross = currentBasic + currentAllowance + currentOT + currentPH + currentIncentive +
                         currentCommission + currentTradeComm + currentOutstation + currentBonus + currentClaims - unpaidDeduction;

    const proposedGross = proposedBasic + proposedAllowance + proposedOT + proposedPH + proposedIncentive +
                          proposedCommission + proposedTradeComm + proposedOutstation + proposedBonus + proposedClaims - unpaidDeduction;

    // Calculate statutory base
    let currentStatBase = currentBasic + currentCommission + currentTradeComm + currentBonus;
    let proposedStatBase = proposedBasic + proposedCommission + proposedTradeComm + proposedBonus;

    if (statutory.statutory_on_ot) {
      currentStatBase += currentOT;
      proposedStatBase += proposedOT;
    }
    if (statutory.statutory_on_ph_pay) {
      currentStatBase += currentPH;
      proposedStatBase += proposedPH;
    }
    if (statutory.statutory_on_allowance) {
      currentStatBase += currentAllowance;
      proposedStatBase += proposedAllowance;
    }
    if (statutory.statutory_on_incentive) {
      currentStatBase += currentIncentive;
      proposedStatBase += proposedIncentive;
    }

    // Calculate statutory deductions
    const { calculateAllStatutory } = require('../utils/statutory');
    const currentStat = calculateAllStatutory(currentStatBase, item, item.month, null);
    const proposedStat = calculateAllStatutory(proposedStatBase, item, item.month, null);

    const currentEPF = statutory.epf_enabled ? currentStat.epf.employee : 0;
    const proposedEPF = statutory.epf_enabled ? proposedStat.epf.employee : 0;
    const currentSOCSO = statutory.socso_enabled ? currentStat.socso.employee : 0;
    const proposedSOCSO = statutory.socso_enabled ? proposedStat.socso.employee : 0;
    const currentEIS = statutory.eis_enabled ? currentStat.eis.employee : 0;
    const proposedEIS = statutory.eis_enabled ? proposedStat.eis.employee : 0;
    const currentPCB = statutory.pcb_enabled ? currentStat.pcb : 0;
    const proposedPCB = statutory.pcb_enabled ? proposedStat.pcb : 0;

    const currentTotalDed = unpaidDeduction + currentEPF + currentSOCSO + currentEIS + currentPCB + advanceDeduction + otherDeductions;
    const proposedTotalDed = unpaidDeduction + proposedEPF + proposedSOCSO + proposedEIS + proposedPCB + advanceDeduction + proposedOther;

    const currentNet = currentGross + unpaidDeduction - currentTotalDed;
    const proposedNet = proposedGross + unpaidDeduction - proposedTotalDed;

    res.json({
      employee_name: item.employee_name,
      field,
      current_value: parseFloat(item[field]) || 0,
      new_value: parseFloat(new_value) || 0,
      calculation: {
        current: {
          gross_salary: Math.round(currentGross * 100) / 100,
          statutory_base: Math.round(currentStatBase * 100) / 100,
          epf: Math.round(currentEPF * 100) / 100,
          socso: Math.round(currentSOCSO * 100) / 100,
          eis: Math.round(currentEIS * 100) / 100,
          pcb: Math.round(currentPCB * 100) / 100,
          total_deductions: Math.round(currentTotalDed * 100) / 100,
          net_pay: Math.round(currentNet * 100) / 100
        },
        proposed: {
          gross_salary: Math.round(proposedGross * 100) / 100,
          statutory_base: Math.round(proposedStatBase * 100) / 100,
          epf: Math.round(proposedEPF * 100) / 100,
          socso: Math.round(proposedSOCSO * 100) / 100,
          eis: Math.round(proposedEIS * 100) / 100,
          pcb: Math.round(proposedPCB * 100) / 100,
          total_deductions: Math.round(proposedTotalDed * 100) / 100,
          net_pay: Math.round(proposedNet * 100) / 100
        },
        difference: {
          gross_salary: Math.round((proposedGross - currentGross) * 100) / 100,
          epf: Math.round((proposedEPF - currentEPF) * 100) / 100,
          socso: Math.round((proposedSOCSO - currentSOCSO) * 100) / 100,
          eis: Math.round((proposedEIS - currentEIS) * 100) / 100,
          pcb: Math.round((proposedPCB - currentPCB) * 100) / 100,
          total_deductions: Math.round((proposedTotalDed - currentTotalDed) * 100) / 100,
          net_pay: Math.round((proposedNet - currentNet) * 100) / 100
        }
      }
    });

  } catch (error) {
    console.error('Preview calculation error:', error);
    res.status(500).json({ error: 'Failed to preview calculation: ' + error.message });
  }
});

/**
 * POST /api/payroll/ai/compare
 * Compare current payroll with previous month
 */
router.post('/compare', authenticateAdmin, async (req, res) => {
  try {
    const { run_id } = req.body;
    const companyId = req.companyId;

    if (!companyId || !run_id) {
      return res.status(400).json({ error: 'run_id required' });
    }

    // Get current run
    const runResult = await pool.query(`
      SELECT * FROM payroll_runs WHERE id = $1 AND company_id = $2
    `, [run_id, companyId]);

    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    const run = runResult.rows[0];

    // Get current items
    const currentItems = await pool.query(`
      SELECT pi.*, e.name as employee_name, e.employee_id as emp_code
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      WHERE pi.payroll_run_id = $1
    `, [run_id]);

    // Get previous month
    let prevMonth = run.month - 1;
    let prevYear = run.year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }

    const prevItems = await pool.query(`
      SELECT pi.*, e.name as employee_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
        AND (pr.department_id = $4 OR ($4 IS NULL AND pr.department_id IS NULL))
    `, [companyId, prevMonth, prevYear, run.department_id]);

    const prevMap = {};
    prevItems.rows.forEach(p => {
      prevMap[p.employee_id] = p;
    });

    // Build comparison
    const comparison = currentItems.rows.map(curr => {
      const prev = prevMap[curr.employee_id];

      const changes = [];
      if (prev) {
        const fields = ['basic_salary', 'fixed_allowance', 'ot_amount', 'commission_amount', 'bonus', 'net_pay'];
        fields.forEach(f => {
          const currVal = parseFloat(curr[f]) || 0;
          const prevVal = parseFloat(prev[f]) || 0;
          if (currVal !== prevVal) {
            changes.push({
              field: f,
              previous: prevVal,
              current: currVal,
              difference: currVal - prevVal
            });
          }
        });
      }

      return {
        employee_name: curr.employee_name,
        emp_code: curr.emp_code,
        is_new: !prev,
        current_net: parseFloat(curr.net_pay) || 0,
        previous_net: prev ? parseFloat(prev.net_pay) || 0 : null,
        net_difference: prev ? (parseFloat(curr.net_pay) || 0) - (parseFloat(prev.net_pay) || 0) : null,
        changes
      };
    });

    // Summary
    const totalCurrentNet = currentItems.rows.reduce((s, i) => s + (parseFloat(i.net_pay) || 0), 0);
    const totalPrevNet = prevItems.rows.reduce((s, i) => s + (parseFloat(i.net_pay) || 0), 0);

    res.json({
      current_period: `${run.month}/${run.year}`,
      previous_period: `${prevMonth}/${prevYear}`,
      comparison,
      summary: {
        current_total_net: totalCurrentNet,
        previous_total_net: totalPrevNet,
        difference: totalCurrentNet - totalPrevNet,
        new_employees: comparison.filter(c => c.is_new).length,
        employees_with_changes: comparison.filter(c => c.changes.length > 0).length
      }
    });

  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ error: 'Comparison failed: ' + error.message });
  }
});

/**
 * POST /api/payroll/ai/settings-assistant
 * AI assistant for understanding and changing payroll calculation rules
 */
router.post('/settings-assistant', authenticateAdmin, async (req, res) => {
  try {
    const { message, conversation_history = [] } = req.body;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Get current company payroll settings
    const companyResult = await pool.query(
      'SELECT name, payroll_settings, grouping_type FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];
    const currentSettings = company.payroll_settings || {};

    // Default settings structure
    const defaultSettings = {
      features: {
        auto_ot_from_clockin: true,
        auto_ph_pay: true,
        auto_claims_linking: true,
        unpaid_leave_deduction: true,
        salary_carry_forward: true,
        flexible_commissions: true,
        flexible_allowances: true,
        indoor_sales_logic: false,
        ytd_pcb_calculation: true,
        require_approval: false
      },
      rates: {
        ot_multiplier: 1.0,
        ph_multiplier: 1.0,
        indoor_sales_basic: 4000,
        indoor_sales_commission_rate: 6,
        standard_work_hours: 8,
        standard_work_days: 22
      },
      statutory: {
        epf_enabled: true,
        socso_enabled: true,
        eis_enabled: true,
        pcb_enabled: true,
        statutory_on_ot: false,
        statutory_on_ph_pay: false,
        statutory_on_allowance: false,
        statutory_on_incentive: false
      }
    };

    // Merge with defaults
    const mergedSettings = {
      features: { ...defaultSettings.features, ...currentSettings.features },
      rates: { ...defaultSettings.rates, ...currentSettings.rates },
      statutory: { ...defaultSettings.statutory, ...currentSettings.statutory }
    };

    // Build conversation for AI (simplified for speed)
    const systemPrompt = `Payroll Settings AI for ${company.name}. Return JSON only.

Current: ${JSON.stringify(mergedSettings)}

Settings: features(auto_ot_from_clockin,auto_ph_pay,unpaid_leave_deduction), rates(ot_multiplier,ph_multiplier,standard_work_hours), statutory(epf_enabled,socso_enabled,eis_enabled,pcb_enabled,statutory_on_ot,statutory_on_ph_pay,statutory_on_allowance)

JSON: {"reply":"explanation","changes":{"path.to.setting":value},"needs_confirmation":true/false}
If changing, set needs_confirmation=true. If user says yes/ok/confirm, apply changes.`;

    // Build messages array
    const messages = [];

    // Add conversation history
    for (const msg of conversation_history) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message
    });

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages
    });

    // Parse AI response
    let aiResponse;
    try {
      const responseText = response.content[0].text;
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
                        responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText;
      aiResponse = JSON.parse(jsonStr);
    } catch (e) {
      // If not JSON, treat as plain text reply
      aiResponse = {
        reply: response.content[0].text,
        changes: null,
        needs_confirmation: false
      };
    }

    // If changes are confirmed and provided, apply them
    let appliedChanges = null;
    if (aiResponse.changes && !aiResponse.needs_confirmation) {
      const updatedSettings = JSON.parse(JSON.stringify(mergedSettings));

      for (const [path, value] of Object.entries(aiResponse.changes)) {
        const parts = path.split('.');
        let obj = updatedSettings;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;
      }

      // Save to database
      await pool.query(
        'UPDATE companies SET payroll_settings = $1, updated_at = NOW() WHERE id = $2',
        [updatedSettings, companyId]
      );

      // Log the change
      const changeCategories = Object.keys(aiResponse.changes).map(k => k.split('.')[0]).filter((v, i, a) => a.indexOf(v) === i);
      await pool.query(`
        INSERT INTO ai_change_logs (company_id, change_type, category, summary, changes, changed_by, changed_by_name)
        VALUES ($1, 'settings', $2, $3, $4, $5, $6)
      `, [
        companyId,
        changeCategories.join(', '),
        aiResponse.reply.split('\n')[0].substring(0, 200), // First line as summary
        aiResponse.changes,
        req.adminId,
        req.adminName || 'Admin'
      ]);

      appliedChanges = aiResponse.changes;
      aiResponse.reply += '\n\n✅ Changes have been applied successfully.';
    }

    res.json({
      reply: aiResponse.reply,
      changes: aiResponse.changes,
      applied: appliedChanges !== null,
      applied_changes: appliedChanges,
      needs_confirmation: aiResponse.needs_confirmation || false,
      confirmation_message: aiResponse.confirmation_message,
      current_settings: appliedChanges ?
        (await pool.query('SELECT payroll_settings FROM companies WHERE id = $1', [companyId])).rows[0].payroll_settings :
        mergedSettings
    });

  } catch (error) {
    console.error('Settings assistant error:', error);
    res.status(500).json({ error: 'AI assistant failed: ' + error.message });
  }
});

/**
 * GET /api/payroll/ai/settings
 * Get current payroll settings for the company
 */
router.get('/settings', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const result = await pool.query(
      'SELECT name, payroll_settings FROM companies WHERE id = $1',
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const defaultSettings = {
      features: {
        auto_ot_from_clockin: true,
        auto_ph_pay: true,
        auto_claims_linking: true,
        unpaid_leave_deduction: true,
        salary_carry_forward: true,
        flexible_commissions: true,
        flexible_allowances: true,
        indoor_sales_logic: false,
        ytd_pcb_calculation: true,
        require_approval: false
      },
      rates: {
        ot_multiplier: 1.0,
        ph_multiplier: 1.0,
        indoor_sales_basic: 4000,
        indoor_sales_commission_rate: 6,
        standard_work_hours: 8,
        standard_work_days: 22
      },
      statutory: {
        epf_enabled: true,
        socso_enabled: true,
        eis_enabled: true,
        pcb_enabled: true,
        statutory_on_ot: false,
        statutory_on_ph_pay: false,
        statutory_on_allowance: false,
        statutory_on_incentive: false
      }
    };

    const currentSettings = result.rows[0].payroll_settings || {};
    const mergedSettings = {
      features: { ...defaultSettings.features, ...currentSettings.features },
      rates: { ...defaultSettings.rates, ...currentSettings.rates },
      statutory: { ...defaultSettings.statutory, ...currentSettings.statutory }
    };

    res.json({
      company_name: result.rows[0].name,
      settings: mergedSettings
    });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings: ' + error.message });
  }
});

/**
 * GET /api/payroll/ai/change-logs
 * Get AI change logs for the company
 */
router.get('/change-logs', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    const { type, limit = 50, offset = 0 } = req.query;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    let query = `
      SELECT acl.*, pr.month as payroll_month, pr.year as payroll_year
      FROM ai_change_logs acl
      LEFT JOIN payroll_runs pr ON acl.payroll_run_id = pr.id
      WHERE acl.company_id = $1
    `;
    const params = [companyId];

    if (type) {
      query += ` AND acl.change_type = $${params.length + 1}`;
      params.push(type);
    }

    query += ` ORDER BY acl.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM ai_change_logs WHERE company_id = $1';
    const countParams = [companyId];
    if (type) {
      countQuery += ' AND change_type = $2';
      countParams.push(type);
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get change logs error:', error);
    res.status(500).json({ error: 'Failed to get change logs: ' + error.message });
  }
});

/**
 * GET /api/payroll/ai/change-logs/:id
 * Get a specific AI change log entry
 */
router.get('/change-logs/:id', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const result = await pool.query(`
      SELECT acl.*, pr.month as payroll_month, pr.year as payroll_year, c.name as company_name
      FROM ai_change_logs acl
      LEFT JOIN payroll_runs pr ON acl.payroll_run_id = pr.id
      LEFT JOIN companies c ON acl.company_id = c.id
      WHERE acl.id = $1 AND acl.company_id = $2
    `, [id, companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Change log not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Get change log error:', error);
    res.status(500).json({ error: 'Failed to get change log: ' + error.message });
  }
});

module.exports = router;
