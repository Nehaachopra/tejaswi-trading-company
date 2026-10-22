"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

type Range = "3m" | "fy" | "all";
const RANGES: Range[] = ["3m", "fy", "all"];

const W = 320;
const H = 140;
const PAD = { top: 12, right: 10, bottom: 20, left: 10 };

// a smooth line through the points that never overshoots them (monotone cubic, Fritsch–Carlson),
// so a price that only went up never dips on the way
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0]!.x},${pts[0]!.y}`;
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i]!.x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i]!.y) / (dx[i] || 1));
  const tangent = pts.map((_, i) => {
    if (i === 0) return slope[0]!;
    if (i === n - 1) return slope[n - 2]!;
    const a = slope[i - 1]!;
    const b = slope[i]!;
    return a * b <= 0 ? 0 : (3 * (dx[i - 1]! + dx[i]!)) / ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b);
  });
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += `C${pts[i]!.x + h},${pts[i]!.y + tangent[i]! * h} ${pts[i + 1]!.x - h},${pts[i + 1]!.y - tangent[i + 1]! * h} ${pts[i + 1]!.x},${pts[i + 1]!.y}`;
  }
  return d;
}

// one pack size's selling price as a smooth line, over 3 months, this financial year or all time
export function PriceChart({ productId }: { productId: string }) {
  const t = useTranslations("products.items.chart");
  const format = useFormatter();
  const [range, setRange] = useState<Range>("fy");
  const history = trpc.inventory.product.priceHistory.useQuery({ productId, range });

  // the price points, in time order
  const prices = (history.data?.prices ?? []).map((p) => ({ at: new Date(p.at).getTime(), value: p.priceAfterGst }));
  const now = Date.now();
  const last = prices[prices.length - 1];

  // the scales: time from the first price to today, prices with a little room above and below
  const t0 = prices.length ? prices[0]!.at : now;
  const values = prices.map((p) => p.value);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const room = Math.max((hi - lo) * 0.15, hi * 0.02, 1);
  const min = lo - room;
  const max = hi + room;
  const x = (at: number) => PAD.left + ((at - t0) / Math.max(now - t0, 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);

  // the line runs on to today at the latest price, so it reaches the right edge; the area under it is lightly filled
  const pts = [...prices, ...(last ? [{ at: now, value: last.value }] : [])].map((p) => ({ x: x(p.at), y: y(p.value) }));
  const line = smoothPath(pts);
  const area = pts.length > 1 ? `${line}L${pts[pts.length - 1]!.x},${H - PAD.bottom}L${pts[0]!.x},${H - PAD.bottom}Z` : "";

  const when = (at: number) => format.dateTime(new Date(at), { month: "short", year: "2-digit" });

  return (
    <figure className="flex flex-col gap-2">
      {/* title and the range toggle */}
      <div className="flex items-center justify-between gap-2">
        <figcaption className="text-xs text-chestnut/80">{t("title")}</figcaption>
        <div role="group" aria-label={t("range")} className="flex rounded-control border border-chestnut/50 p-0.5 text-xs">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={cn("rounded-control px-2.5 py-1", range === r ? "bg-chestnut font-medium text-ivory" : "text-chestnut/80 hover:text-chestnut")}
            >
              {t(`ranges.${r}`)}
            </button>
          ))}
        </div>
      </div>

      {/* the chart, or a spinner while it loads */}
      {history.isPending ? (
        <div className="grid h-[140px] place-items-center text-chestnut/70">
          <Spinner />
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={last ? t("summary", { price: rupees(last.value) }) : t("empty")}
        >
          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="stroke-chestnut/20" />
          {area && <path d={area} className="fill-chestnut/8" />}
          {line && <path d={line} fill="none" className="stroke-chestnut" strokeWidth={2} strokeLinecap="round" />}
          {prices.map((p) => (
            <circle key={p.at} cx={x(p.at)} cy={y(p.value)} r={2.5} className="fill-ivory stroke-chestnut" strokeWidth={1.5} />
          ))}
          {last && (
            <>
              <circle cx={x(now)} cy={y(last.value)} r={3.5} className="fill-chestnut" />
              <text x={x(now) - 6} y={y(last.value) - 7} textAnchor="end" className="tabular fill-chestnut text-[10px] font-semibold">
                {rupees(last.value)}
              </text>
            </>
          )}
          <text x={PAD.left} y={H - 4} className="fill-chestnut/70 text-[9px]">
            {when(t0)}
          </text>
          <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-chestnut/70 text-[9px]">
            {when(now)}
          </text>
        </svg>
      )}

    </figure>
  );
}
