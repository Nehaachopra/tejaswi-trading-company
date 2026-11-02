import type { Metadata } from "next";

import { PAGE } from "~/components/ui/page-styles";
import { StockTabs } from "~/components/stock/stock-tabs";

export const metadata: Metadata = { title: "Stock count · Tejaswi trading company" };

// the day's count and its calendar: designed next, so only the tabs for now
export default function StockCountPage() {
  return (
    <main className={`${PAGE} pb-16`}>
      <StockTabs />
    </main>
  );
}
