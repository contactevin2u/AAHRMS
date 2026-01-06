import React, { useState, useEffect } from 'react';
import ESSLayout from '../../components/ESSLayout';
import { essApi } from '../../api';

function ESSPayslips() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState(null);

  useEffect(() => {
    fetchPayslips();
  }, []);

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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount || 0);
  };

  const formatMonth = (month, year) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[month - 1]} ${year}`;
  };

  const latestPayslip = payslips[0];

  return (
    <ESSLayout>
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>Payslips</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>View your salary details</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading payslips...</div>
        ) : payslips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
            <div style={{ color: '#64748b' }}>No payslips available yet</div>
          </div>
        ) : (
          <>
            {/* Latest Payslip Summary */}
            <div style={{ background: 'linear-gradient(135deg, #1976d2, #1565c0)', borderRadius: '16px', padding: '20px', color: 'white', marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Latest Net Pay</div>
              <div style={{ fontSize: '32px', fontWeight: '700' }}>{formatCurrency(latestPayslip?.net_salary)}</div>
              <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>{formatMonth(latestPayslip?.month, latestPayslip?.year)}</div>
            </div>

            {/* Payslips List */}
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Payslip History</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {payslips.map(payslip => (
                <div
                  key={payslip.id}
                  onClick={() => setSelectedPayslip(payslip)}
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
                      {payslip.run_status === 'finalized' ? 'Paid' : 'Pending'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>Net Pay</span>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: '#1976d2' }}>{formatCurrency(payslip.net_salary)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Payslip Detail Modal */}
        {selectedPayslip && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedPayslip(null)}>
            <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{formatMonth(selectedPayslip.month, selectedPayslip.year)}</h2>
                <button onClick={() => setSelectedPayslip(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
              </div>
              <div style={{ padding: '20px' }}>
                {/* Earnings */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase' }}>Earnings</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>Basic Salary</span>
                    <span style={{ fontWeight: '600' }}>{formatCurrency(selectedPayslip.basic_salary)}</span>
                  </div>
                  {selectedPayslip.allowance > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span>Allowance</span>
                      <span style={{ fontWeight: '600' }}>{formatCurrency(selectedPayslip.allowance)}</span>
                    </div>
                  )}
                  {selectedPayslip.ot_amount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span>Overtime</span>
                      <span style={{ fontWeight: '600' }}>{formatCurrency(selectedPayslip.ot_amount)}</span>
                    </div>
                  )}
                  {selectedPayslip.commission > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span>Commission</span>
                      <span style={{ fontWeight: '600' }}>{formatCurrency(selectedPayslip.commission)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', color: '#059669', fontWeight: '600' }}>
                    <span>Gross Salary</span>
                    <span>{formatCurrency(selectedPayslip.gross_salary)}</span>
                  </div>
                </div>

                {/* Deductions */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase' }}>Deductions</h4>
                  {selectedPayslip.epf_employee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span>EPF (Employee)</span>
                      <span style={{ fontWeight: '600', color: '#dc2626' }}>-{formatCurrency(selectedPayslip.epf_employee)}</span>
                    </div>
                  )}
                  {selectedPayslip.socso_employee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span>SOCSO</span>
                      <span style={{ fontWeight: '600', color: '#dc2626' }}>-{formatCurrency(selectedPayslip.socso_employee)}</span>
                    </div>
                  )}
                  {selectedPayslip.eis_employee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span>EIS</span>
                      <span style={{ fontWeight: '600', color: '#dc2626' }}>-{formatCurrency(selectedPayslip.eis_employee)}</span>
                    </div>
                  )}
                  {selectedPayslip.pcb > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span>PCB (Tax)</span>
                      <span style={{ fontWeight: '600', color: '#dc2626' }}>-{formatCurrency(selectedPayslip.pcb)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', color: '#dc2626', fontWeight: '600' }}>
                    <span>Total Deductions</span>
                    <span>-{formatCurrency(selectedPayslip.total_deductions)}</span>
                  </div>
                </div>

                {/* Net Pay */}
                <div style={{ background: 'linear-gradient(135deg, #1976d2, #1565c0)', borderRadius: '12px', padding: '16px', color: 'white', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', opacity: 0.9 }}>Net Pay</div>
                  <div style={{ fontSize: '28px', fontWeight: '700' }}>{formatCurrency(selectedPayslip.net_salary)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ESSLayout>
  );
}

export default ESSPayslips;
