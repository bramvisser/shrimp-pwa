// Production economics assumptions and formatters, shared between the
// production KPI strip and the production screen.

// Target harvest weight for white-leg shrimp (grams).
export const HARVEST_WEIGHT_G = 25;
// Farm-gate price per kg (USD).
export const PRICE_PER_KG = 8;
// Operating cost per kg of current biomass to date (USD).
export const COST_PER_KG = 4.5;

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export function formatKg(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}t`;
  return `${Math.round(value)}kg`;
}
