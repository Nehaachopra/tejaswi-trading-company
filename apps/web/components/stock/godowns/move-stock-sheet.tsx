"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { Sheet } from "~/components/ui/sheet";
import { toast } from "~/components/ui/toast";
import { packLabel, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { ProductImage, productTitle } from "../../product/products/product-tile";
import { PickMenu } from "../pick-menu";

type GodownCard = RouterOutputs["inventory"]["stock"]["byGodown"][number];

// what the sheet opens on: a pack size in a godown (its card's Move button)
export type MoveStart = { fromGodownId: string; productId: string };

// lengths follow stock_moves: vehicle number 15, remarks 100
const VEHICLE_MAX = 15;
const REMARKS_MAX = 100;

// move one pack size out of a godown: the pack size on top (image beside its details), then From (the godown it
// was opened on), To, the quantity (up to what From holds), and an optional vehicle number and remarks
export function MoveStockSheet({ start, cards, onClose }: { start: MoveStart | null; cards: GodownCard[]; onClose: () => void }) {
  const t = useTranslations("stock.move");
  const tg = useTranslations("stock.godowns");
  const utils = trpc.useUtils();
  const move = trpc.inventory.stock.move.useMutation();

  const [toId, setToId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [remarks, setRemarks] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // each time it opens, start empty
  useEffect(() => {
    if (!start) return;
    setToId(null);
    setQuantity("");
    setVehicle("");
    setRemarks("");
    setTried(false);
    setError(null);
  }, [start]);

  // the pack size and where it's moving from, found in the latest stock
  const from = cards.find((c) => c.godownId === start?.fromGodownId);
  const group = from?.products.find((g) => g.packs.some((p) => p.productId === start?.productId));
  const pack = group?.packs.find((p) => p.productId === start?.productId);
  // where it can go: any other godown not being counted
  const receivers = cards.filter((c) => c.godownId !== from?.godownId && !c.beingCounted);
  const to = receivers.find((c) => c.godownId === toId);

  // what's missing or wrong
  const qty = /^\d+$/.test(quantity) ? Number(quantity) : 0;
  const bad = { to: !to, quantity: qty < 1 || (pack ? qty > pack.quantity : false) };
  const show = (field: keyof typeof bad) => tried && bad[field];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (!from || !group || !pack) return;
    if (bad.to || bad.quantity) return setError(qty > pack.quantity ? t("errors.tooMany", { from: from.godownName }) : t("errors.fill"));
    try {
      await move.mutateAsync({
        productId: pack.productId,
        fromGodownId: from.godownId,
        toGodownId: to!.godownId,
        quantity: qty,
        vehicleNumber: vehicle,
        remarks,
      });
      toast.success(
        tg("toast.moved", { quantity: qty.toLocaleString("en-IN"), pack: `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`, to: to!.godownName }),
      );
      void utils.inventory.stock.invalidate();
      void utils.inventory.godown.list.invalidate();
      onClose();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      setError(
        t(`errors.${code === undefined ? "network" : code === "PRECONDITION_FAILED" ? "stock" : code === "CONFLICT" ? "counting" : "failed"}`),
      );
      void utils.inventory.stock.byGodown.invalidate();
    }
  }

  // the pack size's details, shown beside its image
  const rows =
    group && pack
      ? [
          { label: t("pack"), value: packLabel(pack.packSize, pack.packSizeCode) },
          { label: t("brand"), value: productTitle(group) },
          { label: t("category"), value: titleCase(group.categoryName) },
          { label: t("subCategory"), value: titleCase(group.subCategoryName) },
          { label: t("inGodown"), value: pack.quantity.toLocaleString("en-IN"), number: true },
        ]
      : [];

  return (
    <Sheet open={!!start} title={t("title")} closeLabel={t("close")} onClose={onClose}>
      {from && group && pack && (
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            {/* the pack size: image on the left, its details on the right */}
            <div className="flex gap-4">
              <ProductImage group={group} imageUrl={pack.imageUrl ?? group.imageUrl} className="w-2/5 max-w-36 shrink-0 self-start [&_span]:text-3xl" />
              <dl className="flex min-w-0 flex-1 flex-col justify-center divide-y divide-chestnut/10 text-sm">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2 py-1.5">
                    <dt className="shrink-0 text-chestnut/70">{row.label}</dt>
                    <dd className={cn("min-w-0 truncate text-right font-medium", row.number && "tabular font-heading text-base font-bold")} title={row.value}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* from: the godown it was opened on, filled in */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm">{t("from")}</span>
              <p className="flex min-h-11 items-center truncate rounded-control border border-chestnut/25 px-3 text-base">{from.godownName}</p>
            </div>

            {/* to: each with how much of this pack size it holds */}
            {receivers.length === 0 ? (
              <FieldMessage>{t("noOther")}</FieldMessage>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm">{t("to")}</span>
                <PickMenu
                  label={t("to")}
                  current={to?.godownName ?? t("pick")}
                  options={receivers.map((c) => {
                    const there = c.products.flatMap((g) => g.packs).find((p) => p.productId === pack.productId)?.quantity ?? 0;
                    return { id: c.godownId, name: c.godownName, hint: t("holds", { count: there.toLocaleString("en-IN") }) };
                  })}
                  picked={toId}
                  onPick={setToId}
                  invalid={show("to")}
                />
              </label>
            )}

            {/* how many, up to what From holds */}
            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                {t("quantity")}
                <span className="tabular text-xs text-chestnut/70">{t("max", { count: pack.quantity.toLocaleString("en-IN") })}</span>
              </span>
              <NumberInput
                value={quantity}
                maxDigits={7}
                max={pack.quantity}
                onChange={setQuantity}
                aria-invalid={show("quantity") || undefined}
                className={cn("tabular min-h-11 px-3 text-base", fieldClass(show("quantity")))}
              />
            </label>

            {/* vehicle number and remarks, both optional */}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm">{t("vehicle")}</span>
              <input
                value={vehicle}
                maxLength={VEHICLE_MAX}
                autoCapitalize="characters"
                onChange={(e) => setVehicle(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                placeholder="KA01AB1234"
                className={cn("min-h-11 px-3 text-base uppercase placeholder:text-chestnut/50", fieldClass(false))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm">{t("remarks")}</span>
              <input value={remarks} maxLength={REMARKS_MAX} onChange={(e) => setRemarks(e.target.value)} className={cn("min-h-11 px-3 text-base", fieldClass(false))} />
            </label>

            {error && <FieldMessage>{error}</FieldMessage>}
          </div>
          <footer className="flex shrink-0 flex-col border-t border-chestnut/15 px-5 py-4">
            <SubmitButton busy={move.isPending} disabled={receivers.length === 0}>
              {t("save")}
            </SubmitButton>
          </footer>
        </form>
      )}
    </Sheet>
  );
}
