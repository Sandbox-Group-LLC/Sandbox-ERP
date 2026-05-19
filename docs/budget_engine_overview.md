# Budget Engine Overview

This document provides a high-level overview of the core sheets that power the budget calculation engine.

---

## 1. Internal Budget

**Purpose:** The central budget worksheet that consolidates all project costs, calculates gross margins, and tracks forecast vs actual spending across all expense categories.

**Primary Tables/Ranges:**
| Range | Description | Size |
|-------|-------------|------|
| A1:Q314 | Main budget table | ~314 rows x 17 cols |
| G6:L13 | Passthrough costs section | 8 rows x 6 cols |
| G17:L210 | Line item expenses (MAS Costs) | ~194 rows x 6 cols |
| G215:L220 | Staffing summary | 6 rows x 6 cols |
| G227:L250 | Totals and margin calculations | ~24 rows x 6 cols |

**Column Classification:**
| Column | Type | Description |
|--------|------|-------------|
| A (Tax Category) | Input | Expense category code |
| B (Description) | Input | Line item description |
| C (OVH) | Input | Overhead flag (true/false) |
| D (Tax) | Computed | Tax rate lookup from Tax Codes |
| E (Made By) | Input | Vendor flag (true/false) |
| F (Vendor) | Input | Vendor name or "Expense Tracker" |
| G (Client Estimate) | Computed | Internal budget × markup |
| H (MAS Internal Budget) | Input/Computed | Base cost amount |
| I (Forecast Costs) | Computed | Forecasted costs |
| J (Variance) | Computed | H - I (Budget vs Forecast) |
| K (Actual Costs) | Computed | Summed from Job Report |
| L (Remaining) | Computed | I - K |
| O (Mark Up %) | Input | Markup percentage (default 1.0) |

**Key Outputs:**
- `G238`: Total Revenue (Client Estimate Total)
- `G240`: COGS Forecast
- `G247`: COGS Actual
- `G239`: Forecast Margin %
- `G250`: Actual Margin %
- `G227`: Client Subtotal
- `G229`: Client Grand Total

---

## 2. Assumptions

**Purpose:** Stores global project parameters and configuration values that drive calculations across all sheets (dates, markup rates, client info, fee structures).

**Primary Tables/Ranges:**
| Range | Description | Size |
|-------|-------------|------|
| B1:F55 | Configuration parameters | ~55 rows x 5 cols |

**Column Classification:**
| Column | Type | Description |
|--------|------|-------------|
| B-C | Input | Parameter names and values |
| E-F | Computed | Summary metrics from Internal Budget |

**Key Outputs:**
- `C9`: Project name/title
- `C14-C15`: Project dates
- `C16`: Tax jurisdiction selection
- `F13`: GM Target percentage
- `F22`: Forecast/Actual toggle
- `F26-F29`: Revenue and margin summaries

---

## 3. Controls

**Purpose:** Defines budget bracket thresholds, status codes, and dropdown lists used for data validation throughout the workbook.

**Primary Tables/Ranges:**
| Range | Description | Size |
|-------|-------------|------|
| B1:J249 | Control tables | ~249 rows x 10 cols |
| B2:I10 | Budget brackets | 9 rows x 8 cols |
| B215:B249 | Line item master list | ~35 rows |

**Column Classification:**
| Column | Type | Description |
|--------|------|-------------|
| B | Input | Bracket name / Item list |
| C-D | Input | Min/Max percentages |
| E | Computed | Average percentage |
| F-G | Input | Budget ranges and amounts |
| H | Computed | Adjustment percentages |
| I | Input | Bracket titles |
| J | Input | Project status codes |

**Key Outputs:**
- Budget bracket definitions for margin targeting
- Status dropdown values (Budget Build, In Production, etc.)
- Master list of expense categories

---

## 4. Tax Codes

**Purpose:** Comprehensive tax rate lookup table supporting multi-state and international tax calculations with item-specific rates by jurisdiction.

**Primary Tables/Ranges:**
| Range | Description | Size |
|-------|-------------|------|
| A1:BQ39 | Tax rate matrix | ~39 rows x 69 cols |
| B4:D110 | Item-to-markup lookup | ~107 rows x 3 cols |
| I3:BQ3 | State/jurisdiction headers | 1 row x 59 cols |
| I4:BQ39 | Tax rates by item × jurisdiction | ~35 rows x 59 cols |

**Column Classification:**
| Column | Type | Description |
|--------|------|-------------|
| A | Input | Item ID |
| B | Input | MAS Names (expense categories) |
| C | Input | International flag |
| D | Input | Markup percentage |
| I-BQ | Input | Tax rates by jurisdiction |

**Key Outputs:**
- Tax rate lookups via INDEX/MATCH using Assumptions!C16 as jurisdiction selector
- Markup percentages by expense category

---

## 5. Rate Card

**Purpose:** Master staffing rate table defining hourly billing rates by role and client, supporting multi-currency and client-specific pricing.

**Primary Tables/Ranges:**
| Range | Description | Size |
|-------|-------------|------|
| A1:AE88 | Rate card matrix | ~88 rows x 31 cols |
| A2:A103 | Role names | ~101 rows |
| C4:AE103 | Rate values by client | ~100 rows x 29 cols |

**Column Classification:**
| Column | Type | Description |
|--------|------|-------------|
| A | Input | MAS Role names |
| B | Input | Verve Internal Rates |
| C-AE | Input | Client-specific rates (Google, Dell, Amazon, etc.) |

**Key Outputs (Named Ranges):**
- `GoogleRates`: Column U rates
- `DellRates`: Column W rates
- `AmazonRates`: Column Z rates
- `LinkedInRates`: Column Y rates
- `QiddiyaRates`: Column AA rates
- `EmeaRatesEuro`: Column AB rates
- `LondonRatesGBP`: Column AC rates

---

## 6. Internal Staffing Calculator

**Purpose:** Calculates internal labor costs and hours by role, aggregating staffing assignments and computing total labor burden for the project.

**Primary Tables/Ranges:**
| Range | Description | Size |
|-------|-------------|------|
| A1:BN124 | Staffing calculator | ~124 rows x 66 cols |
| B9:AK95 | Role-based staffing matrix | ~87 rows x 36 cols |
| F5:K5 | Summary totals row | 1 row x 6 cols |

**Column Classification:**
| Column | Type | Description |
|--------|------|-------------|
| A | Computed | Category grouping |
| B | Input | Role/position name |
| C-E | Input | Assignment details |
| F-K | Computed | Hours and cost calculations |
| L+ | Input/Computed | Date-based hour allocations |

**Key Outputs:**
- `G5`: Total internal cost
- `H5`: Total hours
- `I5`: Total labor cost
- Per-role cost summaries used by Internal Budget via SUMIF

---

## 7. Client Staffing Calculator

**Purpose:** Calculates client-facing labor rates and billable amounts, applying client-specific rate cards to staffing assignments for revenue projection.

**Primary Tables/Ranges:**
| Range | Description | Size |
|-------|-------------|------|
| A1:BA169 | Client staffing calculator | ~169 rows x 53 cols |
| D3:BA169 | Rate and hour matrix | ~167 rows x 50 cols |

**Column Classification:**
| Column | Type | Description |
|--------|------|-------------|
| A-C | Input | Notes and configuration |
| D-BA | Computed | Billable amounts by date/period |

**Key Outputs:**
- Client-billable labor totals
- Revenue by staffing category
- Margin contribution from labor
