const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');
const { getCompanyFilter } = require('../middleware/tenant');

// =====================================================
// COMMISSION TYPES
// =====================================================

// Get all commission types
router.get('/commission-types', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    let query = 'SELECT * FROM commission_types WHERE is_active = TRUE';
    let params = [];

    if (companyId !== null) {
      query += ' AND company_id = $1';
      params = [companyId];
    }
    query += ' ORDER BY name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching commission types:', error);
    res.status(500).json({ error: 'Failed to fetch commission types' });
  }
});

// Create commission type
router.post('/commission-types', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, calculation_type } = req.body;
    const companyId = req.companyId || 1;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      `INSERT INTO commission_types (name, description, calculation_type, company_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description, calculation_type || 'fixed', companyId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating commission type:', error);
    res.status(500).json({ error: 'Failed to create commission type' });
  }
});

// Update commission type
router.put('/commission-types/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, calculation_type } = req.body;

    const result = await pool.query(
      `UPDATE commission_types
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           calculation_type = COALESCE($3, calculation_type)
       WHERE id = $4 RETURNING *`,
      [name, description, calculation_type, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commission type not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating commission type:', error);
    res.status(500).json({ error: 'Failed to update commission type' });
  }
});

// Delete (deactivate) commission type
router.delete('/commission-types/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('UPDATE commission_types SET is_active = FALSE WHERE id = $1', [id]);
    res.json({ message: 'Commission type deleted' });
  } catch (error) {
    console.error('Error deleting commission type:', error);
    res.status(500).json({ error: 'Failed to delete commission type' });
  }
});

// =====================================================
// ALLOWANCE TYPES
// =====================================================

// Get all allowance types
router.get('/allowance-types', authenticateAdmin, async (req, res) => {
  try {
    const companyId = getCompanyFilter(req);
    let query = 'SELECT * FROM allowance_types WHERE is_active = TRUE';
    let params = [];

    if (companyId !== null) {
      query += ' AND company_id = $1';
      params = [companyId];
    }
    query += ' ORDER BY name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching allowance types:', error);
    res.status(500).json({ error: 'Failed to fetch allowance types' });
  }
});

// Create allowance type
router.post('/allowance-types', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, is_taxable } = req.body;
    const companyId = req.companyId || 1;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      `INSERT INTO allowance_types (name, description, is_taxable, company_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description, is_taxable !== false, companyId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating allowance type:', error);
    res.status(500).json({ error: 'Failed to create allowance type' });
  }
});

// Update allowance type
router.put('/allowance-types/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_taxable } = req.body;

    const result = await pool.query(
      `UPDATE allowance_types
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_taxable = COALESCE($3, is_taxable)
       WHERE id = $4 RETURNING *`,
      [name, description, is_taxable, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Allowance type not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating allowance type:', error);
    res.status(500).json({ error: 'Failed to update allowance type' });
  }
});

// Delete (deactivate) allowance type
router.delete('/allowance-types/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('UPDATE allowance_types SET is_active = FALSE WHERE id = $1', [id]);
    res.json({ message: 'Allowance type deleted' });
  } catch (error) {
    console.error('Error deleting allowance type:', error);
    res.status(500).json({ error: 'Failed to delete allowance type' });
  }
});

// =====================================================
// EMPLOYEE COMMISSIONS
// =====================================================

// Get employee's commissions
router.get('/employees/:id/commissions', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT ec.*, ct.name as commission_name, ct.calculation_type as type_calculation
      FROM employee_commissions ec
      JOIN commission_types ct ON ec.commission_type_id = ct.id
      WHERE ec.employee_id = $1 AND ec.is_active = TRUE
      ORDER BY ct.name
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employee commissions:', error);
    res.status(500).json({ error: 'Failed to fetch employee commissions' });
  }
});

// Add commission to employee
router.post('/employees/:id/commissions', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { commission_type_id, amount } = req.body;

    if (!commission_type_id) {
      return res.status(400).json({ error: 'Commission type is required' });
    }

    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM employee_commissions WHERE employee_id = $1 AND commission_type_id = $2',
      [id, commission_type_id]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE employee_commissions SET amount = $1, is_active = TRUE WHERE id = $2 RETURNING *`,
        [amount || 0, existing.rows[0].id]
      );
    } else {
      // Insert new
      result = await pool.query(
        `INSERT INTO employee_commissions (employee_id, commission_type_id, amount)
         VALUES ($1, $2, $3) RETURNING *`,
        [id, commission_type_id, amount || 0]
      );
    }

    // Fetch with commission name
    const fullResult = await pool.query(`
      SELECT ec.*, ct.name as commission_name, ct.calculation_type as type_calculation
      FROM employee_commissions ec
      JOIN commission_types ct ON ec.commission_type_id = ct.id
      WHERE ec.id = $1
    `, [result.rows[0].id]);

    res.status(201).json(fullResult.rows[0]);
  } catch (error) {
    console.error('Error adding employee commission:', error);
    res.status(500).json({ error: 'Failed to add commission' });
  }
});

// Update employee commission
router.put('/employees/:employeeId/commissions/:commissionId', authenticateAdmin, async (req, res) => {
  try {
    const { commissionId } = req.params;
    const { amount } = req.body;

    const result = await pool.query(
      `UPDATE employee_commissions SET amount = $1 WHERE id = $2 RETURNING *`,
      [amount || 0, commissionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Commission not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee commission:', error);
    res.status(500).json({ error: 'Failed to update commission' });
  }
});

// Remove employee commission
router.delete('/employees/:employeeId/commissions/:commissionId', authenticateAdmin, async (req, res) => {
  try {
    const { commissionId } = req.params;

    await pool.query('UPDATE employee_commissions SET is_active = FALSE WHERE id = $1', [commissionId]);
    res.json({ message: 'Commission removed' });
  } catch (error) {
    console.error('Error removing employee commission:', error);
    res.status(500).json({ error: 'Failed to remove commission' });
  }
});

// =====================================================
// EMPLOYEE ALLOWANCES
// =====================================================

// Get employee's allowances
router.get('/employees/:id/allowances', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT ea.*, at.name as allowance_name, at.is_taxable
      FROM employee_allowances ea
      JOIN allowance_types at ON ea.allowance_type_id = at.id
      WHERE ea.employee_id = $1 AND ea.is_active = TRUE
      ORDER BY at.name
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employee allowances:', error);
    res.status(500).json({ error: 'Failed to fetch employee allowances' });
  }
});

// Add allowance to employee
router.post('/employees/:id/allowances', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { allowance_type_id, amount } = req.body;

    if (!allowance_type_id) {
      return res.status(400).json({ error: 'Allowance type is required' });
    }

    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM employee_allowances WHERE employee_id = $1 AND allowance_type_id = $2',
      [id, allowance_type_id]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE employee_allowances SET amount = $1, is_active = TRUE WHERE id = $2 RETURNING *`,
        [amount || 0, existing.rows[0].id]
      );
    } else {
      // Insert new
      result = await pool.query(
        `INSERT INTO employee_allowances (employee_id, allowance_type_id, amount)
         VALUES ($1, $2, $3) RETURNING *`,
        [id, allowance_type_id, amount || 0]
      );
    }

    // Fetch with allowance name
    const fullResult = await pool.query(`
      SELECT ea.*, at.name as allowance_name, at.is_taxable
      FROM employee_allowances ea
      JOIN allowance_types at ON ea.allowance_type_id = at.id
      WHERE ea.id = $1
    `, [result.rows[0].id]);

    res.status(201).json(fullResult.rows[0]);
  } catch (error) {
    console.error('Error adding employee allowance:', error);
    res.status(500).json({ error: 'Failed to add allowance' });
  }
});

// Update employee allowance
router.put('/employees/:employeeId/allowances/:allowanceId', authenticateAdmin, async (req, res) => {
  try {
    const { allowanceId } = req.params;
    const { amount } = req.body;

    const result = await pool.query(
      `UPDATE employee_allowances SET amount = $1 WHERE id = $2 RETURNING *`,
      [amount || 0, allowanceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Allowance not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating employee allowance:', error);
    res.status(500).json({ error: 'Failed to update allowance' });
  }
});

// Remove employee allowance
router.delete('/employees/:employeeId/allowances/:allowanceId', authenticateAdmin, async (req, res) => {
  try {
    const { allowanceId } = req.params;

    await pool.query('UPDATE employee_allowances SET is_active = FALSE WHERE id = $1', [allowanceId]);
    res.json({ message: 'Allowance removed' });
  } catch (error) {
    console.error('Error removing employee allowance:', error);
    res.status(500).json({ error: 'Failed to remove allowance' });
  }
});

// =====================================================
// BULK SAVE (for employee form)
// =====================================================

// Save all commissions for an employee
router.post('/employees/:id/commissions/bulk', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { commissions } = req.body; // Array of { commission_type_id, amount }

    await client.query('BEGIN');

    // Deactivate all existing commissions
    await client.query(
      'UPDATE employee_commissions SET is_active = FALSE WHERE employee_id = $1',
      [id]
    );

    // Insert/update new ones
    for (const comm of commissions) {
      if (comm.commission_type_id && comm.amount > 0) {
        await client.query(`
          INSERT INTO employee_commissions (employee_id, commission_type_id, amount, is_active)
          VALUES ($1, $2, $3, TRUE)
          ON CONFLICT (employee_id, commission_type_id)
          DO UPDATE SET amount = $3, is_active = TRUE
        `, [id, comm.commission_type_id, comm.amount]);
      }
    }

    await client.query('COMMIT');

    // Fetch updated list
    const result = await pool.query(`
      SELECT ec.*, ct.name as commission_name, ct.calculation_type as type_calculation
      FROM employee_commissions ec
      JOIN commission_types ct ON ec.commission_type_id = ct.id
      WHERE ec.employee_id = $1 AND ec.is_active = TRUE
      ORDER BY ct.name
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving employee commissions:', error);
    res.status(500).json({ error: 'Failed to save commissions' });
  } finally {
    client.release();
  }
});

// Save all allowances for an employee
router.post('/employees/:id/allowances/bulk', authenticateAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { allowances } = req.body; // Array of { allowance_type_id, amount }

    await client.query('BEGIN');

    // Deactivate all existing allowances
    await client.query(
      'UPDATE employee_allowances SET is_active = FALSE WHERE employee_id = $1',
      [id]
    );

    // Insert/update new ones
    for (const allow of allowances) {
      if (allow.allowance_type_id && allow.amount > 0) {
        await client.query(`
          INSERT INTO employee_allowances (employee_id, allowance_type_id, amount, is_active)
          VALUES ($1, $2, $3, TRUE)
          ON CONFLICT (employee_id, allowance_type_id)
          DO UPDATE SET amount = $3, is_active = TRUE
        `, [id, allow.allowance_type_id, allow.amount]);
      }
    }

    await client.query('COMMIT');

    // Fetch updated list
    const result = await pool.query(`
      SELECT ea.*, at.name as allowance_name, at.is_taxable
      FROM employee_allowances ea
      JOIN allowance_types at ON ea.allowance_type_id = at.id
      WHERE ea.employee_id = $1 AND ea.is_active = TRUE
      ORDER BY at.name
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving employee allowances:', error);
    res.status(500).json({ error: 'Failed to save allowances' });
  } finally {
    client.release();
  }
});

module.exports = router;
