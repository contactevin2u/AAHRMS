import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { payrollApi } from '../api';
import Layout from '../components/Layout';
import './Payslip.css';

function Payslip() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payslip, setPayslip] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef();

  useEffect(() => {
    fetchPayslip();
  }, [id]);

  const fetchPayslip = async () => {
    try {
      setLoading(true);
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
                <span className="label">Department:</span>
                <span className="value">{payslip.employee.department || '-'}</span>
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
                  {payslip.earnings.allowance > 0 && (
                    <tr>
                      <td>Allowance</td>
                      <td className="amount">{formatCurrency(payslip.earnings.allowance)}</td>
                    </tr>
                  )}
                  {payslip.earnings.commission > 0 && (
                    <tr>
                      <td>Commission</td>
                      <td className="amount">{formatCurrency(payslip.earnings.commission)}</td>
                    </tr>
                  )}
                  {payslip.earnings.trip_pay > 0 && (
                    <tr>
                      <td>Trip Allowance</td>
                      <td className="amount">{formatCurrency(payslip.earnings.trip_pay)}</td>
                    </tr>
                  )}
                  {payslip.earnings.ot_pay > 0 && (
                    <tr>
                      <td>Overtime Pay</td>
                      <td className="amount">{formatCurrency(payslip.earnings.ot_pay)}</td>
                    </tr>
                  )}
                  {payslip.earnings.outstation_pay > 0 && (
                    <tr>
                      <td>Outstation Allowance</td>
                      <td className="amount">{formatCurrency(payslip.earnings.outstation_pay)}</td>
                    </tr>
                  )}
                  {payslip.earnings.bonus > 0 && (
                    <tr>
                      <td>Bonus</td>
                      <td className="amount">{formatCurrency(payslip.earnings.bonus)}</td>
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
                      <td>EPF (Employee 11%)</td>
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
                      <td>EIS (Employee 0.2%)</td>
                      <td className="amount">{formatCurrency(payslip.deductions.eis_employee)}</td>
                    </tr>
                  )}
                  {payslip.deductions.pcb > 0 && (
                    <tr>
                      <td>PCB (Income Tax)</td>
                      <td className="amount">{formatCurrency(payslip.deductions.pcb)}</td>
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

          {/* Employer Contributions */}
          <div className="employer-section">
            <h3>Employer Contributions (For Reference)</h3>
            <div className="employer-grid">
              <div className="contribution-item">
                <span>EPF (Employer):</span>
                <span>{formatCurrency(payslip.employer_contributions.epf_employer)}</span>
              </div>
              <div className="contribution-item">
                <span>SOCSO (Employer):</span>
                <span>{formatCurrency(payslip.employer_contributions.socso_employer)}</span>
              </div>
              <div className="contribution-item">
                <span>EIS (Employer):</span>
                <span>{formatCurrency(payslip.employer_contributions.eis_employer)}</span>
              </div>
            </div>
          </div>

          {/* Net Pay */}
          <div className="net-pay-section">
            <div className="net-pay">
              <span>NET PAY</span>
              <span className="net-amount">{formatCurrency(payslip.totals.net_salary)}</span>
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
