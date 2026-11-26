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
import { GodownRows } from "../shared/product-details-card";

// a return's Receive replacement, over the dimmed page as the product details card: each item still to come with the
// godowns its new packs go into (the main godown filled in), then the day they came (today until changed; never before
// the return) and Save. Tapped with packs still to place: said under the button. ✕, a tap on the dim area or Escape
// closes it
export function ReceiveCard({ returnId, onClose }: { returnId: string; onClose: () => void }) {
  const t = useTranslations("transactions.purchaseReturn.receive");
  const tc = useTranslations("transactions.chat");
  const ts = useTranslations("transactions.sale");
  const { pending, loading } = usePendingReplacement(returnId, true);
  const { stock } = useReturnSources();
  const { receive, saving } = useReceiveReplacement();
  const mainId = stock.find((g) => g.isMain && !g.beingCounted)?.godownId ?? null;
  // each item's godowns, the main godown filled in with all of it once the items are in
  const [parts, setParts] = useState<Record<string, Record<string, string>> | null>(null);
  if (pending && parts === null && stock.length > 0)
    setParts(Object.fromEntries(pending.lines.map((l) => [l.productId, mainId ? { [mainId]: String(l.quantity) } : {}])));
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
  const placed = (productId: string) => Object.values(parts?.[productId] ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const today = indiaDay(new Date());

  // Save: every pack placed, then the new packs come in
  async function save() {
    if (!pending || !parts) return;
    if (pending.lines.some((l) => placed(l.productId) !== l.quantity) || day === "") return setError(t("missing"));
    setError(null);
    try {
      await receive({
        transactionId: returnId,
        dateTime: momentOf(day),
        lines: pending.lines.map((l) => ({
          productId: l.productId,
          into: Object.entries(parts[l.productId] ?? {})
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

          {loading || !pending || !parts ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm opacity-70">
              <Spinner /> {t("loading")}
            </p>
          ) : (
            <>
              {/* each item still to come: its name and how many, then the godowns its new packs go into */}
              {pending.lines.map((l) => (
                <div key={l.productId} className="flex flex-col gap-1 border-t border-chestnut/15 pt-2">
                  <p className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                    <span className="min-w-0 break-words">{titleCase(l.name)}</span>
                    <span className="tabular shrink-0">×{l.quantity.toLocaleString("en-IN")}</span>
                  </p>
                  <GodownRows
                    spots={spotsOf(l.productId)}
                    quantity={l.quantity}
                    parts={parts[l.productId] ?? {}}
                    onPart={(godownId, v) => setParts((all) => ({ ...all, [l.productId]: { ...(all?.[l.productId] ?? {}), [godownId]: v } }))}
                    leftLabel={ts("leftToPlace")}
                    name={l.name}
                  />
                </div>
              ))}
              {/* the day they came */}
              <label className={cn(fieldRow, "border-t border-chestnut/15 pt-3")}>
                <span>
                  {tc("q.date")}
                  <RequiredMark />
                </span>
                <DateInput
                  value={day}
                  min={pending.returnDate}
                  max={today}
                  onChange={(d) => setDay(d !== "" && (d > today || d < pending.returnDate) ? day : d)}
                  calendarLabel={tc("q.date")}
                  className={input(day === "")}
                />
              </label>
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
