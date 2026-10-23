import type { Metadata } from "next";

import { GodownsBoard } from "~/components/stock/godowns/godowns-board";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Godowns · Tejaswi trading company" };

// what each godown holds; admin and staff (the shell already checked for a session), admin-only parts inside
export default async function StockPage() {
  const session = await getSession();
  return <GodownsBoard isAdmin={session!.user.role === "admin"} />;
}
