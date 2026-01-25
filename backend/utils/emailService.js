/**
 * Email Notification Service
 *
 * Provides email functionality for payroll notifications including:
 * - OT approval requests
 * - Payroll generation notifications
 * - Payslip availability notifications
 *
 * Configuration via environment variables:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * - EMAIL_FROM (sender address)
 * - EMAIL_ENABLED (true/false to enable/disable)
 */

const nodemailer = require('nodemailer');

// Email configuration
const config = {
  enabled: process.env.EMAIL_ENABLED === 'true',
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.EMAIL_FROM || 'noreply@aahrms.com'
};

// Create transporter (lazy initialization)
let transporter = null;

function getTransporter() {
  if (!transporter && config.enabled && config.user && config.pass) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    });
  }
  return transporter;
}

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @returns {Promise<Object>} - Send result
 */
async function sendEmail({ to, subject, html, text }) {
  if (!config.enabled) {
    console.log('[EmailService] Email disabled, skipping:', subject);
    return { success: false, reason: 'Email service disabled' };
  }

  const transport = getTransporter();
  if (!transport) {
    console.error('[EmailService] Transporter not configured');
    return { success: false, reason: 'Email service not configured' };
  }

  try {
    const result = await transport.sendMail({
      from: config.from,
      to,
      subject,
      html,
      text: text || stripHtml(html)
    });

    console.log('[EmailService] Email sent:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('[EmailService] Failed to send email:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * Strip HTML tags for plain text fallback
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ============================================================
// EMAIL TEMPLATES
// ============================================================

/**
 * Send OT approval request notification to supervisor
 */
async function sendOTApprovalRequest({ supervisorEmail, supervisorName, employeeName, otHours, workDate, otId }) {
  const subject = `OT Approval Required: ${employeeName} - ${otHours} hours`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">OT Approval Required</h2>
      <p>Dear ${supervisorName},</p>
      <p>An overtime claim requires your approval:</p>
      <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <tr style="background: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Employee</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${employeeName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Work Date</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${workDate}</td>
        </tr>
        <tr style="background: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>OT Hours</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${otHours} hours</td>
        </tr>
      </table>
      <p>Please log in to the ESS portal to approve or reject this request.</p>
      <p style="color: #666; font-size: 12px;">This is an automated message from AA HRMS.</p>
    </div>
  `;

  return sendEmail({ to: supervisorEmail, subject, html });
}

/**
 * Send OT approval/rejection notification to employee
 */
async function sendOTDecisionNotification({ employeeEmail, employeeName, otHours, workDate, decision, reason }) {
  const isApproved = decision === 'approved';
  const subject = `OT ${isApproved ? 'Approved' : 'Rejected'}: ${workDate} - ${otHours} hours`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${isApproved ? '#28a745' : '#dc3545'};">
        OT ${isApproved ? 'Approved' : 'Rejected'}
      </h2>
      <p>Dear ${employeeName},</p>
      <p>Your overtime claim has been ${decision}:</p>
      <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <tr style="background: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Work Date</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${workDate}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>OT Hours</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${otHours} hours</td>
        </tr>
        <tr style="background: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Status</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd; color: ${isApproved ? '#28a745' : '#dc3545'};">
            <strong>${isApproved ? 'APPROVED' : 'REJECTED'}</strong>
          </td>
        </tr>
        ${!isApproved && reason ? `
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Reason</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${reason}</td>
        </tr>
        ` : ''}
      </table>
      ${isApproved ? '<p>The approved OT will be included in your next payroll.</p>' : ''}
      <p style="color: #666; font-size: 12px;">This is an automated message from AA HRMS.</p>
    </div>
  `;

  return sendEmail({ to: employeeEmail, subject, html });
}

/**
 * Send payroll generated notification
 */
async function sendPayrollGeneratedNotification({ adminEmail, adminName, month, year, employeeCount, totalNet }) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1];

  const subject = `Payroll Generated: ${monthName} ${year}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Payroll Generated Successfully</h2>
      <p>Dear ${adminName},</p>
      <p>The payroll for ${monthName} ${year} has been generated:</p>
      <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <tr style="background: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Period</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${monthName} ${year}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Employees</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${employeeCount}</td>
        </tr>
        <tr style="background: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Net Pay</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">RM ${totalNet.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
        </tr>
      </table>
      <p>Please log in to the admin portal to review and finalize the payroll.</p>
      <p style="color: #666; font-size: 12px;">This is an automated message from AA HRMS.</p>
    </div>
  `;

  return sendEmail({ to: adminEmail, subject, html });
}

/**
 * Send payslip availability notification to employee
 */
async function sendPayslipNotification({ employeeEmail, employeeName, month, year, netPay }) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1];

  const subject = `Your Payslip for ${monthName} ${year} is Ready`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Payslip Available</h2>
      <p>Dear ${employeeName},</p>
      <p>Your payslip for ${monthName} ${year} is now available.</p>
      <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center;">
        <p style="margin: 0; color: #666;">Net Pay</p>
        <p style="margin: 10px 0 0 0; font-size: 24px; color: #28a745; font-weight: bold;">
          RM ${netPay.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
        </p>
      </div>
      <p>Log in to the ESS portal to view your full payslip details.</p>
      <p style="color: #666; font-size: 12px;">This is an automated message from AA HRMS.</p>
    </div>
  `;

  return sendEmail({ to: employeeEmail, subject, html });
}

/**
 * Send bulk payslip notifications to all employees in a payroll run
 */
async function sendBulkPayslipNotifications(payrollItems, month, year) {
  const results = {
    sent: 0,
    failed: 0,
    skipped: 0
  };

  for (const item of payrollItems) {
    if (!item.employee_email) {
      results.skipped++;
      continue;
    }

    const result = await sendPayslipNotification({
      employeeEmail: item.employee_email,
      employeeName: item.employee_name,
      month,
      year,
      netPay: item.net_pay
    });

    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Test email configuration
 */
async function testEmailConfig(testEmail) {
  if (!config.enabled) {
    return { success: false, reason: 'Email service is disabled' };
  }

  const transport = getTransporter();
  if (!transport) {
    return { success: false, reason: 'Email service not configured (missing SMTP credentials)' };
  }

  try {
    await transport.verify();
    console.log('[EmailService] SMTP connection verified');

    // Send test email
    const result = await sendEmail({
      to: testEmail,
      subject: 'AA HRMS Email Test',
      html: '<p>This is a test email from AA HRMS. If you received this, email notifications are working correctly.</p>'
    });

    return result;
  } catch (error) {
    console.error('[EmailService] SMTP verification failed:', error);
    return { success: false, reason: error.message };
  }
}

module.exports = {
  sendEmail,
  sendOTApprovalRequest,
  sendOTDecisionNotification,
  sendPayrollGeneratedNotification,
  sendPayslipNotification,
  sendBulkPayslipNotifications,
  testEmailConfig,
  config
};
