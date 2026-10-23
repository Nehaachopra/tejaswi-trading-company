"use client";

import { Check, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { packLabel, rupees } from "~/lib/format";
import { asField, packPriceFromRate, parseAmount, rateFromPackPrice } from "~/lib/price";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { categoryError } from "../categories/category-errors";
import type { ProductGroup } from "./product-tile";

type Pack = ProductGroup["packs"][number];

const iconButton =
  "grid size-11 shrink-0 place-items-center rounded-control border border-chestnut/40 hover:border-chestnut disabled:not-aria-busy:opacity-30 aria-busy:opacity-80";
const action =
  "flex min-h-9 items-center justify-center gap-1.5 rounded-control border border-chestnut/50 px-3 text-sm font-medium hover:border-chestnut";
const input = (bad: boolean) => `tabular min-h-9 w-28 px-2.5 text-right text-sm ${fieldClass(bad)}`;

const money = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());

// one pack size's price as a table: rate per unit, price before GST, GST, price with GST, cost and margin.
// Edit price turns the rate, GST % and price into inputs in place; the rows worked out from them follow as you type
export function ProductPrice({ pack }: { pack: Pack }) {
  const t = useTranslations("products.items");
  const utils = trpc.useUtils();
  const updatePrice = trpc.inventory.product.updatePrice.useMutation();

  // the draft while editing; the rate and the price fill each other in, `from` is whichever was typed last
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [gst, setGst] = useState("");
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState<"rate" | "price">("price");
  const [tried, setTried] = useState(false);

  // another pack size closes the editor
  useEffect(() => setEditing(false), [pack.productId]);

  const startEditing = () => {
    setPrice(pack.priceAfterGst?.toString() ?? "");
    setGst(pack.gstPercent?.toString() ?? "");
    setRate(pack.priceAfterGst != null && pack.gstPercent != null ? asField(rateFromPackPrice(pack.priceAfterGst, pack.packSize, pack.gstPercent)) : "");
    setFrom("price");
    setTried(false);
    setEditing(true);
  };

  // a change to any of the three: keep the other of rate and price in step
  function change(next: { price?: string; gst?: string; rate?: string }) {
    const p = next.price ?? price;
    const g = next.gst ?? gst;
    const r = next.rate ?? rate;
    const typedFrom = next.rate !== undefined ? "rate" : next.price !== undefined ? "price" : from;
    setPrice(p);
    setGst(g);
    setRate(r);
    setFrom(typedFrom);
    const gNum = parseAmount(g);
    if (gNum == null || gNum > 100) return;
    if (typedFrom === "rate") {
      const rNum = parseAmount(r);
      if (rNum != null) setPrice(asField(packPriceFromRate(rNum, pack.packSize, gNum)));
    } else {
      const pNum = parseAmount(p);
      if (pNum != null) setRate(asField(rateFromPackPrice(pNum, pack.packSize, gNum)));
    }
  }

  const bad = { price: !money(price), gst: !money(gst) || Number(gst) > 100 };

  // save the new price (and GST); it applies to new sales only and becomes the next point on the chart
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (bad.price || bad.gst) return;
    try {
      await updatePrice.mutateAsync({ productId: pack.productId, priceAfterGst: Number(price), gstPercent: Number(gst) });
      toast.success(t("toast.priceSaved", { pack: packLabel(pack.packSize, pack.packSizeCode), price: rupees(Number(price)) }));
      setEditing(false);
      void utils.inventory.product.list.invalidate();
      void utils.inventory.product.priceHistory.invalidate({ productId: pack.productId });
    } catch (err) {
      toast.error(t(`errors.${categoryError(err)}`));
    }
  }

  // the figures: saved ones, or while editing, the ones worked out from the draft
  const after = editing ? parseAmount(price) : pack.priceAfterGst;
  const gstPct = editing ? parseAmount(gst) : pack.gstPercent;
  const before = editing ? (after != null && gstPct != null ? Math.round((after / (1 + gstPct / 100)) * 100) / 100 : null) : pack.priceBeforeGst;
  const cost = pack.weightedAverageCost;
  const margin = before != null && cost != null ? before - cost : null;
  const marginPct = margin != null && before ? Math.round((margin / before) * 100) : null;
  const unit = t(`form.units.${pack.packSizeCode}`);
  const dash = (v: number | null | undefined, show: (v: number) => string = rupees) => (v == null ? "–" : show(v));

  // the rows; the editable ones carry their input
  const rows: { label: string; value: string; edit?: React.ReactNode; strong?: boolean }[] = [
    {
      label: t("rateLabel", { unit }),
      value: dash(after != null && gstPct != null ? rateFromPackPrice(after, pack.packSize, gstPct) : null),
      edit: <NumberInput aria-label={t("rateLabel", { unit })} value={rate} decimals={2} onChange={(v) => change({ rate: v })} className={input(false)} />,
    },
    { label: t("priceBeforeGst"), value: dash(before) },
    ...(editing
      ? [{
          label: t("gstLabel"),
          value: "",
          edit: <NumberInput aria-label={t("gstLabel")} value={gst} decimals={2} maxDigits={3} onChange={(v) => change({ gst: v })} className={input(tried && bad.gst)} />,
        }]
      : []),
    {
      label: gstPct == null ? t("gst") : t("gstAmount", { gst: gstPct }),
      value: dash(after != null && before != null ? after - before : null),
    },
    {
      label: t("priceWithGst"),
      value: dash(after),
      strong: true,
      edit: <NumberInput autoFocus aria-label={t("priceWithGst")} value={price} decimals={2} onChange={(v) => change({ price: v })} className={cn(input(tried && bad.price), "font-semibold")} />,
    },
    { label: t("cost"), value: dash(cost) },
    { label: t("margin"), value: dash(margin, (m) => `${rupees(m)} (${marginPct}%)`) },
  ];

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-2">
      {/* the heading, with Edit price; while editing, Cancel and Save instead */}
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2 className="text-xs text-chestnut/80">{t("priceDetails")}</h2>
        {editing ? (
          <div className="flex gap-2">
            <button type="button" aria-label={t("cancel")} onClick={() => setEditing(false)} className={iconButton}>
              <X className="size-5" aria-hidden />
            </button>
            <button type="submit" aria-label={t("savePrice")} disabled={updatePrice.isPending} aria-busy={updatePrice.isPending} className={iconButton}>
              {updatePrice.isPending ? <Spinner /> : <Check className="size-5" aria-hidden />}
            </button>
          </div>
        ) : (
          <button type="button" onClick={startEditing} className={action}>
            <Pencil className="size-4" aria-hidden /> {t("editPrice")}
          </button>
        )}
      </div>

      {/* the table */}
      <table className="w-full overflow-hidden rounded-control text-sm">
        <tbody className="divide-y divide-chestnut/10">
          {rows.map((row) => (
            <tr key={row.label} className={cn(row.strong && "bg-chestnut/6 font-semibold")}>
              <th scope="row" className="px-3 py-2 text-left font-normal text-chestnut/80">
                {row.label}
              </th>
              <td className={cn("tabular px-3 text-right", editing && row.edit ? "py-1" : "py-2", row.value === "–" && "text-chestnut/60", row.strong && "font-heading text-base font-bold")}>
                {editing && row.edit ? row.edit : row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {tried && (bad.price || bad.gst) && <FieldMessage>{t("errors.priceInvalid")}</FieldMessage>}
    </form>
  );
}
