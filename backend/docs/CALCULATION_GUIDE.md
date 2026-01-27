# AA HRMS - Calculation Guide

**Version:** 1.0.0
**Last Updated:** 27 January 2026
**Auto-Generated Changelog:** See [Change History](#change-history) below

This document explains how working hours, overtime (OT), and payroll calculations work for both **AA Alive** and **Mimix** companies.

---

## Change History

| Version | Date | Changed By | Description |
|---------|------|------------|-------------|
| 1.0.0 | 27 Jan 2026 | System | Initial calculation guide created |

---

## Table of Contents

1. [Clock-In Flow](#clock-in-flow)
2. [Working Hours Calculation](#working-hours-calculation)
3. [Overtime (OT) Calculation](#overtime-ot-calculation)
4. [Payroll Calculation](#payroll-calculation)
5. [Statutory Deductions](#statutory-deductions)
6. [Database Columns](#database-columns)

---

## Clock-In Flow

### AA Alive (Company ID: 1)

AA Alive uses a **2-session flow** with optional second session:

| Action | Field | Description |
|--------|-------|-------------|
| Clock In 1 | `clock_in_1` | Start of work day |
| Clock Out 1 | `clock_out_1` | End of session 1 (NOT break) |
| Clock In 2 | `clock_in_2` | Start of optional second session |
| Clock Out 2 | `clock_out_2` | End of second session |

**Key Points:**
- **No break tracking** - Employees don't clock for breaks
- `clock_out_1` = End of first session (session complete)
- Second session (`clock_in_2` / `clock_out_2`) is **optional**
- Used for drivers, office staff who may work split shifts

**Status Flow:**
```
not_started → clock_in_1 → working → clock_out_1 → session_ended → (optional) clock_in_2 → working → clock_out_2 → completed
```

### Mimix (Company ID: 3)

Mimix uses a **4-action flow** with mandatory break tracking:

| Action | Field | Description |
|--------|-------|-------------|
| Clock In | `clock_in_1` | Start of work |
| Start Break | `clock_out_1` | Going on break |
| End Break | `clock_in_2` | Returning from break |
| Clock Out | `clock_out_2` | End of work day |

**Key Points:**
- **Break tracking required** - Must clock out/in for break
- `clock_out_1` = Start of break (NOT end of day)
- Break duration is deducted from working hours
- Used for outlet staff (F&B, retail)

**Status Flow:**
```
not_started → clock_in_1 → working → clock_out_1 → on_break → clock_in_2 → working → clock_out_2 → completed
```

---

## Working Hours Calculation

### AA Alive

```
Total Hours = (clock_out_1 - clock_in_1) + (clock_out_2 - clock_in_2)
```

- If only one session: `Total Hours = clock_out_1 - clock_in_1`
- If two sessions: Add both sessions together
- **No automatic break deduction** (break not tracked)
- Overnight shifts supported (clock_out on next day)

**Example - Single Session:**
```
Clock In 1:  07:46:00
Clock Out 1: 18:30:00
Total Hours: 10.73 hours
```

**Example - Two Sessions:**
```
Session 1: 06:00 - 12:00 = 6.00 hours
Session 2: 14:00 - 18:00 = 4.00 hours
Total Hours: 10.00 hours
```

### Mimix

```
Session 1 = clock_out_1 - clock_in_1
Session 2 = clock_out_2 - clock_in_2
Total Hours = Session 1 + Session 2
```

- Break time is automatically excluded (between `clock_out_1` and `clock_in_2`)
- Standard break: 60 minutes

**Example:**
```
Clock In:    08:00:00
Break Start: 12:00:00  (Session 1 = 4 hours)
Break End:   13:00:00  (1 hour break - not counted)
Clock Out:   17:00:00  (Session 2 = 4 hours)
Total Hours: 8.00 hours
```

### Overnight Shift Handling

For shifts that extend past midnight:

```javascript
// If clock_out time is earlier than clock_in time, add 24 hours
if (outSeconds < inSeconds) {
  outSeconds += 24 * 3600;
}
```

**Example:**
```
Clock In:  22:00:00 (10 PM)
Clock Out: 06:00:00 (6 AM next day)
Calculation: (6:00 + 24:00) - 22:00 = 30:00 - 22:00 = 8 hours
```

---

## Overtime (OT) Calculation

### OT Rules

| Company | Normal Hours | OT Threshold | OT Starts After |
|---------|-------------|--------------|-----------------|
| AA Alive | 8 hours | 8 hours | 8 hours work |
| Mimix | 7.5 hours | 7.5 hours | 7.5 hours work |

### OT Multipliers (Mimix)

| Day Type | Multiplier | Description |
|----------|------------|-------------|
| Normal Day | 1.5x | Weekday OT |
| Weekend | 1.5x | Saturday/Sunday |
| Public Holiday | 2.0x | Work on PH (normal hours) |
| PH + OT | 3.0x | OT on public holiday |

### OT Rounding Rules (Mimix)

1. **Minimum OT**: 1 hour required
   - Less than 1 hour OT = 0 OT
2. **Rounding**: Down to nearest 0.5 hour
   - 1 hr 15 min → 1.0 hr
   - 1 hr 45 min → 1.5 hr
   - 2 hr 20 min → 2.0 hr

### OT Calculation Formula

```
Hourly Rate = Basic Salary / 22 days / Normal Hours Per Day

OT Normal Amount = OT Hours × Hourly Rate × 1.5
OT Weekend Amount = OT Hours × Hourly Rate × 1.5
OT PH Amount = OT Hours × Hourly Rate × 3.0
```

**Example (Mimix):**
```
Basic Salary: RM 2,000
Daily Rate: RM 2,000 / 22 = RM 90.91
Hourly Rate: RM 90.91 / 7.5 = RM 12.12

Worked: 10.5 hours on normal day
OT Hours: 10.5 - 7.5 = 3.0 hours
OT Amount: 3.0 × RM 12.12 × 1.5 = RM 54.54
```

### OT Approval (Mimix Only)

- OT requires supervisor/manager approval
- Configurable via `companies.payroll_settings.features.ot_requires_approval`
- Unapproved OT is not included in payroll
- AA Alive: OT auto-approved (no approval required)

---

## Payroll Calculation

### Gross Salary Components

```
Gross Salary = Basic Salary
             + Allowances (Fixed + Variable)
             + OT Pay
             + PH Pay (if worked on public holiday)
             + Bonuses
             + Commission
             - Unpaid Leave Deduction
```

### Unpaid Leave Deduction

```
Daily Rate = Basic Salary / 22 working days
Unpaid Leave Deduction = Daily Rate × Unpaid Leave Days
```

### Part-Time Employee Calculation

Part-time employees:
- **No OT** - Overtime not applicable
- Paid based on hours worked × hourly rate
- Hourly rate from employee record or calculated from basic salary

---

## Statutory Deductions

### EPF (Employee Provident Fund)

| Age | Employee | Employer |
|-----|----------|----------|
| Below 60 | 11% | 12% or 13%* |
| 60 and above | 0% (optional 5.5%) | 4% |

*13% for salary ≤ RM 5,000

### SOCSO (Social Security)

| Category | Employee | Employer |
|----------|----------|----------|
| Employment Injury | 0% | 1.25% |
| Invalidity | 0.5% | 1.75% |

*Based on SOCSO contribution tables*

### EIS (Employment Insurance System)

| Rate | Employee | Employer |
|------|----------|----------|
| Standard | 0.2% | 0.2% |

*Maximum insurable salary: RM 5,000*

### PCB (Monthly Tax Deduction)

Calculated based on:
- Monthly salary
- Tax reliefs (individual, spouse, children)
- LHDN tax tables

---

## Database Columns

### clock_in_records Table

| Column | Type | Description |
|--------|------|-------------|
| `clock_in_1` | TIME | First clock in time |
| `clock_out_1` | TIME | First clock out (AA: session end, Mimix: break start) |
| `clock_in_2` | TIME | Second clock in (AA: new session, Mimix: break end) |
| `clock_out_2` | TIME | Final clock out |
| `total_hours` | DECIMAL | Total working hours (calculated) |
| `total_work_minutes` | INTEGER | Total working minutes (used by API) |
| `ot_minutes` | INTEGER | Overtime minutes |
| `ot_flagged` | BOOLEAN | Whether OT is flagged for approval |
| `ot_approved` | BOOLEAN | Whether OT is approved |
| `status` | VARCHAR | in_progress, working, on_break, session_ended, completed |

**Important:** The ESS API uses `total_work_minutes` to display hours. Both `total_hours` and `total_work_minutes` must be in sync.

### Working Hours Sync

```sql
-- Ensure total_work_minutes matches total_hours
UPDATE clock_in_records
SET total_work_minutes = ROUND(total_hours * 60)
WHERE total_hours > 0
  AND (total_work_minutes IS NULL OR ABS(total_hours * 60 - total_work_minutes) > 5);
```

---

## Summary Table

| Feature | AA Alive | Mimix |
|---------|----------|-------|
| Company ID | 1 | 3 |
| Clock Flow | 2-session (optional 2nd) | 4-action (with break) |
| Break Tracking | No | Yes (mandatory) |
| Normal Hours | 8 hours | 7.5 hours |
| OT Threshold | 8 hours | 7.5 hours |
| OT Approval | Auto-approved | Requires approval |
| OT Minimum | N/A | 1 hour |
| OT Rounding | N/A | 0.5 hour increments |
| Part-time OT | No | No |

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `fix-all-zero-hours.js` | Calculate and fix records with 0 hours |
| `fix-incorrect-hours.js` | Fix records with incorrect hours (>20 or negative) |
| `sync-hours-minutes.js` | Sync total_hours and total_work_minutes |
| `add-missing-schedules.js` | Create schedules for clock records without schedules |
| `update-calculation-guide.js` | Update this guide's changelog when calculation logic changes |

---

## Updating This Guide

When calculation logic is modified, update this guide's changelog:

```bash
# Check if any calculation files were changed
node scripts/update-calculation-guide.js --check

# Add changelog entry after making changes
node scripts/update-calculation-guide.js "Fixed OT calculation for overnight shifts"
```

**Monitored Files** (changes to these require guide update):
- `backend/utils/otCalculation.js` - OT calculation logic
- `backend/utils/statutory.js` - EPF, SOCSO, EIS, PCB calculations
- `backend/utils/finalSettlement.js` - Prorate and final settlement
- `backend/routes/ess/clockin.js` - Clock-in/out flow and hours calculation
- `backend/routes/payrollUnified.js` - Payroll processing
- `backend/routes/payrollAI.js` - AI-assisted payroll features

---

*End of Calculation Guide*
