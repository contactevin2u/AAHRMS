/**
 * Payroll Configuration Admin Routes
 * GET/PUT company payroll config, OT rules CRUD, employee overrides
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticateAdmin } = require('../../middleware/auth');

// Default payroll config values (used when keys are missing from DB)
const DEFAULT_PAYROLL_CONFIG = {
  work_hours_per_day: 8,
  work_days_per_month: 22,
  part_time_hourly_rate: 8.72,
  part_time_ph_multiplier: 2.0,
  indoor_sales_basic: 4000,
  indoor_sales_commission_rate: 6,
  outstation_per_day: 100,
  outstation_min_distance_km: 180,
  statutory_on_allowance: false,
  statutory_on_ot: false,
  statutory_on_ph_pay: false,
  statutory_on_incentive: false,
  statutory_on_commission: true,
  ot_requires_approval: false
};

// =====================================================
// COMPANY PAYROLL CONFIG
// =====================================================

/**
 * GET /api/admin/payroll-config
 * Returns merged config (DB + defaults)
 */
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const result = await pool.query(
      'SELECT payroll_config, payroll_settings FROM companies WHERE id = $1',
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.json(DEFAULT_PAYROLL_CONFIG);
    }

    const dbConfig = result.rows[0].payroll_config || {};
    const payrollSettings = result.rows[0].payroll_settings || {};

    // Merge: DB payroll_config > payroll_settings mappings > defaults
    const config = { ...DEFAULT_PAYROLL_CONFIG };

    // Map from existing payroll_settings if payroll_config doesn't have values yet
    if (payrollSettings.rates) {
      if (payrollSettings.rates.standard_work_hours) config.work_hours_per_day = payrollSettings.rates.standard_work_hours;
      if (payrollSettings.rates.standard_work_days) config.work_days_per_month = payrollSettings.rates.standard_work_days;
      if (payrollSettings.rates.indoor_sales_basic) config.indoor_sales_basic = payrollSettings.rates.indoor_sales_basic;
      if (payrollSettings.rates.indoor_sales_commission_rate) config.indoor_sales_commission_rate = payrollSettings.rates.indoor_sales_commission_rate;
    }
    if (payrollSettings.statutory) {
      if (payrollSettings.statutory.statutory_on_allowance !== undefined) config.statutory_on_allowance = payrollSettings.statutory.statutory_on_allowance;
      if (payrollSettings.statutory.statutory_on_ot !== undefined) config.statutory_on_ot = payrollSettings.statutory.statutory_on_ot;
      if (payrollSettings.statutory.statutory_on_ph_pay !== undefined) config.statutory_on_ph_pay = payrollSettings.statutory.statutory_on_ph_pay;
      if (payrollSettings.statutory.statutory_on_incentive !== undefined) config.statutory_on_incentive = payrollSettings.statutory.statutory_on_incentive;
    }
    if (payrollSettings.features) {
      if (payrollSettings.features.ot_requires_approval !== undefined) config.ot_requires_approval = payrollSettings.features.ot_requires_approval;
    }

    // Override with payroll_config values (takes priority)
    Object.assign(config, dbConfig);

    res.json(config);
  } catch (error) {
    console.error('Error fetching payroll config:', error);
    res.status(500).json({ error: 'Failed to fetch payroll config' });
  }
});

/**
 * PUT /api/admin/payroll-config
 * Save company payroll config
 */
router.put('/', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company context required' });
    }

    const config = req.body;

    // Validate numeric fields
    const numericFields = [
      'work_hours_per_day', 'work_days_per_month', 'part_time_hourly_rate',
      'part_time_ph_multiplier', 'indoor_sales_basic', 'indoor_sales_commission_rate',
      'outstation_per_day', 'outstation_min_distance_km'
    ];
    for (const field of numericFields) {
      if (config[field] !== undefined && (typeof config[field] !== 'number' || config[field] < 0)) {
        return res.status(400).json({ error: `${field} must be a non-negative number` });
      }
    }

    // Save to payroll_config column
    await pool.query(
      `UPDATE companies SET payroll_config = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(config), companyId]
    );

    // Also sync key values back to payroll_settings for backward compat
    const settingsResult = await pool.query(
      'SELECT payroll_settings FROM companies WHERE id = $1',
      [companyId]
    );
    const existingSettings = settingsResult.rows[0]?.payroll_settings || {};

    const updatedSettings = {
      ...existingSettings,
      features: {
        ...(existingSettings.features || {}),
        ot_requires_approval: config.ot_requires_approval ?? false
      },
      rates: {
        ...(existingSettings.rates || {}),
        standard_work_hours: config.work_hours_per_day ?? 8,
        standard_work_days: config.work_days_per_month ?? 22,
        indoor_sales_basic: config.indoor_sales_basic ?? 4000,
        indoor_sales_commission_rate: config.indoor_sales_commission_rate ?? 6
      },
      statutory: {
        ...(existingSettings.statutory || {}),
        statutory_on_allowance: config.statutory_on_allowance ?? false,
        statutory_on_ot: config.statutory_on_ot ?? false,
        statutory_on_ph_pay: config.statutory_on_ph_pay ?? false,
        statutory_on_incentive: config.statutory_on_incentive ?? false
      }
    };

    await pool.query(
      'UPDATE companies SET payroll_settings = $1 WHERE id = $2',
      [JSON.stringify(updatedSettings), companyId]
    );

    res.json({ message: 'Payroll config updated', config });
  } catch (error) {
    console.error('Error updating payroll config:', error);
    res.status(500).json({ error: 'Failed to update payroll config' });
  }
});

// =====================================================
// OT RULES (Department/Outlet Level)
// =====================================================

/**
 * GET /api/admin/payroll-config/ot-rules
 */
router.get('/ot-rules', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const result = await pool.query(`
      SELECT otr.*,
             d.name as department_name
      FROM ot_rules otr
      LEFT JOIN departments d ON otr.department_id = d.id
      WHERE otr.company_id = $1
      ORDER BY otr.department_id NULLS FIRST, otr.name
    `, [companyId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching OT rules:', error);
    res.status(500).json({ error: 'Failed to fetch OT rules' });
  }
});

/**
 * POST /api/admin/payroll-config/ot-rules
 */
router.post('/ot-rules', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const {
      department_id, name, normal_hours_per_day, includes_break, break_duration_minutes,
      ot_threshold_hours, ot_normal_multiplier, ot_weekend_multiplier,
      ot_ph_multiplier, ot_ph_after_hours_multiplier,
      rounding_method, rounding_direction, min_ot_hours
    } = req.body;

    const result = await pool.query(`
      INSERT INTO ot_rules (
        company_id, department_id, name, normal_hours_per_day, includes_break,
        break_duration_minutes, ot_threshold_hours, ot_normal_multiplier,
        ot_weekend_multiplier, ot_ph_multiplier, ot_ph_after_hours_multiplier,
        rounding_method, rounding_direction, min_ot_hours
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      companyId, department_id || null, name || 'Default',
      normal_hours_per_day ?? 8, includes_break ?? false, break_duration_minutes ?? 0,
      ot_threshold_hours ?? 8, ot_normal_multiplier ?? 1.5, ot_weekend_multiplier ?? 1.5,
      ot_ph_multiplier ?? 2.0, ot_ph_after_hours_multiplier ?? null,
      rounding_method ?? 'minute', rounding_direction ?? 'nearest', min_ot_hours ?? 1.0
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating OT rule:', error);
    res.status(500).json({ error: 'Failed to create OT rule' });
  }
});

/**
 * PUT /api/admin/payroll-config/ot-rules/:id
 */
router.put('/ot-rules/:id', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const { id } = req.params;
    const {
      department_id, name, normal_hours_per_day, includes_break, break_duration_minutes,
      ot_threshold_hours, ot_normal_multiplier, ot_weekend_multiplier,
      ot_ph_multiplier, ot_ph_after_hours_multiplier,
      rounding_method, rounding_direction, min_ot_hours, is_active
    } = req.body;

    const result = await pool.query(`
      UPDATE ot_rules SET
        department_id = $3, name = $4, normal_hours_per_day = $5,
        includes_break = $6, break_duration_minutes = $7,
        ot_threshold_hours = $8, ot_normal_multiplier = $9,
        ot_weekend_multiplier = $10, ot_ph_multiplier = $11,
        ot_ph_after_hours_multiplier = $12, rounding_method = $13,
        rounding_direction = $14, min_ot_hours = $15, is_active = $16,
        updated_at = NOW()
      WHERE id = $1 AND company_id = $2
      RETURNING *
    `, [
      id, companyId, department_id || null, name,
      normal_hours_per_day, includes_break, break_duration_minutes,
      ot_threshold_hours, ot_normal_multiplier, ot_weekend_multiplier,
      ot_ph_multiplier, ot_ph_after_hours_multiplier,
      rounding_method, rounding_direction, min_ot_hours, is_active ?? true
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'OT rule not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating OT rule:', error);
    res.status(500).json({ error: 'Failed to update OT rule' });
  }
});

/**
 * DELETE /api/admin/payroll-config/ot-rules/:id
 */
router.delete('/ot-rules/:id', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    await pool.query('DELETE FROM ot_rules WHERE id = $1 AND company_id = $2', [req.params.id, companyId]);
    res.json({ message: 'OT rule deleted' });
  } catch (error) {
    console.error('Error deleting OT rule:', error);
    res.status(500).json({ error: 'Failed to delete OT rule' });
  }
});

// =====================================================
// EMPLOYEE OVERRIDES
// =====================================================

/**
 * GET /api/admin/payroll-config/employee-overrides
 * List employees with their payroll override fields
 */
router.get('/employee-overrides', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const { search } = req.query;
    let query = `
      SELECT e.id, e.name, e.employee_id as emp_code, e.department_id,
             d.name as department_name,
             e.ot_rate, e.commission_rate, e.fixed_ot_amount,
             e.per_trip_rate, e.outstation_rate, e.allowance_pcb,
             e.residency_status, e.epf_contribution_type,
             e.employment_type, e.work_type
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = $1 AND e.status = 'active'
    `;
    const params = [companyId];

    if (search) {
      query += ` AND (e.name ILIKE $2 OR e.employee_id ILIKE $2)`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY e.name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employee overrides:', error);
    res.status(500).json({ error: 'Failed to fetch employee overrides' });
  }
});

/**
 * PUT /api/admin/payroll-config/employee-overrides/:id
 * Update individual employee override fields
 */
router.put('/employee-overrides/:id', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const { id } = req.params;
    const {
      ot_rate, commission_rate, fixed_ot_amount, per_trip_rate,
      outstation_rate, allowance_pcb, residency_status, epf_contribution_type
    } = req.body;

    const result = await pool.query(`
      UPDATE employees SET
        ot_rate = $3, commission_rate = $4, fixed_ot_amount = $5,
        per_trip_rate = $6, outstation_rate = $7, allowance_pcb = $8,
        residency_status = $9, epf_contribution_type = $10,
        updated_at = NOW()
      WHERE id = $1 AND company_id = $2
      RETURNING id, name, ot_rate, commission_rate, fixed_ot_amount,
                per_trip_rate, outstation_rate, allowance_pcb,
                residency_status, epf_contribution_type
    `, [
      id, companyId, ot_rate ?? null, commission_rate ?? null,
      fixed_ot_amount ?? null, per_trip_rate ?? null, outstation_rate ?? null,
      allowance_pcb ?? 'normal', residency_status ?? 'citizen',
      epf_contribution_type ?? 'standard'
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee override:', error);
    res.status(500).json({ error: 'Failed to update employee override' });
  }
});

/**
 * PUT /api/admin/payroll-config/employee-overrides/bulk
 * Bulk update employee overrides
 */
router.put('/employee-overrides/bulk', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const { employee_ids, updates } = req.body;
    if (!employee_ids?.length || !updates) {
      return res.status(400).json({ error: 'employee_ids and updates required' });
    }

    const setClauses = [];
    const values = [companyId];
    let paramIdx = 2;

    const allowedFields = [
      'ot_rate', 'commission_rate', 'fixed_ot_amount', 'per_trip_rate',
      'outstation_rate', 'allowance_pcb', 'residency_status', 'epf_contribution_type'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx}`);
        values.push(updates[field]);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push('updated_at = NOW()');

    const idPlaceholders = employee_ids.map((_, i) => `$${paramIdx + i}`).join(',');
    values.push(...employee_ids);

    await pool.query(
      `UPDATE employees SET ${setClauses.join(', ')} WHERE company_id = $1 AND id IN (${idPlaceholders})`,
      values
    );

    res.json({ message: `Updated ${employee_ids.length} employees` });
  } catch (error) {
    console.error('Error bulk updating employee overrides:', error);
    res.status(500).json({ error: 'Failed to bulk update' });
  }
});

// =====================================================
// ALLOWANCE & COMMISSION TYPES (taxability)
// =====================================================

/**
 * GET /api/admin/payroll-config/earning-types
 * Get all allowance and commission types for the company
 */
router.get('/earning-types', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const [allowances, commissions] = await Promise.all([
      pool.query('SELECT * FROM allowance_types WHERE company_id = $1 ORDER BY name', [companyId]),
      pool.query('SELECT * FROM commission_types WHERE company_id = $1 ORDER BY name', [companyId])
    ]);

    res.json({
      allowance_types: allowances.rows,
      commission_types: commissions.rows
    });
  } catch (error) {
    console.error('Error fetching earning types:', error);
    res.status(500).json({ error: 'Failed to fetch earning types' });
  }
});

/**
 * PATCH /api/admin/payroll-config/allowance-types/:id/taxable
 */
router.patch('/allowance-types/:id/taxable', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const { is_taxable } = req.body;
    const result = await pool.query(
      'UPDATE allowance_types SET is_taxable = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING *',
      [is_taxable, req.params.id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating allowance taxability:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
});

/**
 * PATCH /api/admin/payroll-config/commission-types/:id/taxable
 */
router.patch('/commission-types/:id/taxable', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const { is_taxable } = req.body;
    const result = await pool.query(
      'UPDATE commission_types SET is_taxable = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING *',
      [is_taxable, req.params.id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating commission taxability:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
});

// =====================================================
// AUTOMATION CONFIG (read from automation_configs table)
// =====================================================

/**
 * GET /api/admin/payroll-config/automation
 */
router.get('/automation', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const result = await pool.query(
      'SELECT * FROM automation_configs WHERE company_id = $1',
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.json({
        payroll_auto_generate: false,
        payroll_auto_generate_day: 1,
        payroll_auto_approve: false,
        payroll_variance_threshold: 5,
        payroll_lock_after_days: 3
      });
    }

    const row = result.rows[0];
    res.json({
      payroll_auto_generate: row.payroll_auto_generate || false,
      payroll_auto_generate_day: row.payroll_auto_generate_day || 1,
      payroll_auto_approve: row.payroll_auto_approve || false,
      payroll_variance_threshold: row.payroll_variance_threshold ?? 5,
      payroll_lock_after_days: row.payroll_lock_after_days ?? 3
    });
  } catch (error) {
    console.error('Error fetching automation config:', error);
    res.status(500).json({ error: 'Failed to fetch automation config' });
  }
});

/**
 * PUT /api/admin/payroll-config/automation
 */
router.put('/automation', authenticateAdmin, async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(403).json({ error: 'Company context required' });

    const {
      payroll_auto_generate, payroll_auto_generate_day,
      payroll_auto_approve, payroll_variance_threshold, payroll_lock_after_days
    } = req.body;

    const result = await pool.query(`
      INSERT INTO automation_configs (
        company_id, payroll_auto_generate, payroll_auto_generate_day,
        payroll_auto_approve, payroll_variance_threshold, payroll_lock_after_days
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (company_id) DO UPDATE SET
        payroll_auto_generate = COALESCE($2, automation_configs.payroll_auto_generate),
        payroll_auto_generate_day = COALESCE($3, automation_configs.payroll_auto_generate_day),
        payroll_auto_approve = COALESCE($4, automation_configs.payroll_auto_approve),
        payroll_variance_threshold = COALESCE($5, automation_configs.payroll_variance_threshold),
        payroll_lock_after_days = COALESCE($6, automation_configs.payroll_lock_after_days),
        updated_at = NOW()
      RETURNING *
    `, [
      companyId, payroll_auto_generate, payroll_auto_generate_day,
      payroll_auto_approve, payroll_variance_threshold, payroll_lock_after_days
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating automation config:', error);
    res.status(500).json({ error: 'Failed to update automation config' });
  }
});

// =====================================================
// STATUTORY REFERENCE (read-only)
// =====================================================

/**
 * GET /api/admin/payroll-config/statutory-reference
 * Returns current government-mandated rates for display
 */
router.get('/statutory-reference', authenticateAdmin, async (req, res) => {
  res.json({
    epf: {
      employee_rate_below_60: '11% (mandatory)',
      employer_rate_below_60: '13% (wages <= RM5,000) / 12% (wages > RM5,000)',
      employee_rate_60_above: '0% (optional 5.5%)',
      employer_rate_60_above: '4%',
      foreign_worker: '2% employee / 2% employer (optional)',
      tax_relief_cap: 4000,
      note: 'Third Schedule effective 1 October 2025 (Act A1760/2025)'
    },
    socso: {
      wage_ceiling: 6000,
      first_category: 'Employment Injury + Invalidity',
      second_category: 'Employment Injury only (age 60+)',
      note: 'Effective 1 October 2024'
    },
    eis: {
      wage_ceiling: 5000,
      rate: '0.2% employee + 0.2% employer',
      age_cutoff: 57,
      note: 'Employment Insurance System Act 2017'
    },
    pcb: {
      brackets: [
        { range: '0 - 5,000', rate: '0%' },
        { range: '5,001 - 20,000', rate: '1%' },
        { range: '20,001 - 35,000', rate: '3%' },
        { range: '35,001 - 50,000', rate: '6%' },
        { range: '50,001 - 70,000', rate: '11%' },
        { range: '70,001 - 100,000', rate: '19%' },
        { range: '100,001 - 400,000', rate: '25%' },
        { range: '400,001 - 600,000', rate: '26%' },
        { range: '600,001 - 2,000,000', rate: '28%' },
        { range: 'Above 2,000,000', rate: '30%' }
      ],
      individual_relief: 9000,
      spouse_relief: 4000,
      child_relief: 2000,
      rebate_threshold: 35000,
      rebate_single: 400,
      rebate_married: 800,
      note: 'PCB rounding to nearest 5 sen (LHDN guideline)'
    }
  });
});

module.exports = router;
