import { describe, test, expect } from "vitest";
import {
  computeBudgetLine,
  computeAllBudgetLines,
  calculateBudgetSummary,
  buildTaxCodeMap,
  buildStaffingRateMap,
  buildExpenseMap,
  buildActualMap,
  lookupTaxRate,
  lookupDefaultMarkup,
  lookupStaffingRate,
  calculateInternalCost,
  calculateMarkup,
  calculateForecast,
  calculateActual,
  formatCurrency,
  formatPercent,
  BudgetContext,
  BudgetLineInput,
  TaxCodeLookup,
  StaffingRateLookup,
} from "./budget-engine";

const sampleTaxCodes: TaxCodeLookup[] = [
  { categoryCode: "Admin", jurisdiction: "California", taxRate: 0.0875, defaultMarkup: 1.25, isTaxable: true },
  { categoryCode: "Travel", jurisdiction: "California", taxRate: 0.0, defaultMarkup: 1.0, isTaxable: false },
  { categoryCode: "AV", jurisdiction: "California", taxRate: 0.0875, defaultMarkup: 1.15, isTaxable: true },
  { categoryCode: "Admin", jurisdiction: "Texas", taxRate: 0.0825, defaultMarkup: 1.25, isTaxable: true },
];

const sampleStaffingRates: StaffingRateLookup[] = [
  { roleName: "Executive Producer", internalRate: 250 },
  { roleName: "Producer", internalRate: 150 },
  { roleName: "Production Assistant", internalRate: 50 },
];

function createTestContext(
  jurisdiction: string = "California",
  baseMarkup: number = 1.0
): BudgetContext {
  return {
    jurisdiction,
    baseMarkup,
    taxCodes: buildTaxCodeMap(sampleTaxCodes),
    staffingRates: buildStaffingRateMap(sampleStaffingRates),
    expensesByDescription: new Map([
      ["Research and Sourcing", 500],
      ["Site Survey", 1200],
    ]),
    actualsByDescription: new Map([
      ["Research and Sourcing", 450],
      ["Site Survey", 1100],
      ["AV Equipment", 5000],
    ]),
    expensesByBudgetLineId: new Map(),
    actualsByBudgetLineId: new Map(),
    purchasesByBudgetLineId: new Map(),
    roleAllocationsByBudgetLineId: new Map(),
  };
}

describe("Budget Engine - Map Builders", () => {
  test("buildTaxCodeMap creates correct lookup keys", () => {
    const map = buildTaxCodeMap(sampleTaxCodes);
    expect(map.size).toBe(4);
    expect(map.get("Admin:California")?.taxRate).toBe(0.0875);
    expect(map.get("Travel:California")?.defaultMarkup).toBe(1.0);
    expect(map.get("Admin:Texas")?.taxRate).toBe(0.0825);
  });

  test("buildStaffingRateMap creates correct lookup by role", () => {
    const map = buildStaffingRateMap(sampleStaffingRates);
    expect(map.size).toBe(3);
    expect(map.get("Executive Producer")?.internalRate).toBe(250);
    expect(map.get("Producer")?.internalRate).toBe(150);
  });

  test("buildExpenseMap aggregates amounts by description", () => {
    const entries = [
      { description: "Travel", amount: 100 },
      { description: "Travel", amount: 200 },
      { description: "Food", amount: 50 },
    ];
    const map = buildExpenseMap(entries);
    expect(map.get("Travel")).toBe(300);
    expect(map.get("Food")).toBe(50);
  });

  test("buildActualMap aggregates amounts by description", () => {
    const entries = [
      { description: "AV", amount: 1000 },
      { description: "AV", amount: 2000 },
    ];
    const map = buildActualMap(entries);
    expect(map.get("AV")).toBe(3000);
  });
});

describe("Budget Engine - Lookups", () => {
  const context = createTestContext();

  test("lookupTaxRate returns correct rate for existing category", () => {
    expect(lookupTaxRate("Admin", "California", context.taxCodes)).toBe(0.0875);
    expect(lookupTaxRate("Travel", "California", context.taxCodes)).toBe(0.0);
  });

  test("lookupTaxRate returns 0 for missing category", () => {
    expect(lookupTaxRate("Unknown", "California", context.taxCodes)).toBe(0);
    expect(lookupTaxRate(null, "California", context.taxCodes)).toBe(0);
  });

  test("lookupDefaultMarkup returns correct markup for existing category", () => {
    expect(lookupDefaultMarkup("Admin", "California", context.taxCodes)).toBe(1.25);
    expect(lookupDefaultMarkup("AV", "California", context.taxCodes)).toBe(1.15);
  });

  test("lookupDefaultMarkup returns 1.0 for missing category", () => {
    expect(lookupDefaultMarkup("Unknown", "California", context.taxCodes)).toBe(1.0);
    expect(lookupDefaultMarkup(null, "California", context.taxCodes)).toBe(1.0);
  });

  test("lookupStaffingRate returns correct rate for existing role", () => {
    expect(lookupStaffingRate("Executive Producer", context.staffingRates)).toBe(250);
    expect(lookupStaffingRate("Producer", context.staffingRates)).toBe(150);
  });

  test("lookupStaffingRate returns 0 for missing role", () => {
    expect(lookupStaffingRate("Unknown Role", context.staffingRates)).toBe(0);
    expect(lookupStaffingRate(null, context.staffingRates)).toBe(0);
  });
});

describe("Budget Engine - Internal Cost Calculation", () => {
  const context = createTestContext();

  test("NORMAL line uses internalCostInput directly", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Research",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateInternalCost(line, context.staffingRates)).toBe(1000);
  });

  test("NORMAL line with null internalCostInput returns 0", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Research",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: null,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateInternalCost(line, context.staffingRates)).toBe(0);
  });

  test("STAFFING line with ovh=true uses simple rate * units", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "STAFFING",
      lineType: "STAFFING",
      taxCategory: null,
      description: "Producer",
      ovh: true,
      vendor: null,
      units: 10,
      internalCostInput: null,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateInternalCost(line, context.staffingRates)).toBe(150 * 10);
  });

  test("STAFFING line with ovh=false uses adjusted formula", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "STAFFING",
      lineType: "STAFFING",
      taxCategory: null,
      description: "Producer",
      ovh: false,
      vendor: null,
      units: 15,
      internalCostInput: null,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    const expected = 150 * (15 / 1.5) * 1.2285;
    expect(calculateInternalCost(line, context.staffingRates)).toBeCloseTo(expected, 2);
  });

  test("SUBTOTAL line returns 0", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SUMMARY",
      lineType: "SUBTOTAL",
      taxCategory: null,
      description: "Total",
      ovh: false,
      vendor: null,
      units: 0,
      internalCostInput: null,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateInternalCost(line, context.staffingRates)).toBe(0);
  });
});

describe("Budget Engine - Markup Calculation", () => {
  test("uses markupOverride when provided", () => {
    const context = createTestContext("California", 1.0);
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: 1.5,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateMarkup(line, context)).toBe(1.5);
  });

  test("uses defaultMarkup * baseMarkup when no override", () => {
    const context = createTestContext("California", 1.1);
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateMarkup(line, context)).toBeCloseTo(1.25 * 1.1, 4);
  });
});

describe("Budget Engine - Forecast Calculation", () => {
  const context = createTestContext();

  test("returns 0 when ovh is true", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: true,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateForecast(line, 1000, context)).toBe(0);
  });

  test("returns expense sum when vendor is Expense Tracker", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Research and Sourcing",
      ovh: false,
      vendor: "Expense Tracker",
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateForecast(line, 1000, context)).toBe(500);
  });

  test("returns internalCost for normal lines", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateForecast(line, 1000, context)).toBe(1000);
  });

  test("returns linked expense amount when budgetLineId matches", () => {
    const contextWithLinked = {
      ...createTestContext(),
      expensesByBudgetLineId: new Map([["linked-line-1", 750]]),
    };
    const line: BudgetLineInput = {
      id: "linked-line-1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateForecast(line, 1000, contextWithLinked)).toBe(750);
  });

  test("returns zero when linked expense amount is zero", () => {
    const contextWithLinked = {
      ...createTestContext(),
      expensesByBudgetLineId: new Map([["linked-line-zero", 0]]),
    };
    const line: BudgetLineInput = {
      id: "linked-line-zero",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateForecast(line, 1000, contextWithLinked)).toBe(0);
  });

  test("returns negative when linked expense amount is negative (refund)", () => {
    const contextWithLinked = {
      ...createTestContext(),
      expensesByBudgetLineId: new Map([["linked-line-refund", -200]]),
    };
    const line: BudgetLineInput = {
      id: "linked-line-refund",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateForecast(line, 1000, contextWithLinked)).toBe(-200);
  });
});

describe("Budget Engine - Actual Calculation", () => {
  const context = createTestContext();

  test("returns sum from actuals map", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Research and Sourcing",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateActual(line, context)).toBe(450);
  });

  test("returns 0 for missing description", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Unknown",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateActual(line, context)).toBe(0);
  });

  test("returns linked actual amount when budgetLineId matches", () => {
    const contextWithLinked = {
      ...createTestContext(),
      actualsByBudgetLineId: new Map([["linked-line-1", 800]]),
    };
    const line: BudgetLineInput = {
      id: "linked-line-1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateActual(line, contextWithLinked)).toBe(800);
  });

  test("returns zero when linked actual amount is zero", () => {
    const contextWithLinked = {
      ...createTestContext(),
      actualsByBudgetLineId: new Map([["linked-line-zero", 0]]),
    };
    const line: BudgetLineInput = {
      id: "linked-line-zero",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateActual(line, contextWithLinked)).toBe(0);
  });

  test("returns negative when linked actual amount is negative (refund)", () => {
    const contextWithLinked = {
      ...createTestContext(),
      actualsByBudgetLineId: new Map([["linked-line-refund", -150]]),
    };
    const line: BudgetLineInput = {
      id: "linked-line-refund",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Test",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };
    expect(calculateActual(line, contextWithLinked)).toBe(-150);
  });
});

describe("Budget Engine - Full Line Computation", () => {
  const context = createTestContext("California", 1.0);

  test("computes all fields correctly for NORMAL line", () => {
    const line: BudgetLineInput = {
      id: "1",
      rowOrder: 1,
      section: "SANDBOX",
      lineType: "NORMAL",
      taxCategory: "Admin",
      description: "Research and Sourcing",
      ovh: false,
      vendor: null,
      units: 1,
      internalCostInput: 1000,
      markupOverride: null,
      internalNotes: null,
      clientNotes: null,
    };

    const computed = computeBudgetLine(line, context);

    expect(computed.taxRate).toBe(0.0875);
    expect(computed.internalCost).toBe(1000);
    expect(computed.markup).toBe(1.25);
    expect(computed.subtotal).toBe(1250); // billableBase * markup (before tax)
    expect(computed.taxAmount).toBe(109.375); // 1250 * 0.0875
    expect(computed.clientEstimate).toBe(1359.375); // 1250 + 109.375 (subtotal + tax)
    expect(computed.forecast).toBe(1000);
    expect(computed.actual).toBe(450);
    expect(computed.variance).toBe(0);
    expect(computed.remaining).toBe(550);
  });

  test("computes all fields correctly for STAFFING line", () => {
    const line: BudgetLineInput = {
      id: "2",
      rowOrder: 2,
      section: "STAFFING",
      lineType: "STAFFING",
      taxCategory: null,
      description: "Producer",
      ovh: false,
      vendor: null,
      units: 15,
      internalCostInput: null,
      markupOverride: 1.3,
      internalNotes: null,
      clientNotes: null,
    };

    const computed = computeBudgetLine(line, context);

    const expectedCost = 150 * (15 / 1.5) * 1.2285;
    expect(computed.internalCost).toBeCloseTo(expectedCost, 2);
    expect(computed.markup).toBe(1.3);
    expect(computed.clientEstimate).toBeCloseTo(expectedCost * 1.3, 2);
  });

  test("OVH only affects margin, not revenue (clientEstimate)", () => {
    // Create two identical staffing lines, one with OVH and one without
    const lineWithoutOVH: BudgetLineInput = {
      id: "no-ovh",
      rowOrder: 1,
      section: "STAFFING",
      lineType: "STAFFING",
      taxCategory: null,
      description: "Producer",
      ovh: false,
      vendor: null,
      units: 10,
      internalCostInput: null,
      markupOverride: 1.5,
      internalNotes: null,
      clientNotes: null,
    };

    const lineWithOVH: BudgetLineInput = {
      ...lineWithoutOVH,
      id: "with-ovh",
      ovh: true,
    };

    const computedWithoutOVH = computeBudgetLine(lineWithoutOVH, context);
    const computedWithOVH = computeBudgetLine(lineWithOVH, context);

    // Internal cost should be higher with OVH (rate × units vs adjusted formula)
    expect(computedWithOVH.internalCost).toBeGreaterThan(computedWithoutOVH.internalCost);
    
    // But clientEstimate (revenue) should be IDENTICAL regardless of OVH
    expect(computedWithOVH.clientEstimate).toBeCloseTo(computedWithoutOVH.clientEstimate, 2);
    
    // Verify the exact values
    const expectedBillableBase = 150 * (10 / 1.5) * 1.2285;
    expect(computedWithoutOVH.internalCost).toBeCloseTo(expectedBillableBase, 2);
    expect(computedWithOVH.internalCost).toBeCloseTo(150 * 10, 2); // Simple rate × units
    expect(computedWithOVH.clientEstimate).toBeCloseTo(expectedBillableBase * 1.5, 2);
    expect(computedWithoutOVH.clientEstimate).toBeCloseTo(expectedBillableBase * 1.5, 2);
  });
});

describe("Budget Engine - Summary Calculation", () => {
  const context = createTestContext("California", 1.0);

  test("calculates summary correctly", () => {
    const lines: BudgetLineInput[] = [
      {
        id: "1",
        rowOrder: 1,
        section: "PASSTHROUGH",
        lineType: "NORMAL",
        taxCategory: "Travel",
        description: "Flights",
        ovh: false,
          vendor: null,
        units: 1,
        internalCostInput: 5000,
        markupOverride: 1.0,
        internalNotes: null,
        clientNotes: null,
      },
      {
        id: "2",
        rowOrder: 2,
        section: "SANDBOX",
        lineType: "NORMAL",
        taxCategory: "Admin",
        description: "Research",
        ovh: false,
          vendor: null,
        units: 1,
        internalCostInput: 2000,
        markupOverride: null,
      internalNotes: null,
      clientNotes: null,
      },
      {
        id: "3",
        rowOrder: 3,
        section: "STAFFING",
        lineType: "STAFFING",
        taxCategory: null,
        description: "Producer",
        ovh: true,
          vendor: null,
        units: 10,
        internalCostInput: null,
        markupOverride: 1.5,
        internalNotes: null,
        clientNotes: null,
      },
    ];

    const computed = computeAllBudgetLines(lines, context);
    const summary = calculateBudgetSummary(computed);

    // PASSTHROUGH: Travel (isTaxable=false) → subtotal=5000, taxAmount=0, clientEstimate=5000
    expect(summary.passthroughTotal).toBe(5000);
    // SANDBOX: Admin (isTaxable=true, taxRate=8.75%) → subtotal=2500, taxAmount=218.75, clientEstimate=2718.75
    expect(summary.sandboxTotal).toBeCloseTo(2718.75, 2);
    // STAFFING: no taxCategory → no tax applied
    // billableBase = 150 * (10 / 1.5) * 1.2285 = 1228.5
    // staffingTotal = 1228.5 * 1.5 = 1842.75
    const expectedBillableBase = 150 * (10 / 1.5) * 1.2285;
    expect(summary.staffingTotal).toBeCloseTo(expectedBillableBase * 1.5, 2);
    // PASSTHROUGH items don't count towards revenue or COGS
    // Revenue includes tax: Sandbox (2718.75) + Staffing (1842.75)
    expect(summary.revenue).toBeCloseTo(2718.75 + expectedBillableBase * 1.5, 2);
    expect(summary.cogsForecast).toBe(2000 + 0); // Sandbox + Staffing costs only (OVH has forecast=0)
    expect(summary.forecastMarginPercent).toBeGreaterThan(0);
  });

  test("skips SUBTOTAL lines in summary", () => {
    const lines: BudgetLineInput[] = [
      {
        id: "1",
        rowOrder: 1,
        section: "SANDBOX",
        lineType: "NORMAL",
        taxCategory: "Admin",
        description: "Test",
        ovh: false,
          vendor: null,
        units: 1,
        internalCostInput: 1000,
        markupOverride: 1.0,
        internalNotes: null,
        clientNotes: null,
      },
      {
        id: "2",
        rowOrder: 2,
        section: "SUMMARY",
        lineType: "SUBTOTAL",
        taxCategory: null,
        description: "Total",
        ovh: false,
          vendor: null,
        units: 0,
        internalCostInput: null,
        markupOverride: null,
      internalNotes: null,
      clientNotes: null,
      },
    ];

    const computed = computeAllBudgetLines(lines, context);
    const summary = calculateBudgetSummary(computed);

    // SANDBOX line with Admin (isTaxable=true): subtotal=1000, taxAmount=87.5, clientEstimate=1087.5
    expect(summary.revenue).toBeCloseTo(1087.5, 2);
  });
});

describe("Budget Engine - Formatting", () => {
  test("formatCurrency formats USD correctly", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(-500)).toBe("-$500.00");
  });

  test("formatPercent formats percentage correctly", () => {
    expect(formatPercent(25.5)).toBe("25.5%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(100)).toBe("100.0%");
  });
});
