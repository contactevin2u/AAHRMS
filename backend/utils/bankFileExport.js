/**
 * Malaysian Bank File Export Utility
 *
 * Generates bank-specific file formats for salary payments via:
 * - Maybank IBG (Interbank GIRO)
 * - CIMB BizChannel
 * - Public Bank
 * - RHB Corporate Banking
 * - Generic CSV
 *
 * File formats follow official bank specifications for bulk salary transfers.
 */

const pool = require('../db');

/**
 * Bank-specific format generators
 */
const formatters = {
  /**
   * Maybank Bulk Transfer CSV Format
   * For Maybank2u/M2U Biz bulk salary payment upload
   */
  maybankbulk: {
    name: 'Maybank Bulk Transfer',
    extension: 'csv',
    generate: (payrollItems, options = {}) => {
      const lines = [];

      // Format crediting date as DD/MM/YYYY
      let creditDate = options.creditingDate;
      if (!creditDate) {
        // Default to 5th of next month
        const nextMonth = parseInt(options.month) === 12 ? 1 : parseInt(options.month) + 1;
        const creditYear = parseInt(options.month) === 12 ? parseInt(options.year) + 1 : parseInt(options.year);
        creditDate = `05/${String(nextMonth).padStart(2, '0')}/${creditYear}`;
      }

      // Header section (6 rows)
      lines.push('Employer Info :,,,,,,,');
      lines.push(`Crediting Date (eg. dd/MM/yyyy),${creditDate},,,,,,`);
      lines.push('Payment Reference,,,,,,,');
      lines.push('Payment Description,,,,,,,');
      lines.push('Bulk Payment Type,Salary,,,,,,');
      lines.push(',,,,,,,');

      // Column headers
      lines.push('Beneficiary Name,Beneficiary Bank,Beneficiary Account No,ID Type,ID Number,Payment Amount,Payment Reference,Payment Description');

      // Data rows
      payrollItems.forEach(item => {
        const bankName = getMaybankBulkBankName(item.bank_name);
        // Strip dashes from IC number (e.g., 061009-14-1125 -> 061009141125)
        const icNumber = (item.ic_number || '').replace(/-/g, '');
        // Clean name - remove commas to avoid CSV issues
        const cleanName = (item.employee_name || '').toUpperCase().replace(/,/g, '');

        // Generate payment reference like SALARYJAN2026
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const paymentRef = `SALARY${monthNames[parseInt(options.month) - 1]}${options.year}`;

        const line = [
          cleanName,
          bankName,
          item.bank_account_no || '',
          'NRIC',
          icNumber,
          (parseFloat(item.net_pay) || 0).toFixed(2),
          paymentRef,
          paymentRef
        ].join(',');

        lines.push(line);
      });

      // Add empty line at end (required by Maybank format)
      lines.push('');

      return lines.join('\r\n');
    }
  },

  /**
   * Maybank IBG (Interbank GIRO) Format
   * Fixed-width text file format
   */
  maybank: {
    name: 'Maybank IBG',
    extension: 'txt',
    generate: (payrollItems, options = {}) => {
      const lines = [];
      const paymentDate = options.paymentDate || new Date().toISOString().split('T')[0].replace(/-/g, '');
      const batchRef = options.batchRef || `PAY${Date.now()}`;

      // Header record (01)
      const headerLine = [
        '01',                                    // Record type
        padRight(options.companyName || 'COMPANY', 35),  // Company name
        padLeft(options.maybankAccountNo || '', 17),     // Paying account no
        paymentDate,                             // Value date (YYYYMMDD)
        padLeft(String(payrollItems.length), 6, '0'),    // Total records
        padLeft(formatAmount(getTotalAmount(payrollItems)), 15, '0'), // Total amount (2 dec)
        padRight(batchRef, 20),                  // Batch reference
        'S'                                      // Transaction type (S=Salary)
      ].join('');

      lines.push(headerLine);

      // Detail records (02)
      payrollItems.forEach((item, index) => {
        const detailLine = [
          '02',                                  // Record type
          padLeft(String(index + 1), 6, '0'),    // Sequence number
          padRight(item.bank_account_no || '', 17),      // Beneficiary account
          padRight(getBankCode(item.bank_name), 11),     // Bank code
          padRight(item.employee_name || '', 35),        // Beneficiary name
          padLeft(formatAmount(item.net_pay), 15, '0'),  // Amount (2 dec)
          padRight(item.employee_id || '', 20),          // Reference (emp ID)
          padRight(getBankCode(item.bank_name) === '8' ? 'I' : 'L', 1), // I=IBG, L=Local
          padRight('', 50)                       // Filler
        ].join('');

        lines.push(detailLine);
      });

      return lines.join('\r\n');
    }
  },

  /**
   * CIMB BizChannel Format
   * CSV format with specific column structure
   */
  cimb: {
    name: 'CIMB BizChannel',
    extension: 'csv',
    generate: (payrollItems, options = {}) => {
      const lines = [];

      // Header
      lines.push([
        'Beneficiary Account No',
        'Beneficiary Name',
        'Beneficiary ID',
        'Amount',
        'Bank Code',
        'Payment Reference',
        'Payment Details',
        'Email'
      ].join(','));

      // Detail records
      payrollItems.forEach(item => {
        const line = [
          escapeCsv(item.bank_account_no || ''),
          escapeCsv(item.employee_name || ''),
          escapeCsv(item.ic_number || item.employee_id || ''),
          (parseFloat(item.net_pay) || 0).toFixed(2),
          escapeCsv(getBankCode(item.bank_name)),
          escapeCsv(`SALARY ${options.month}/${options.year}`),
          escapeCsv(`Salary payment for ${item.employee_name}`),
          escapeCsv(item.email || '')
        ].join(',');

        lines.push(line);
      });

      return lines.join('\r\n');
    }
  },

  /**
   * Public Bank Format
   * Fixed-width text file format
   */
  publicbank: {
    name: 'Public Bank',
    extension: 'txt',
    generate: (payrollItems, options = {}) => {
      const lines = [];
      const paymentDate = options.paymentDate || new Date().toISOString().split('T')[0].replace(/-/g, '');

      // Header
      const header = [
        'H',                                     // Record type
        padRight(options.companyCode || '', 10),         // Company code
        padRight(options.publicBankAccountNo || '', 14), // Debit account
        paymentDate,                             // Value date
        padLeft(String(payrollItems.length), 6, '0'),    // Total count
        padLeft(formatAmount(getTotalAmount(payrollItems)), 13, '0')
      ].join('');

      lines.push(header);

      // Details
      payrollItems.forEach((item, index) => {
        const detail = [
          'D',                                   // Record type
          padLeft(String(index + 1), 6, '0'),    // Sequence
          padRight(item.bank_account_no || '', 14),      // Credit account
          padLeft(formatAmount(item.net_pay), 13, '0'),  // Amount
          padRight(item.employee_name || '', 40),        // Name
          padRight(item.ic_number || '', 14),            // ID
          padRight('SALARY', 20)                         // Reference
        ].join('');

        lines.push(detail);
      });

      // Trailer
      const trailer = [
        'T',
        padLeft(String(payrollItems.length + 1), 6, '0'),
        padLeft(formatAmount(getTotalAmount(payrollItems)), 15, '0')
      ].join('');

      lines.push(trailer);

      return lines.join('\r\n');
    }
  },

  /**
   * RHB Corporate Format
   * CSV with specific columns
   */
  rhb: {
    name: 'RHB Corporate',
    extension: 'csv',
    generate: (payrollItems, options = {}) => {
      const lines = [];

      // Header
      lines.push([
        'RECORD TYPE',
        'TRANSACTION REF',
        'BENEFICIARY NAME',
        'BENEFICIARY ACCOUNT',
        'BENEFICIARY BANK',
        'AMOUNT',
        'EMAIL',
        'NARRATIVE'
      ].join(','));

      // Details
      payrollItems.forEach((item, index) => {
        const txnRef = `SAL${options.year}${String(options.month).padStart(2, '0')}${String(index + 1).padStart(4, '0')}`;

        const line = [
          'D',
          escapeCsv(txnRef),
          escapeCsv(item.employee_name || ''),
          escapeCsv(item.bank_account_no || ''),
          escapeCsv(getBankCode(item.bank_name)),
          (parseFloat(item.net_pay) || 0).toFixed(2),
          escapeCsv(item.email || ''),
          escapeCsv(`Salary ${options.month}/${options.year}`)
        ].join(',');

        lines.push(line);
      });

      return lines.join('\r\n');
    }
  },

  /**
   * Generic CSV Format
   * Universal format that works with most banks
   */
  csv: {
    name: 'Generic CSV',
    extension: 'csv',
    generate: (payrollItems, options = {}) => {
      const lines = [];

      // Header
      lines.push([
        'Employee ID',
        'Employee Name',
        'IC Number',
        'Bank Name',
        'Bank Account No',
        'Net Pay (RM)',
        'Reference'
      ].join(','));

      // Details
      payrollItems.forEach(item => {
        const line = [
          escapeCsv(item.employee_id || ''),
          escapeCsv(item.employee_name || ''),
          escapeCsv(item.ic_number || ''),
          escapeCsv(item.bank_name || ''),
          escapeCsv(item.bank_account_no || ''),
          (parseFloat(item.net_pay) || 0).toFixed(2),
          escapeCsv(`SALARY-${options.month}/${options.year}`)
        ].join(',');

        lines.push(line);
      });

      return lines.join('\r\n');
    }
  }
};

/**
 * Helper functions
 */

function padRight(str, len, char = ' ') {
  return String(str || '').padEnd(len, char).substring(0, len);
}

function padLeft(str, len, char = ' ') {
  return String(str || '').padStart(len, char).substring(0, len);
}

function formatAmount(amount) {
  return Math.round((parseFloat(amount) || 0) * 100).toString();
}

function getTotalAmount(items) {
  return items.reduce((sum, item) => sum + (parseFloat(item.net_pay) || 0), 0);
}

function escapeCsv(str) {
  if (!str) return '';
  const escaped = String(str).replace(/"/g, '""');
  return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
    ? `"${escaped}"`
    : escaped;
}

/**
 * Get bank name for Maybank Bulk Transfer format
 * Returns the exact bank name as expected by Maybank's bulk payment system
 */
function getMaybankBulkBankName(bankName) {
  if (!bankName) return '';

  const bankNameMap = {
    'maybank': 'MAYBANK',
    'malayan banking': 'MAYBANK',
    'cimb': 'CIMB',
    'public bank': 'PUBLIC BANK',
    'publicbank': 'PUBLIC BANK',
    'rhb': 'RHB',
    'hong leong': 'HONG LEONG',
    'hlb': 'HONG LEONG',
    'ambank': 'AMBANK',
    'bank islam': 'BANK ISLAM',
    'bimb': 'BANK ISLAM',
    'bank rakyat': 'BANK RAKYAT',
    'bank muamalat': 'MUAMALAT',
    'muamalat': 'MUAMALAT',
    'affin': 'AFFIN BANK',
    'alliance': 'ALLIANCE BANK',
    'standard chartered': 'STANDARD CHARTERED',
    'hsbc': 'HSBC',
    'ocbc': 'OCBC',
    'uob': 'UOB',
    'bsn': 'BSN',
    'bank simpanan nasional': 'BSN',
    'agro bank': 'AGRO BANK',
    'agrobank': 'AGRO BANK'
  };

  const normalizedName = bankName.toLowerCase().trim();
  for (const [key, name] of Object.entries(bankNameMap)) {
    if (normalizedName.includes(key)) {
      return name;
    }
  }

  // Return original name uppercase if no match found
  return bankName.toUpperCase();
}

/**
 * Get Malaysian bank swift/MEPS code
 */
function getBankCode(bankName) {
  if (!bankName) return '';

  const bankCodes = {
    'maybank': 'MBBEMYKL',
    'malayan banking': 'MBBEMYKL',
    'cimb': 'CIBBMYKL',
    'public bank': 'PBBEMYKL',
    'rhb': 'RHBBMYKL',
    'hong leong': 'HLBBMYKL',
    'ambank': 'ARBKMYKL',
    'bank islam': 'BIMBMYKL',
    'bank rakyat': 'BKRMMYKL',
    'affin': 'PHBMMYKL',
    'alliance': 'MFBBMYKL',
    'standard chartered': 'SCBLMYKX',
    'hsbc': 'HBMBMYKL',
    'ocbc': 'OCBCMYKL',
    'uob': 'UOVBMYKL',
    'bsn': 'BSNAMYK1'
  };

  const normalizedName = bankName.toLowerCase();
  for (const [key, code] of Object.entries(bankCodes)) {
    if (normalizedName.includes(key)) {
      return code;
    }
  }

  return 'UNKNOWN';
}

/**
 * Generate bank file for a payroll run
 * @param {number} runId - Payroll run ID
 * @param {string} format - Bank format (maybank, cimb, publicbank, rhb, csv)
 * @param {Object} options - Additional options
 * @returns {Object} File content and metadata
 */
async function generateBankFile(runId, format = 'csv', options = {}) {
  // Validate format
  const formatter = formatters[format.toLowerCase()];
  if (!formatter) {
    throw new Error(`Unknown bank format: ${format}. Available: ${Object.keys(formatters).join(', ')}`);
  }

  // Get payroll run details
  const runResult = await pool.query(`
    SELECT pr.*, c.name as company_name
    FROM payroll_runs pr
    JOIN companies c ON pr.company_id = c.id
    WHERE pr.id = $1
  `, [runId]);

  if (runResult.rows.length === 0) {
    throw new Error('Payroll run not found');
  }

  const run = runResult.rows[0];

  // Get payroll items with bank details
  const itemsResult = await pool.query(`
    SELECT
      pi.*,
      e.employee_id,
      e.name as employee_name,
      e.ic_number,
      e.bank_name,
      e.bank_account_no,
      e.email
    FROM payroll_items pi
    JOIN employees e ON pi.employee_id = e.id
    WHERE pi.payroll_run_id = $1
      AND e.bank_account_no IS NOT NULL
      AND e.bank_account_no != ''
    ORDER BY e.name
  `, [runId]);

  if (itemsResult.rows.length === 0) {
    throw new Error('No employees with bank details found');
  }

  // Generate file content
  const fileOptions = {
    ...options,
    companyName: run.company_name,
    month: run.month,
    year: run.year,
    paymentDate: options.paymentDate || run.payment_due_date
  };

  const content = formatter.generate(itemsResult.rows, fileOptions);

  // Generate filename
  const filename = `salary_${run.year}_${String(run.month).padStart(2, '0')}_${format}.${formatter.extension}`;

  return {
    content,
    filename,
    format: formatter.name,
    extension: formatter.extension,
    records: itemsResult.rows.length,
    total_amount: getTotalAmount(itemsResult.rows),
    generated_at: new Date().toISOString()
  };
}

/**
 * Get list of available bank formats
 */
function getAvailableFormats() {
  return Object.entries(formatters).map(([key, formatter]) => ({
    key,
    name: formatter.name,
    extension: formatter.extension
  }));
}

module.exports = {
  generateBankFile,
  getAvailableFormats,
  formatters,
  getBankCode
};
