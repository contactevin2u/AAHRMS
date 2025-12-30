import React, { useState, useEffect } from 'react';
import { essApi } from '../../api';
import ESSLayout from '../../components/ESSLayout';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './ESSPayslips.css';

function ESSPayslips() {
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payslips, setPayslips] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPayslip, setSelectedPayslip] = useState(null);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    const storedInfo = localStorage.getItem('employeeInfo');
    if (storedInfo) {
      setEmployeeInfo(JSON.parse(storedInfo));
    }
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

  const handleDownload = async () => {
    const element = document.getElementById('payslip-print');
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
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      const fileName = `Payslip_${getMonthName(selectedPayslip.month)}_${selectedPayslip.year}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to download payslip. Please try printing instead.');
    }
  };

  // Get company logo
  const getCompanyLogo = () => {
    const companyId = employeeInfo?.company_id;
    const companyLogos = {
      1: '/logos/aa-alive.png',
      3: '/logos/mixue.png'
    };
    return companyLogos[companyId] || '/logos/hr-default.png';
  };

  return (
    <ESSLayout>
      <div className="ess-payslips-page">
        {/* Page Header */}
        <div className="ess-page-header">
          <div className="header-content">
            <h1>Payslips</h1>
            <p>View your monthly salary records</p>
          </div>
          <select
            className="year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="ess-loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        ) : payslips.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">&#x1F4B5;</span>
            <p>No payslips found for {selectedYear}</p>
          </div>
        ) : (
          <div className="payslips-list">
            {payslips.map(payslip => (
              <div
                key={payslip.id}
                className="payslip-card"
                onClick={() => viewPayslip(payslip)}
              >
                <div className="payslip-month">
                  <span className="month-name">{getMonthName(payslip.month)}</span>
                  <span className="month-year">{payslip.year}</span>
                </div>
                <div className="payslip-amounts">
                  <div className="amount-row">
                    <span className="label">Gross</span>
                    <span className="value">{formatCurrency(payslip.gross_salary)}</span>
                  </div>
                  <div className="amount-row deduction">
                    <span className="label">Deductions</span>
                    <span className="value">-{formatCurrency(payslip.total_deductions)}</span>
                  </div>
                  <div className="amount-row net">
                    <span className="label">Net Pay</span>
                    <span className="value">{formatCurrency(payslip.net_pay)}</span>
                  </div>
                </div>
                <div className="payslip-status">
                  <span className={`status-badge ${payslip.run_status}`}>
                    {payslip.run_status === 'finalized' ? 'Finalized' : 'Draft'}
                  </span>
                  <span className="view-arrow">&#8594;</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payslip Detail Modal */}
        {selectedPayslip && (
          <div className="ess-modal-overlay" onClick={() => setSelectedPayslip(null)}>
            <div className="ess-modal payslip-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{getMonthName(selectedPayslip.month)} {selectedPayslip.year}</h2>
                <button className="close-btn" onClick={() => setSelectedPayslip(null)}>&#x2715;</button>
              </div>
              <div className="modal-body">
                {/* Printable Payslip */}
                <div className="payslip-preview" id="payslip-print">
                  {/* Letterhead */}
                  <div className="letterhead">
                    <img src={getCompanyLogo()} alt="Company" className="company-logo" />
                    <div className="company-info">
                      <h2>{employeeInfo?.company_name || 'Company'}</h2>
                    </div>
                  </div>

                  <div className="payslip-title">
                    <h3>PAYSLIP</h3>
                    <p>{getMonthName(selectedPayslip.month)} {selectedPayslip.year}</p>
                  </div>

                  {/* Employee Info */}
                  <div className="employee-info-section">
                    <div className="info-row">
                      <span className="label">Employee:</span>
                      <span className="value">{employeeInfo?.name}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Employee ID:</span>
                      <span className="value">{employeeInfo?.employee_id}</span>
                    </div>
                  </div>

                  {/* Earnings Section */}
                  <div className="payslip-section">
                    <h4>Earnings</h4>
                    <div className="items-list">
                      <div className="item">
                        <span>Basic Salary</span>
                        <span>{formatCurrency(selectedPayslip.basic_salary)}</span>
                      </div>
                      {selectedPayslip.fixed_allowance > 0 && (
                        <div className="item">
                          <span>Fixed Allowance</span>
                          <span>{formatCurrency(selectedPayslip.fixed_allowance)}</span>
                        </div>
                      )}
                      {selectedPayslip.ot_amount > 0 && (
                        <div className="item">
                          <span>Overtime</span>
                          <span>{formatCurrency(selectedPayslip.ot_amount)}</span>
                        </div>
                      )}
                      {selectedPayslip.commission_amount > 0 && (
                        <div className="item">
                          <span>Commission</span>
                          <span>{formatCurrency(selectedPayslip.commission_amount)}</span>
                        </div>
                      )}
                      {selectedPayslip.incentive_amount > 0 && (
                        <div className="item">
                          <span>Incentive</span>
                          <span>{formatCurrency(selectedPayslip.incentive_amount)}</span>
                        </div>
                      )}
                      {selectedPayslip.bonus > 0 && (
                        <div className="item">
                          <span>Bonus</span>
                          <span>{formatCurrency(selectedPayslip.bonus)}</span>
                        </div>
                      )}
                      {selectedPayslip.claims_amount > 0 && (
                        <div className="item">
                          <span>Claims</span>
                          <span>{formatCurrency(selectedPayslip.claims_amount)}</span>
                        </div>
                      )}
                      <div className="item total">
                        <span>Gross Pay</span>
                        <span>{formatCurrency(selectedPayslip.gross_salary)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions Section */}
                  <div className="payslip-section">
                    <h4>Deductions</h4>
                    <div className="items-list">
                      {selectedPayslip.epf_employee > 0 && (
                        <div className="item">
                          <span>EPF (Employee)</span>
                          <span>{formatCurrency(selectedPayslip.epf_employee)}</span>
                        </div>
                      )}
                      {selectedPayslip.socso_employee > 0 && (
                        <div className="item">
                          <span>SOCSO (Employee)</span>
                          <span>{formatCurrency(selectedPayslip.socso_employee)}</span>
                        </div>
                      )}
                      {selectedPayslip.eis_employee > 0 && (
                        <div className="item">
                          <span>EIS (Employee)</span>
                          <span>{formatCurrency(selectedPayslip.eis_employee)}</span>
                        </div>
                      )}
                      {selectedPayslip.pcb > 0 && (
                        <div className="item">
                          <span>PCB (Tax)</span>
                          <span>{formatCurrency(selectedPayslip.pcb)}</span>
                        </div>
                      )}
                      {selectedPayslip.unpaid_leave_deduction > 0 && (
                        <div className="item">
                          <span>Unpaid Leave</span>
                          <span>{formatCurrency(selectedPayslip.unpaid_leave_deduction)}</span>
                        </div>
                      )}
                      {selectedPayslip.other_deductions > 0 && (
                        <div className="item">
                          <span>Other Deductions</span>
                          <span>{formatCurrency(selectedPayslip.other_deductions)}</span>
                        </div>
                      )}
                      <div className="item total">
                        <span>Total Deductions</span>
                        <span>{formatCurrency(selectedPayslip.total_deductions)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Pay */}
                  <div className="net-pay-section">
                    <span>Net Pay</span>
                    <span className="net-amount">{formatCurrency(selectedPayslip.net_pay)}</span>
                  </div>

                  {selectedPayslip.notes && (
                    <div className="notes-section">
                      <h4>Notes</h4>
                      <p>{selectedPayslip.notes}</p>
                    </div>
                  )}

                  <div className="payslip-footer">
                    <p>Computer-generated payslip. No signature required.</p>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="download-btn" onClick={handleDownload}>
                  &#x2B07; Download PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSPayslips;
