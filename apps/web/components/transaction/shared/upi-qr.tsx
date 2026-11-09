"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import QRCode from "react-qr-code";

import { rupees, titleCase } from "~/lib/format";
import { PickMenu } from "~/components/stock/pick-menu";
import { appOfUpi } from "@repo/trpc/client";

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

// a bank account's UPI QR for the amount, shown in the card as soon as there is one: with more than one UPI ID a
// dropdown above the code naming each by its app (PhonePe, GPay ...; the ID too when two share an app), the first, the
// account's default, picked to start with; the code on white (so any phone camera reads it), the amount large under
// it, then the UPI ID it pays (the dropdown, when there's more than one)
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
  // a UPI ID by the app it's in (from its handle); the ID itself too when another one is in the same app, or the app
  // isn't known
  const tp = useTranslations("accounts.bank.form.providers");
  const appOf = (u: string) => appOfUpi(u);
  const appName = (u: string) => {
    const app = appOf(u);
    if (!app || app === "other") return u;
    return upiIds.filter((x) => appOf(x) === app).length > 1 ? `${tp(app)} (${u})` : tp(app);
  };

  return (
    <div className="flex flex-col items-center gap-3">
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
      {/* the UPI ID it pays; with more than one, a dropdown naming each by its app, the default first */}
      {upiIds.length > 1 ? (
        <div className="w-full">
          <PickMenu
            label={t("upiId")}
            current={appName(picked)}
            options={upiIds.map((u) => ({ id: u, name: appName(u) }))}
            picked={picked}
            onPick={setUpiId}
            matchWidth
            inFlow
            className="bg-ivory text-chestnut"
          />
        </div>
      ) : (
        <p className="text-center text-xs opacity-70">{picked}</p>
      )}
    </div>
  );
}
