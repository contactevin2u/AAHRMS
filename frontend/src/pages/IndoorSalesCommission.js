import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { commissionApi } from '../api';
import './IndoorSalesCommission.css';

function IndoorSalesCommission() {
  const [loading, setLoading] = useState(true);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [salesData, setSalesData] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [totalSales, setTotalSales] = useState('');
  const [commissionRate, setCommissionRate] = useState('6.00');

  // Modal state
  const [showPayoutsModal, setShowPayoutsModal] = useState(false);
  const [payouts, setPayouts] = useState([]);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Fetch indoor sales outlets
  useEffect(() => {
    const fetchOutlets = async () => {
      try {
        const res = await commissionApi.getIndoorSalesOutlets();
        setOutlets(res.data || []);
        if (res.data?.length > 0) {
          setSelectedOutlet(res.data[0].id.toString());
        }
      } catch (error) {
        console.error('Error fetching outlets:', error);
      }
    };
    fetchOutlets();
  }, []);

  // Fetch sales data for selected period
  const fetchSalesData = useCallback(async () => {
    if (!selectedOutlet) return;

    try {
      setLoading(true);
      const res = await commissionApi.getSales({
        outlet_id: selectedOutlet,
        year: selectedYear,
        month: selectedMonth
      });

      const data = res.data?.[0] || null;
      setSalesData(data);

      if (data) {
        setTotalSales(data.total_sales?.toString() || '');
        setCommissionRate(data.commission_rate?.toString() || '6.00');
      } else {
        setTotalSales('');
        setCommissionRate('6.00');
      }
    } catch (error) {
      console.error('Error fetching sales data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedOutlet, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchSalesData();
  }, [fetchSalesData]);

  // Save sales data
  const handleSaveSales = async () => {
    if (!totalSales) {
      alert('Please enter total sales amount');
      return;
    }

    try {
      setSaving(true);
      await commissionApi.saveSales({
        outlet_id: parseInt(selectedOutlet),
        period_month: selectedMonth,
        period_year: selectedYear,
        total_sales: parseFloat(totalSales),
        commission_rate: parseFloat(commissionRate)
      });
      fetchSalesData();
      alert('Sales data saved successfully');
    } catch (error) {
      console.error('Error saving sales:', error);
      alert(error.response?.data?.error || 'Failed to save sales data');
    } finally {
      setSaving(false);
    }
  };

  // Calculate commissions
  const handleCalculate = async () => {
    if (!salesData?.id) {
      alert('Please save sales data first');
      return;
    }

    try {
      setSaving(true);
      const res = await commissionApi.calculateCommissions(salesData.id);
      setPayouts(res.data.payouts || []);
      setShowPayoutsModal(true);
      fetchSalesData();
    } catch (error) {
      console.error('Error calculating commissions:', error);
      alert(error.response?.data?.error || 'Failed to calculate commissions');
    } finally {
      setSaving(false);
    }
  };

  // Finalize commissions
  const handleFinalize = async () => {
    if (!salesData?.id) return;

    if (!window.confirm('Finalize this commission period? This will lock the data for payroll processing.')) return;

    try {
      setSaving(true);
      await commissionApi.finalizeSales(salesData.id);
      fetchSalesData();
      alert('Commission period finalized');
    } catch (error) {
      console.error('Error finalizing:', error);
      alert(error.response?.data?.error || 'Failed to finalize');
    } finally {
      setSaving(false);
    }
  };

  // Revert finalization
  const handleRevert = async () => {
    if (!salesData?.id) return;

    if (!window.confirm('Revert to draft? This will unlock the commission period for editing.')) return;

    try {
      setSaving(true);
      await commissionApi.revertSales(salesData.id);
      fetchSalesData();
      alert('Reverted to draft');
    } catch (error) {
      console.error('Error reverting:', error);
      alert(error.response?.data?.error || 'Failed to revert');
    } finally {
      setSaving(false);
    }
  };

  // View payouts
  const handleViewPayouts = async () => {
    if (!salesData?.id) return;

    try {
      setSaving(true);
      const res = await commissionApi.getSalesById(salesData.id);
      setPayouts(res.data.payouts || []);
      setShowPayoutsModal(true);
    } catch (error) {
      console.error('Error fetching payouts:', error);
      alert(error.response?.data?.error || 'Failed to fetch payouts');
    } finally {
      setSaving(false);
    }
  };

  // Delete sales record
  const handleDelete = async () => {
    if (!salesData?.id) return;

    if (!window.confirm('Delete this sales record? This will also delete all commission payouts for this period.')) return;

    try {
      setSaving(true);
      await commissionApi.deleteSales(salesData.id);
      fetchSalesData();
      alert('Sales record deleted');
    } catch (error) {
      console.error('Error deleting:', error);
      alert(error.response?.data?.error || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);
  };

  const isFinalized = salesData?.status === 'finalized';

  return (
    <Layout>
      <div className="indoor-sales-commission">
        <header className="page-header">
          <div>
            <h1>Indoor Sales Commission</h1>
            <p>Manage sales and calculate commissions</p>
          </div>
        </header>

        {/* Controls */}
        <div className="commission-controls">
          <div className="control-group">
            <label>Outlet:</label>
            <select
              value={selectedOutlet}
              onChange={(e) => setSelectedOutlet(e.target.value)}
            >
              {outlets.map(outlet => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>Period:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            >
              {monthNames.map((name, index) => (
                <option key={index} value={index + 1}>{name}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {[2024, 2025, 2026, 2027].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Sales Form */}
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="sales-form-card">
            <div className="form-header">
              <h2>{monthNames[selectedMonth - 1]} {selectedYear}</h2>
              {salesData && (
                <span className={`status-badge ${salesData.status}`}>
                  {salesData.status === 'finalized' ? 'Finalized' : 'Draft'}
                </span>
              )}
            </div>

            <div className="sales-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Total Sales (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={totalSales}
                    onChange={(e) => setTotalSales(e.target.value)}
                    placeholder="0.00"
                    disabled={isFinalized}
                  />
                </div>
                <div className="form-group">
                  <label>Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    disabled={isFinalized}
                  />
                </div>
              </div>

              {totalSales && (
                <div className="commission-summary">
                  <div className="summary-item">
                    <span className="label">Total Sales:</span>
                    <span className="value">{formatCurrency(parseFloat(totalSales) || 0)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Commission Rate:</span>
                    <span className="value">{commissionRate}%</span>
                  </div>
                  <div className="summary-item highlight">
                    <span className="label">Commission Pool:</span>
                    <span className="value">
                      {formatCurrency((parseFloat(totalSales) || 0) * (parseFloat(commissionRate) || 0) / 100)}
                    </span>
                  </div>
                </div>
              )}

              {salesData && (
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Total Effective Shifts</span>
                    <span className="stat-value">{salesData.total_effective_shifts || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Per-Shift Value</span>
                    <span className="stat-value">{formatCurrency(salesData.per_shift_value || 0)}</span>
                  </div>
                </div>
              )}

              <div className="form-actions">
                {!isFinalized && (
                  <>
                    <button
                      className="btn-primary"
                      onClick={handleSaveSales}
                      disabled={saving}
                    >
                      Save Sales
                    </button>
                    {salesData && (
                      <button
                        className="btn-secondary"
                        onClick={handleCalculate}
                        disabled={saving}
                      >
                        Calculate Commissions
                      </button>
                    )}
                    {salesData && salesData.total_effective_shifts > 0 && (
                      <button
                        className="btn-success"
                        onClick={handleFinalize}
                        disabled={saving}
                      >
                        Finalize
                      </button>
                    )}
                  </>
                )}

                {salesData && (
                  <button
                    className="btn-view"
                    onClick={handleViewPayouts}
                    disabled={saving}
                  >
                    View Payouts
                  </button>
                )}

                {isFinalized && (
                  <button
                    className="btn-warning"
                    onClick={handleRevert}
                    disabled={saving}
                  >
                    Revert to Draft
                  </button>
                )}

                {salesData && !isFinalized && (
                  <button
                    className="btn-danger"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Formula Explanation */}
        <div className="formula-card">
          <h3>Commission Calculation Formula</h3>
          <div className="formula">
            <p><strong>Commission Pool</strong> = Total Sales x Commission Rate (default 6%)</p>
            <p><strong>Per-Shift Value</strong> = Commission Pool / Total Effective Shifts</p>
            <p><strong>Effective Shifts</strong> = Normal Shifts + (PH Shifts x 2)</p>
            <p><strong>Employee Commission</strong> = Employee's Effective Shifts x Per-Shift Value</p>
          </div>
        </div>

        {/* Payouts Modal */}
        {showPayoutsModal && (
          <div className="modal-overlay" onClick={() => setShowPayoutsModal(false)}>
            <div className="modal payouts-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Commission Payouts - {monthNames[selectedMonth - 1]} {selectedYear}</h2>
                <button className="close-btn" onClick={() => setShowPayoutsModal(false)}>&times;</button>
              </div>

              <div className="modal-body">
                {payouts.length === 0 ? (
                  <p className="no-data">No payouts calculated yet.</p>
                ) : (
                  <>
                    <div className="payouts-summary">
                      <span>Total Commission Pool: {formatCurrency(salesData?.commission_pool || 0)}</span>
                      <span>Per-Shift Value: {formatCurrency(salesData?.per_shift_value || 0)}</span>
                    </div>

                    <table className="payouts-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Normal</th>
                          <th>PH</th>
                          <th>Effective</th>
                          <th>Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payouts.map(p => (
                          <tr key={p.id}>
                            <td>
                              <div className="emp-info">
                                <span className="emp-name">{p.employee_name}</span>
                                <span className="emp-code">{p.employee_code}</span>
                              </div>
                            </td>
                            <td>{p.normal_shifts}</td>
                            <td className="ph-shifts">{p.ph_shifts}</td>
                            <td className="effective-shifts">{p.effective_shifts}</td>
                            <td className="commission-amount">{formatCurrency(p.commission_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td><strong>Total</strong></td>
                          <td><strong>{payouts.reduce((sum, p) => sum + p.normal_shifts, 0)}</strong></td>
                          <td><strong>{payouts.reduce((sum, p) => sum + p.ph_shifts, 0)}</strong></td>
                          <td><strong>{payouts.reduce((sum, p) => sum + p.effective_shifts, 0)}</strong></td>
                          <td className="commission-amount">
                            <strong>{formatCurrency(payouts.reduce((sum, p) => sum + parseFloat(p.commission_amount), 0))}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowPayoutsModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default IndoorSalesCommission;
