import type { Metadata } from "next";

import { DUE_KINDS, type DueKind } from "~/components/dues/due-kinds";
import { OldDueChat } from "~/components/transaction/chat/receipt-chat";

export const metadata: Metadata = { title: "Old due · Tejaswi trading company" };

// a due from before the app, as a chat: of the kind in the link (asked when there's none), going back to the receipt
// or payment that asked for it, or to its tab
export default async function OldDuePage({ searchParams }: { searchParams: Promise<{ kind?: string; back?: string }> }) {
  const { kind, back } = await searchParams;
  return (
    <OldDueChat
      kind={DUE_KINDS.includes(kind as DueKind) ? (kind as DueKind) : null}
      back={back === "receipt" || back === "payment" ? back : null}
    />
  );
}
