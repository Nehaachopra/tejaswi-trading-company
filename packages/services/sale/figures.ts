import { TRPCError } from "@trpc/server";

import { toPaise } from "../accounts/money";
import { priceLines } from "../purchase-order";
import type { SaleLineInputModel } from "./model";

// what a bill's figures need of each item's product
type Priced = { gstRate: number };

// a sale's bill, worked out the same way for a new sale and an edit, in paise: each godown's part of each item as a
// line of its own (so GST falls on each part), the items' value and GST, the charges (typed with GST in them, their
// GST taken out at the highest rate among the items), the cash discount (never more than the bill, not lowering GST),
// and the total rounded to the rupee with its round off
export function figureSale<P extends Priced>(
  input: { lines: SaleLineInputModel[]; discount: number; transportCharges: number; packingCharges: number; loadingCharges: number },
  products: P[],
) {
  const parts = input.lines.flatMap((l, i) => l.godowns.map((g) => ({ line: l, product: products[i]!, godownId: g.godownId, quantity: g.quantity })));
  const priced = priceLines(
    parts.map((p) => ({ quantity: p.quantity, rate: p.line.rateBeforeGst, discount: 0, gstRate: p.product.gstRate })),
    0,
  );
  const charges = toPaise(input.transportCharges) + toPaise(input.packingCharges) + toPaise(input.loadingCharges);
  const chargeRate = Math.max(...parts.map((p) => p.product.gstRate));
  const chargeTaxable = Math.round((charges * 100) / (100 + chargeRate));
  const chargeGst = charges - chargeTaxable;
  const gstAll = priced.gst + chargeGst;
  const gross = priced.subtotal + priced.gst + charges;
  const off = toPaise(input.discount);
  if (off > gross) throw new TRPCError({ code: "BAD_REQUEST", message: "The discount can't be more than the bill." });
  const figured = gross - off;
  const total = Math.round(figured / 100) * 100;
  const roundOff = total - figured;
  return { parts, priced, chargeTaxable, gstAll, off, total, roundOff };
}
