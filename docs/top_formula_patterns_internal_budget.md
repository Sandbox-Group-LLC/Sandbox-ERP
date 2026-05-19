# Top Formula Patterns - Internal Budget

This document lists the most frequently used formula patterns in the Internal Budget sheet, sorted by occurrence count.

---

## Pattern Summary

| Rank | Count | Pattern | Description |
|------|-------|---------|-------------|
| 1 | 1161 | Cell reference | Simple reference to another cell |
| 2 | 268 | SUMIF Job Report | Sum actual costs by description |
| 3 | 178 | H-I variance | Budget minus forecast |
| 4 | 177 | INDEX/MATCH Tax | Tax rate lookup |
| 5 | 172 | I-K remaining | Forecast minus actual |
| 6 | 171 | H×O markup | Internal × markup |
| 7 | 171 | IF/SUMIF costs | Conditional forecast calculation |
| 8 | 167 | VLOOKUP tax rate | Markup lookup by category |

---

## Detailed Pattern Analysis

### 1. Simple Cell Reference
**Normalized:** `G#`  
**Count:** 1161  
**Examples:** `F2`, `G2`, `H2`  
**Description:** References another cell's value directly, used for summary cells and cross-references.

---

### 2. SUMIF from Job Report
**Normalized:** `sumif('Job Report'!I:I, B#, 'Job Report'!H:H)`  
**Count:** 268  
**Examples:** `K9`, `K10`, `K11`  
**Description:** Sums actual costs from Job Report sheet where the description matches the current row's description.

---

### 3. Budget-Forecast Variance
**Normalized:** `H#-I#`  
**Count:** 178  
**Examples:** `J9`, `J10`, `J11`  
**Description:** Calculates the difference between internal budget and forecast costs.

---

### 4. Tax Rate INDEX/MATCH Lookup
**Normalized:** `iferror(INDEX('Tax Codes'!I#:BQ#, MATCH(A#,'Tax Codes'!B#:B#,0), MATCH(Assumptions!C#,'Tax Codes'!I#:BQ#,0)), "")`  
**Count:** 177  
**Examples:** `D9`, `D10`, `D11`  
**Description:** 2D lookup to find the tax rate by matching tax category (row) and jurisdiction (column) from Tax Codes.

---

### 5. Forecast-Actual Remaining
**Normalized:** `I#-K#`  
**Count:** 172  
**Examples:** `L9`, `L10`, `L11`  
**Description:** Calculates remaining budget by subtracting actual costs from forecast.

---

### 6. Client Estimate Markup
**Normalized:** `(H#*O#)`  
**Count:** 171  
**Examples:** `G9`, `G10`, `G11`  
**Description:** Multiplies internal budget by markup percentage to calculate client-facing estimate.

---

### 7. Conditional Forecast Calculation
**Normalized:** `if(C#=true, 0, if(F#="Expense Tracker", sumif('Expense Tracker'!E:E,B#,'Expense Tracker'!D:D), H#))`  
**Count:** 171  
**Examples:** `I9`, `I10`, `I11`  
**Description:** Returns 0 if overhead, sums from Expense Tracker if vendor, otherwise uses internal budget.

---

### 8. Markup Rate VLOOKUP
**Normalized:** `iferror(vlookup(A#,'Tax Codes'!B#:D#,3,false)*O#, "")`  
**Count:** 167  
**Examples:** `O19`, `O20`, `O21`  
**Description:** Looks up default markup percentage from Tax Codes by tax category.

---

### 9. Vendor-based Markup Lookup
**Normalized:** `iferror(vlookup(F#,'Tax Codes'!B#:D#,3,false)*O#, "")`  
**Count:** 21  
**Examples:** `O18`, `O22`, `O47`  
**Description:** Looks up markup using vendor name instead of tax category.

---

### 10. Assumptions Reference
**Normalized:** `Assumptions!C#`  
**Count:** 13  
**Examples:** `B1`, `B228`, `D237`  
**Description:** References global configuration values from Assumptions sheet.

---

### 11-13. Category SUMIF Rollups
**Normalized:** `SUMIF(F#:F#, G#, [G/H/I]#:G#)`  
**Count:** 13 each (3 columns)  
**Examples:** `H277`, `I277`, `J277`  
**Description:** Sums budget values by vendor category for reporting rollups.

---

### 14. Contingency/Fee Calculation
**Normalized:** `(H#*1.05)*1.25`  
**Count:** 10  
**Examples:** `G256`, `G257`, `G258`  
**Description:** Applies 5% contingency plus 25% fee markup to internal costs.

---

### 15. Staffing Calculator Reference
**Normalized:** `'Internal Staffing Calculator'!C#`  
**Count:** 7  
**Examples:** `G71`, `G72`, `G73`  
**Description:** Direct reference to staffing calculator values.

---

### 16-18. Staffing SUMIF by Category
**Normalized:** `sumif('Internal Staffing Calculator'!A#:A#, B#, 'Internal Staffing Calculator'![F/G/H]#:#)`  
**Count:** 6 each  
**Examples:** `G215`, `H215`, `I215`  
**Description:** Aggregates staffing costs by category from Internal Staffing Calculator.

---

### 19. Staffing Hours SUMIF
**Normalized:** `sumif('Internal Staffing Calculator'!A:A, B#, 'Internal Staffing Calculator'!J:J)`  
**Count:** 6  
**Examples:** `K215`, `K216`, `K217`  
**Description:** Sums staffing hours by category.

---

### 20. Staffing Cost VLOOKUP
**Normalized:** `iferror(if(C#=true, vlookup(B#,'Internal Staffing Calculator'!B#:AK#,...)*P#, ...))`  
**Count:** 5  
**Examples:** `H5`, `H8`, `H13`  
**Description:** Looks up role costs from staffing calculator with overhead adjustment.

---

### 21-22. Column Subtotals
**Normalized:** `SUM(G#:G#)` / `SUM(H#:H#)`  
**Count:** 4 each  
**Examples:** `G14`, `G211`, `H14`, `H211`  
**Description:** Section subtotals for each column.

---

### 23. Combined Subtotals
**Normalized:** `G#+G#`  
**Count:** 4  
**Examples:** `G222`, `G227`, `G229`  
**Description:** Adds section subtotals together for grand totals.

---

### 24-26. Additional Column Subtotals
**Normalized:** `SUM(J#:J#)`, `sum(H#:H#)`, `sum(I#:I#)`  
**Count:** 3 each  
**Examples:** `J14`, `H221`, `I221`  
**Description:** Subtotals for variance and cost columns.

---

### 27. Overhead Filtering
**Normalized:** `sumif($E:$E, true, G:G)`  
**Count:** 3  
**Examples:** `H271`, `I271`, `J271`  
**Description:** Sums only rows where overhead flag is true.

---

### 28. Margin Percentage
**Normalized:** `(G#-G#)/G#`  
**Count:** 2  
**Examples:** `C2`, `G239`  
**Description:** Calculates gross margin percentage as (revenue - cost) / revenue.
