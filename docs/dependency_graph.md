# Budget Engine Dependency Graph

This document maps the major data dependencies between sheets in the budget workbook.

---

## Dependency Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INTERNAL BUDGET                                │
│                        (Central Calculation Hub)                         │
└─────────────────────────────────────────────────────────────────────────┘
       ▲           ▲           ▲           ▲           ▲           ▲
       │           │           │           │           │           │
  Assumptions   Tax Codes   Controls   Expense    Job Report   Internal
                                       Tracker                 Staffing
                                                               Calculator
                                                                   ▲
                                                                   │
                                                          ┌────────┴────────┐
                                                          │                 │
                                                     Rate Card        Hours Spread
                                                                      - Filtered
```

---

## Internal Budget Depends On

| Source Sheet | Data Used | Purpose |
|--------------|-----------|---------|
| **Assumptions** | C9 (Project Name), C16 (Jurisdiction), F13 (GM Target), F22 (Toggle) | Global configuration |
| **Tax Codes** | I:BQ (Tax Matrix), B:D (Markup Table) | Tax rates and markup percentages |
| **Controls** | B2 (Lookup values), B215:B249 (Item list) | Budget brackets and item validation |
| **Expense Tracker** | D:E columns | Actual expenses by category via SUMIF |
| **Job Report** | H:I columns | Actual costs by description via SUMIF |
| **Internal Staffing Calculator** | B:AK matrix, A:J summary columns | Labor costs and hours |

**Formula Examples:**
```
=Assumptions!C9                                    → Project name
=INDEX('Tax Codes'!I:BQ, MATCH(...))              → Tax rate lookup
=sumif('Expense Tracker'!E:E, B#, 'Expense Tracker'!D:D)  → Expense totals
=sumif('Job Report'!I:I, B#, 'Job Report'!H:H)    → Actual costs
=vlookup(B#, 'Internal Staffing Calculator'!B:AK, ...) → Staffing costs
```

---

## Internal Staffing Calculator Depends On

| Source Sheet | Data Used | Purpose |
|--------------|-----------|---------|
| **Rate Card** | B column (Internal Rates), Client columns | Hourly rate lookups |
| **Hours Spread - Filtered** | Hour allocations | Staff hours by date |
| **Job Report** | Actual hours worked | Hours reconciliation |
| **Internal Budget** | Category assignments | Cost center mapping |

**Formula Examples:**
```
=vlookup(B#, 'Rate Card'!A:B, 2, false)           → Internal hourly rate
=sumif('Hours Spread - Filtered'!..., ...)        → Hours by role
```

---

## Client Staffing Calculator Depends On

| Source Sheet | Data Used | Purpose |
|--------------|-----------|---------|
| **Rate Card** | Named ranges (GoogleRates, AmazonRates, etc.) | Client billing rates |
| **Internal Staffing Calculator** | Hours and role data | Base hours to bill |
| **Assumptions** | Client selection | Which rate column to use |

---

## Tax Codes Affects

| Target Sheet | How Used |
|--------------|----------|
| **Internal Budget** | Column D (Tax Rate) via INDEX/MATCH |
| **Internal Budget** | Column O (Markup %) via VLOOKUP |

Tax Codes is a pure lookup table with no dependencies on other sheets.

---

## Rate Card Affects

| Target Sheet | How Used |
|--------------|----------|
| **Internal Staffing Calculator** | Role-based hourly rates |
| **Client Staffing Calculator** | Client-specific billing rates |

Rate Card is a pure reference table with no dependencies on other sheets.

---

## Controls Affects

| Target Sheet | How Used |
|--------------|----------|
| **Internal Budget** | B215:B249 referenced for item list |
| **Internal Budget** | Bracket thresholds for margin validation |

Controls is primarily a configuration/validation sheet.

---

## Assumptions Affects

| Target Sheet | How Used |
|--------------|----------|
| **Internal Budget** | Project name (B1), jurisdiction (D column lookup), GM target |
| **Tax Codes lookups** | C16 provides the jurisdiction column selector |
| **Margin calculations** | F22 toggles between Forecast and Actual COGS |

---

## Data Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Rate Card  │     │  Tax Codes  │     │  Controls   │
│  (Rates)    │     │  (Tax/Mkup) │     │  (Brackets) │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────┐    ┌─────────────────────────────────┐
│   Internal   │───▶│         INTERNAL BUDGET         │
│   Staffing   │    │                                 │
│  Calculator  │    │  ┌─────────┐    ┌───────────┐  │
└──────────────┘    │  │ Line    │───▶│ Subtotals │  │
       ▲            │  │ Items   │    └─────┬─────┘  │
       │            │  └─────────┘          │        │
┌──────────────┐    │                       ▼        │
│ Hours Spread │    │               ┌───────────┐    │
│  - Filtered  │    │               │  Margins  │    │
└──────────────┘    │               │  COGS     │    │
                    │               │  Revenue  │    │
┌──────────────┐    │               └───────────┘    │
│  Assumptions │───▶│                                 │
└──────────────┘    └─────────────────────────────────┘
                              ▲           ▲
┌──────────────┐              │           │
│   Expense    │──────────────┘           │
│   Tracker    │                          │
└──────────────┘                          │
┌──────────────┐                          │
│  Job Report  │──────────────────────────┘
└──────────────┘
```

---

## Circular References

**None detected.** The dependency graph is acyclic:
- Lookup tables (Rate Card, Tax Codes, Controls) have no dependencies
- Calculators depend on lookups and upstream data
- Internal Budget aggregates from all sources
- No sheet references back to a sheet that references it
