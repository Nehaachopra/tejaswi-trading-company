// a pack's weighted average cost after packs come in (or, negative, go back): what was held at the old cost plus what
// moved at its own cost, over the quantity after; nothing held before takes the new cost as it is. Paise a pack
export function weightedCost(before: { quantity: number; cost: number | null }, moved: { quantity: number; value: number }) {
  const after = before.quantity + moved.quantity;
  if (after <= 0) return before.cost ?? 0;
  if (before.cost === null || before.quantity <= 0) return moved.quantity > 0 ? Math.round(moved.value / moved.quantity) : (before.cost ?? 0);
  return Math.max(0, Math.round((before.quantity * before.cost + moved.value) / after));
}
