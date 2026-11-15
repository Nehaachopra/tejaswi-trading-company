import type { Metadata } from "next";

import { TransactionHub } from "~/components/transaction/hub";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Home · Tejaswi trading company" };

// Home: the tiles for a new transaction, group by group, on phone and desktop alike (a phone's raised + in the bottom
// bar opens the same tiles); the rest of Home is left until it's designed
export default async function HomePage() {
  const session = await getSession();
  return <TransactionHub isAdmin={session!.user.role === "admin"} />;
}
