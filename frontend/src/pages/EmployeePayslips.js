import React, { useState, useEffect } from 'react';
import { essApi } from '../api';
import EmployeeLayout from '../components/EmployeeLayout';
import './EmployeePayslips.css';

function EmployeePayslips() {
  const [loading, setLoading] = useState(true);
  const [payslips, setPayslips] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPayslip, setSelectedPayslip] = useState(null);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    fetchPayslips();
  }, [selectedYear]);

  const fetchPayslips = async () => {
    try {
      setLoading(true);
      const res = await essApi.getPayslips({ year: selectedYear });
      setPayslips(res.data);
    } catch (error) {
      console.error('Error fetching payslips:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const getMonthName = (month) => {
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month] || '';
  };

  const viewPayslip = async (payslip) => {
    try {
      const res = await essApi.getPayslip(payslip.id);
      setSelectedPayslip(res.data);
    } catch (error) {
      console.error('Error fetching payslip details:', error);
    }
  };

  return (
    <EmployeeLayout>
      <div className="ess-payslips">
        <header className="ess-page-header">
          <div>
            <h1>Salary Records</h1>
            <p>View your monthly salary and payslips</p>
          </div>
          <div className="filter-section">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </header>

        {loading ? (
          <div className="ess-loading">Loading payslips...</div>
        ) : payslips.length === 0 ? (
          <div className="no-data-card">
            <p>No payslips found for {selectedYear}</p>
          </div>
        ) : (
          <div className="payslips-grid">
            {payslips.map(payslip => (
              <div
                key={payslip.id}
                className="payslip-card"
                onClick={() => viewPayslip(payslip)}
              >
                <div className="payslip-month-header">
                  {getMonthName(payslip.month)} {payslip.year}
                </div>
                <div className="payslip-details">
                  <div className="payslip-row">
                    <span>Gross Pay</span>
                    <span>{formatCurrency(payslip.gross_salary)}</span>
                  </div>
                  <div className="payslip-row">
                    <span>Deductions</span>
                    <span className="deduction">-{formatCurrency(payslip.total_deductions)}</span>
                  </div>
                  <div className="payslip-row net">
                    <span>Net Pay</span>
                    <span>{formatCurrency(payslip.net_pay)}</span>
                  </div>
                </div>
                <div className="payslip-status">
                  <span className={`status ${payslip.run_status}`}>
                    {payslip.run_status === 'finalized' ? 'Finalized' : 'Draft'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payslip Detail Modal */}
        {selectedPayslip && (
          <div className="modal-overlay" onClick={() => setSelectedPayslip(null)}>
            <div className="modal payslip-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Payslip - {getMonthName(selectedPayslip.month)} {selectedPayslip.year}</h2>
                <div className="modal-header-actions">
                  <button className="btn-print" onClick={() => window.print()}>Print</button>
                  <button className="close-btn" onClick={() => setSelectedPayslip(null)}>×</button>
                </div>
              </div>
              <div className="modal-body">
                {/* Payslip with Letterhead */}
                <div className="payslip-preview" id="payslip-print">
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
                  <div className="payslip-title-section">
                    <h2>PAYSLIP</h2>
                    <p>{getMonthName(selectedPayslip.month)} {selectedPayslip.year}</p>
                  </div>

                <section className="payslip-section">
                  <h3>Earnings</h3>
                  <div className="payslip-items">
                    <div className="payslip-item">
                      <span>Basic Salary</span>
                      <span>{formatCurrency(selectedPayslip.basic_salary)}</span>
                    </div>
                    {selectedPayslip.fixed_allowance > 0 && (
                      <div className="payslip-item">
                        <span>Fixed Allowance</span>
                        <span>{formatCurrency(selectedPayslip.fixed_allowance)}</span>
                      </div>
                    )}
                    {selectedPayslip.ot_amount > 0 && (
                      <div className="payslip-item">
                        <span>Overtime</span>
                        <span>{formatCurrency(selectedPayslip.ot_amount)}</span>
                      </div>
                    )}
                    {selectedPayslip.commission_amount > 0 && (
                      <div className="payslip-item">
                        <span>Commission</span>
                        <span>{formatCurrency(selectedPayslip.commission_amount)}</span>
                      </div>
                    )}
                    {selectedPayslip.incentive_amount > 0 && (
                      <div className="payslip-item">
                        <span>Incentive</span>
                        <span>{formatCurrency(selectedPayslip.incentive_amount)}</span>
                      </div>
                    )}
                    {selectedPayslip.bonus > 0 && (
                      <div className="payslip-item">
                        <span>Bonus</span>
                        <span>{formatCurrency(selectedPayslip.bonus)}</span>
                      </div>
                    )}
                    {selectedPayslip.claims_amount > 0 && (
                      <div className="payslip-item">
                        <span>Claims</span>
                        <span>{formatCurrency(selectedPayslip.claims_amount)}</span>
                      </div>
                    )}
                    <div className="payslip-item total">
                      <span>Gross Pay</span>
                      <span>{formatCurrency(selectedPayslip.gross_salary)}</span>
                    </div>
                  </div>
                </section>

                <section className="payslip-section">
                  <h3>Deductions</h3>
                  <div className="payslip-items">
                    {selectedPayslip.epf_employee > 0 && (
                      <div className="payslip-item">
                        <span>EPF (Employee)</span>
                        <span>{formatCurrency(selectedPayslip.epf_employee)}</span>
                      </div>
                    )}
                    {selectedPayslip.socso_employee > 0 && (
                      <div className="payslip-item">
                        <span>SOCSO (Employee)</span>
                        <span>{formatCurrency(selectedPayslip.socso_employee)}</span>
                      </div>
                    )}
                    {selectedPayslip.eis_employee > 0 && (
                      <div className="payslip-item">
                        <span>EIS (Employee)</span>
                        <span>{formatCurrency(selectedPayslip.eis_employee)}</span>
                      </div>
                    )}
                    {selectedPayslip.pcb > 0 && (
                      <div className="payslip-item">
                        <span>PCB (Tax)</span>
                        <span>{formatCurrency(selectedPayslip.pcb)}</span>
                      </div>
                    )}
                    {selectedPayslip.unpaid_leave_deduction > 0 && (
                      <div className="payslip-item">
                        <span>Unpaid Leave</span>
                        <span>{formatCurrency(selectedPayslip.unpaid_leave_deduction)}</span>
                      </div>
                    )}
                    {selectedPayslip.other_deductions > 0 && (
                      <div className="payslip-item">
                        <span>Other Deductions</span>
                        <span>{formatCurrency(selectedPayslip.other_deductions)}</span>
                      </div>
                    )}
                    <div className="payslip-item total">
                      <span>Total Deductions</span>
                      <span>{formatCurrency(selectedPayslip.total_deductions)}</span>
                    </div>
                  </div>
                </section>

                <section className="payslip-section net-section">
                  <div className="net-pay-row">
                    <span>Net Pay</span>
                    <span className="net-amount">{formatCurrency(selectedPayslip.net_pay)}</span>
                  </div>
                </section>

                {selectedPayslip.notes && (
                  <section className="payslip-section">
                    <h3>Notes</h3>
                    <p className="notes-text">{selectedPayslip.notes}</p>
                  </section>
                )}

                  {/* Footer */}
                  <div className="payslip-footer">
                    <p>This is a computer-generated payslip. No signature required.</p>
                    <p>Generated on: {new Date().toLocaleDateString('en-MY')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </EmployeeLayout>
  );
}

export default EmployeePayslips;
