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

## Test Calculator Examples

### Example 1: AA Alive Driver (with OT)

**Employee:** Driver, Basic RM 1,800, Single, Age 30
**Work:** 10 hours OT in month, 1 PH day worked

```
Step 1: Calculate Hourly Rate
Hourly Rate = RM 1,800 / 22 / 7.5 = RM 10.91

Step 2: Calculate OT (1.0x for Driver)
OT Amount = 10 hrs x RM 10.91 x 1.0 = RM 109.10

Step 3: Calculate PH Pay (1 day)
PH Pay = (RM 1,800 / 22) x 1 x 1.0 = RM 81.82

Step 4: Calculate Gross (Statutory Base = Basic only)
Gross Salary = RM 1,800 + RM 109.10 + RM 81.82 = RM 1,990.92
Statutory Base = RM 1,800 (OT and PH not subject to statutory)

Step 5: Calculate EPF (on RM 1,800)
EPF Employee = RM 1,800 x 11% = RM 198
EPF Employer = RM 1,800 x 13% = RM 234

Step 6: Calculate SOCSO (on RM 1,800)
SOCSO Employee = RM 9.25 (from table: RM 1,800.01-1,900)
SOCSO Employer = RM 28.00

Step 7: Calculate EIS (on RM 1,800)
EIS Employee = RM 3.50 (from table)
EIS Employer = RM 3.50

Step 8: Calculate PCB (Monthly Tax)
Annual Chargeable Income = (RM 1,800 x 12) - RM 9,000 (individual relief) - RM 4,000 (EPF relief cap)
                         = RM 21,600 - RM 13,000 = RM 8,600
Annual Tax = RM 8,600 falls in 1%-3% bracket
           = (RM 8,600 - RM 5,000) x 1% = RM 36 (with RM 400 rebate = RM 0)
PCB = RM 0 (below rebate threshold)

Step 9: Calculate Net Salary
Total Deductions = RM 198 + RM 9.25 + RM 3.50 + RM 0 = RM 210.75
Net Salary = RM 1,990.92 - RM 210.75 = RM 1,780.17

Step 10: Employer Cost
Employer Cost = RM 1,990.92 + RM 234 + RM 28 + RM 3.50 = RM 2,256.42
```

---

### Example 2: AA Alive Office Staff (no OT)

**Employee:** Admin, Basic RM 2,500, Married (spouse not working), 2 children, Age 35

```
Step 1: Gross Salary (no OT for office staff)
Gross Salary = RM 2,500
Statutory Base = RM 2,500

Step 2: Calculate EPF
EPF Employee = RM 2,500 x 11% = RM 275
EPF Employer = RM 2,500 x 13% = RM 325

Step 3: Calculate SOCSO (on RM 2,500)
SOCSO Employee = RM 12.25
SOCSO Employer = RM 37.00

Step 4: Calculate EIS
EIS Employee = RM 4.90
EIS Employer = RM 4.90

Step 5: Calculate PCB
Annual Chargeable Income = (RM 2,500 x 12) - RM 9,000 - RM 4,000 (spouse) - RM 4,000 (children: 2 x RM 2,000) - RM 4,000 (EPF cap)
                         = RM 30,000 - RM 21,000 = RM 9,000
Annual Tax = (RM 9,000 - RM 5,000) x 1% = RM 40 (with RM 800 rebate for married = RM 0)
PCB = RM 0

Step 6: Calculate Net Salary
Total Deductions = RM 275 + RM 12.25 + RM 4.90 + RM 0 = RM 292.15
Net Salary = RM 2,500 - RM 292.15 = RM 2,207.85
```

---

### Example 3: Mimix Crew (Full-time Confirmed)

**Employee:** Crew, Basic RM 1,800, Single, Age 25
**Work:** 8 hours approved OT, 1 PH day with 2 hours OT

```
Step 1: Calculate Hourly Rate
Hourly Rate = RM 1,800 / 22 / 7.5 = RM 10.91

Step 2: Calculate Normal OT (1.5x)
Normal OT = 8 hrs x RM 10.91 x 1.5 = RM 130.92

Step 3: Calculate PH After Hours OT (3.0x)
PH OT = 2 hrs x RM 10.91 x 3.0 = RM 65.46

Step 4: Calculate PH Pay (working on PH)
PH Pay = (RM 1,800 / 22) x 1 = RM 81.82

Step 5: Calculate Gross
Gross Salary = RM 1,800 + RM 130.92 + RM 65.46 + RM 81.82 = RM 2,078.20
Statutory Base = RM 1,800

Step 6: Calculate Statutory (on RM 1,800)
EPF Employee = RM 198, Employer = RM 234
SOCSO Employee = RM 9.25, Employer = RM 28.00
EIS Employee = RM 3.50, Employer = RM 3.50
PCB = RM 0 (below threshold)

Step 7: Calculate Net Salary
Total Deductions = RM 198 + RM 9.25 + RM 3.50 = RM 210.75
Net Salary = RM 2,078.20 - RM 210.75 = RM 1,867.45
```

---

### Example 4: Mimix Part-Time

**Employee:** Part-time Crew, Hourly Rate RM 8.72
**Work:** 120 hours in month

```
Step 1: Calculate Gross
Gross Salary = 120 hrs x RM 8.72 = RM 1,046.40
Statutory Base = RM 1,046.40

Step 2: Calculate Statutory
EPF Employee = RM 1,046.40 x 11% = RM 115
EPF Employer = RM 1,046.40 x 13% = RM 136
SOCSO Employee = RM 5.25, Employer = RM 16.00
EIS Employee = RM 2.10, Employer = RM 2.10
PCB = RM 0

Step 3: Calculate Net Salary
Total Deductions = RM 115 + RM 5.25 + RM 2.10 = RM 122.35
Net Salary = RM 1,046.40 - RM 122.35 = RM 924.05
```

---

### Example 5: Higher Salary with PCB

**Employee:** Manager, Basic RM 5,000, Single, Age 40

```
Step 1: Gross Salary
Gross Salary = RM 5,000
Statutory Base = RM 5,000

Step 2: Calculate EPF
EPF Employee = RM 5,000 x 11% = RM 550
EPF Employer = RM 5,000 x 12% = RM 600 (12% for salary > RM 5,000)

Step 3: Calculate SOCSO (ceiling RM 5,000)
SOCSO Employee = RM 24.75 (max)
SOCSO Employer = RM 69.05 (max)

Step 4: Calculate EIS (ceiling RM 5,000)
EIS Employee = RM 9.90 (max)
EIS Employer = RM 9.90 (max)

Step 5: Calculate PCB
Annual Gross = RM 5,000 x 12 = RM 60,000
Annual EPF = RM 550 x 12 = RM 6,600 (capped at RM 4,000 for relief)
Reliefs = RM 9,000 (individual) + RM 4,000 (EPF cap) = RM 13,000
Annual Chargeable Income = RM 60,000 - RM 13,000 = RM 47,000

Tax Calculation (using LHDN brackets):
- First RM 35,000: RM 200 (B value after rebate)
- Next RM 12,000 (RM 47,000 - RM 35,000) at 6%: RM 720
Annual Tax = RM 200 + RM 720 = RM 920
Monthly PCB = RM 920 / 12 = RM 76.67 ≈ RM 77 (rounded up to 5 sen)

Step 6: Calculate Net Salary
Total Deductions = RM 550 + RM 24.75 + RM 9.90 + RM 77 = RM 661.65
Net Salary = RM 5,000 - RM 661.65 = RM 4,338.35

Step 7: Employer Cost
Employer Cost = RM 5,000 + RM 600 + RM 69.05 + RM 9.90 = RM 5,678.95
```

---

### PCB Tax Brackets Reference (2024/2025)

| Chargeable Income (Annual) | Rate | Cumulative Tax |
|---------------------------|------|----------------|
| First RM 5,000 | 0% | RM 0 |
| RM 5,001 - RM 20,000 | 1% | RM 150 |
| RM 20,001 - RM 35,000 | 3% | RM 600 |
| RM 35,001 - RM 50,000 | 6% | RM 1,500 |
| RM 50,001 - RM 70,000 | 11% | RM 3,700 |
| RM 70,001 - RM 100,000 | 19% | RM 9,400 |
| RM 100,001 - RM 400,000 | 25% | RM 84,400 |
| RM 400,001 - RM 600,000 | 26% | RM 136,400 |
| RM 600,001 - RM 2,000,000 | 28% | RM 528,400 |
| Above RM 2,000,000 | 30% | - |

**Tax Rebates:**
- Single/Category 1: RM 400
- Married (spouse not working)/Category 2: RM 800

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
