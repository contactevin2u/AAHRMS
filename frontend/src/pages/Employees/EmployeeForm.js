import React from 'react';

// Helper function to extract gender from Malaysian IC number
// Last digit: Odd (1,3,5,7,9) = Male, Even (0,2,4,6,8) = Female
const getGenderFromIC = (icNumber) => {
  if (!icNumber) return null;
  const cleaned = icNumber.replace(/[-\s]/g, '');
  if (cleaned.length < 12) return null;
  const lastDigit = parseInt(cleaned.charAt(cleaned.length - 1));
  if (isNaN(lastDigit)) return null;
  return lastDigit % 2 === 1 ? 'male' : 'female';
};

const INITIAL_FORM_STATE = {
  employee_id: '',
  name: '',
  email: '',
  phone: '',
  ic_number: '',
  department_id: '',
  outlet_id: '',
  position: '',
  join_date: '',
  status: 'active',
  address: '',
  bank_name: '',
  bank_account_no: '',
  bank_account_holder: '',
  epf_number: '',
  socso_number: '',
  tax_number: '',
  epf_contribution_type: 'normal',
  marital_status: 'single',
  spouse_working: false,
  children_count: 0,
  date_of_birth: '',
  default_basic_salary: '',
  default_allowance: '',
  commission_rate: '',
  per_trip_rate: '',
  ot_rate: '',
  outstation_rate: '',
  default_bonus: '',
  default_incentive: '',
  employment_type: 'probation',
  probation_months: 3,
  salary_before_confirmation: '',
  salary_after_confirmation: '',
  increment_amount: '',
  probation_notes: ''
};

const BANK_OPTIONS = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank',
  'AmBank', 'Bank Islam', 'Bank Rakyat', 'OCBC Bank', 'HSBC Bank',
  'Standard Chartered', 'UOB Bank', 'Affin Bank', 'Alliance Bank', 'BSN', 'Other'
];

// Define payroll components for each department structure
const DEPARTMENT_PAYROLL_INFO = {
  office: {
    name: 'Office',
    components: ['Basic Salary', 'Allowance', 'Bonus'],
    description: 'Basic + Allowance + Bonus'
  },
  'indoor sales': {
    name: 'Indoor Sales',
    components: ['Basic Salary', 'Commission'],
    description: 'Basic + Commission'
  },
  'outdoor sales': {
    name: 'Outdoor Sales',
    components: ['Basic Salary', 'Commission', 'Allowance', 'Bonus'],
    description: 'Basic + Commission + Allowance + Bonus'
  },
  driver: {
    name: 'Driver',
    components: ['Basic Salary', 'Upsell Commission', 'Outstation', 'OT', 'Trip Commission'],
    description: 'Basic + Upsell Commission + Outstation + OT + Trip Commission'
  },
  packer: {
    name: 'Packer',
    components: ['Basic Salary', 'Allowance', 'OT (1.0x)', 'Bonus'],
    description: 'Basic + Allowance + OT (1.0x rate) + Bonus'
  },
  mimix_general: {
    name: 'Mimix General',
    components: ['Basic Salary', 'Allowance', 'OT', 'Bonus'],
    description: 'Basic + Allowance + OT + Bonus (requires Clock In)'
  }
};

const EmployeeForm = ({
  form,
  setForm,
  editingEmployee,
  departments,
  outlets,
  usesOutlets,
  commissionTypes,
  allowanceTypes,
  employeeCommissions,
  setEmployeeCommissions,
  employeeAllowances,
  setEmployeeAllowances,
  salaryAutoPopulated,
  onDepartmentChange,
  onSubmit,
  onCancel
}) => {
  // Get selected department's payroll structure based on name
  const selectedDept = departments.find(d => d.id === parseInt(form.department_id));
  const deptName = selectedDept?.name?.toLowerCase();
  const payrollInfo = deptName ? DEPARTMENT_PAYROLL_INFO[deptName] : null;
  const handleSalaryChange = (field, value) => {
    const newForm = { ...form, [field]: value };

    if (field === 'salary_before_confirmation' || field === 'salary_after_confirmation') {
      const before = parseFloat(newForm.salary_before_confirmation) || 0;
      const after = parseFloat(newForm.salary_after_confirmation) || 0;
      if (before > 0 && after > 0) {
        newForm.increment_amount = (after - before).toFixed(2);
      }
    }

    setForm(newForm);
  };

  return (
    <form onSubmit={onSubmit}>
      {/* Personal Information */}
      <div className="form-row">
        <div className="form-group">
          <label>Employee ID *</label>
          <input
            type="text"
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            placeholder="e.g. EMP001"
            required
            disabled={!!editingEmployee}
            style={editingEmployee ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
          />
          {editingEmployee && (
            <small style={{ color: '#64748b', fontSize: '11px' }}>Employee ID cannot be changed</small>
          )}
        </div>
        <div className="form-group">
          <label>Full Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
            required
          />
        </div>
      </div>

      <div className="form-row">
        {usesOutlets ? (
          <div className="form-group">
            <label>Outlet *</label>
            <select
              value={form.outlet_id || ''}
              onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
              required
            >
              <option value="">Select outlet</option>
              {(outlets || []).map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label>Department *</label>
            <select
              value={form.department_id}
              onChange={(e) => onDepartmentChange(e.target.value)}
              required
            >
              <option value="">Select department</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Position</label>
          <input
            type="text"
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
            placeholder="Job title"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="email@company.com"
          />
        </div>
        <div className="form-group">
          <label>Phone</label>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Phone number"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>IC Number</label>
          <input
            type="text"
            value={form.ic_number}
            onChange={(e) => setForm({ ...form, ic_number: e.target.value })}
            placeholder="e.g. 901234-56-7890"
          />
        </div>
        <div className="form-group">
          <label>Gender</label>
          <input
            type="text"
            value={
              getGenderFromIC(form.ic_number)
                ? getGenderFromIC(form.ic_number) === 'male' ? 'Male' : 'Female'
                : 'Auto-detected from IC'
            }
            disabled
            style={{
              backgroundColor: getGenderFromIC(form.ic_number)
                ? (getGenderFromIC(form.ic_number) === 'male' ? '#e3f2fd' : '#fce4ec')
                : '#f5f5f5',
              color: getGenderFromIC(form.ic_number) ? '#333' : '#999',
              fontWeight: getGenderFromIC(form.ic_number) ? '500' : 'normal'
            }}
          />
          <small style={{ color: '#666', fontSize: '11px' }}>
            Based on IC last digit (odd=Male, even=Female)
          </small>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Join Date</label>
          <input
            type="date"
            value={form.join_date}
            onChange={(e) => setForm({ ...form, join_date: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Date of Birth</label>
          <input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
          />
          <small style={{ color: '#666', fontSize: '11px' }}>
            Can also be extracted from IC (YYMMDD)
          </small>
        </div>
      </div>

      <div className="form-group">
        <label>Address</label>
        <textarea
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Full address"
          rows="2"
        />
      </div>

      {/* Bank Details */}
      <div className="form-section-title">Bank Details</div>

      <div className="form-row">
        <div className="form-group">
          <label>Bank Name</label>
          <select
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
          >
            <option value="">Select bank</option>
            {BANK_OPTIONS.map(bank => (
              <option key={bank} value={bank}>{bank}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Account Number</label>
          <input
            type="text"
            value={form.bank_account_no}
            onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })}
            placeholder="Bank account number"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Account Holder Name</label>
        <input
          type="text"
          value={form.bank_account_holder}
          onChange={(e) => setForm({ ...form, bank_account_holder: e.target.value })}
          placeholder="Name as per bank account"
        />
      </div>

      {/* Statutory Information */}
      <div className="form-section-title">Statutory Information</div>

      <div className="form-row">
        <div className="form-group">
          <label>EPF Number</label>
          <input
            type="text"
            value={form.epf_number}
            onChange={(e) => setForm({ ...form, epf_number: e.target.value })}
            placeholder="EPF member number"
          />
        </div>
        <div className="form-group">
          <label>SOCSO Number</label>
          <input
            type="text"
            value={form.socso_number}
            onChange={(e) => setForm({ ...form, socso_number: e.target.value })}
            placeholder="SOCSO number"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Tax Number (PCB)</label>
          <input
            type="text"
            value={form.tax_number}
            onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
            placeholder="Income tax number"
          />
        </div>
        <div className="form-group">
          <label>EPF Contribution Type</label>
          <select
            value={form.epf_contribution_type}
            onChange={(e) => setForm({ ...form, epf_contribution_type: e.target.value })}
          >
            <option value="normal">Normal (11%)</option>
            <option value="reduced">Reduced (below 60 with EPF)</option>
            <option value="above_60">Above 60 years old</option>
            <option value="foreign">Foreign Worker</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Marital Status</label>
          <select
            value={form.marital_status}
            onChange={(e) => setForm({ ...form, marital_status: e.target.value })}
          >
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Spouse Working?</label>
          <select
            value={form.spouse_working ? 'yes' : 'no'}
            onChange={(e) => setForm({ ...form, spouse_working: e.target.value === 'yes' })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="form-group">
          <label>Number of Children</label>
          <input
            type="number"
            min="0"
            max="20"
            value={form.children_count}
            onChange={(e) => setForm({ ...form, children_count: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* Salary Section */}
      <div className="form-section-title">
        Default Salary (for Payroll)
        {salaryAutoPopulated && !editingEmployee && (
          <span className="auto-populated-hint">
            Auto-filled from department config (editable)
          </span>
        )}
      </div>

      {/* Department Payroll Structure Info */}
      {payrollInfo && (
        <div style={{
          backgroundColor: payrollInfo.special ? '#fff3cd' : '#e3f2fd',
          border: `1px solid ${payrollInfo.special ? '#ffc107' : '#2196f3'}`,
          borderRadius: '4px',
          padding: '10px 15px',
          marginBottom: '15px',
          fontSize: '13px'
        }}>
          <strong>{payrollInfo.name} Payroll Structure:</strong>
          <div style={{ marginTop: '5px', color: '#555' }}>
            {payrollInfo.description}
          </div>
          <div style={{ marginTop: '5px', color: '#666' }}>
            Components: {payrollInfo.components.join(', ')}
          </div>
          {payrollInfo.special && (
            <div style={{ marginTop: '5px', color: '#856404', fontStyle: 'italic' }}>
              Note: For Indoor Sales, salary is automatically calculated during payroll based on sales data.
            </div>
          )}
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label>Basic Salary (RM)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.default_basic_salary}
            onChange={(e) => setForm({ ...form, default_basic_salary: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="form-group">
          <label>Allowance (RM)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.default_allowance}
            onChange={(e) => setForm({ ...form, default_allowance: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Commission Rate (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={form.commission_rate}
            onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="form-group">
          <label>Per Trip Rate (RM)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.per_trip_rate}
            onChange={(e) => setForm({ ...form, per_trip_rate: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>OT Rate (RM/hour)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.ot_rate}
            onChange={(e) => setForm({ ...form, ot_rate: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="form-group">
          <label>Outstation Rate (RM/day)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.outstation_rate}
            onChange={(e) => setForm({ ...form, outstation_rate: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Additional Earnings */}
      <div className="form-section-title">Additional Earnings (Optional)</div>

      <div className="form-row">
        <div className="form-group">
          <label>Default Bonus (RM)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.default_bonus}
            onChange={(e) => setForm({ ...form, default_bonus: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="form-group">
          <label>Default Incentive (RM)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.default_incentive}
            onChange={(e) => setForm({ ...form, default_incentive: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Commissions Section */}
      <div className="form-section-title">
        Commissions
        <button
          type="button"
          className="btn-add-small"
          onClick={() => setEmployeeCommissions([...employeeCommissions, { commission_type_id: '', amount: '' }])}
          style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px' }}
        >
          + Add
        </button>
      </div>

      {employeeCommissions.length === 0 ? (
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>
          No commissions assigned. Click "+ Add" to add commission types.
        </p>
      ) : (
        employeeCommissions.map((comm, index) => (
          <div className="form-row" key={index} style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Commission Type</label>
              <select
                value={comm.commission_type_id}
                onChange={(e) => {
                  const updated = [...employeeCommissions];
                  updated[index].commission_type_id = e.target.value;
                  setEmployeeCommissions(updated);
                }}
              >
                <option value="">Select Type</option>
                {commissionTypes.map(ct => (
                  <option key={ct.id} value={ct.id}>{ct.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Amount (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={comm.amount}
                onChange={(e) => {
                  const updated = [...employeeCommissions];
                  updated[index].amount = e.target.value;
                  setEmployeeCommissions(updated);
                }}
                placeholder="0.00"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const updated = employeeCommissions.filter((_, i) => i !== index);
                setEmployeeCommissions(updated);
              }}
              style={{ padding: '8px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '15px' }}
            >
              X
            </button>
          </div>
        ))
      )}

      {/* Allowances Section */}
      <div className="form-section-title">
        Allowances
        <button
          type="button"
          className="btn-add-small"
          onClick={() => setEmployeeAllowances([...employeeAllowances, { allowance_type_id: '', amount: '' }])}
          style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px' }}
        >
          + Add
        </button>
      </div>

      {employeeAllowances.length === 0 ? (
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>
          No allowances assigned. Click "+ Add" to add allowance types.
        </p>
      ) : (
        employeeAllowances.map((allow, index) => (
          <div className="form-row" key={index} style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Allowance Type</label>
              <select
                value={allow.allowance_type_id}
                onChange={(e) => {
                  const updated = [...employeeAllowances];
                  updated[index].allowance_type_id = e.target.value;
                  setEmployeeAllowances(updated);
                }}
              >
                <option value="">Select Type</option>
                {allowanceTypes.map(at => (
                  <option key={at.id} value={at.id}>{at.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Amount (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={allow.amount}
                onChange={(e) => {
                  const updated = [...employeeAllowances];
                  updated[index].amount = e.target.value;
                  setEmployeeAllowances(updated);
                }}
                placeholder="0.00"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const updated = employeeAllowances.filter((_, i) => i !== index);
                setEmployeeAllowances(updated);
              }}
              style={{ padding: '8px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '15px' }}
            >
              X
            </button>
          </div>
        ))
      )}

      {/* Probation Section */}
      <div className="form-section-title">Probation & Confirmation</div>

      <div className="form-row">
        <div className="form-group">
          <label>Employment Type</label>
          <select
            value={form.employment_type}
            onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
          >
            <option value="probation">Probation</option>
            <option value="confirmed">Confirmed</option>
            <option value="contract">Contract</option>
          </select>
        </div>
        <div className="form-group">
          <label>Probation Duration (months)</label>
          <select
            value={form.probation_months}
            onChange={(e) => setForm({ ...form, probation_months: parseInt(e.target.value) })}
            disabled={form.employment_type === 'confirmed'}
          >
            <option value={1}>1 month</option>
            <option value={2}>2 months</option>
            <option value={3}>3 months</option>
            <option value={4}>4 months</option>
            <option value={5}>5 months</option>
            <option value={6}>6 months</option>
          </select>
        </div>
      </div>

      {form.employment_type === 'probation' && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label>Salary Before Confirmation (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.salary_before_confirmation}
                onChange={(e) => handleSalaryChange('salary_before_confirmation', e.target.value)}
                placeholder="Current basic salary"
              />
            </div>
            <div className="form-group">
              <label>Salary After Confirmation (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.salary_after_confirmation}
                onChange={(e) => handleSalaryChange('salary_after_confirmation', e.target.value)}
                placeholder="New salary after confirmation"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Increment Amount (RM)</label>
              <input
                type="number"
                step="0.01"
                value={form.increment_amount}
                onChange={(e) => setForm({ ...form, increment_amount: e.target.value })}
                placeholder="Auto-calculated"
                readOnly
              />
            </div>
            <div className="form-group">
              <label>Probation End Date</label>
              <input
                type="text"
                value={form.join_date && form.probation_months ?
                  new Date(new Date(form.join_date).setMonth(new Date(form.join_date).getMonth() + form.probation_months)).toLocaleDateString() :
                  'Set join date first'}
                disabled
              />
            </div>
          </div>
        </>
      )}

      {editingEmployee && (
        <div className="form-group">
          <label>Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}

      <div className="modal-actions">
        <button type="button" onClick={onCancel} className="cancel-btn">
          Cancel
        </button>
        <button type="submit" className="save-btn">
          {editingEmployee ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  );
};

export { INITIAL_FORM_STATE, BANK_OPTIONS, getGenderFromIC };
export default EmployeeForm;
