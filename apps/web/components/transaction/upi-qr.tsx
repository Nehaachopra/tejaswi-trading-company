"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import QRCode from "react-qr-code";

import { PickMenu } from "~/components/stock/pick-menu";
import { rupees, titleCase } from "~/lib/format";

// a UPI payment link: who's paid (the UPI ID and the name it shows), how much, and a note. Any UPI app that scans it
// opens with the amount filled in. https://www.npci.org.in/ (UPI linking specification)
export function upiLink({ upiId, payee, amount, note }: { upiId: string; payee: string; amount: number; note?: string }) {
  const params = new URLSearchParams({ pa: upiId, pn: payee.slice(0, 50), am: amount.toFixed(2), cu: "INR" });
  if (note) params.set("tn", note.slice(0, 50));
  // UPI apps read spaces as %20, not +, and want the UPI ID's @ as it is
  return `upi://pay?${params.toString().replace(/\+/g, "%20").replace(/%40/g, "@")}`;
}

// a bank account's UPI QR for the amount, shown in the card as soon as there is one: the code on white (so any phone camera reads
// it), the amount large under it, and which UPI ID it pays (a choice when the account has more than one)
export function UpiQr({ upiIds, payee, amount, note }: { upiIds: string[]; payee: string; amount: number; note?: string }) {
  const t = useTranslations("transactions.receipt.form");
  const [upiId, setUpiId] = useState(upiIds[0]!);
  const picked = upiIds.includes(upiId) ? upiId : upiIds[0]!;
  const name = titleCase(payee);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-chestnut/20 p-4">
      <span className="text-xs font-semibold">{t("scanToPay")}</span>
      {/* the code: dark on white with a quiet margin, the size a phone reads from arm's length */}
      <div className="rounded-xl bg-white p-3">
        <QRCode value={upiLink({ upiId: picked, payee: name, amount, note })} size={208} fgColor="#2b160e" bgColor="#ffffff" level="M" />
      </div>
      <p className="tabular font-heading text-3xl font-bold leading-none">{rupees(amount)}</p>
      <p className="text-center text-xs">
        <span className="block font-semibold">{name}</span>
        {upiIds.length === 1 && <span className="block opacity-70">{picked}</span>}
      </p>
      {/* more than one UPI ID on the account: which one this code pays */}
      {upiIds.length > 1 && (
        <div className="w-full">
          <PickMenu
            label={t("upiId")}
            current={picked}
            options={upiIds.map((u) => ({ id: u, name: u }))}
            picked={picked}
            onPick={setUpiId}
            matchWidth
            inFlow
            className="bg-ivory text-chestnut"
          />
        </div>
      )}
    </div>
  );
}
