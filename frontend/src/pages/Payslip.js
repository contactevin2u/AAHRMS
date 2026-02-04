import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { payrollApi } from '../api';
import Layout from '../components/Layout';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './Payslip.css';

function Payslip() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payslip, setPayslip] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef();

  // Check if company uses outlets (Mimix = company_id 3)
  const adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
  const isMimix = adminInfo.company_id === 3;

  useEffect(() => {
    fetchPayslip();
  }, [id]);

  const fetchPayslip = async () => {
    try {
      setLoading(true);
      // Try new payroll items API first (includes claims, OT details, etc.)
      try {
        const res = await payrollApi.getItemPayslip(id);
        setPayslip(res.data);
        return;
      } catch (err) {
        // If new API fails, fall back to old API
        console.log('Falling back to old payslip API');
      }
      // Old API fallback
      const res = await payrollApi.getPayslip(id);
      setPayslip(res.data);
    } catch (error) {
      console.error('Error fetching payslip:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    const element = printRef.current;
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      const fileName = `Payslip_${payslip.employee.code}_${payslip.period.month_name}_${payslip.period.year}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to download payslip. Please try printing instead.');
    }
  };

  const formatCurrency = (amount) => {
    return `RM ${parseFloat(amount || 0).toFixed(2)}`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading payslip...</div>
      </Layout>
    );
  }

  if (!payslip) {
    return (
      <Layout>
        <div className="error">Payslip not found</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="payslip-page">
        <div className="payslip-actions no-print">
          <button onClick={() => navigate(-1)} className="back-btn">
            Back
          </button>
          <button onClick={handleDownload} className="download-btn">
            Download PDF
          </button>
          <button onClick={handlePrint} className="print-btn">
            Print Payslip
          </button>
        </div>

        <div className="payslip-container" ref={printRef}>
          {/* Letterhead */}
          <div className="letterhead">
            <div className="letterhead-logo">
              <img src="/logo.png" alt="AA Alive" />
            </div>
            <div className="letterhead-info">
              <h1>AA Alive Sdn. Bhd.</h1>
              <p className="company-reg">Company No.: 1204108-D</p>
              <p className="company-address">
                1, Jalan Perusahaan Amari, Kawasan Industri Batu Caves,<br />
                68100 Batu Caves, Selangor
              </p>
            </div>
          </div>

          <div className="letter-divider"></div>

          {/* Payslip Title */}
          <div className="payslip-header">
            <div className="payslip-title">
              <h2>PAYSLIP</h2>
              <p>{payslip.period.month_name} {payslip.period.year}</p>
            </div>
          </div>

          {/* Employee Info */}
          <div className="employee-section">
            <div className="info-grid">
              <div className="info-row">
                <span className="label">Employee ID:</span>
                <span className="value">{payslip.employee.code}</span>
              </div>
              <div className="info-row">
                <span className="label">Name:</span>
                <span className="value">{payslip.employee.name}</span>
              </div>
              <div className="info-row">
                <span className="label">IC Number:</span>
                <span className="value">{payslip.employee.ic_number || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">{isMimix ? 'Outlet' : 'Department'}:</span>
                <span className="value">{isMimix ? payslip.employee.outlet_name : payslip.employee.department || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">Position:</span>
                <span className="value">{payslip.employee.position || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">EPF No:</span>
                <span className="value">{payslip.employee.epf_number || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">SOCSO No:</span>
                <span className="value">{payslip.employee.socso_number || '-'}</span>
              </div>
              <div className="info-row">
                <span className="label">Tax No:</span>
                <span className="value">{payslip.employee.tax_number || '-'}</span>
              </div>
            </div>
          </div>

          {/* Earnings and Deductions */}
          <div className="payslip-body">
            <div className="earnings-section">
              <h3>Earnings</h3>
              <table>
                <tbody>
                  {payslip.earnings.basic_salary > 0 && (
                    <tr>
                      <td>Basic Salary</td>
                      <td className="amount">{formatCurrency(payslip.earnings.basic_salary)}</td>
                    </tr>
                  )}
                  {payslip.earnings.wages > 0 && (
                    <tr>
                      <td>Wages {payslip.earnings.part_time_hours > 0 && `(${payslip.earnings.part_time_hours} hrs)`}</td>
                      <td className="amount">{formatCurrency(payslip.earnings.wages)}</td>
                    </tr>
                  )}
                  {(payslip.earnings.allowance > 0 || payslip.earnings.fixed_allowance > 0) && (
                    <tr>
                      <td>Allowance</td>
                      <td className="amount">{formatCurrency(payslip.earnings.allowance || payslip.earnings.fixed_allowance)}</td>
                    </tr>
                  )}
                  {(payslip.earnings.ot_pay > 0 || payslip.earnings.ot_amount > 0) && (
                    <tr>
                      <td>Overtime Pay {payslip.earnings.ot_hours > 0 && `(${payslip.earnings.ot_hours} hrs)`}</td>
                      <td className="amount">{formatCurrency(payslip.earnings.ot_pay || payslip.earnings.ot_amount)}</td>
                    </tr>
                  )}
                  {payslip.earnings.ph_pay > 0 && (
                    <tr>
                      <td>Public Holiday Pay {payslip.earnings.ph_days_worked > 0 && `(${payslip.earnings.ph_days_worked} days)`}</td>
                      <td className="amount">{formatCurrency(payslip.earnings.ph_pay)}</td>
                    </tr>
                  )}
                  {(payslip.earnings.commission > 0 || payslip.earnings.commission_amount > 0) && (
                    <tr>
                      <td>Commission</td>
                      <td className="amount">{formatCurrency(payslip.earnings.commission || payslip.earnings.commission_amount)}</td>
                    </tr>
                  )}
                  {payslip.earnings.trade_commission_amount > 0 && (
                    <tr>
                      <td>Upsell Commission</td>
                      <td className="amount">{formatCurrency(payslip.earnings.trade_commission_amount)}</td>
                    </tr>
                  )}
                  {payslip.earnings.incentive_amount > 0 && (
                    <tr>
                      <td>Incentive</td>
                      <td className="amount">{formatCurrency(payslip.earnings.incentive_amount)}</td>
                    </tr>
                  )}
                  {payslip.earnings.trip_pay > 0 && (
                    <tr>
                      <td>Trip Allowance</td>
                      <td className="amount">{formatCurrency(payslip.earnings.trip_pay)}</td>
                    </tr>
                  )}
                  {(payslip.earnings.outstation_pay > 0 || payslip.earnings.outstation_amount > 0) && (
                    <tr>
                      <td>Outstation Allowance</td>
                      <td className="amount">{formatCurrency(payslip.earnings.outstation_pay || payslip.earnings.outstation_amount)}</td>
                    </tr>
                  )}
                  {payslip.earnings.claims_amount > 0 && (
                    <tr>
                      <td>Claims</td>
                      <td className="amount">{formatCurrency(payslip.earnings.claims_amount)}</td>
                    </tr>
                  )}
                  {payslip.earnings.bonus > 0 && (
                    <tr>
                      <td>Bonus</td>
                      <td className="amount">{formatCurrency(payslip.earnings.bonus)}</td>
                    </tr>
                  )}
                  {payslip.earnings.attendance_bonus > 0 && (
                    <tr>
                      <td>Attendance Bonus</td>
                      <td className="amount">{formatCurrency(payslip.earnings.attendance_bonus)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td><strong>Gross Salary</strong></td>
                    <td className="amount"><strong>{formatCurrency(payslip.totals.gross_salary)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="deductions-section">
              <h3>Deductions</h3>
              <table>
                <tbody>
                  {payslip.deductions.epf_employee > 0 && (
                    <tr>
                      <td>EPF (Employee)</td>
                      <td className="amount">{formatCurrency(payslip.deductions.epf_employee)}</td>
                    </tr>
                  )}
                  {payslip.deductions.socso_employee > 0 && (
                    <tr>
                      <td>SOCSO (Employee)</td>
                      <td className="amount">{formatCurrency(payslip.deductions.socso_employee)}</td>
                    </tr>
                  )}
                  {payslip.deductions.eis_employee > 0 && (
                    <tr>
                      <td>EIS (Employee)</td>
                      <td className="amount">{formatCurrency(payslip.deductions.eis_employee)}</td>
                    </tr>
                  )}
                  {payslip.deductions.pcb > 0 && (
                    <tr>
                      <td>PCB (Income Tax)</td>
                      <td className="amount">{formatCurrency(payslip.deductions.pcb)}</td>
                    </tr>
                  )}
                  {payslip.deductions.absent_day_deduction > 0 && (
                    <tr>
                      <td>Absent Days {payslip.deductions.absent_days > 0 && `(${payslip.deductions.absent_days} days)`}</td>
                      <td className="amount">{formatCurrency(payslip.deductions.absent_day_deduction)}</td>
                    </tr>
                  )}
                  {payslip.deductions.short_hours_deduction > 0 && (
                    <tr>
                      <td>Short Hours {payslip.deductions.short_hours > 0 && `(${parseFloat(payslip.deductions.short_hours).toFixed(1)} hrs)`}</td>
                      <td className="amount">{formatCurrency(payslip.deductions.short_hours_deduction)}</td>
                    </tr>
                  )}
                  {payslip.deductions.unpaid_leave_deduction > 0 && (
                    <tr>
                      <td>Unpaid Leave {payslip.deductions.unpaid_leave_days > 0 && `(${payslip.deductions.unpaid_leave_days} days)`}</td>
                      <td className="amount">{formatCurrency(payslip.deductions.unpaid_leave_deduction)}</td>
                    </tr>
                  )}
                  {payslip.deductions.advance_deduction > 0 && (
                    <tr>
                      <td>Advance Deduction</td>
                      <td className="amount">{formatCurrency(payslip.deductions.advance_deduction)}</td>
                    </tr>
                  )}
                  {payslip.deductions.other_deductions > 0 && (
                    <tr>
                      <td>Other Deductions</td>
                      <td className="amount">{formatCurrency(payslip.deductions.other_deductions)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td><strong>Total Deductions</strong></td>
                    <td className="amount"><strong>{formatCurrency(payslip.totals.total_deductions)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Employer Contributions - only show if any contribution exists */}
          {payslip.employer_contributions && (
            payslip.employer_contributions.epf_employer > 0 ||
            payslip.employer_contributions.socso_employer > 0 ||
            payslip.employer_contributions.eis_employer > 0) && (
            <div className="employer-section">
              <h3>Employer Contributions (For Reference)</h3>
              <div className="employer-grid">
                {payslip.employer_contributions.epf_employer > 0 && (
                  <div className="contribution-item">
                    <span>EPF (Employer):</span>
                    <span>{formatCurrency(payslip.employer_contributions.epf_employer)}</span>
                  </div>
                )}
                {payslip.employer_contributions.socso_employer > 0 && (
                  <div className="contribution-item">
                    <span>SOCSO (Employer):</span>
                    <span>{formatCurrency(payslip.employer_contributions.socso_employer)}</span>
                  </div>
                )}
                {payslip.employer_contributions.eis_employer > 0 && (
                  <div className="contribution-item">
                    <span>EIS (Employer):</span>
                    <span>{formatCurrency(payslip.employer_contributions.eis_employer)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MyTax Breakdown - Show EPF/PCB split for admin to fill in LHDN MyTax */}
          {payslip.mytax_breakdown &&
           (payslip.mytax_breakdown.epf_on_normal > 0 || payslip.mytax_breakdown.epf_on_additional > 0) && (
            <div className="mytax-section no-print">
              <h3>MyTax Entry Guide (Admin Reference)</h3>
              <p className="mytax-note">Use these values when entering in LHDN MyTax / e-PCB:</p>
              <div className="mytax-grid">
                <div className="mytax-category">
                  <h4>Saraan Biasa (Normal Salary)</h4>
                  <div className="mytax-item">
                    <span>EPF (K1):</span>
                    <span>{formatCurrency(payslip.mytax_breakdown.epf_on_normal)}</span>
                  </div>
                  {payslip.mytax_breakdown.pcb_normal > 0 && (
                    <div className="mytax-item">
                      <span>PCB Bersih:</span>
                      <span>{formatCurrency(payslip.mytax_breakdown.pcb_normal)}</span>
                    </div>
                  )}
                </div>
                {payslip.mytax_breakdown.epf_on_additional > 0 && (
                  <div className="mytax-category">
                    <h4>Saraan Tambahan (Additional)</h4>
                    <div className="mytax-item">
                      <span>EPF (Kt):</span>
                      <span>{formatCurrency(payslip.mytax_breakdown.epf_on_additional)}</span>
                    </div>
                    {payslip.mytax_breakdown.pcb_additional > 0 && (
                      <div className="mytax-item">
                        <span>PCB Tambahan:</span>
                        <span>{formatCurrency(payslip.mytax_breakdown.pcb_additional)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Net Pay */}
          <div className="net-pay-section">
            <div className="net-pay">
              <span>NET PAY</span>
              <span className="net-amount">{formatCurrency(payslip.totals.net_pay || payslip.totals.net_salary)}</span>
            </div>
          </div>

          {/* Bank Info */}
          {payslip.employee.bank_name && (
            <div className="bank-section">
              <h3>Payment Details</h3>
              <p>
                Bank: {payslip.employee.bank_name}<br />
                Account No: {payslip.employee.bank_account_no}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="payslip-footer">
            <p>This is a computer-generated payslip. No signature required.</p>
            <p>Generated on: {new Date().toLocaleDateString('en-MY')}</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Payslip;
