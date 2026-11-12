"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { rupees } from "~/lib/format";
import { trpc } from "~/trpc/client";

// the drawing's own units; it scales to the card's width
const W = 160;
const H = 80;
const PAD = { top: 8, right: 8, bottom: 16, left: 8 };

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

// one pack size's last 5 saved price changes as a smooth line with a fade under it; only saved prices, never the
// one being typed. Only the first and last dates are written; a tap or hover shows a point's price
export function PriceChart({ productId }: { productId: string }) {
  const t = useTranslations("products.items.chart");
  const locale = useLocale();
  const fadeId = useId();
  const history = trpc.inventory.product.priceHistory.useQuery({ productId, range: "recent" });
  const [tip, setTip] = useState<number | null>(null);

  if (history.isPending) {
    return (
      <div className="grid h-20 place-items-center text-chestnut/70">
        <Spinner />
      </div>
    );
  }

  // the points: saved prices only
  // dates in words, the Indian way round: 22 Oct 2026
  const day = (at: string) =>
    new Date(at).toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const pts = (history.data?.prices ?? []).map((p) => ({ label: day(p.at), value: p.priceAfterGst }));
  const latest = pts[pts.length - 1]?.value;
  // one price alone (the first one, set when the pack size was added) is no history yet
  if (pts.length <= 1) return <p className="py-4 text-center text-xs text-chestnut/60">{t("empty")}</p>;

  // the scales: one price alone sits in the middle; prices get a little room above and below
  const values = pts.map((p) => p.value);
  const pad = (Math.max(...values) - Math.min(...values)) * 0.15 || Math.max(...values) * 0.1 || 1;
  const lo = Math.max(0, Math.min(...values) - pad);
  const hi = Math.max(...values) + pad;
  const x = (i: number) => (pts.length === 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + (i * (W - PAD.left - PAD.right)) / (pts.length - 1));
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  // the line through the prices, and the same line closed down to the base for the fade
  const line = smoothPath(pts.map((p, i) => ({ x: x(i), y: y(p.value) })));
  const base = H - PAD.bottom;
  const last = pts.length - 1;
  const area = pts.length > 1 ? `${line}L${x(last)},${base}L${x(0)},${base}Z` : "";
  const shown = tip == null ? null : pts[tip];

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={latest != null ? t("summary", { price: rupees(latest) }) : t("empty")}>
        <defs>
          <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-chestnut)" stopOpacity={0.32} />
            <stop offset="1" stopColor="var(--color-chestnut)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} className="stroke-chestnut/15" />
        {/* the first and last dates only */}
        {last === 0 ? (
          <text x={x(0)} y={H - 3} textAnchor="middle" className="tabular fill-chestnut/60 text-[7.5px] font-medium">{pts[0]!.label}</text>
        ) : (
          <>
            <text x={x(0)} y={H - 3} textAnchor="start" className="tabular fill-chestnut/60 text-[7.5px] font-medium">{pts[0]!.label}</text>
            <text x={x(last)} y={H - 3} textAnchor="end" className="tabular fill-chestnut/60 text-[7.5px] font-medium">{pts[last]!.label}</text>
          </>
        )}
        {area && <path d={area} fill={`url(#${fadeId})`} />}
        <path d={line} fill="none" className="stroke-chestnut" strokeWidth={2} strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={4} strokeWidth={2} className="fill-chestnut stroke-ivory" />
        ))}
        {/* wide tap targets, one per point */}
        {pts.map((p, i) => (
          <rect
            key={`hit-${i}`}
            x={x(i) - 12}
            y={PAD.top}
            width={24}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onPointerEnter={() => setTip(i)}
            onPointerDown={() => setTip(i)}
            onPointerLeave={() => setTip(null)}
          />
        ))}
      </svg>
      {/* the point's date and price */}
      {shown && tip != null && (
        <span
          className="tabular pointer-events-none absolute -translate-x-1/2 -translate-y-[120%] whitespace-nowrap rounded-[8px] bg-chestnut px-[7px] py-1 text-[11px] text-ivory"
          style={{ left: `${(x(tip) / W) * 100}%`, top: `${(y(shown.value) / H) * 100}%` }}
        >
          {shown.label}: {rupees(shown.value)}
        </span>
      )}
    </figure>
  );
}
