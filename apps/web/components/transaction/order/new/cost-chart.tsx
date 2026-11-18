"use client";

import { HistoryChart } from "~/components/product/products/price-chart";
import { useCostHistory } from "~/providers/products";

import { useOrderEntry } from "./state";

// a purchase order's line: what one pack of this size cost with GST on its last 5 purchases, drawn as the
// Products page draws its price history
export function CostChart({ productId }: { productId: string }) {
  const { t } = useOrderEntry();
  const history = useCostHistory(productId);
  const points = (history.data?.costs ?? []).map((c) => ({ at: c.at, value: c.costAfterGst }));
  return (
    <HistoryChart
      pending={history.isPending}
      points={points}
      empty={t("costHistoryEmpty")}
      summary={(price) => t("costHistorySummary", { price })}
    />
  );
}
