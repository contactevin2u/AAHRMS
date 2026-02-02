import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { payrollConfigApi, departmentApi } from '../api';

function PayrollSettings() {
  const [activeTab, setActiveTab] = useState('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Section A: Company config
  const [config, setConfig] = useState({});

  // Section B: OT Rules
  const [otRules, setOtRules] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editingOtRule, setEditingOtRule] = useState(null);

  // Section C: Earning types
  const [earningTypes, setEarningTypes] = useState({ allowance_types: [], commission_types: [] });

  // Section D: Automation
  const [automation, setAutomation] = useState({});

  // Section E: Employee overrides
  const [employees, setEmployees] = useState([]);
  const [empSearch, setEmpSearch] = useState('');
  const [editingEmp, setEditingEmp] = useState(null);
  const [selectedEmps, setSelectedEmps] = useState([]);
  const [bulkField, setBulkField] = useState('');
  const [bulkValue, setBulkValue] = useState('');

  // Section F: Statutory reference
  const [statutory, setStatutory] = useState(null);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadData = useCallback(async (tab) => {
    setLoading(true);
    try {
      if (tab === 'company') {
        const res = await payrollConfigApi.getConfig();
        setConfig(res.data);
      } else if (tab === 'ot-rules') {
        const [rulesRes, deptRes] = await Promise.all([
          payrollConfigApi.getOTRules(),
          departmentApi.getAll()
        ]);
        setOtRules(rulesRes.data);
        setDepartments(deptRes.data || []);
      } else if (tab === 'earnings') {
        const res = await payrollConfigApi.getEarningTypes();
        setEarningTypes(res.data);
      } else if (tab === 'automation') {
        const res = await payrollConfigApi.getAutomation();
        setAutomation(res.data);
      } else if (tab === 'employees') {
        const res = await payrollConfigApi.getEmployeeOverrides({ search: empSearch || undefined });
        setEmployees(res.data);
      } else if (tab === 'statutory') {
        const res = await payrollConfigApi.getStatutoryReference();
        setStatutory(res.data);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      showMessage('Failed to load data', 'error');
    }
    setLoading(false);
  }, [empSearch]);

  useEffect(() => { loadData(activeTab); }, [activeTab, loadData]);

  // =====================================================
  // Section A: Company Settings
  // =====================================================
  const saveConfig = async () => {
    setSaving(true);
    try {
      await payrollConfigApi.updateConfig(config);
      showMessage('Company settings saved');
    } catch (err) {
      showMessage('Failed to save', 'error');
    }
    setSaving(false);
  };

  const updateConfig = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const renderCompanySettings = () => (
    <div className="settings-section">
      <h3 style={{ marginBottom: 16 }}>Work Hours & Days</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <NumberField label="Standard work hours/day" value={config.work_hours_per_day} onChange={v => updateConfig('work_hours_per_day', v)} />
        <NumberField label="Standard work days/month" value={config.work_days_per_month} onChange={v => updateConfig('work_days_per_month', v)} />
      </div>

      <h3 style={{ marginBottom: 16 }}>Part-Time Rates</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <NumberField label="Part-time hourly rate (RM)" value={config.part_time_hourly_rate} onChange={v => updateConfig('part_time_hourly_rate', v)} step="0.01" />
        <NumberField label="Part-time PH multiplier" value={config.part_time_ph_multiplier} onChange={v => updateConfig('part_time_ph_multiplier', v)} step="0.1" />
      </div>

      <h3 style={{ marginBottom: 16 }}>Indoor Sales</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <NumberField label="Indoor sales base salary (RM)" value={config.indoor_sales_basic} onChange={v => updateConfig('indoor_sales_basic', v)} />
        <NumberField label="Indoor sales commission rate (%)" value={config.indoor_sales_commission_rate} onChange={v => updateConfig('indoor_sales_commission_rate', v)} step="0.1" />
      </div>

      <h3 style={{ marginBottom: 16 }}>Outstation Allowance</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <NumberField label="Outstation per day (RM)" value={config.outstation_per_day} onChange={v => updateConfig('outstation_per_day', v)} />
        <NumberField label="Outstation min distance (km)" value={config.outstation_min_distance_km} onChange={v => updateConfig('outstation_min_distance_km', v)} />
      </div>

      <h3 style={{ marginBottom: 16 }}>Statutory Deductions on Earnings</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <ToggleField label="Statutory on allowance" value={config.statutory_on_allowance} onChange={v => updateConfig('statutory_on_allowance', v)} />
        <ToggleField label="Statutory on OT" value={config.statutory_on_ot} onChange={v => updateConfig('statutory_on_ot', v)} />
        <ToggleField label="Statutory on PH pay" value={config.statutory_on_ph_pay} onChange={v => updateConfig('statutory_on_ph_pay', v)} />
        <ToggleField label="Statutory on incentive" value={config.statutory_on_incentive} onChange={v => updateConfig('statutory_on_incentive', v)} />
        <ToggleField label="Statutory on commission" value={config.statutory_on_commission} onChange={v => updateConfig('statutory_on_commission', v)} />
      </div>

      <h3 style={{ marginBottom: 16 }}>Approval</h3>
      <div style={{ marginBottom: 24 }}>
        <ToggleField label="OT requires approval" value={config.ot_requires_approval} onChange={v => updateConfig('ot_requires_approval', v)} />
      </div>

      <button onClick={saveConfig} disabled={saving} style={btnStyle}>{saving ? 'Saving...' : 'Save Company Settings'}</button>
    </div>
  );

  // =====================================================
  // Section B: OT Rules
  // =====================================================
  const saveOtRule = async (rule) => {
    setSaving(true);
    try {
      if (rule.id) {
        await payrollConfigApi.updateOTRule(rule.id, rule);
      } else {
        await payrollConfigApi.createOTRule(rule);
      }
      setEditingOtRule(null);
      loadData('ot-rules');
      showMessage('OT rule saved');
    } catch (err) {
      showMessage('Failed to save OT rule', 'error');
    }
    setSaving(false);
  };

  const deleteOtRule = async (id) => {
    if (!window.confirm('Delete this OT rule?')) return;
    try {
      await payrollConfigApi.deleteOTRule(id);
      loadData('ot-rules');
      showMessage('OT rule deleted');
    } catch (err) {
      showMessage('Failed to delete', 'error');
    }
  };

  const renderOtRules = () => (
    <div className="settings-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>OT Rules by Department</h3>
        <button onClick={() => setEditingOtRule({ name: '', department_id: null, normal_hours_per_day: 8, includes_break: false, break_duration_minutes: 0, ot_threshold_hours: 8, ot_normal_multiplier: 1.5, ot_weekend_multiplier: 1.5, ot_ph_multiplier: 2.0, ot_ph_after_hours_multiplier: null, rounding_method: 'minute', rounding_direction: 'nearest', min_ot_hours: 1.0 })} style={btnStyle}>
          + Add OT Rule
        </button>
      </div>

      {editingOtRule && (
        <div style={{ ...cardStyle, marginBottom: 16, background: '#f8f9fa' }}>
          <h4>{editingOtRule.id ? 'Edit' : 'New'} OT Rule</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={editingOtRule.name} onChange={e => setEditingOtRule({ ...editingOtRule, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Department</label>
              <select style={inputStyle} value={editingOtRule.department_id || ''} onChange={e => setEditingOtRule({ ...editingOtRule, department_id: e.target.value ? parseInt(e.target.value) : null })}>
                <option value="">Company Default (all)</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <NumberField label="Normal hours/day" value={editingOtRule.normal_hours_per_day} onChange={v => setEditingOtRule({ ...editingOtRule, normal_hours_per_day: v })} step="0.5" />
            <NumberField label="OT threshold hours" value={editingOtRule.ot_threshold_hours} onChange={v => setEditingOtRule({ ...editingOtRule, ot_threshold_hours: v })} step="0.5" />
            <NumberField label="OT normal multiplier" value={editingOtRule.ot_normal_multiplier} onChange={v => setEditingOtRule({ ...editingOtRule, ot_normal_multiplier: v })} step="0.1" />
            <NumberField label="OT weekend multiplier" value={editingOtRule.ot_weekend_multiplier} onChange={v => setEditingOtRule({ ...editingOtRule, ot_weekend_multiplier: v })} step="0.1" />
            <NumberField label="OT PH multiplier" value={editingOtRule.ot_ph_multiplier} onChange={v => setEditingOtRule({ ...editingOtRule, ot_ph_multiplier: v })} step="0.1" />
            <NumberField label="OT PH after-hours multiplier" value={editingOtRule.ot_ph_after_hours_multiplier} onChange={v => setEditingOtRule({ ...editingOtRule, ot_ph_after_hours_multiplier: v })} step="0.1" />
            <NumberField label="Min OT hours" value={editingOtRule.min_ot_hours} onChange={v => setEditingOtRule({ ...editingOtRule, min_ot_hours: v })} step="0.5" />
            <NumberField label="Break duration (min)" value={editingOtRule.break_duration_minutes} onChange={v => setEditingOtRule({ ...editingOtRule, break_duration_minutes: v })} />
            <div>
              <label style={labelStyle}>Rounding method</label>
              <select style={inputStyle} value={editingOtRule.rounding_method} onChange={e => setEditingOtRule({ ...editingOtRule, rounding_method: e.target.value })}>
                <option value="minute">Minute</option>
                <option value="30min">30 min</option>
                <option value="15min">15 min</option>
                <option value="hour">Hour</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Rounding direction</label>
              <select style={inputStyle} value={editingOtRule.rounding_direction} onChange={e => setEditingOtRule({ ...editingOtRule, rounding_direction: e.target.value })}>
                <option value="nearest">Nearest</option>
                <option value="down">Down</option>
                <option value="up">Up</option>
              </select>
            </div>
            <ToggleField label="Includes break" value={editingOtRule.includes_break} onChange={v => setEditingOtRule({ ...editingOtRule, includes_break: v })} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={() => saveOtRule(editingOtRule)} disabled={saving} style={btnStyle}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => setEditingOtRule(null)} style={{ ...btnStyle, background: '#6c757d' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Department</th>
              <th style={thStyle}>Hours/Day</th>
              <th style={thStyle}>OT Threshold</th>
              <th style={thStyle}>Normal</th>
              <th style={thStyle}>Weekend</th>
              <th style={thStyle}>PH</th>
              <th style={thStyle}>Min OT</th>
              <th style={thStyle}>Rounding</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {otRules.map(rule => (
              <tr key={rule.id}>
                <td style={tdStyle}>{rule.name}</td>
                <td style={tdStyle}>{rule.department_name || 'Company Default'}</td>
                <td style={tdStyle}>{rule.normal_hours_per_day}h</td>
                <td style={tdStyle}>{rule.ot_threshold_hours}h</td>
                <td style={tdStyle}>{rule.ot_normal_multiplier}x</td>
                <td style={tdStyle}>{rule.ot_weekend_multiplier}x</td>
                <td style={tdStyle}>{rule.ot_ph_multiplier}x</td>
                <td style={tdStyle}>{rule.min_ot_hours}h</td>
                <td style={tdStyle}>{rule.rounding_method} ({rule.rounding_direction})</td>
                <td style={tdStyle}>
                  <button onClick={() => setEditingOtRule(rule)} style={smallBtnStyle}>Edit</button>
                  <button onClick={() => deleteOtRule(rule.id)} style={{ ...smallBtnStyle, background: '#dc3545', marginLeft: 4 }}>Delete</button>
                </td>
              </tr>
            ))}
            {otRules.length === 0 && <tr><td style={tdStyle} colSpan={10}>No OT rules configured. Add one to get started.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  // =====================================================
  // Section C: Earning Types
  // =====================================================
  const toggleTaxable = async (type, id, currentValue) => {
    try {
      if (type === 'allowance') {
        await payrollConfigApi.updateAllowanceTaxable(id, !currentValue);
      } else {
        await payrollConfigApi.updateCommissionTaxable(id, !currentValue);
      }
      loadData('earnings');
      showMessage('Taxability updated');
    } catch (err) {
      showMessage('Failed to update', 'error');
    }
  };

  const renderEarningTypes = () => (
    <div className="settings-section">
      <h3 style={{ marginBottom: 16 }}>Allowance Types</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Code</th>
            <th style={thStyle}>Taxable (PCB)</th>
          </tr>
        </thead>
        <tbody>
          {earningTypes.allowance_types.map(at => (
            <tr key={at.id}>
              <td style={tdStyle}>{at.name}</td>
              <td style={tdStyle}>{at.code}</td>
              <td style={tdStyle}>
                <ToggleField value={at.is_taxable} onChange={() => toggleTaxable('allowance', at.id, at.is_taxable)} inline />
              </td>
            </tr>
          ))}
          {earningTypes.allowance_types.length === 0 && <tr><td style={tdStyle} colSpan={3}>No allowance types configured</td></tr>}
        </tbody>
      </table>

      <h3 style={{ margin: '24px 0 16px' }}>Commission Types</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Code</th>
            <th style={thStyle}>Taxable (PCB)</th>
          </tr>
        </thead>
        <tbody>
          {earningTypes.commission_types.map(ct => (
            <tr key={ct.id}>
              <td style={tdStyle}>{ct.name}</td>
              <td style={tdStyle}>{ct.code}</td>
              <td style={tdStyle}>
                <ToggleField value={ct.is_taxable} onChange={() => toggleTaxable('commission', ct.id, ct.is_taxable)} inline />
              </td>
            </tr>
          ))}
          {earningTypes.commission_types.length === 0 && <tr><td style={tdStyle} colSpan={3}>No commission types configured</td></tr>}
        </tbody>
      </table>
    </div>
  );

  // =====================================================
  // Section D: Automation
  // =====================================================
  const saveAutomation = async () => {
    setSaving(true);
    try {
      await payrollConfigApi.updateAutomation(automation);
      showMessage('Automation settings saved');
    } catch (err) {
      showMessage('Failed to save', 'error');
    }
    setSaving(false);
  };

  const renderAutomation = () => (
    <div className="settings-section">
      <h3 style={{ marginBottom: 16 }}>Payroll Automation</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <ToggleField label="Auto-generate payroll" value={automation.payroll_auto_generate} onChange={v => setAutomation(prev => ({ ...prev, payroll_auto_generate: v }))} />
        <NumberField label="Auto-generate on day of month" value={automation.payroll_auto_generate_day} onChange={v => setAutomation(prev => ({ ...prev, payroll_auto_generate_day: v }))} />
        <ToggleField label="Auto-approve payroll" value={automation.payroll_auto_approve} onChange={v => setAutomation(prev => ({ ...prev, payroll_auto_approve: v }))} />
        <NumberField label="Variance threshold (%)" value={automation.payroll_variance_threshold} onChange={v => setAutomation(prev => ({ ...prev, payroll_variance_threshold: v }))} step="0.1" />
        <NumberField label="Lock payroll after N days" value={automation.payroll_lock_after_days} onChange={v => setAutomation(prev => ({ ...prev, payroll_lock_after_days: v }))} />
      </div>
      <button onClick={saveAutomation} disabled={saving} style={btnStyle}>{saving ? 'Saving...' : 'Save Automation Settings'}</button>
    </div>
  );

  // =====================================================
  // Section E: Employee Overrides
  // =====================================================
  const searchEmployees = () => { loadData('employees'); };

  const saveEmpOverride = async (emp) => {
    try {
      await payrollConfigApi.updateEmployeeOverride(emp.id, emp);
      setEditingEmp(null);
      loadData('employees');
      showMessage('Employee override saved');
    } catch (err) {
      showMessage('Failed to save', 'error');
    }
  };

  const applyBulkUpdate = async () => {
    if (!selectedEmps.length || !bulkField || bulkValue === '') {
      showMessage('Select employees and fill in field/value', 'error');
      return;
    }
    try {
      await payrollConfigApi.bulkUpdateOverrides(selectedEmps, { [bulkField]: bulkValue === '' ? null : isNaN(bulkValue) ? bulkValue : parseFloat(bulkValue) });
      setSelectedEmps([]);
      setBulkField('');
      setBulkValue('');
      loadData('employees');
      showMessage('Bulk update applied');
    } catch (err) {
      showMessage('Failed to bulk update', 'error');
    }
  };

  const toggleSelectEmp = (id) => {
    setSelectedEmps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const renderEmployeeOverrides = () => (
    <div className="settings-section">
      <h3 style={{ marginBottom: 16 }}>Per-Employee Overrides</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} placeholder="Search by name or ID..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchEmployees()} />
        <button onClick={searchEmployees} style={btnStyle}>Search</button>
      </div>

      {selectedEmps.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16, background: '#e3f2fd', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{selectedEmps.length} selected</span>
          <select style={inputStyle} value={bulkField} onChange={e => setBulkField(e.target.value)}>
            <option value="">-- Field --</option>
            <option value="ot_rate">OT Rate</option>
            <option value="commission_rate">Commission Rate</option>
            <option value="fixed_ot_amount">Fixed OT Amount</option>
            <option value="per_trip_rate">Per-Trip Rate</option>
            <option value="outstation_rate">Outstation Rate</option>
            <option value="allowance_pcb">Allowance PCB</option>
          </select>
          <input style={{ ...inputStyle, width: 120 }} placeholder="Value" value={bulkValue} onChange={e => setBulkValue(e.target.value)} />
          <button onClick={applyBulkUpdate} style={btnStyle}>Apply Bulk</button>
          <button onClick={() => setSelectedEmps([])} style={{ ...btnStyle, background: '#6c757d' }}>Clear</button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}><input type="checkbox" onChange={e => setSelectedEmps(e.target.checked ? employees.map(emp => emp.id) : [])} checked={selectedEmps.length === employees.length && employees.length > 0} /></th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Dept</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>OT Rate</th>
              <th style={thStyle}>Commission %</th>
              <th style={thStyle}>Fixed OT</th>
              <th style={thStyle}>Per-Trip</th>
              <th style={thStyle}>Outstation</th>
              <th style={thStyle}>Allow. PCB</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const isEditing = editingEmp?.id === emp.id;
              const e = isEditing ? editingEmp : emp;
              return (
                <tr key={emp.id} style={selectedEmps.includes(emp.id) ? { background: '#e3f2fd' } : {}}>
                  <td style={tdStyle}><input type="checkbox" checked={selectedEmps.includes(emp.id)} onChange={() => toggleSelectEmp(emp.id)} /></td>
                  <td style={tdStyle}>{emp.name}</td>
                  <td style={tdStyle}>{emp.department_name || '-'}</td>
                  <td style={tdStyle}>{emp.work_type || emp.employment_type || '-'}</td>
                  {isEditing ? (
                    <>
                      <td style={tdStyle}><input type="number" style={smallInputStyle} value={e.ot_rate ?? ''} onChange={ev => setEditingEmp({ ...e, ot_rate: ev.target.value ? parseFloat(ev.target.value) : null })} /></td>
                      <td style={tdStyle}><input type="number" style={smallInputStyle} value={e.commission_rate ?? ''} onChange={ev => setEditingEmp({ ...e, commission_rate: ev.target.value ? parseFloat(ev.target.value) : null })} /></td>
                      <td style={tdStyle}><input type="number" style={smallInputStyle} value={e.fixed_ot_amount ?? ''} onChange={ev => setEditingEmp({ ...e, fixed_ot_amount: ev.target.value ? parseFloat(ev.target.value) : null })} /></td>
                      <td style={tdStyle}><input type="number" style={smallInputStyle} value={e.per_trip_rate ?? ''} onChange={ev => setEditingEmp({ ...e, per_trip_rate: ev.target.value ? parseFloat(ev.target.value) : null })} /></td>
                      <td style={tdStyle}><input type="number" style={smallInputStyle} value={e.outstation_rate ?? ''} onChange={ev => setEditingEmp({ ...e, outstation_rate: ev.target.value ? parseFloat(ev.target.value) : null })} /></td>
                      <td style={tdStyle}>
                        <select style={smallInputStyle} value={e.allowance_pcb || 'normal'} onChange={ev => setEditingEmp({ ...e, allowance_pcb: ev.target.value })}>
                          <option value="normal">Normal</option>
                          <option value="additional">Additional</option>
                          <option value="excluded">Excluded</option>
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => saveEmpOverride(editingEmp)} style={smallBtnStyle}>Save</button>
                        <button onClick={() => setEditingEmp(null)} style={{ ...smallBtnStyle, background: '#6c757d', marginLeft: 4 }}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={tdStyle}>{emp.ot_rate ?? '-'}</td>
                      <td style={tdStyle}>{emp.commission_rate ? `${emp.commission_rate}%` : '-'}</td>
                      <td style={tdStyle}>{emp.fixed_ot_amount ? `RM${emp.fixed_ot_amount}` : '-'}</td>
                      <td style={tdStyle}>{emp.per_trip_rate ? `RM${emp.per_trip_rate}` : '-'}</td>
                      <td style={tdStyle}>{emp.outstation_rate ? `RM${emp.outstation_rate}` : '-'}</td>
                      <td style={tdStyle}>{emp.allowance_pcb || 'normal'}</td>
                      <td style={tdStyle}><button onClick={() => setEditingEmp({ ...emp })} style={smallBtnStyle}>Edit</button></td>
                    </>
                  )}
                </tr>
              );
            })}
            {employees.length === 0 && <tr><td style={tdStyle} colSpan={11}>No employees found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  // =====================================================
  // Section F: Statutory Reference
  // =====================================================
  const renderStatutory = () => {
    if (!statutory) return <div>Loading...</div>;
    return (
      <div className="settings-section">
        <div style={{ padding: '12px 16px', background: '#fff3cd', borderRadius: 6, marginBottom: 20, border: '1px solid #ffc107' }}>
          These rates are government-mandated and update with legislation. They cannot be changed from this page.
        </div>

        <h3 style={{ marginBottom: 12 }}>EPF (KWSP)</h3>
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <table style={tableStyle}>
            <tbody>
              <tr><td style={tdStyle}><strong>Employee rate (below 60)</strong></td><td style={tdStyle}>{statutory.epf.employee_rate_below_60}</td></tr>
              <tr><td style={tdStyle}><strong>Employer rate (below 60)</strong></td><td style={tdStyle}>{statutory.epf.employer_rate_below_60}</td></tr>
              <tr><td style={tdStyle}><strong>Employee rate (60+)</strong></td><td style={tdStyle}>{statutory.epf.employee_rate_60_above}</td></tr>
              <tr><td style={tdStyle}><strong>Employer rate (60+)</strong></td><td style={tdStyle}>{statutory.epf.employer_rate_60_above}</td></tr>
              <tr><td style={tdStyle}><strong>Foreign worker</strong></td><td style={tdStyle}>{statutory.epf.foreign_worker}</td></tr>
              <tr><td style={tdStyle}><strong>Tax relief cap</strong></td><td style={tdStyle}>RM{statutory.epf.tax_relief_cap?.toLocaleString()}/year</td></tr>
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', color: '#666', fontSize: 13 }}>{statutory.epf.note}</p>
        </div>

        <h3 style={{ marginBottom: 12 }}>SOCSO (PERKESO)</h3>
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <table style={tableStyle}>
            <tbody>
              <tr><td style={tdStyle}><strong>Wage ceiling</strong></td><td style={tdStyle}>RM{statutory.socso.wage_ceiling?.toLocaleString()}</td></tr>
              <tr><td style={tdStyle}><strong>First category</strong></td><td style={tdStyle}>{statutory.socso.first_category}</td></tr>
              <tr><td style={tdStyle}><strong>Second category</strong></td><td style={tdStyle}>{statutory.socso.second_category}</td></tr>
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', color: '#666', fontSize: 13 }}>{statutory.socso.note}</p>
        </div>

        <h3 style={{ marginBottom: 12 }}>EIS</h3>
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <table style={tableStyle}>
            <tbody>
              <tr><td style={tdStyle}><strong>Wage ceiling</strong></td><td style={tdStyle}>RM{statutory.eis.wage_ceiling?.toLocaleString()}</td></tr>
              <tr><td style={tdStyle}><strong>Rate</strong></td><td style={tdStyle}>{statutory.eis.rate}</td></tr>
              <tr><td style={tdStyle}><strong>Age cutoff</strong></td><td style={tdStyle}>{statutory.eis.age_cutoff} years</td></tr>
            </tbody>
          </table>
          <p style={{ margin: '8px 0 0', color: '#666', fontSize: 13 }}>{statutory.eis.note}</p>
        </div>

        <h3 style={{ marginBottom: 12 }}>PCB (Income Tax)</h3>
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>Annual Income Range (RM)</th><th style={thStyle}>Rate</th></tr>
            </thead>
            <tbody>
              {statutory.pcb.brackets.map((b, i) => (
                <tr key={i}><td style={tdStyle}>{b.range}</td><td style={tdStyle}>{b.rate}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
            <div>Individual relief: RM{statutory.pcb.individual_relief?.toLocaleString()}</div>
            <div>Spouse relief: RM{statutory.pcb.spouse_relief?.toLocaleString()}</div>
            <div>Child relief: RM{statutory.pcb.child_relief?.toLocaleString()}/child</div>
            <div>Rebate: RM{statutory.pcb.rebate_single} (single) / RM{statutory.pcb.rebate_married} (married) if income &lt; RM{statutory.pcb.rebate_threshold?.toLocaleString()}</div>
          </div>
          <p style={{ margin: '8px 0 0', color: '#666', fontSize: 13 }}>{statutory.pcb.note}</p>
        </div>
      </div>
    );
  };

  // =====================================================
  // Tabs and Layout
  // =====================================================
  const tabs = [
    { key: 'company', label: 'Company Settings' },
    { key: 'ot-rules', label: 'OT Rules' },
    { key: 'earnings', label: 'Allowance & Commission' },
    { key: 'automation', label: 'Automation' },
    { key: 'employees', label: 'Employee Overrides' },
    { key: 'statutory', label: 'Quick Reference' }
  ];

  return (
    <Layout>
      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Payroll Settings</h1>
        <p style={{ color: '#666', marginBottom: 20 }}>Configure payroll calculation parameters, OT rules, and employee overrides.</p>

        {message && (
          <div style={{ padding: '10px 16px', marginBottom: 16, borderRadius: 6, background: message.type === 'error' ? '#f8d7da' : '#d4edda', color: message.type === 'error' ? '#721c24' : '#155724', border: `1px solid ${message.type === 'error' ? '#f5c6cb' : '#c3e6cb'}` }}>
            {message.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #dee2e6', marginBottom: 24, overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: activeTab === tab.key ? 600 : 400, color: activeTab === tab.key ? '#0d6efd' : '#666', borderBottom: activeTab === tab.key ? '2px solid #0d6efd' : '2px solid transparent', marginBottom: -2, whiteSpace: 'nowrap', fontSize: 14 }}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Loading...</div>
        ) : (
          <>
            {activeTab === 'company' && renderCompanySettings()}
            {activeTab === 'ot-rules' && renderOtRules()}
            {activeTab === 'earnings' && renderEarningTypes()}
            {activeTab === 'automation' && renderAutomation()}
            {activeTab === 'employees' && renderEmployeeOverrides()}
            {activeTab === 'statutory' && renderStatutory()}
          </>
        )}
      </div>
    </Layout>
  );
}

// =====================================================
// Reusable Components
// =====================================================

function NumberField({ label, value, onChange, step = '1' }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        step={step}
        style={inputStyle}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
      />
    </div>
  );
}

function ToggleField({ label, value, onChange, inline }) {
  const toggle = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 42, height: 22, borderRadius: 11, background: value ? '#0d6efd' : '#ccc',
          position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 9, background: '#fff',
          position: 'absolute', top: 2, left: value ? 22 : 2,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }} />
      </div>
      {!inline && <span style={{ fontSize: 14 }}>{label}</span>}
    </label>
  );
  if (inline) return toggle;
  return (
    <div>
      {label && !inline && <label style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>{label}</label>}
      {toggle}
    </div>
  );
}

// =====================================================
// Styles
// =====================================================
const btnStyle = { padding: '8px 20px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 14 };
const smallBtnStyle = { padding: '4px 12px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const smallInputStyle = { width: 80, padding: '4px 8px', border: '1px solid #ced4da', borderRadius: 4, fontSize: 13 };
const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500, color: '#333' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const thStyle = { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #dee2e6', fontWeight: 600, fontSize: 13, color: '#495057', whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 12px', borderBottom: '1px solid #eee', verticalAlign: 'middle' };
const cardStyle = { padding: 16, border: '1px solid #dee2e6', borderRadius: 8 };

export default PayrollSettings;
