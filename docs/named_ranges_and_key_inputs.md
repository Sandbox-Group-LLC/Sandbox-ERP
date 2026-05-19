# Named Ranges and Key Inputs

This document catalogs all named ranges in the Budget workbook and identifies key global inputs that drive calculations.

---

## Named Ranges

| Name | Reference | Used By Internal Budget | Description |
|------|-----------|------------------------|-------------|
| **COGSForecast** | `'Internal Budget'!$G$240` | Yes (output) | Cost of Goods Sold - Forecasted |
| **COGSActual** | `'Internal Budget'!$G$247` | Yes (output) | Cost of Goods Sold - Actual |
| **ForecastMargin** | `'Internal Budget'!$G$239` | Yes (output) | Forecast Gross Margin % |
| **ActualMargin** | `'Internal Budget'!$G$250` | Yes (output) | Actual Gross Margin % |
| **MASCosts** | `'Internal Budget'!$G$222` | Yes (output) | Total MAS (internal) costs |
| GoogleRates | `'Rate Card'!$U$4:$U$103` | No (via Staffing Calc) | Google client hourly rates |
| DellRates | `'Rate Card'!$W$4:$W$103` | No (via Staffing Calc) | Dell client hourly rates |
| NorthwellRates | `'Rate Card'!$X$4:$X$103` | No (via Staffing Calc) | Northwell client hourly rates |
| LinkedInRates | `'Rate Card'!$Y$4:$Y$103` | No (via Staffing Calc) | LinkedIn client hourly rates |
| AmazonRates | `'Rate Card'!$Z$4:$Z$81` | No (via Staffing Calc) | Amazon client hourly rates |
| QiddiyaRates | `'Rate Card'!$AA$4:$AA$103` | No (via Staffing Calc) | Qiddiya client hourly rates |
| EmeaRatesEuro | `'Rate Card'!$AB$4:$AB$103` | No (via Staffing Calc) | EMEA rates in EUR |
| LondonRatesGBP | `'Rate Card'!$AC$3:$AC$103` | No (via Staffing Calc) | London rates in GBP |
| LondonDAYRatesGBP | `'Rate Card'!$AD$4:$AD$103` | No (via Staffing Calc) | London day rates in GBP |
| IntelRates | `'Rate Card'!$AE$4:$AE$103` | No (via Staffing Calc) | Intel client hourly rates |
| OtherClientRates | `'Rate Card'!$V$4:$V$103` | No (via Staffing Calc) | Generic other client rates |

---

## Key Global Inputs (Assumptions Sheet)

| Cell | Purpose | Used In | Description |
|------|---------|---------|-------------|
| **C9** | Project Name | Internal Budget B1 | Project/event title |
| **C14** | Start Date | Date calculations | Project start date |
| **C15** | End Date | Date calculations | Project end date |
| **C16** | Tax Jurisdiction | Internal Budget D column | State/region for tax rates |
| **F13** | GM Target | Internal Budget D3 | Target gross margin % |
| **F22** | Forecast/Actual Toggle | Assumptions formulas | Switches COGS calculation mode |

---

## Key Global Inputs (Controls Sheet)

| Cell/Range | Purpose | Used In | Description |
|------------|---------|---------|-------------|
| **B2:I10** | Budget Brackets | Margin targeting | Defines GM% ranges by budget size |
| **C2:C10** | Min Margin % | Bracket validation | Minimum acceptable margin |
| **D2:D10** | Max Margin % | Bracket validation | Maximum target margin |
| **F2:G10** | Budget Ranges | Bracket selection | Dollar thresholds for brackets |
| **B215:B249** | Line Item Master | Internal Budget dropdowns | Valid expense categories |
| **J2:J10** | Project Status | Status dropdowns | Valid project status values |

---

## Key Global Inputs (Tax Codes Sheet)

| Range | Purpose | Used In | Description |
|-------|---------|---------|-------------|
| **B2:D110** | Item Markup Table | Internal Budget O column | Default markup % by category |
| **I3:BQ3** | Jurisdiction Headers | Tax lookups | State/country names |
| **I4:BQ39** | Tax Rate Matrix | Internal Budget D column | Tax rates by item × jurisdiction |

---

## Key Global Inputs (Rate Card Sheet)

| Range | Purpose | Used In | Description |
|-------|---------|---------|-------------|
| **A3:A103** | Role Names | Staffing calculators | Standard role/position titles |
| **B3:B103** | Internal Rates | Internal Staffing Calc | Verve internal hourly rates |
| **C3:AE103** | Client Rates | Client Staffing Calc | Client-specific billing rates |

---

## Input-Output Flow Summary

```
INPUTS                          CALCULATIONS                    OUTPUTS
─────────                       ────────────                    ───────
Assumptions                                                     
├─ C16 (Jurisdiction) ──────────→ Tax Codes Lookup ──────────→ Tax Rate (col D)
├─ C9 (Project Name) ───────────→ Internal Budget B1
├─ F13 (GM Target) ─────────────→ Internal Budget D3
└─ F22 (Forecast Toggle) ───────→ COGS Selection

Tax Codes                                                       
├─ B:D (Markup Table) ──────────→ Markup % (col O)
└─ I:BQ (Tax Matrix) ───────────→ Tax Rate (col D)

Controls                                                        
├─ B:I (Brackets) ──────────────→ GM Validation
└─ B215:B249 (Items) ───────────→ Dropdown Validation

Rate Card                                                       
├─ B (Internal Rates) ──────────→ Internal Staffing Calc ────→ MAS Internal Budget (col H)
└─ Client Columns ──────────────→ Client Staffing Calc ──────→ Client Rates

Internal Budget                                                 
├─ (col H × col O) ─────────────→ Client Estimate (col G) ───→ G238 (Revenue)
├─ Expense Tracker SUMIF ───────→ Forecast Costs (col I) ────→ G240 (COGS Forecast)
├─ Job Report SUMIF ────────────→ Actual Costs (col K) ──────→ G247 (COGS Actual)
└─ (Revenue - COGS) / Revenue ──→ Margin % ──────────────────→ G239/G250
```

---

## Fee and Adjustment Rules

From formula analysis, the following fee rules are embedded:

| Rule | Formula Pattern | Applied To |
|------|-----------------|------------|
| Contingency | `×1.05` | Base costs (5% contingency) |
| Fee Markup | `×1.25` | After contingency (25% agency fee) |
| Combined | `(H×1.05)×1.25` | Standard line items |
| Overhead Labor | `(P/1.5)×1.2285` | Non-billable staffing adjustment |
| Standard Markup | `H×O` (O=1.0 default) | Pass-through with 100% markup |
