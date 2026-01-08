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

// Valid Malaysian state codes (7th-8th digit of IC)
const VALID_STATE_CODES = [
  '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16',
  '21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39',
  '40','41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56','57','58','59',
  '82'
];

// Format IC number with dashes: yymmddxxxxxx -> yymmdd-xx-xxxx
const formatIC = (ic) => {
  if (!ic) return '';
  const clean = ic.replace(/[-\s]/g, '');
  if (clean.length !== 12) return ic;
  return `${clean.slice(0,6)}-${clean.slice(6,8)}-${clean.slice(8)}`;
};

// Detect if ID is Malaysian IC or Passport
const detectIDType = (idNumber) => {
  if (!idNumber) return 'passport';
  const clean = idNumber.replace(/[-\s]/g, '');
  if (!/^\d{12}$/.test(clean)) return 'passport';
  const month = parseInt(clean.substring(2, 4));
  const day = parseInt(clean.substring(4, 6));
  if (month < 1 || month > 12) return 'passport';
  if (day < 1 || day > 31) return 'passport';
  const stateCode = clean.substring(6, 8);
  if (!VALID_STATE_CODES.includes(stateCode)) return 'passport';
  return 'ic';
};

const INITIAL_FORM_STATE = {
  employee_id: '',
  name: '',
  email: '',
  phone: '',
  ic_number: '',
  id_type: 'ic',
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
          <label>Full Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Employee will complete via ESS"
          />
          <small style={{ color: '#64748b', fontSize: '11px' }}>Optional - Employee can fill via ESS</small>
        </div>
      </div>

      {/* Info Banner for New Employee Onboarding */}
      {!editingEmployee && (
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#1e40af'
        }}>
          <strong>Quick Setup:</strong> Only Employee ID, IC Number, and Department/Outlet are required.
          The employee will complete remaining fields (name, bank, statutory info) via ESS after logging in with their IC number.
        </div>
      )}

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
          <label>ID Type *</label>
          <select
            value={form.id_type || 'ic'}
            onChange={(e) => setForm({ ...form, id_type: e.target.value })}
            required
          >
            <option value="ic">Malaysian IC (MyKad)</option>
            <option value="passport">Passport</option>
          </select>
          <small style={{ color: '#64748b', fontSize: '11px' }}>Auto-detected from ID number</small>
        </div>
        <div className="form-group">
          <label>{form.id_type === 'ic' ? 'IC Number' : 'Passport Number'} *</label>
          <input
            type="text"
            value={form.ic_number}
            onChange={(e) => {
              let value = e.target.value;
              if (form.id_type === 'ic') {
                // Only allow digits and dashes for IC
                value = value.replace(/[^0-9-]/g, '');
                // Auto-format if 12 digits entered
                const digits = value.replace(/-/g, '');
                if (digits.length === 12) {
                  value = formatIC(digits);
                }
              }
              setForm({ ...form, ic_number: value });
            }}
            onBlur={(e) => {
              // On blur, auto-detect and format
              const value = e.target.value;
              if (value) {
                const detected = detectIDType(value);
                if (detected === 'ic') {
                  setForm({ ...form, ic_number: formatIC(value), id_type: 'ic' });
                } else if (form.id_type === 'ic' && detected === 'passport') {
                  // If was IC but doesn't match IC format, change to passport
                  setForm({ ...form, id_type: 'passport' });
                }
              }
            }}
            placeholder={form.id_type === 'ic' ? 'e.g. 901234-56-7890' : 'e.g. A12345678'}
            required
            maxLength={form.id_type === 'ic' ? 14 : 20}
          />
          <small style={{ color: '#64748b', fontSize: '11px' }}>Required for employee login</small>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Gender</label>
          <input
            type="text"
            value={
              form.id_type === 'ic' && getGenderFromIC(form.ic_number)
                ? getGenderFromIC(form.ic_number) === 'male' ? 'Male' : 'Female'
                : form.id_type === 'passport' ? 'N/A (Passport)' : 'Auto-detected from IC'
            }
            disabled
            style={{
              backgroundColor: form.id_type === 'ic' && getGenderFromIC(form.ic_number)
                ? (getGenderFromIC(form.ic_number) === 'male' ? '#e3f2fd' : '#fce4ec')
                : '#f5f5f5',
              color: form.id_type === 'ic' && getGenderFromIC(form.ic_number) ? '#333' : '#999',
              fontWeight: form.id_type === 'ic' && getGenderFromIC(form.ic_number) ? '500' : 'normal'
            }}
          />
          <small style={{ color: '#666', fontSize: '11px' }}>
            {form.id_type === 'ic' ? 'Based on IC last digit (odd=Male, even=Female)' : 'Not available for passport'}
          </small>
        </div>
        <div className="form-group" />
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
