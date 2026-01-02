import React, { useState } from 'react';
import ESSLayout from '../../components/ESSLayout';

function ESSPayslips() {
  const employeeInfo = JSON.parse(localStorage.getItem('employeeInfo') || '{}');
  const [selectedPayslip, setSelectedPayslip] = useState(null);

  const payslips = [
    { id: 1, month: 'December 2025', basic: 3000, allowance: 500, deductions: 450, net: 3050, status: 'paid' },
    { id: 2, month: 'November 2025', basic: 3000, allowance: 500, deductions: 450, net: 3050, status: 'paid' },
    { id: 3, month: 'October 2025', basic: 3000, allowance: 400, deductions: 440, net: 2960, status: 'paid' }
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  return (
    <ESSLayout>
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>Payslips</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>View your salary details</p>
        </div>


        {/* Latest Payslip Summary */}
        <div style={{ background: 'linear-gradient(135deg, #1976d2, #1565c0)', borderRadius: '16px', padding: '20px', color: 'white', marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '4px' }}>Latest Net Pay</div>
          <div style={{ fontSize: '32px', fontWeight: '700' }}>{formatCurrency(payslips[0]?.net || 0)}</div>
          <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>{payslips[0]?.month}</div>
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
                <span style={{ fontWeight: '600', color: '#1e293b' }}>{payslip.month}</span>
                <span style={{ background: '#d1fae5', color: '#059669', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                  {payslip.status.charAt(0).toUpperCase() + payslip.status.slice(1)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Net Pay</span>
                <span style={{ fontSize: '18px', fontWeight: '700', color: '#1976d2' }}>{formatCurrency(payslip.net)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Payslip Detail Modal */}
        {selectedPayslip && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedPayslip(null)}>
            <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{selectedPayslip.month}</h2>
                <button onClick={() => setSelectedPayslip(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
              </div>
              <div style={{ padding: '20px' }}>
                {/* Earnings */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase' }}>Earnings</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>Basic Salary</span>
                    <span style={{ fontWeight: '600' }}>{formatCurrency(selectedPayslip.basic)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>Allowance</span>
                    <span style={{ fontWeight: '600' }}>{formatCurrency(selectedPayslip.allowance)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', color: '#059669', fontWeight: '600' }}>
                    <span>Total Earnings</span>
                    <span>{formatCurrency(selectedPayslip.basic + selectedPayslip.allowance)}</span>
                  </div>
                </div>

                {/* Deductions */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase' }}>Deductions</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>EPF (11%)</span>
                    <span style={{ fontWeight: '600', color: '#dc2626' }}>-{formatCurrency(330)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>SOCSO</span>
                    <span style={{ fontWeight: '600', color: '#dc2626' }}>-{formatCurrency(20)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>PCB (Tax)</span>
                    <span style={{ fontWeight: '600', color: '#dc2626' }}>-{formatCurrency(100)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', color: '#dc2626', fontWeight: '600' }}>
                    <span>Total Deductions</span>
                    <span>-{formatCurrency(selectedPayslip.deductions)}</span>
                  </div>
                </div>

                {/* Net Pay */}
                <div style={{ background: 'linear-gradient(135deg, #1976d2, #1565c0)', borderRadius: '12px', padding: '16px', color: 'white', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', opacity: 0.9 }}>Net Pay</div>
                  <div style={{ fontSize: '28px', fontWeight: '700' }}>{formatCurrency(selectedPayslip.net)}</div>
                </div>

                <button style={{ width: '100%', marginTop: '20px', padding: '14px', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: 'pointer' }}>
                  Download PDF
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
