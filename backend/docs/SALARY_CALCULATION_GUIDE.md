# Salary Calculation Guide

This document describes the salary and payroll calculation logic for each company in the HRMS system.

---

## Company Overview

| Company | Company ID | OT Approval Required | Outlet-based |
|---------|------------|---------------------|--------------|
| AA Alive | 1, 2 | No (auto-approved) | No (department-based) |
| Mimix | 3 | Yes | Yes |

---

## AA Alive Calculation Rules

### Basic Configuration
- **Standard work hours:** 8 hours/day (7.5 hours work + 1 hour break)
- **OT threshold:** 7.5 working hours (OT starts after 7.5 hours)
- **Working days/month:** 22 days
- **Part-time employees:** No OT calculation

### OT (Overtime) Multipliers

#### Driver & Packing Room ONLY
| Type | Multiplier | Description |
|------|------------|-------------|
| Normal | 1.0x | Weekday OT |
| Weekend | 1.0x | Saturday/Sunday OT |
| Public Holiday | 2.0x | Working on PH |
| PH After Hours | 2.0x | OT on top of PH |

#### Other Departments
- **No OT calculation** - other departments do not have overtime
- **No PH work** - other departments do not work on public holidays

### OT Calculation Rules
- **Minimum OT:** 1.0 hour (less than 1 hour = 0)
- **Rounding:** Down to nearest 0.5 hour
- **OT Approval:** NOT required - all OT counts automatically

### OT Rounding Examples
| Raw OT Minutes | Rounded OT Hours |
|----------------|------------------|
| 45 min | 0 hr (below minimum) |
| 60 min | 1.0 hr |
| 75 min | 1.0 hr |
| 90 min | 1.5 hr |
| 105 min | 1.5 hr |
| 120 min | 2.0 hr |

### Salary Structure
- Uses `employees.default_basic_salary` from employee record
- Supports flexible commissions and allowances
- **Indoor Sales special logic:** Compare basic salary vs commission, use the HIGHER amount

### Probation to Confirmed Salary Increment
- Increment amount is **per employee** (stored in `employees.increment_amount`)
- Each employee can have different increment amounts based on individual agreement
- Salary updates from `salary_before_confirmation` to `salary_after_confirmation` upon confirmation

### Formulas

**Hourly Rate:**
```
Hourly Rate = Basic Salary / 22 days / 7.5 hours
```

**OT Amount (Driver & Packing Room only):**
```
Normal OT = OT Hours x Hourly Rate x 1.0
Weekend OT = OT Hours x Hourly Rate x 1.0
PH OT = OT Hours x Hourly Rate x 2.0
PH After Hours OT = OT Hours x Hourly Rate x 2.0
```

**Other Departments:** No OT or PH work applicable

**PH Extra Pay (working on public holiday):**
```
PH Pay = (Basic Salary / 22) x PH Days Worked x 1.0
```

---

## Mimix Calculation Rules

### Basic Configuration
- **Standard work hours:** 8 hours/day (7.5 hours work + 1 hour break)
- **OT threshold:** 7.5 working hours (OT starts after 7.5 hours)
- **Working days/month:** 22 days
- **Part-time employees:** No OT calculation (hourly rate only)

### OT (Overtime) Multipliers
| Type | Multiplier | Description |
|------|------------|-------------|
| Normal | 1.5x | Weekday OT |
| Weekend | 1.5x | Saturday/Sunday OT |
| Public Holiday | 2.0x | Working on PH (within normal hours) |
| PH After Hours | 3.0x | OT on top of PH |

### OT Calculation Rules
- **Minimum OT:** 1.0 hour (less than 1 hour = 0)
- **Rounding:** Down to nearest 0.5 hour
- **OT Approval:** REQUIRED - only approved OT counts for payroll

### Salary Structure (Position-Based)
| Position | Work Type | Employment Status | Basic Salary |
|----------|-----------|-------------------|--------------|
| Manager | Full-time | Confirmed | RM 2,500 |
| Supervisor | Full-time | Confirmed | RM 2,000 |
| Supervisor | Full-time | Probation | RM 2,000 |
| Crew | Full-time | Confirmed | RM 1,800 |
| Crew | Full-time | Probation | RM 1,700 |
| All Positions | Part-time | Any | RM 8.72/hour |

### Probation to Confirmed Salary Increment
When a probation employee is confirmed:
- Crew salary increases from RM 1,700 to RM 1,800 (increment: RM 100)
- Supervisor salary remains RM 2,000 (no change)

### Part-Time Salary Calculation
```
Gross Salary = Total Work Hours x RM 8.72
```
- Calculated from `clock_in_records.total_work_minutes`
- No OT calculation for part-time employees

### Formulas

**Hourly Rate (Full-time):**
```
Hourly Rate = Basic Salary / 22 days / 7.5 hours
```

**OT Amount:**
```
Normal OT = OT Hours x Hourly Rate x 1.5
Weekend OT = OT Hours x Hourly Rate x 1.5
PH OT = OT Hours x Hourly Rate x 2.0
PH After Hours OT = OT Hours x Hourly Rate x 3.0
```

---

## Gross Salary Formula (Both Companies)

```
Gross Salary = Basic Salary
             + Fixed Allowance
             + Flexible Allowance
             + OT Amount
             + PH Pay
             + Commission
             + Claims
             - Unpaid Leave Deduction
             - Late/Early Deduction
```

---

## Statutory Deductions (Both Companies)

### Important Rule
**Statutory deductions apply ONLY to:**
- Basic Salary
- Commission
- Bonus

**NOT subject to statutory deductions:**
- OT Amount
- Allowances
- Outstation
- Incentives

### EPF (KWSP)
| Age | Employee Rate | Employer Rate |
|-----|---------------|---------------|
| ≤ 60 | 11% | 13% (salary ≤ RM5,000) or 12% (> RM5,000) |
| > 60 | 0% | 4% |

- **Wage ceiling:** RM 20,000
- **Rounding:** To nearest RM (not cents)

### SOCSO (PERKESO)
- Based on tiered contribution table
- **Ceiling:** RM 5,000
- Age ≥ 60: Employee 0%, Employer pays bracket contribution

### EIS (Employment Insurance)
- Based on tiered contribution table
- **Ceiling:** RM 5,000
- **Not applicable:** Age ≥ 57

### PCB (Monthly Tax Deduction)
- Full LHDN Computerized Method
- Uses year-to-date data for accuracy
- **Tax brackets:** 0% up to RM 5,000, progressive up to 30% (RM 2M+)

**Tax Reliefs:**
| Relief Type | Amount |
|-------------|--------|
| Individual | RM 9,000 |
| Spouse (not working) | RM 4,000 |
| Disabled Individual | RM 7,000 |
| Disabled Spouse | RM 6,000 |
| Per Child | RM 2,000 |

---

## Net Salary Formula

```
Net Salary = Gross Salary
           - EPF (Employee)
           - SOCSO (Employee)
           - EIS (Employee)
           - PCB
           - Other Deductions
```

---

## Employer Cost Formula

```
Employer Total Cost = Gross Salary
                    + EPF (Employer)
                    + SOCSO (Employer)
                    + EIS (Employer)
```

---

## Quick Reference: Key Differences

| Feature | AA Alive | Mimix |
|---------|----------|-------|
| OT approval required | No | Yes |
| OT applicable departments | Driver & Packing Room only | All departments |
| Normal OT multiplier | 1.0x | 1.5x |
| PH multiplier | 2.0x | 2.0x |
| PH after-hours multiplier | 2.0x | 3.0x |
| Salary structure | Employee-based | Position-based |
| Part-time rate | Employee hourly_rate | RM 8.72/hour |
| Probation increment | Per employee (varies) | RM 100 (crew) |
| Outlet support | No | Yes |

---

## Code Implementation Status

> **Note:** The current code implementation does not fully differentiate between AA Alive and Mimix calculation rules. The following items need to be updated:

### AA Alive - Needs Implementation
- [ ] Restrict OT calculation to Driver & Packing Room departments only
- [ ] Set OT multipliers: Normal 1.0x, Weekend 1.0x, PH 2.0x, PH After Hours 2.0x
- [ ] Other departments should have no OT or PH work calculations

### Mimix - Correctly Implemented
- [x] All departments have OT calculation
- [x] OT multipliers: Normal 1.5x, Weekend 1.5x, PH 2.0x, PH After Hours 3.0x
- [x] OT approval required before payroll
- [x] Position-based salary structure

---

## Source Code References

- OT Calculation: `backend/utils/otCalculation.js`
- Statutory Calculation: `backend/utils/statutory.js`
- Mimix Salary Config: `backend/db/migrations/009-mimix-salary-config.sql`
- Payroll Processing: `backend/routes/payrollNew.js`
