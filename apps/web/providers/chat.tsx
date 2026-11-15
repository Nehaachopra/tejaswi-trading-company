"use client";

import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type Flow = "receipt" | "payment" | "oldDue";
type Out = RouterOutputs["transactions"];

// what the question-by-question entry (a receipt, a payment or an old due) needs from the server: the bank accounts,
// what cash and each bank hold (a payment only), the three saves, the checks asked as answers come in, and what is
// read again or kept once it's saved
export function useChatEntry(flow: Flow) {
  const utils = trpc.useUtils();
  return {
    banks: trpc.accounts.bank.pickable.useQuery(),
    // a payment never takes more than where it's paid from holds: what each holds today (null for staff)
    sources: trpc.transactions.payment.sources.useQuery(undefined, { enabled: flow === "payment" }),
    createReceipt: trpc.transactions.receipt.create.useMutation(),
    createPayment: trpc.transactions.payment.create.useMutation(),
    addOldDue: trpc.transactions.due.addOld.useMutation(),
    // whether cash or the bank account holds this amount
    paymentFits: (input: RouterInputs["transactions"]["payment"]["fits"]) => utils.transactions.payment.fits.fetch(input),
    // the town, district and state saved with a PIN on one of our addresses
    pinPlace: (postalCode: string) => utils.accounts.party.pinPlace.fetch({ postalCode }),
    // an old due added: balances and dues are read again
    afterOldDue: () => {
      void utils.accounts.invalidate();
      void utils.transactions.due.invalidate();
    },
    // a payment or receipt saved: balances are read again, and what was saved is kept for its success page
    afterPayment: (r: Out["payment"]["create"]) => {
      void utils.accounts.invalidate();
      utils.transactions.payment.get.setData({ transactionId: r.transactionId }, r);
      utils.transactions.payment.balances.setData({ transactionId: r.transactionId }, r.balances);
    },
    afterReceipt: (r: Out["receipt"]["create"]) => {
      void utils.accounts.invalidate();
      utils.transactions.receipt.get.setData({ transactionId: r.transactionId }, r);
      utils.transactions.receipt.balances.setData({ transactionId: r.transactionId }, r.balances);
    },
  };
}
