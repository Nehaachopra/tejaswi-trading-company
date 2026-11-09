"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import QRCode from "react-qr-code";

import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

// a UPI payment link: who's paid (the UPI ID and the name it shows), how much, and a note. Any UPI app that scans it
// opens with the amount filled in. https://www.npci.org.in/ (UPI linking specification)
export function upiLink({
  upiId,
  payee,
  amount,
  note,
}: {
  upiId: string;
  payee: string;
  amount: number;
  note?: string;
}) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payee.slice(0, 50),
    am: amount.toFixed(2),
    cu: "INR",
  });
  if (note) params.set("tn", note.slice(0, 50));
  // UPI apps read spaces as %20, not +, and want the UPI ID's @ as it is
  return `upi://pay?${params.toString().replace(/\+/g, "%20").replace(/%40/g, "@")}`;
}

// a bank account's UPI QR for the amount, shown in the card as soon as there is one: with more than one UPI ID a chip
// each above the code (the first, the account's default, picked to start with; a tap switches), the code on white (so any
// phone camera reads it), the amount large under it, and which UPI ID it pays
export function UpiQr({
  upiIds,
  payee,
  amount,
  note,
}: {
  upiIds: string[];
  payee: string;
  amount: number;
  note?: string;
}) {
  const t = useTranslations("transactions.receipt.form");
  const [upiId, setUpiId] = useState(upiIds[0]!);
  const picked = upiIds.includes(upiId) ? upiId : upiIds[0]!;
  const name = titleCase(payee);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-chestnut/20 p-4">
      <span className="text-xs font-semibold">{t("scanToPay")}</span>
      {/* more than one UPI ID: which one this code pays, the default first */}
      {upiIds.length > 1 && (
        <div role="radiogroup" aria-label={t("upiId")} className="flex w-full flex-wrap justify-center gap-1.5">
          {upiIds.map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={picked === u}
              onClick={() => setUpiId(u)}
              className={cn(
                "min-h-9 max-w-full truncate rounded-control border px-3 text-xs transition-colors",
                picked === u ? "border-chestnut bg-chestnut font-semibold text-ivory" : "border-chestnut/50 hover:border-chestnut",
              )}
            >
              {u}
            </button>
          ))}
        </div>
      )}
      {/* the code: dark on white with a quiet margin, the size a phone reads from arm's length */}
      <div className="rounded-xl bg-white p-3">
        <QRCode
          value={upiLink({ upiId: picked, payee: name, amount, note })}
          size={208}
          fgColor="#2b160e"
          bgColor="#ffffff"
          level="M"
        />
      </div>
      <p className="tabular font-heading text-3xl font-bold leading-none">{rupees(amount)}</p>
      <p className="text-center text-xs">
        <span className="block font-semibold">{name}</span>
        <span className="block opacity-70">{picked}</span>
      </p>
    </div>
  );
}
