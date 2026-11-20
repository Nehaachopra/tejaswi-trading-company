import type { Metadata } from "next";

import { HistoryList } from "~/components/history/history-list";

export const metadata: Metadata = { title: "History · Tejaswi trading company" };

// every past transaction: the admin sees all, staff only their own (the server decides)
export default function HistoryPage() {
  return <HistoryList />;
}
