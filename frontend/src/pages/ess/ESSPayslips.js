import React, { useState, useEffect, useRef } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';
import { useLanguage } from '../../contexts/LanguageContext';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './ESSPayslips.css';

function ESSPayslips() {
  const { t, language } = useLanguage();
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslipId, setSelectedPayslipId] = useState(null);
  const [payslipDetail, setPayslipDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const printRef = useRef();

  // Check if company uses outlets (Mimix = company_id 3)
  const isMimix = employeeInfo.company_id === 3;

  useEffect(() => {
    fetchPayslips();
  }, []);

  useEffect(() => {
    if (selectedPayslipId) {
      fetchPayslipDetail(selectedPayslipId);
    }
  }, [selectedPayslipId]);

  const fetchPayslips = async () => {
    try {
      const response = await essApi.getPayslips();
      setPayslips(response.data || []);
    } catch (error) {
      console.error('Error fetching payslips:', error);
      setPayslips([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayslipDetail = async (id) => {
    try {
      setLoadingDetail(true);
      const response = await essApi.getPayslip(id);
      setPayslipDetail(response.data);
    } catch (error) {
      console.error('Error fetching payslip detail:', error);
      setPayslipDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatCurrency = (amount) => {
    return `RM ${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatMonth = (month, year) => {
    const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return `${t(`months.${monthKeys[month - 1]}`)} ${year}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    const element = printRef.current;
    if (!element || !payslipDetail) return;

    setDownloading(true);
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

      const fileName = `Payslip_${payslipDetail.employee.code}_${payslipDetail.period.month_name}_${payslipDetail.period.year}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(t('errors.generic'));
    } finally {
      setDownloading(false);
    }
  };

  const handleBack = () => {
    setSelectedPayslipId(null);
    setPayslipDetail(null);
  };

  const latestPayslip = payslips[0];

  // If viewing a specific payslip, show the full payslip view
  if (selectedPayslipId && payslipDetail) {
    return (
      <ESSLayout>
        <div className="ess-payslip-page">
          <div className="ess-payslip-actions no-print">
            <button onClick={handleBack} className="ess-back-btn">
              ← {t('payslip.backToPayslips')}
            </button>
            <button onClick={handleDownload} className="ess-download-btn" disabled={downloading}>
              {downloading ? t('payslip.generating') : t('payslip.downloadPdf')}
            </button>
            <button onClick={handlePrint} className="ess-print-btn">
              {t('payslip.printPayslip')}
            </button>
          </div>

          <div className="ess-payslip-container" ref={printRef}>
            {/* Letterhead */}
            <div className="ess-letterhead">
              <div className="ess-letterhead-logo">
                <img src="/logo.png" alt="Company Logo" />
              </div>
              <div className="ess-letterhead-info">
                <h1>{payslipDetail.company.name || 'AA Alive Sdn. Bhd.'}</h1>
                <p className="ess-company-reg">{t('payslip.companyNo')}: 1204108-D</p>
                <p className="ess-company-address">
                  {payslipDetail.company.address || '1, Jalan Perusahaan Amari, Kawasan Industri Batu Caves,'}<br />
                  {payslipDetail.company.address ? '' : '68100 Batu Caves, Selangor'}
                </p>
              </div>
            </div>

            <div className="ess-letter-divider"></div>

            {/* Payslip Title */}
            <div className="ess-payslip-header">
              <div className="ess-payslip-title">
                <h2>{t('payslip.payslipTitle')}</h2>
                <p>{formatMonth(payslipDetail.period.month, payslipDetail.period.year)}</p>
              </div>
            </div>

            {/* Employee Info */}
            <div className="ess-employee-section">
              <div className="ess-info-grid">
                <div className="ess-info-row">
                  <span className="ess-label">{t('payslip.employeeId')}:</span>
                  <span className="ess-value">{payslipDetail.employee.code}</span>
                </div>
                <div className="ess-info-row">
                  <span className="ess-label">{t('payslip.name')}:</span>
                  <span className="ess-value">{payslipDetail.employee.name}</span>
                </div>
                <div className="ess-info-row">
                  <span className="ess-label">{t('payslip.icNumber')}:</span>
                  <span className="ess-value">{payslipDetail.employee.ic_number || '-'}</span>
                </div>
                <div className="ess-info-row">
                  <span className="ess-label">{isMimix ? t('payslip.outlet') : t('payslip.department')}:</span>
                  <span className="ess-value">{isMimix ? payslipDetail.employee.outlet_name : payslipDetail.employee.department || '-'}</span>
                </div>
                <div className="ess-info-row">
                  <span className="ess-label">{t('payslip.position')}:</span>
                  <span className="ess-value">{payslipDetail.employee.position || '-'}</span>
                </div>
                <div className="ess-info-row">
                  <span className="ess-label">{t('payslip.epfNo')}:</span>
                  <span className="ess-value">{payslipDetail.employee.epf_number || '-'}</span>
                </div>
                <div className="ess-info-row">
                  <span className="ess-label">{t('payslip.socsoNo')}:</span>
                  <span className="ess-value">{payslipDetail.employee.socso_number || '-'}</span>
                </div>
                <div className="ess-info-row">
                  <span className="ess-label">{t('payslip.taxNo')}:</span>
                  <span className="ess-value">{payslipDetail.employee.tax_number || '-'}</span>
                </div>
              </div>
            </div>

            {/* Earnings and Deductions */}
            <div className="ess-payslip-body">
              <div className="ess-earnings-section">
                <h3>{t('payslip.earnings')}</h3>
                <table>
                  <tbody>
                    {payslipDetail.earnings.basic_salary > 0 && (
                      <tr>
                        <td>{t('payslip.basicSalary')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.basic_salary)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.fixed_allowance > 0 && (
                      <tr>
                        <td>{t('payslip.fixedAllowance')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.fixed_allowance)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.ot_amount > 0 && (
                      <tr>
                        <td>{t('payslip.overtimePay')} {payslipDetail.earnings.ot_hours > 0 && `(${payslipDetail.earnings.ot_hours} ${t('payslip.hrs')})`}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.ot_amount)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.ph_pay > 0 && (
                      <tr>
                        <td>{t('payslip.publicHolidayPay')} {payslipDetail.earnings.ph_days_worked > 0 && `(${payslipDetail.earnings.ph_days_worked} ${t('payslip.days')})`}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.ph_pay)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.commission_amount > 0 && (
                      <tr>
                        <td>{t('payslip.commission')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.commission_amount)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.trade_commission_amount > 0 && (
                      <tr>
                        <td>{t('payslip.upsellCommission')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.trade_commission_amount)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.incentive_amount > 0 && (
                      <tr>
                        <td>{t('payslip.incentive')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.incentive_amount)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.outstation_amount > 0 && (
                      <tr>
                        <td>{t('payslip.outstationAllowance')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.outstation_amount)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.claims_amount > 0 && (
                      <tr>
                        <td>{t('payslip.claims')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.claims_amount)}</td>
                      </tr>
                    )}
                    {payslipDetail.earnings.bonus > 0 && (
                      <tr>
                        <td>{t('payslip.bonus')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.earnings.bonus)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="ess-total-row">
                      <td><strong>{t('payslip.grossSalary')}</strong></td>
                      <td className="ess-amount"><strong>{formatCurrency(payslipDetail.totals.gross_salary)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="ess-deductions-section">
                <h3>{t('payslip.deductions')}</h3>
                <table>
                  <tbody>
                    {payslipDetail.deductions.epf_employee > 0 && (
                      <tr>
                        <td>{t('payslip.epfEmployee')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.deductions.epf_employee)}</td>
                      </tr>
                    )}
                    {payslipDetail.deductions.socso_employee > 0 && (
                      <tr>
                        <td>{t('payslip.socsoEmployee')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.deductions.socso_employee)}</td>
                      </tr>
                    )}
                    {payslipDetail.deductions.eis_employee > 0 && (
                      <tr>
                        <td>{t('payslip.eisEmployee')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.deductions.eis_employee)}</td>
                      </tr>
                    )}
                    {payslipDetail.deductions.pcb > 0 && (
                      <tr>
                        <td>{t('payslip.pcbTax')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.deductions.pcb)}</td>
                      </tr>
                    )}
                    {payslipDetail.deductions.unpaid_leave_deduction > 0 && (
                      <tr>
                        <td>{t('payslip.unpaidLeave')} {payslipDetail.deductions.unpaid_leave_days > 0 && `(${payslipDetail.deductions.unpaid_leave_days} ${t('payslip.days')})`}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.deductions.unpaid_leave_deduction)}</td>
                      </tr>
                    )}
                    {payslipDetail.deductions.advance_deduction > 0 && (
                      <tr>
                        <td>{t('payslip.advanceDeduction')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.deductions.advance_deduction)}</td>
                      </tr>
                    )}
                    {payslipDetail.deductions.other_deductions > 0 && (
                      <tr>
                        <td>{t('payslip.otherDeductions')}</td>
                        <td className="ess-amount">{formatCurrency(payslipDetail.deductions.other_deductions)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="ess-total-row">
                      <td><strong>{t('payslip.totalDeductions')}</strong></td>
                      <td className="ess-amount"><strong>{formatCurrency(payslipDetail.totals.total_deductions)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Employer Contributions - only show if any contribution exists */}
            {(payslipDetail.employer_contributions.epf_employer > 0 ||
              payslipDetail.employer_contributions.socso_employer > 0 ||
              payslipDetail.employer_contributions.eis_employer > 0) && (
              <div className="ess-employer-section">
                <h3>{t('payslip.employerContributions')}</h3>
                <div className="ess-employer-grid">
                  {payslipDetail.employer_contributions.epf_employer > 0 && (
                    <div className="ess-contribution-item">
                      <span>{t('payslip.epfEmployer')}:</span>
                      <span>{formatCurrency(payslipDetail.employer_contributions.epf_employer)}</span>
                    </div>
                  )}
                  {payslipDetail.employer_contributions.socso_employer > 0 && (
                    <div className="ess-contribution-item">
                      <span>{t('payslip.socsoEmployer')}:</span>
                      <span>{formatCurrency(payslipDetail.employer_contributions.socso_employer)}</span>
                    </div>
                  )}
                  {payslipDetail.employer_contributions.eis_employer > 0 && (
                    <div className="ess-contribution-item">
                      <span>{t('payslip.eisEmployer')}:</span>
                      <span>{formatCurrency(payslipDetail.employer_contributions.eis_employer)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Net Pay */}
            <div className="ess-net-pay-section">
              <div className="ess-net-pay">
                <span>{t('payslip.netPay')}</span>
                <span className="ess-net-amount">{formatCurrency(payslipDetail.totals.net_pay)}</span>
              </div>
            </div>

            {/* Bank Info */}
            {payslipDetail.employee.bank_name && (
              <div className="ess-bank-section">
                <h3>{t('payslip.paymentDetails')}</h3>
                <p>
                  {t('payslip.bank')}: {payslipDetail.employee.bank_name}<br />
                  {t('payslip.accountNo')}: {payslipDetail.employee.bank_account_no}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="ess-payslip-footer">
              <p>{t('payslip.footer')}</p>
              <p>{t('payslip.generatedOn')}: {new Date().toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY')}</p>
            </div>
          </div>
        </div>
      </ESSLayout>
    );
  }

  // Loading state for payslip detail
  if (selectedPayslipId && loadingDetail) {
    return (
      <ESSLayout>
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          {t('common.loading')}
        </div>
      </ESSLayout>
    );
  }

  // Main payslips list view
  return (
    <ESSLayout>
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>{t('payslip.title')}</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>{t('payslip.subtitle')}</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>{t('common.loading')}</div>
        ) : payslips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
            <div style={{ color: '#64748b' }}>{t('payslip.noPayslips')}</div>
          </div>
        ) : (
          <>
            {/* Latest Payslip Summary */}
            <div style={{ background: 'linear-gradient(135deg, #1976d2, #1565c0)', borderRadius: '16px', padding: '20px', color: 'white', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>{t('payslip.latestNetPay')}</div>
              <div style={{ fontSize: '32px', fontWeight: '700' }}>RM {parseFloat(latestPayslip?.net_salary || latestPayslip?.net_pay || 0).toFixed(2)}</div>
              <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>{formatMonth(latestPayslip?.month, latestPayslip?.year)}</div>
            </div>

            {/* Payslips List */}
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>{t('payslip.payslipHistory')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {payslips.map(payslip => (
                <div
                  key={payslip.id}
                  onClick={() => setSelectedPayslipId(payslip.id)}
                  style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '600', color: '#1e293b' }}>{formatMonth(payslip.month, payslip.year)}</span>
                    <span style={{
                      background: payslip.run_status === 'finalized' ? '#d1fae5' : '#fef3c7',
                      color: payslip.run_status === 'finalized' ? '#059669' : '#d97706',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {payslip.run_status === 'finalized' ? t('payslip.paid') : t('payslip.pending')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>{t('payslip.netPay')}</span>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: '#1976d2' }}>RM {parseFloat(payslip.net_salary || payslip.net_pay || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{t('payslip.viewPayslip')} →</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSPayslips;
