-- AI Change Logs Table
-- Tracks all changes made by AI assistants (both settings and payroll)

CREATE TABLE IF NOT EXISTS ai_change_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    change_type VARCHAR(50) NOT NULL, -- 'settings' or 'payroll'
    category VARCHAR(100), -- e.g., 'statutory', 'rates', 'bonus', 'basic_salary'
    summary TEXT NOT NULL, -- Human-readable summary
    changes JSONB NOT NULL, -- Detailed changes
    affected_employees INTEGER DEFAULT 0, -- Number of employees affected (for payroll)
    payroll_run_id INTEGER REFERENCES payroll_runs(id), -- If payroll change
    changed_by INTEGER REFERENCES admin_users(id),
    changed_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick lookups by company
CREATE INDEX IF NOT EXISTS idx_ai_change_logs_company ON ai_change_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_change_logs_created ON ai_change_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_change_logs_type ON ai_change_logs(change_type);
