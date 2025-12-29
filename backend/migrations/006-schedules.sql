-- Schedules System for Mimix (outlet-based companies)
-- Run this migration to enable scheduling features

-- Main schedules table
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id),
  outlet_id INTEGER REFERENCES outlets(id),

  -- Schedule details
  schedule_date DATE NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  break_duration INTEGER DEFAULT 60, -- minutes

  -- Status: scheduled, completed, absent, leave
  status VARCHAR(20) DEFAULT 'scheduled',

  -- Metadata
  created_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(employee_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedules_employee ON schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_schedules_outlet ON schedules(outlet_id);
CREATE INDEX IF NOT EXISTS idx_schedules_company ON schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);

-- Extra shift requests table
CREATE TABLE IF NOT EXISTS extra_shift_requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id),
  outlet_id INTEGER REFERENCES outlets(id),

  -- Requested shift
  request_date DATE NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  reason TEXT,

  -- Approval workflow
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  approved_by INTEGER REFERENCES admin_users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,

  -- Created schedule (if approved)
  schedule_id INTEGER REFERENCES schedules(id),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extra_shift_employee ON extra_shift_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_extra_shift_status ON extra_shift_requests(status);
CREATE INDEX IF NOT EXISTS idx_extra_shift_date ON extra_shift_requests(request_date);

-- Schedule audit logs table
CREATE TABLE IF NOT EXISTS schedule_audit_logs (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,

  action VARCHAR(50) NOT NULL, -- created, updated, deleted, status_changed, approved, rejected
  old_value JSONB,
  new_value JSONB,
  reason TEXT,

  performed_by INTEGER REFERENCES admin_users(id),
  performed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_audit_schedule ON schedule_audit_logs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_audit_employee ON schedule_audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_audit_action ON schedule_audit_logs(action);
