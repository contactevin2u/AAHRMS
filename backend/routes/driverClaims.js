/**
 * Driver Claims Portal Routes
 *
 * Separate portal for AA Alive driver claims management.
 * Driver claims are NOT included in payroll - paid as cash.
 *
 * Flow: Approved claims -> Admin selects & releases payment -> Driver signs -> Paid
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authenticateAdmin } = require('../middleware/auth');

// =====================================================
// AUTH
// =====================================================

// Login (uses admin_users credentials)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(`
      SELECT au.*, c.name as company_name
      FROM admin_users au
      LEFT JOIN companies c ON au.company_id = c.id
      WHERE au.username = $1
    `, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];

    if (admin.status !== 'active') {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: admin.role || 'admin',
        name: admin.name,
        company_id: admin.company_id,
        portal: 'driver_claims'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Driver claims login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// =====================================================
// DASHBOARD - Get claims grouped by driver
// =====================================================

// Get summary stats
router.get('/summary', authenticateAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;

    let dateFilter = '';
    const params = [];

    if (month && year) {
      dateFilter = 'AND EXTRACT(MONTH FROM c.claim_date) = $1 AND EXTRACT(YEAR FROM c.claim_date) = $2';
      params.push(month, year);
    }

    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE c.status = 'approved' AND c.cash_paid_at IS NULL) as pending_release,
        COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'approved' AND c.cash_paid_at IS NULL), 0) as pending_amount,
        COUNT(*) FILTER (WHERE c.status = 'approved' AND c.cash_paid_at IS NOT NULL AND c.driver_signature IS NULL) as pending_signature,
        COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'approved' AND c.cash_paid_at IS NOT NULL AND c.driver_signature IS NULL), 0) as signature_amount,
        COUNT(*) FILTER (WHERE c.status = 'paid') as paid_count,
        COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'paid'), 0) as paid_amount,
        COUNT(*) as total_claims,
        COALESCE(SUM(c.amount), 0) as total_amount
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = 1
        AND LOWER(d.name) = 'driver'
        AND c.status IN ('approved', 'paid')
        ${dateFilter}
    `, params);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching driver claims summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Get approved claims grouped by driver
router.get('/by-driver', authenticateAdmin, async (req, res) => {
  try {
    const { month, year, status } = req.query;

    let dateFilter = '';
    const params = [];
    let paramCount = 0;

    if (month && year) {
      paramCount++;
      dateFilter += ` AND EXTRACT(MONTH FROM c.claim_date) = $${paramCount}`;
      params.push(month);
      paramCount++;
      dateFilter += ` AND EXTRACT(YEAR FROM c.claim_date) = $${paramCount}`;
      params.push(year);
    }

    // Default: show approved claims not yet paid
    let statusFilter = "AND c.status = 'approved' AND c.cash_paid_at IS NULL";
    if (status === 'pending_signature') {
      statusFilter = "AND c.status = 'approved' AND c.cash_paid_at IS NOT NULL AND c.driver_signature IS NULL";
    } else if (status === 'paid') {
      statusFilter = "AND c.status = 'paid'";
    } else if (status === 'all') {
      statusFilter = "AND c.status IN ('approved', 'paid')";
    }

    const result = await pool.query(`
      SELECT
        e.id as employee_id,
        e.name as driver_name,
        e.employee_id as emp_code,
        COUNT(*) as claim_count,
        SUM(c.amount) as total_amount,
        MIN(c.claim_date) as earliest_claim,
        MAX(c.claim_date) as latest_claim
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = 1
        AND LOWER(d.name) = 'driver'
        ${statusFilter}
        ${dateFilter}
      GROUP BY e.id, e.name, e.employee_id
      ORDER BY e.name
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching claims by driver:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// Get claims for a specific driver
router.get('/driver/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year, status } = req.query;

    let dateFilter = '';
    const params = [employeeId];
    let paramCount = 1;

    if (month && year) {
      paramCount++;
      dateFilter += ` AND EXTRACT(MONTH FROM c.claim_date) = $${paramCount}`;
      params.push(month);
      paramCount++;
      dateFilter += ` AND EXTRACT(YEAR FROM c.claim_date) = $${paramCount}`;
      params.push(year);
    }

    let statusFilter = "AND c.status IN ('approved', 'paid')";
    if (status === 'approved') {
      statusFilter = "AND c.status = 'approved' AND c.cash_paid_at IS NULL";
    } else if (status === 'pending_signature') {
      statusFilter = "AND c.status = 'approved' AND c.cash_paid_at IS NOT NULL AND c.driver_signature IS NULL";
    } else if (status === 'paid') {
      statusFilter = "AND c.status = 'paid'";
    }

    const result = await pool.query(`
      SELECT c.*, e.name as driver_name, e.employee_id as emp_code,
             au.name as paid_by_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      LEFT JOIN admin_users au ON c.cash_paid_by = au.id
      WHERE e.company_id = 1
        AND LOWER(d.name) = 'driver'
        AND e.id = $1
        ${statusFilter}
        ${dateFilter}
      ORDER BY c.claim_date DESC
    `, params);

    // Get driver info
    const driverResult = await pool.query(
      'SELECT id, name, employee_id FROM employees WHERE id = $1',
      [employeeId]
    );

    res.json({
      driver: driverResult.rows[0] || null,
      claims: result.rows
    });
  } catch (error) {
    console.error('Error fetching driver claims:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// =====================================================
// PAYMENT RELEASE
// =====================================================

// Release payment for selected claims (bulk)
router.post('/release', authenticateAdmin, async (req, res) => {
  try {
    const { claim_ids } = req.body;

    if (!claim_ids || !Array.isArray(claim_ids) || claim_ids.length === 0) {
      return res.status(400).json({ error: 'Claim IDs are required' });
    }

    // Only release approved claims from AA Alive drivers that haven't been paid yet
    const result = await pool.query(`
      UPDATE claims c
      SET cash_paid_at = NOW(),
          cash_paid_by = $1,
          updated_at = NOW()
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      WHERE c.employee_id = e.id
        AND e.company_id = 1
        AND LOWER(d.name) = 'driver'
        AND c.id = ANY($2)
        AND c.status = 'approved'
        AND c.cash_paid_at IS NULL
      RETURNING c.id, c.amount, c.employee_id
    `, [req.admin.id, claim_ids]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No eligible claims found to release' });
    }

    const totalAmount = result.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    res.json({
      message: `${result.rows.length} claims released for cash payment`,
      released_count: result.rows.length,
      total_amount: totalAmount,
      released_ids: result.rows.map(r => r.id)
    });
  } catch (error) {
    console.error('Error releasing claims:', error);
    res.status(500).json({ error: 'Failed to release claims' });
  }
});

// =====================================================
// DRIVER SIGNATURE
// =====================================================

// Get claims pending signature for a driver
router.get('/pending-signature/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;

    const result = await pool.query(`
      SELECT c.id, c.claim_date, c.category, c.description, c.amount,
             c.cash_paid_at, au.name as paid_by_name
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      LEFT JOIN admin_users au ON c.cash_paid_by = au.id
      WHERE e.company_id = 1
        AND LOWER(d.name) = 'driver'
        AND e.id = $1
        AND c.status = 'approved'
        AND c.cash_paid_at IS NOT NULL
        AND c.driver_signature IS NULL
      ORDER BY c.claim_date DESC
    `, [employeeId]);

    // Get driver info
    const driverResult = await pool.query(
      'SELECT id, name, employee_id FROM employees WHERE id = $1',
      [employeeId]
    );

    res.json({
      driver: driverResult.rows[0] || null,
      claims: result.rows,
      total_amount: result.rows.reduce((sum, c) => sum + parseFloat(c.amount), 0)
    });
  } catch (error) {
    console.error('Error fetching pending signature claims:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// Submit driver signature for released claims
router.post('/sign/:employeeId', authenticateAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    // Update all released (pending signature) claims for this driver
    const result = await pool.query(`
      UPDATE claims c
      SET driver_signature = $1,
          status = 'paid',
          updated_at = NOW()
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      WHERE c.employee_id = e.id
        AND e.company_id = 1
        AND LOWER(d.name) = 'driver'
        AND e.id = $2
        AND c.status = 'approved'
        AND c.cash_paid_at IS NOT NULL
        AND c.driver_signature IS NULL
      RETURNING c.id, c.amount
    `, [signature, employeeId]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No claims pending signature for this driver' });
    }

    const totalAmount = result.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    res.json({
      message: `${result.rows.length} claims signed and marked as paid`,
      paid_count: result.rows.length,
      total_amount: totalAmount,
      paid_ids: result.rows.map(r => r.id)
    });
  } catch (error) {
    console.error('Error signing claims:', error);
    res.status(500).json({ error: 'Failed to sign claims' });
  }
});

// =====================================================
// HISTORY - View paid claims with signatures
// =====================================================

router.get('/history', authenticateAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;

    let dateFilter = '';
    const params = [];
    let paramCount = 0;

    if (month && year) {
      paramCount++;
      dateFilter += ` AND EXTRACT(MONTH FROM c.cash_paid_at) = $${paramCount}`;
      params.push(month);
      paramCount++;
      dateFilter += ` AND EXTRACT(YEAR FROM c.cash_paid_at) = $${paramCount}`;
      params.push(year);
    }

    const result = await pool.query(`
      SELECT
        e.id as employee_id,
        e.name as driver_name,
        e.employee_id as emp_code,
        COUNT(*) as claim_count,
        SUM(c.amount) as total_amount,
        MAX(c.cash_paid_at) as last_paid_at,
        MAX(c.driver_signature) as signature
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = 1
        AND LOWER(d.name) = 'driver'
        AND c.status = 'paid'
        ${dateFilter}
      GROUP BY e.id, e.name, e.employee_id
      ORDER BY MAX(c.cash_paid_at) DESC
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
