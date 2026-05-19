export type BudgetSection = "PASSTHROUGH" | "SANDBOX" | "STAFFING" | "SUMMARY";
export type BudgetLineType = "NORMAL" | "STAFFING" | "SUBTOTAL";

export interface TaxCodeLookup {
  categoryCode: string;
  jurisdiction: string;
  taxRate: number;
  defaultMarkup: number;
  isTaxable: boolean;
}

export interface StaffingRateLookup {
  roleName: string;
  internalRate: number;
}

export interface RoleAllocationLookup {
  roleId: string;
  roleName: string;
  internalRate: number;
  totalHours: number;
}

export interface BudgetLineInput {
  id: string;
  rowOrder: number;
  section: BudgetSection;
  lineType: BudgetLineType;
  taxCategory: string | null;
  description: string | null;
  ovh: boolean;
  vendor: string | null;
  units: number;
  internalCostInput: number | null;
  markupOverride: number | null;
  internalNotes: string | null;
  clientNotes: string | null;
  processingFeeEnabled?: boolean;
  processingFeePercent?: number;
}

export interface BudgetContext {
  jurisdiction: string;
  baseMarkup: number;
  taxCodes: Map<string, TaxCodeLookup>;
  staffingRates: Map<string, StaffingRateLookup>;
  expensesByDescription: Map<string, number>;
  actualsByDescription: Map<string, number>;
  expensesByBudgetLineId: Map<string, number>;
  actualsByBudgetLineId: Map<string, number>;
  purchasesByBudgetLineId: Map<string, number>;
  roleAllocationsByBudgetLineId: Map<string, RoleAllocationLookup[]>;
}

export interface ComputedBudgetLine extends BudgetLineInput {
  taxRate: number;
  internalCost: number;
  markup: number;
  subtotal: number;     // billableBase * markup (before tax)
  taxAmount: number;    // tax applied to subtotal
  clientEstimate: number; // subtotal + taxAmount
  forecast: number;
  variance: number;
  actual: number;
  remaining: number;
}

export interface BudgetSummary {
  revenue: number;
  cogsForecast: number;
  cogsActual: number;
  forecastMarginPercent: number;
  actualMarginPercent: number;
  passthroughTotal: number;
  sandboxTotal: number;
  staffingTotal: number;
  subtotalSum: number;
  taxAmountSum: number;
}

export function lookupTaxRate(
  taxCategory: string | null,
  jurisdiction: string,
  taxCodes: Map<string, TaxCodeLookup>
): number {
  if (!taxCategory) return 0;
  const key = `${taxCategory}:${jurisdiction}`;
  const code = taxCodes.get(key);
  if (!code) return 0;
  // Only return tax rate if the category is taxable
  return code.isTaxable ? code.taxRate : 0;
}

export function lookupDefaultMarkup(
  taxCategory: string | null,
  jurisdiction: string,
  taxCodes: Map<string, TaxCodeLookup>
): number {
  if (!taxCategory) return 1.0;
  const key = `${taxCategory}:${jurisdiction}`;
  const code = taxCodes.get(key);
  return code?.defaultMarkup ?? 1.0;
}

export function lookupStaffingRate(
  description: string | null,
  staffingRates: Map<string, StaffingRateLookup>
): number {
  if (!description) return 0;
  const rate = staffingRates.get(description);
  return rate?.internalRate ?? 0;
}

export function calculateRoleAllocationsCost(
  roleAllocations: RoleAllocationLookup[],
  ovh: boolean
): number {
  let total = 0;
  for (const alloc of roleAllocations) {
    if (ovh) {
      total += alloc.internalRate * alloc.totalHours;
    } else {
      total += alloc.internalRate * (alloc.totalHours / 1.5) * 1.2285;
    }
  }
  return total;
}

export function calculateRoleAllocationsBillableBase(
  roleAllocations: RoleAllocationLookup[]
): number {
  let total = 0;
  for (const alloc of roleAllocations) {
    total += alloc.internalRate * (alloc.totalHours / 1.5) * 1.2285;
  }
  return total;
}

export function calculateInternalCost(
  line: BudgetLineInput,
  staffingRates: Map<string, StaffingRateLookup>,
  roleAllocations?: RoleAllocationLookup[]
): number {
  if (line.lineType === "STAFFING") {
    if (roleAllocations && roleAllocations.length > 0) {
      return calculateRoleAllocationsCost(roleAllocations, line.ovh);
    }
    const baseRate = lookupStaffingRate(line.description, staffingRates);
    if (line.ovh) {
      return baseRate * line.units;
    } else {
      return baseRate * (line.units / 1.5) * 1.2285;
    }
  }
  
  if (line.lineType === "SUBTOTAL") {
    return 0;
  }
  
  return line.internalCostInput ?? 0;
}

// Billable base is used for revenue calculation - ignores OVH adjustment
// This ensures OVH only affects margin, not revenue
export function calculateBillableBase(
  line: BudgetLineInput,
  staffingRates: Map<string, StaffingRateLookup>,
  roleAllocations?: RoleAllocationLookup[]
): number {
  if (line.lineType === "STAFFING") {
    if (roleAllocations && roleAllocations.length > 0) {
      return calculateRoleAllocationsBillableBase(roleAllocations);
    }
    const baseRate = lookupStaffingRate(line.description, staffingRates);
    return baseRate * (line.units / 1.5) * 1.2285;
  }
  
  if (line.lineType === "SUBTOTAL") {
    return 0;
  }
  
  return line.internalCostInput ?? 0;
}

export function calculateMarkup(
  line: BudgetLineInput,
  context: BudgetContext
): number {
  if (line.markupOverride !== null && line.markupOverride !== undefined) {
    return line.markupOverride;
  }
  
  // PASSTHROUGH items always have markup of 1.0 unless overridden
  if (line.section === "PASSTHROUGH") {
    return 1.0;
  }
  
  const defaultMarkup = lookupDefaultMarkup(
    line.taxCategory,
    context.jurisdiction,
    context.taxCodes
  );
  
  return defaultMarkup * context.baseMarkup;
}

export function calculateForecast(
  line: BudgetLineInput,
  internalCost: number,
  context: BudgetContext
): number {
  if (line.ovh) {
    return 0;
  }
  
  const linkedExpense = context.expensesByBudgetLineId.get(line.id);
  if (linkedExpense !== undefined) {
    return linkedExpense;
  }
  
  if (line.vendor === "Expense Tracker" && line.description) {
    return context.expensesByDescription.get(line.description) ?? 0;
  }
  
  return internalCost;
}

export function calculateActual(
  line: BudgetLineInput,
  context: BudgetContext
): number {
  const linkedActual = context.actualsByBudgetLineId.get(line.id);
  if (linkedActual !== undefined) {
    return linkedActual;
  }
  
  if (!line.description) return 0;
  return context.actualsByDescription.get(line.description) ?? 0;
}

export function computeBudgetLine(
  line: BudgetLineInput,
  context: BudgetContext
): ComputedBudgetLine {
  const taxRate = lookupTaxRate(
    line.taxCategory,
    context.jurisdiction,
    context.taxCodes
  );
  
  const roleAllocations = context.roleAllocationsByBudgetLineId.get(line.id);
  const internalCost = calculateInternalCost(line, context.staffingRates, roleAllocations);
  const billableBase = calculateBillableBase(line, context.staffingRates, roleAllocations);
  const markup = calculateMarkup(line, context);
  const subtotal = billableBase * markup;
  const taxAmount = subtotal * taxRate;
  const clientEstimate = subtotal + taxAmount;
  const forecast = calculateForecast(line, internalCost, context);
  const actual = calculateActual(line, context);
  const variance = internalCost - forecast;
  const remaining = forecast - actual;
  
  return {
    ...line,
    taxRate,
    internalCost,
    markup,
    subtotal,
    taxAmount,
    clientEstimate,
    forecast,
    variance,
    actual,
    remaining,
  };
}

export function computeAllBudgetLines(
  lines: BudgetLineInput[],
  context: BudgetContext
): ComputedBudgetLine[] {
  return lines
    .sort((a, b) => a.rowOrder - b.rowOrder)
    .map(line => computeBudgetLine(line, context));
}

export function calculateBudgetSummary(
  computedLines: ComputedBudgetLine[]
): BudgetSummary {
  let passthroughTotal = 0;
  let sandboxTotal = 0;
  let staffingTotal = 0;
  let cogsForecast = 0;
  let cogsActual = 0;
  let revenue = 0;
  let subtotalSum = 0;
  let taxAmountSum = 0;
  
  for (const line of computedLines) {
    if (line.lineType === "SUBTOTAL") continue;
    
    // Track pre-tax subtotals and tax amounts for all lines (including PASSTHROUGH for client-facing totals)
    subtotalSum += line.subtotal;
    taxAmountSum += line.taxAmount;
    
    // PASSTHROUGH items don't count towards revenue or COGS (pass-through at cost)
    if (line.section !== "PASSTHROUGH") {
      revenue += line.clientEstimate;
      cogsForecast += line.forecast;
      cogsActual += line.actual;
    }
    
    switch (line.section) {
      case "PASSTHROUGH":
        passthroughTotal += line.clientEstimate;
        break;
      case "SANDBOX":
        sandboxTotal += line.clientEstimate;
        break;
      case "STAFFING":
        staffingTotal += line.clientEstimate;
        break;
    }
  }
  
  const forecastMarginPercent = revenue > 0 
    ? ((revenue - cogsForecast) / revenue) * 100 
    : 0;
  
  const actualMarginPercent = revenue > 0 
    ? ((revenue - cogsActual) / revenue) * 100 
    : 0;
  
  return {
    revenue,
    cogsForecast,
    cogsActual,
    forecastMarginPercent,
    actualMarginPercent,
    passthroughTotal,
    sandboxTotal,
    staffingTotal,
    subtotalSum,
    taxAmountSum,
  };
}

export function buildTaxCodeMap(taxCodes: TaxCodeLookup[]): Map<string, TaxCodeLookup> {
  const map = new Map<string, TaxCodeLookup>();
  for (const tc of taxCodes) {
    const key = `${tc.categoryCode}:${tc.jurisdiction}`;
    map.set(key, tc);
  }
  return map;
}

export function buildStaffingRateMap(rates: StaffingRateLookup[]): Map<string, StaffingRateLookup> {
  const map = new Map<string, StaffingRateLookup>();
  for (const rate of rates) {
    map.set(rate.roleName, rate);
  }
  return map;
}

export function buildExpenseMap(entries: { description: string; amount: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const current = map.get(entry.description) ?? 0;
    map.set(entry.description, current + entry.amount);
  }
  return map;
}

export function buildActualMap(entries: { description: string; amount: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const current = map.get(entry.description) ?? 0;
    map.set(entry.description, current + entry.amount);
  }
  return map;
}

export function buildExpenseByBudgetLineIdMap(
  entries: { budgetLineId: string | null; amount: number }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    if (entry.budgetLineId) {
      const current = map.get(entry.budgetLineId) ?? 0;
      map.set(entry.budgetLineId, current + entry.amount);
    }
  }
  return map;
}

export function buildActualByBudgetLineIdMap(
  entries: { budgetLineId: string | null; amount: number }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    if (entry.budgetLineId) {
      const current = map.get(entry.budgetLineId) ?? 0;
      map.set(entry.budgetLineId, current + entry.amount);
    }
  }
  return map;
}

export interface RoleAllocationEntry {
  budgetLineId: string;
  roleId: string;
  roleName: string;
  internalRate: number;
  totalHours: number;
}

export function buildRoleAllocationsByBudgetLineIdMap(
  entries: RoleAllocationEntry[]
): Map<string, RoleAllocationLookup[]> {
  const map = new Map<string, RoleAllocationLookup[]>();
  for (const entry of entries) {
    const existing = map.get(entry.budgetLineId) ?? [];
    const existingRole = existing.find(r => r.roleId === entry.roleId);
    if (existingRole) {
      existingRole.totalHours += entry.totalHours;
    } else {
      existing.push({
        roleId: entry.roleId,
        roleName: entry.roleName,
        internalRate: entry.internalRate,
        totalHours: entry.totalHours,
      });
    }
    map.set(entry.budgetLineId, existing);
  }
  return map;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
