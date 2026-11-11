"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
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
// account's default, picked to start with (one ID: it, with a pen to change it); a receipt's cards (`row`) put the app,
// the ID and the pen in one row instead. The code on white (so any phone camera reads it), the amount large under it
export function UpiQr({
  upiIds,
  payee,
  amount,
  note,
  onEdit,
  hideId = false,
  row = false,
  idLabel,
}: {
  upiIds: string[];
  payee: string;
  amount: number;
  note?: string;
  // a pen beside the UPI ID that brings back the box to change it
  onEdit?: () => void;
  // the UPI ID not shown with the code (a payment's box above it shows it)
  hideId?: boolean;
  // a receipt's cards: the app, the ID and the pen in one row, labels on top
  row?: boolean;
  // a payment's cards: the UPI ID box's own label (Supplier UPI ID ...) above the ID (or its dropdown)
  idLabel?: string;
}) {
  const t = useTranslations("transactions.receipt.form");
  const tp2 = useTranslations("transactions.payment.form");
  const [upiId, setUpiId] = useState(upiIds[0]!);
  const picked = upiIds.includes(upiId) ? upiId : upiIds[0]!;
  const name = titleCase(payee);
  const tb = useTranslations("accounts.bank.form");
  // the app dropdown is open: the ID beside it shows blank until another is picked
  const [listOpen, setListOpen] = useState(false);
  // a UPI ID by the app it's in (from its handle); the ID itself too when another one is in the same app, or the app
  // isn't known
  const tp = useTranslations("accounts.bank.form.providers");
  const appOf = (u: string) => appOfUpi(u);
  // a UPI ID's app by name (PhonePe, GPay ...), or null when its handle isn't one we know
  const providerOf = (u: string) => {
    const app = appOf(u);
    return !app || app === "other" ? null : tp(app);
  };
  const appName = (u: string) => {
    const app = appOf(u);
    if (!app || app === "other") return u;
    return upiIds.filter((x) => appOf(x) === app).length > 1 ? `${tp(app)} (${u})` : tp(app);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* `row` (a receipt's cards): one row above the code, the app (a dropdown when there's more than one UPI ID, the
          default first), the ID it pays, and the pen that changes a typed ID; each with its label on top. The list
          opens under the app, so the ID stays where it is (blank while the list is open) */}
      {/* otherwise the UPI ID it pays above the code; with more than one, a dropdown naming each by its app */}
      {!hideId && !row && upiIds.length > 1 && (
        <div className="flex w-full flex-col gap-2 text-xs font-semibold">
          {idLabel && <span>{idLabel}</span>}
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
      )}
      {/* a payment's cards: "UPI ID" on top, then one row, the ID on the left (a long one cut short, in full on
          hover) and the pen at the right edge */}
      {!hideId && !row && upiIds.length === 1 && idLabel && (
        <div className="flex w-full min-w-0 flex-col gap-2 text-xs font-semibold">
          <span>{idLabel}</span>
          <span className="flex min-h-9 min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate text-base" title={picked}>
              {picked}
            </span>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={tp2("editUpi")}
                className="grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            )}
          </span>
        </div>
      )}
      {!hideId && !row && upiIds.length === 1 && !idLabel && (
        <p className="flex items-center justify-center gap-1.5 text-center text-base">
          <span className="min-w-0 break-all font-semibold">{picked}</span>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={tp2("editUpi")}
              className="grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
        </p>
      )}
      {!hideId && row && (
        <div className="flex w-full min-w-0 items-start gap-3 text-xs font-semibold">
          {(upiIds.length > 1 || providerOf(picked)) && (
            <div className="flex w-32 shrink-0 flex-col gap-2">
              <span>{tb("provider")}</span>
              {upiIds.length > 1 ? (
                <PickMenu
                  label={tb("provider")}
                  current={providerOf(picked) ?? tb("provider")}
                  options={upiIds.map((u) => ({ id: u, name: appName(u) }))}
                  picked={picked}
                  onPick={setUpiId}
                  onOpenChange={setListOpen}
                  matchWidth
                  inFlow
                  className="bg-ivory text-chestnut"
                />
              ) : (
                <span className="flex min-h-11 items-center text-sm">{providerOf(picked)}</span>
              )}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span>{t("upiId")}</span>
            <span className="flex min-h-11 min-w-0 items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-sm font-normal" title={picked}>
                {listOpen ? "" : picked}
              </span>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label={tp2("editUpi")}
                  className="grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
              )}
            </span>
          </div>
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
    </div>
  );
}
