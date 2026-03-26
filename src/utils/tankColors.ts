/**
 * Consistent color palette for dynamically discovered tanks.
 * Colors cycle if there are more tanks than entries.
 */
export const TANK_COLOR_PALETTE = [
  '#3b82f6', // blue-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
];

export function getTankColor(index: number): string {
  return TANK_COLOR_PALETTE[index % TANK_COLOR_PALETTE.length];
}
