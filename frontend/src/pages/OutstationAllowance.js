import React, { useState } from 'react';
import Layout from '../components/Layout';
import api from '../api';

function OutstationAllowance({ departmentId: propDeptId, embedded = false }) {
  const [activeTab, setActiveTab] = useState('report');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [driverId, setDriverId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  const [editingCell, setEditingCell] = useState(null); // { driverIdx, dayIdx, field }
  const [editValue, setEditValue] = useState('');

  const fetchReport = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const params = { start_date: startDate, end_date: endDate };
      if (driverId) params.driver_id = driverId;
      const res = await api.get('/admin/outstation/report', { params });
      setReportData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch report');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (driverIdx, dayIdx, field, currentValue) => {
    setEditingCell({ driverIdx, dayIdx, field });
    setEditValue(currentValue?.toString() || '');
  };

  const saveEdit = () => {
    if (!editingCell || !reportData) return;
    const { driverIdx, dayIdx, field } = editingCell;
    const updated = { ...reportData };
    const drivers = [...updated.eligible_drivers];
    const driver = { ...drivers[driverIdx] };
    const days = [...driver.qualifying_days];
    const day = { ...days[dayIdx] };

    if (['distance_km', 'orders_delivered_day2', 'allowance'].includes(field)) {
      day[field] = parseFloat(editValue) || 0;
    } else {
      day[field] = editValue;
    }
    days[dayIdx] = day;
    driver.qualifying_days = days;
    driver.total_allowance = days.reduce((s, d) => s + (d.allowance || 0), 0);
    drivers[driverIdx] = driver;
    updated.eligible_drivers = drivers;
    updated.summary = {
      total_drivers: drivers.length,
      total_allowance: drivers.reduce((s, d) => s + d.total_allowance, 0)
    };
    setReportData(updated);
    setEditingCell(null);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingCell(null);
  };

  const renderEditableCell = (driverIdx, dayIdx, field, value) => {
    const isEditing = editingCell?.driverIdx === driverIdx &&
      editingCell?.dayIdx === dayIdx &&
      editingCell?.field === field;

    if (isEditing) {
      return (
        <input
          type={['distance_km', 'orders_delivered_day2', 'allowance'].includes(field) ? 'number' : 'text'}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleEditKeyDown}
          autoFocus
          style={{ width: '100%', padding: '4px', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '13px' }}
        />
      );
    }

    return (
      <span
        onClick={() => startEdit(driverIdx, dayIdx, field, value)}
        style={{ cursor: 'pointer', borderBottom: '1px dashed #ccc', display: 'inline-block', minWidth: '30px' }}
        title="Click to edit"
      >
        {value}
      </span>
    );
  };

  const renderReport = () => (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Driver ID (optional)</label>
          <input type="text" value={driverId} onChange={e => setDriverId(e.target.value)} placeholder="All drivers"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', width: '140px' }} />
        </div>
        <button onClick={fetchReport} disabled={loading}
          style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Loading...' : 'Fetch Report'}
        </button>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: '16px', padding: '10px', background: '#fef2f2', borderRadius: '6px' }}>{error}</div>}

      {reportData && (
        <>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
            <div style={{ background: '#eff6ff', padding: '16px 24px', borderRadius: '8px', flex: 1 }}>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>Total Drivers</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#1e40af' }}>{reportData.summary.total_drivers}</div>
            </div>
            <div style={{ background: '#f0fdf4', padding: '16px 24px', borderRadius: '8px', flex: 1 }}>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>Total Allowance</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#166534' }}>RM {reportData.summary.total_allowance.toLocaleString()}</div>
            </div>
          </div>

          {reportData.eligible_drivers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <div>No eligible drivers found for this period.</div>
              {reportData.summary.api_error && (
                <div style={{ color: '#dc2626', marginTop: '8px', fontSize: '13px' }}>
                  API Error: {reportData.summary.api_error}
                </div>
              )}
              {!reportData.summary.api_error && (
                <div style={{ marginTop: '8px', fontSize: '13px' }}>
                  OrderOps returned {reportData.summary.total_shifts_fetched || 0} shifts from {reportData.summary.total_unique_drivers || 0} drivers.
                  {reportData.summary.total_shifts_fetched === 0 && ' The OrderOps API may not have data for this date range.'}
                </div>
              )}
            </div>
          )}

          {reportData.eligible_drivers.map((driver, driverIdx) => (
            <div key={driver.driver_id} style={{ marginBottom: '24px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ background: '#f9fafb', padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{driver.driver_name}</strong>
                  <span style={{ color: '#6b7280', marginLeft: '12px', fontSize: '13px' }}>ID: {driver.driver_id} | Warehouse: {driver.base_warehouse}</span>
                </div>
                <div style={{ fontWeight: 600, color: '#166534' }}>RM {driver.total_allowance}</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Next Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Distance (km)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Clock Out Location</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Clock In Location</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Orders Day2</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Allowance (RM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driver.qualifying_days.map((day, dayIdx) => (
                      <tr key={dayIdx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 12px' }}>{day.date}</td>
                        <td style={{ padding: '8px 12px' }}>{day.next_date}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {renderEditableCell(driverIdx, dayIdx, 'distance_km', day.distance_km)}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {renderEditableCell(driverIdx, dayIdx, 'clock_out_location', day.clock_out_location)}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {renderEditableCell(driverIdx, dayIdx, 'clock_in_location', day.clock_in_location)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {renderEditableCell(driverIdx, dayIdx, 'orders_delivered_day2', day.orders_delivered_day2)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {renderEditableCell(driverIdx, dayIdx, 'allowance', day.allowance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );

  const renderGuide = () => (
    <div style={{ maxWidth: '800px', lineHeight: 1.7 }}>
      <h3 style={{ marginBottom: '16px' }}>Outstation Allowance Calculation Guide</h3>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Drivers are eligible for <strong>RM100/day</strong> outstation allowance when all 4 conditions are met for a consecutive day-pair:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 8px' }}>1. Distance &gt; 180km from Warehouse (Haversine)</h4>
          <p style={{ margin: 0, color: '#4b5563' }}>
            The driver's clock-out GPS on Day 1 must be more than 180km from their base warehouse, calculated using the haversine formula (great-circle distance).
          </p>
          <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fff', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' }}>
            Example: Clock out at Johor Bahru (1.4927, 103.7414) is ~315km from Batu Caves warehouse — qualifies.
          </div>
        </div>

        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 8px' }}>2. Outstation Flag + Outside Selangor/NS Bounding Boxes</h4>
          <p style={{ margin: 0, color: '#4b5563' }}>
            Both Day 1 and Day 2 shifts must have the <code>is_outstation</code> flag set to true in OrderOps, AND the GPS coordinates must fall outside the Selangor and Negeri Sembilan bounding boxes.
          </p>
          <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fff', borderRadius: '4px', fontSize: '13px' }}>
            <strong>Selangor:</strong> Lat 2.6–3.5, Lng 101.2–102.0<br />
            <strong>Negeri Sembilan:</strong> Lat 2.4–2.9, Lng 101.7–102.5
          </div>
        </div>

        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 8px' }}>3. Overnight: Clock Out ≈ Clock In Next Day (within 500m)</h4>
          <p style={{ margin: 0, color: '#4b5563' }}>
            The driver's clock-out GPS on Day 1 must be within 500 meters of their clock-in GPS on Day 2, confirming they stayed overnight at the outstation location.
          </p>
          <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fff', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' }}>
            Example: Clock out at (1.4927, 103.7414), clock in next day at (1.4930, 103.7410) — distance ~50m — qualifies.
          </div>
        </div>

        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 8px' }}>4. Day 2 Must Have &gt; 3 Successful Deliveries</h4>
          <p style={{ margin: 0, color: '#4b5563' }}>
            On Day 2, the driver must have completed more than 3 deliveries with status "delivered", "completed", or "success". This confirms productive work at the outstation.
          </p>
        </div>
      </div>

      <h3 style={{ margin: '32px 0 16px' }}>Reference Data</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '16px' }}>
          <h4 style={{ margin: '0 0 8px', color: '#1e40af' }}>Warehouse Coordinates</h4>
          <table style={{ fontSize: '13px', width: '100%' }}>
            <tbody>
              <tr><td><strong>Batu Caves</strong></td><td>3.2374, 101.6878</td></tr>
              <tr><td><strong>Kota Kinabalu</strong></td><td>5.9804, 116.0735</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '16px' }}>
          <h4 style={{ margin: '0 0 8px', color: '#166534' }}>Allowance Rate</h4>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>RM 100 / day</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>Per qualifying day-pair</p>
        </div>
      </div>
    </div>
  );

  const content = (
      <div style={{ padding: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Outstation Allowance</h1>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>OrderOps driver outstation allowance report</p>

        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid #e5e7eb' }}>
          <button
            onClick={() => setActiveTab('report')}
            style={{
              padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
              borderBottom: activeTab === 'report' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'report' ? '#3b82f6' : '#6b7280', marginBottom: '-2px'
            }}
          >
            Report
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            style={{
              padding: '10px 24px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
              borderBottom: activeTab === 'guide' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'guide' ? '#3b82f6' : '#6b7280', marginBottom: '-2px'
            }}
          >
            Calculation Guide
          </button>
        </div>

        {activeTab === 'report' ? renderReport() : renderGuide()}
      </div>
  );

  return embedded ? content : <Layout>{content}</Layout>;
}

export default OutstationAllowance;
