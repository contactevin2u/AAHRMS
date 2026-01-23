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
 */
router.post('/analyze', authenticateAdmin, async (req, res) => {
  try {
    const { run_id, instruction } = req.body;
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

    // Get current items
    const itemsResult = await pool.query(`
      SELECT pi.*, e.name as employee_name, e.employee_id as emp_code,
             d.name as department_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.payroll_run_id = $1
      ORDER BY e.name
    `, [run_id]);

    const currentItems = itemsResult.rows;

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

    const prevPayrollMap = {};
    prevRunResult.rows.forEach(p => {
      prevPayrollMap[p.employee_id] = p;
    });

    // Build context for AI
    const payrollContext = currentItems.map(item => {
      const prev = prevPayrollMap[item.employee_id];
      return {
        id: item.id,
        employee_id: item.employee_id,
        name: item.employee_name,
        emp_code: item.emp_code,
        department: item.department_name,
        current: {
          basic_salary: parseFloat(item.basic_salary) || 0,
          fixed_allowance: parseFloat(item.fixed_allowance) || 0,
          ot_hours: parseFloat(item.ot_hours) || 0,
          ot_amount: parseFloat(item.ot_amount) || 0,
          commission_amount: parseFloat(item.commission_amount) || 0,
          bonus: parseFloat(item.bonus) || 0,
          claims_amount: parseFloat(item.claims_amount) || 0,
          gross_salary: parseFloat(item.gross_salary) || 0,
          epf_employee: parseFloat(item.epf_employee) || 0,
          socso_employee: parseFloat(item.socso_employee) || 0,
          eis_employee: parseFloat(item.eis_employee) || 0,
          pcb: parseFloat(item.pcb) || 0,
          net_pay: parseFloat(item.net_pay) || 0
        },
        previous: prev ? {
          basic_salary: parseFloat(prev.basic_salary) || 0,
          net_pay: parseFloat(prev.net_pay) || 0
        } : null
      };
    });

    // Call Claude AI to analyze the instruction
    const systemPrompt = `You are an AI Payroll Assistant for a Malaysian HRMS system.
Your job is to interpret HR's instructions about payroll changes and return structured JSON.

IMPORTANT RULES:
1. All amounts are in Malaysian Ringgit (RM)
2. When HR mentions an employee, match by name (partial match OK) or employee code
3. Return changes as an array of modifications to apply
4. If instruction is unclear, ask for clarification in the "clarification" field
5. Always explain the impact of changes

Return ONLY valid JSON in this format:
{
  "understood": true/false,
  "clarification": "question if unclear, null if understood",
  "summary": "Brief summary of what will be done",
  "changes": [
    {
      "item_id": 123,
      "employee_name": "Name",
      "field": "basic_salary|bonus|fixed_allowance|commission_amount|other_deductions",
      "current_value": 2000,
      "new_value": 2200,
      "reason": "Salary increment"
    }
  ],
  "impact": {
    "total_additional_cost": 500,
    "affected_employees": 3,
    "note": "Any important notes"
  }
}

Available fields to modify: basic_salary, fixed_allowance, bonus, commission_amount, incentive_amount, other_deductions, deduction_remarks`;

    const userMessage = `Current payroll for ${run.month}/${run.year}${run.department_name ? ` (${run.department_name})` : ''}:

${JSON.stringify(payrollContext, null, 2)}

HR Instruction: "${instruction}"

Analyze this instruction and return the JSON response with proposed changes.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: userMessage }
      ],
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

    // If AI understood, calculate detailed impact
    if (aiResponse.understood && aiResponse.changes && aiResponse.changes.length > 0) {
      // Calculate preview of changes
      const preview = aiResponse.changes.map(change => {
        const item = currentItems.find(i => i.id === change.item_id);
        if (!item) return null;

        const currentNet = parseFloat(item.net_pay) || 0;
        const diff = change.new_value - change.current_value;

        // Estimate new net (simplified - actual would recalculate statutory)
        let estimatedNewNet = currentNet;
        if (['basic_salary', 'bonus', 'commission_amount', 'fixed_allowance', 'incentive_amount'].includes(change.field)) {
          // These add to pay (minus ~20% for statutory deductions estimate)
          estimatedNewNet = currentNet + (diff * 0.8);
        } else if (change.field === 'other_deductions') {
          // Deductions subtract from pay
          estimatedNewNet = currentNet - diff;
        }

        return {
          ...change,
          current_net: currentNet,
          estimated_new_net: Math.round(estimatedNewNet * 100) / 100,
          difference: Math.round((estimatedNewNet - currentNet) * 100) / 100
        };
      }).filter(Boolean);

      aiResponse.preview = preview;
    }

    res.json({
      run_id,
      instruction,
      analysis: aiResponse,
      current_totals: {
        gross: run.total_gross,
        net: run.total_net,
        employee_count: currentItems.length
      }
    });

  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({ error: 'AI analysis failed: ' + error.message });
  }
});

/**
 * POST /api/payroll/ai/apply
 * Apply the AI-suggested changes after HR approval
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

    if (runResult.rows[0].status === 'finalized') {
      return res.status(400).json({ error: 'Cannot modify finalized payroll' });
    }

    await client.query('BEGIN');

    const results = [];
    for (const change of changes) {
      const { item_id, field, new_value } = change;

      // Validate field is allowed
      const allowedFields = ['basic_salary', 'fixed_allowance', 'bonus', 'commission_amount',
                            'incentive_amount', 'other_deductions', 'deduction_remarks',
                            'trade_commission_amount', 'outstation_amount'];

      if (!allowedFields.includes(field)) {
        results.push({ item_id, success: false, error: `Field ${field} not allowed` });
        continue;
      }

      // Update the item
      try {
        await client.query(
          `UPDATE payroll_items SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
          [new_value, item_id]
        );
        results.push({ item_id, success: true, field, new_value });
      } catch (e) {
        results.push({ item_id, success: false, error: e.message });
      }
    }

    // Recalculate all items to update statutory and totals
    const itemIds = changes.map(c => c.item_id);
    for (const itemId of itemIds) {
      // Get item data
      const itemData = await client.query(`
        SELECT pi.*, e.ic_number, e.date_of_birth, e.marital_status, e.spouse_working, e.children_count
        FROM payroll_items pi
        JOIN employees e ON pi.employee_id = e.id
        WHERE pi.id = $1
      `, [itemId]);

      if (itemData.rows.length === 0) continue;

      const item = itemData.rows[0];

      // Recalculate gross and net
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

      const grossSalary = basicSalary + fixedAllowance + otAmount + phPay + incentiveAmount +
                          commissionAmount + tradeCommission + outstationAmount + bonus + claimsAmount - unpaidDeduction;

      // Keep existing statutory for now (would need full recalculation)
      const totalDeductions = unpaidDeduction + parseFloat(item.epf_employee || 0) +
                              parseFloat(item.socso_employee || 0) + parseFloat(item.eis_employee || 0) +
                              parseFloat(item.pcb || 0) + advanceDeduction + otherDeductions;
      const netPay = grossSalary + unpaidDeduction - totalDeductions;

      await client.query(`
        UPDATE payroll_items SET gross_salary = $1, net_pay = $2, updated_at = NOW()
        WHERE id = $3
      `, [grossSalary, netPay, itemId]);
    }

    // Update run totals
    await client.query(`
      UPDATE payroll_runs SET
        total_gross = (SELECT COALESCE(SUM(gross_salary), 0) FROM payroll_items WHERE payroll_run_id = $1),
        total_net = (SELECT COALESCE(SUM(net_pay), 0) FROM payroll_items WHERE payroll_run_id = $1),
        total_deductions = (SELECT COALESCE(SUM(total_deductions), 0) FROM payroll_items WHERE payroll_run_id = $1),
        updated_at = NOW()
      WHERE id = $1
    `, [run_id]);

    await client.query('COMMIT');

    // Get updated run
    const updatedRun = await pool.query('SELECT * FROM payroll_runs WHERE id = $1', [run_id]);

    res.json({
      success: true,
      message: `Applied ${results.filter(r => r.success).length} of ${changes.length} changes`,
      results,
      updated_totals: {
        gross: updatedRun.rows[0].total_gross,
        net: updatedRun.rows[0].total_net
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

module.exports = router;
