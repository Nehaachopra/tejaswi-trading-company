"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/icons/spinner";
import { RequiredMark } from "~/components/ui/required-mark";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { usePendingReplacement, useReceiveReplacement } from "~/providers/purchase-return";
import { useReturnSources } from "~/providers/sale-return";

import { indiaDay } from "../../account/balance";
import { fieldRow, input, momentOf } from "../shared/form-basics";
import { QuantityBox } from "../shared/pack-parts";
import { GodownRows } from "../shared/product-details-card";
import { NOTE_NUMBER_MAX } from "./state";

// a bill number as GST allows: capitals, digits, / and -
const billNumberOnly = (v: string) => v.toUpperCase().replace(/[^A-Z0-9/-]/g, "").slice(0, NOTE_NUMBER_MAX);

// a return's Receive replacement, over the dimmed page as the product details card: the supplier's invoice the packs
// came on (its bill number and day), then each item still to come: how many came on it (all that's owed to start;
// fewer for a part, 0 when it didn't come) and the godowns they go into (the main godown filled in). Save saves the
// purchase. Tapped with something missing: said under the button. ✕, a tap on the dim area or Escape closes it
export function ReceiveCard({ returnId, onClose }: { returnId: string; onClose: () => void }) {
  const t = useTranslations("transactions.purchaseReturn.receive");
  const tc = useTranslations("transactions.chat");
  const ts = useTranslations("transactions.sale");
  const { pending, loading } = usePendingReplacement(returnId, true);
  const { stock } = useReturnSources();
  const { receive, saving } = useReceiveReplacement();
  const mainId = stock.find((g) => g.isMain && !g.beingCounted)?.godownId ?? null;
  // each item: how many came, and their godowns (all of it into the main godown to start)
  const [came, setCame] = useState<Record<string, { quantity: string; parts: Record<string, string> }> | null>(null);
  if (pending && came === null && stock.length > 0)
    setCame(Object.fromEntries(pending.lines.map((l) => [l.productId, { quantity: String(l.quantity), parts: mainId ? { [mainId]: String(l.quantity) } : {} }])));
  const [bill, setBill] = useState("");
  const [day, setDay] = useState(() => indiaDay(new Date()));
  const [error, setError] = useState<string | null>(null);

  // the page behind doesn't scroll, and Escape closes
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // what each godown holds of a pack now
  const spotsOf = (productId: string) =>
    stock.map((g) => ({
      godownId: g.godownId,
      name: g.godownName,
      held: g.products.flatMap((p) => p.packs).find((p) => p.productId === productId)?.quantity ?? 0,
      counting: g.beingCounted,
    }));
  const qty = (productId: string) => Number(came?.[productId]?.quantity) || 0;
  const placed = (productId: string) => Object.values(came?.[productId]?.parts ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const today = indiaDay(new Date());

  // Save: the bill number, something come, every pack placed; then the purchase is saved
  async function save() {
    if (!pending || !came) return;
    const lines = pending.lines.filter((l) => qty(l.productId) > 0);
    if (bill.trim() === "") return setError(t("missingBill"));
    if (lines.length === 0) return setError(t("missingQuantity"));
    if (lines.some((l) => placed(l.productId) !== qty(l.productId)) || day === "") return setError(t("missing"));
    setError(null);
    try {
      await receive({
        returnTransactionId: returnId,
        supplierInvoiceNumber: bill.trim(),
        dateTime: momentOf(day),
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: qty(l.productId),
          into: Object.entries(came[l.productId]!.parts)
            .filter(([, v]) => (Number(v) || 0) > 0)
            .map(([godownId, v]) => ({ godownId, quantity: Number(v) })),
        })),
      });
      onClose();
    } catch (err) {
      setError((err as { message?: string })?.message || t("failed"));
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-[rgba(30,12,6,0.62)] backdrop-blur-[3px]">
      <div onClick={(e) => e.target === e.currentTarget && onClose()} className="flex min-h-full items-center justify-center p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
          className="on-ivory flex w-[min(380px,100%)] min-w-0 animate-zoom-in flex-col gap-3 rounded-control bg-ivory p-4 text-chestnut shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        >
          {/* the heading (the return it's on), and ✕ */}
          <div className="flex items-start justify-between gap-2">
            <p className="font-heading text-lg font-bold leading-6">
              {t("title")}
              {pending && <span className="block text-xs font-semibold opacity-60">{pending.assignedId}</span>}
            </p>
            <button type="button" onClick={onClose} aria-label={ts("close")} className="grid place-items-center rounded-control p-2 hover:bg-chestnut/8">
              <X className="size-5" aria-hidden />
            </button>
          </div>

          {loading || !pending || !came ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm opacity-70">
              <Spinner /> {t("loading")}
            </p>
          ) : (
            <>
              {/* the supplier's invoice: its bill number and day */}
              <label className={fieldRow}>
                <span>
                  {t("billNumber")}
                  <RequiredMark />
                </span>
                <input
                  autoFocus
                  value={bill}
                  maxLength={NOTE_NUMBER_MAX}
                  onChange={(e) => setBill(billNumberOnly(e.target.value))}
                  className={cn(input(!!error && bill.trim() === ""), "max-w-48")}
                />
              </label>
              <label className={fieldRow}>
                <span>
                  {t("billDate")}
                  <RequiredMark />
                </span>
                <DateInput
                  value={day}
                  min={pending.returnDate}
                  max={today}
                  onChange={(d) => setDay(d !== "" && (d > today || d < pending.returnDate) ? day : d)}
                  calendarLabel={t("billDate")}
                  className={input(day === "")}
                />
              </label>
              {/* each item still to come: how many came on this bill, then their godowns */}
              {pending.lines.map((l) => (
                <div key={l.productId} className="flex flex-col gap-1.5 border-t border-chestnut/15 pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-words text-sm font-semibold">
                      {titleCase(l.name)} <span className="tabular font-medium opacity-65">{t("owed", { count: l.quantity })}</span>
                    </span>
                    <span className="w-28 shrink-0">
                      <QuantityBox
                        value={came[l.productId]!.quantity}
                        max={l.quantity}
                        min={0}
                        label={`${tc("q.amount")}: ${l.name}`}
                        // a new quantity: all of it into the main godown again
                        onChange={(v) => setCame((all) => ({ ...all, [l.productId]: { quantity: v, parts: mainId && (Number(v) || 0) > 0 ? { [mainId]: v } : {} } }))}
                      />
                    </span>
                  </div>
                  {qty(l.productId) > 0 && (
                    <GodownRows
                      spots={spotsOf(l.productId)}
                      quantity={qty(l.productId)}
                      parts={came[l.productId]!.parts}
                      onPart={(godownId, v) => setCame((all) => ({ ...all, [l.productId]: { ...all![l.productId]!, parts: { ...all![l.productId]!.parts, [godownId]: v } } }))}
                      leftLabel={ts("leftToPlace")}
                      name={l.name}
                    />
                  )}
                </div>
              ))}
              <div className="mt-1 flex flex-col gap-2">
                <button
                  type="button"
                  data-recheck
                  onClick={() => void save()}
                  disabled={saving}
                  aria-busy={saving}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory aria-busy:opacity-80"
                >
                  {saving ? (
                    <>
                      <Spinner className="size-5" /> {t("saving")}
                    </>
                  ) : (
                    t("save")
                  )}
                </button>
                {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}
