"use client";

import { useTranslations } from "next-intl";

import { bankNameIn } from "~/lib/bank-names";

import { FlowParts } from "../shared/fold-group";
import { useSaleEntry } from "./state";

// an edit's breakup, under Original sale received (its ⌄ open): where that money came in when the sale was saved (and
// at each edit since), read only, as a receipt's Received towards: a line from the row into each part (cash, each bank
// account with how it came in, the TDS they deducted, an advance set off, each later receipt by its ID)
export function OriginalReceived() {
  const { t, editing, locale } = useSaleEntry();
  const tc = useTranslations("transactions.chat");
  const tm = useTranslations("transactions.payment.form");
  const tr = useTranslations("transactions.receipt.form");
  if (!editing) return null;
  const { cash, tds, banks, setOff, receipts } = editing.received;

  const parts = [
    ...(cash > 0 ? [{ key: "cash", label: tc("cash"), amount: cash }] : []),
    ...banks.map((b, i) => ({
      key: `bank-${i}`,
      label: (
        <>
          <span className="truncate">{bankNameIn(b.bankName, locale)}</span>
          <span className="shrink-0 opacity-70">••{b.last4}</span>
          {b.mode && <span className="shrink-0 text-xs opacity-70">{tm(`modes.${b.mode}`)}</span>}
        </>
      ),
      amount: b.amount,
    })),
    ...(tds > 0 ? [{ key: "tds", label: tc("sum.tds"), amount: tds }] : []),
    ...(setOff > 0 ? [{ key: "setOff", label: t("setOff"), amount: setOff }] : []),
    ...receipts.map((r, i) => ({
      key: `receipt-${i}`,
      label: (
        <>
          <span className="shrink-0">{tr("receiptGroup")}</span>
          <span className="truncate opacity-70">{r.assignedId}</span>
        </>
      ),
      amount: r.amount,
    })),
  ];
  if (parts.length === 0) return null;
  // on beige, apart from the breakup's own rows
  return (
    <div className="rounded-control bg-[#ede3d0] px-2 py-1.5">
      <FlowParts parts={parts} />
    </div>
  );
}
