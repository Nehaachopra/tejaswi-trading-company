import type { Metadata } from "next";

import { TransactionHub } from "~/components/transaction/transaction-hub";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Home · Tejaswi trading company" };

// Home: on desktop, the tiles for a new transaction (phones have the raised + in the bottom bar); the rest of
// Home is left until it's designed
export default async function HomePage() {
  const session = await getSession();
  return (
    <div className="hidden lg:block">
      <TransactionHub isAdmin={session!.user.role === "admin"} />
    </div>
  );
}
