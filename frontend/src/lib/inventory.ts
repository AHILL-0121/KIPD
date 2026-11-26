/** Pure inventory & recipe costing helpers. */

export function isLowStock(stockQty: number | string, lowStockThreshold: number | string): boolean {
  return Number(stockQty) <= Number(lowStockThreshold);
}

export function stockValue(stockQty: number | string, costPerUnit: number | string | null | undefined): number {
  const cost = Number(costPerUnit ?? 0);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return Math.round(Number(stockQty) * cost * 100) / 100;
}

export interface RecipeLineInput {
  quantityPerUnit: number | string;
  costPerUnit: number | string | null | undefined;
}

/** Sums unit ingredient cost for a dish from its recipe lines. */
export function computeRecipeCost(lines: RecipeLineInput[]): number {
  const total = lines.reduce((sum, l) => {
    const qty = Number(l.quantityPerUnit);
    const cost = Number(l.costPerUnit ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(cost)) return sum;
    return sum + qty * cost;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** Percentage of selling price consumed by ingredient cost, or null if price <= 0. */
export function foodCostPercentage(recipeCost: number, sellingPrice: number | string): number | null {
  const price = Number(sellingPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  return Math.round((recipeCost / price) * 1000) / 10;
}
