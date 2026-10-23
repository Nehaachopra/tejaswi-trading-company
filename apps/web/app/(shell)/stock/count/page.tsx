import type { Metadata } from "next";

import { StockTabs } from "~/components/stock/stock-tabs";

export const metadata: Metadata = { title: "Stock count · Tejaswi trading company" };

// the day's count and its calendar: designed next, so only the tabs for now
export default function StockCountPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <StockTabs />
    </main>
  );
}
