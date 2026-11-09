"use client";

import { useState } from "react";

import { BankRefField, ModeChips } from "../shared/bank-mode";
import { useSalaryEntry } from "./state";

// a bank account's part: how it paid (UPI, IMPS, NEFT/RTGS, cheque), then its UTR or cheque no. once picked
export function BankPaidBy({ bankId, account }: { bankId: string; account?: string }) {
  const { tpf, bankModes, setBankModes, bankRefs, setBankRefs, tried } = useSalaryEntry();
  const mode = bankModes[bankId] ?? null;
  const [left, setLeft] = useState(false);
  return (
    <div className="flex flex-col gap-2.5 text-xs font-semibold">
      <ModeChips
        label={tpf("paidBy")}
        missing={tpf("pickMode")}
        mode={mode}
        tried={tried}
        onPick={(m) => setBankModes((all) => ({ ...all, [bankId]: m }))}
      />
      {mode && (
        <BankRefField
          mode={mode}
          text={bankRefs[bankId] ?? ""}
          onText={(v) => setBankRefs((all) => ({ ...all, [bankId]: v }))}
          left={left}
          onLeave={() => setLeft(true)}
          tried={tried}
          account={account}
        />
      )}
    </div>
  );
}
