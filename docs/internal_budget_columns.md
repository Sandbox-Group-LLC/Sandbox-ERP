# Internal Budget Column Specification

This document details the column structure of the Internal Budget sheet, which serves as the central cost tracking and margin calculation worksheet.

---

## Header Row (Row 4)

| Col | Header | Type | Data Type | Description |
|-----|--------|------|-----------|-------------|
| A | Tax Category | Input | Text | Expense category code for tax lookup |
| B | Description | Input | Text | Line item description |
| C | OVH | Input | Boolean | Overhead flag (true/false) |
| D | Tax | Computed | % | Tax rate from Tax Codes lookup |
| E | Made By | Input | Boolean | Internal vs vendor flag |
| F | Vendor | Input | Text | Vendor name or "Expense Tracker" |
| G | Client Estimate [DATE] | Computed | Money | Client-facing amount (H × O markup) |
| H | MAS Internal Budget | Input/Computed | Money | Internal cost estimate |
| I | Forecast Costs | Computed | Money | Forecasted actual costs |
| J | Variance (Budget-Forecast) | Computed | Money | H - I |
| K | Actual Costs | Computed | Money | Actual spent from Job Report |
| L | Remaining (Forecast-Actual) | Computed | Money | I - K |
| M | Internal Notes | Input | Text | Internal comments |
| N | Client Notes [Dates] | Input | Text | Client-facing notes |
| O | Mark Up % | Input | % / Multiplier | Markup factor (default 1.0 = 100%) |
| Q | Guide | Input | Text | Implementation guidance notes |

---

## Column Formula Patterns

### Column D (Tax Rate)
```
=iferror(INDEX('Tax Codes'!$I$4:BQ320, MATCH($A9,'Tax Codes'!$B$4:B320,0), MATCH(Assumptions!$C$16,'Tax Codes'!$I$3:$BQ$3,0)), "")
```
- **Type:** Computed
- **Logic:** 2D lookup - finds tax rate by matching Tax Category (col A) against jurisdiction from Assumptions

### Column G (Client Estimate)
```
=(H9*O9)
```
- **Type:** Computed
- **Logic:** Internal budget × markup percentage
- **Frequency:** 171 occurrences

### Column H (MAS Internal Budget)
```
=iferror(if(C5=true, vlookup(B5,'Internal Staffing Calculator'!$B$9:$AK$95,'Internal Staffing Calculator'!L$1,false)*P5, vlookup(B5,'Internal Staffing Calculator'!$B$9:$AK$95,'Internal Staffing Calculator'!L$1,false)*(P5/1.5*1.2285)), "")
```
- **Type:** Computed (for staffing rows) / Input (for expense rows)
- **Logic:** Looks up role costs from Internal Staffing Calculator, adjusts for overhead

### Column I (Forecast Costs)
```
=if(C9=true, 0, if(F9="Expense Tracker", sumif('Expense Tracker'!E:E,B9,'Expense Tracker'!D:D), H9))
```
- **Type:** Computed
- **Logic:** 
  - If OVH=true → 0
  - If Vendor="Expense Tracker" → sum from Expense Tracker
  - Else → use internal budget

### Column J (Variance)
```
=H9-I9
```
- **Type:** Computed
- **Logic:** Budget minus forecast

### Column K (Actual Costs)
```
=sumif('Job Report'!I:I, B9, 'Job Report'!H:H)
```
- **Type:** Computed
- **Logic:** Sum actual costs from Job Report by description match
- **Frequency:** 268 occurrences

### Column L (Remaining)
```
=I9-K9
```
- **Type:** Computed
- **Logic:** Forecast minus actual

### Column O (Markup %)
```
=iferror(vlookup(A9,'Tax Codes'!$B$2:$D$110,3,false)*O$15,"")
```
- **Type:** Computed (some rows) / Input (others)
- **Logic:** Looks up default markup from Tax Codes, multiplied by base markup

---

## Section/Subtotal Behavior

### Row Structure

| Section | Rows | Description |
|---------|------|-------------|
| Header | 1-4 | Project info and column headers |
| Passthrough Costs | 5-13 | Pass-through expenses (no markup) |
| **Subtotal Row 14** | 14 | `=SUM(G6:G13)` pattern for cols G-L |
| MAS Costs | 15-210 | Main expense categories |
| **Subtotal Row 211** | 211 | `=SUM(G17:G210)` pattern for cols G-L |
| Staffing Summary | 215-220 | Aggregated staffing costs |
| **Section Totals** | 221-229 | Category subtotals and grand totals |
| COGS/Margin | 237-250 | Final margin calculations |
| Category Rollups | 277-290 | SUMIF-based category summaries |

### Subtotal Formula Patterns

**Section Subtotals (Row 14, 211):**
```
=SUM(G6:G13)   -- For each column G through L
=SUM(H6:H13)
=SUM(I6:I13)
...
```

**Grand Totals (Row 221-222):**
```
=sum(G17:G210)     -- MAS costs total
=G14+G211          -- Passthrough + MAS
```

**Category Rollups (Rows 277+):**
```
=SUMIF(F17:F214, G277, G17:G214)   -- Sum by vendor category
=SUMIF(F17:F214, G277, H17:H214)
=SUMIF(F17:F214, G277, I17:I214)
```

---

## Key Cell References

| Cell | Name | Description |
|------|------|-------------|
| B1 | (formula) | Project name from Assumptions!C9 |
| C2 | (formula) | Working GM % = (G238-G240)/G238 |
| G14 | - | Passthrough Costs Subtotal |
| G211 | - | MAS Costs Subtotal |
| G222 | MASCosts | Total MAS Costs |
| G227 | - | Client Subtotal |
| G229 | - | Client Grand Total |
| G238 | - | Total Revenue |
| G239 | ForecastMargin | Forecast Margin % |
| G240 | COGSForecast | COGS Forecast |
| G247 | COGSActual | COGS Actual |
| G250 | ActualMargin | Actual Margin % |
