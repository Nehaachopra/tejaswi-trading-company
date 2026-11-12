"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { useState } from "react";
import QRCode from "react-qr-code";

import { rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { PickMenu } from "~/components/stock/pick-menu";
import { appOfUpi } from "@repo/trpc/client";

import { oneLineRow, pickRow } from "./form-basics";
import { PlacePicker } from "./place-picker";

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
  idAsRow = false,
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
  // a payment's cards: the ID's name on the left and the ID in its box on the right, as the card's other rows
  idAsRow?: boolean;
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
        <div
          className={cn(
            "w-full min-w-0",
            idAsRow ? pickRow : "flex flex-col gap-2 text-xs font-semibold",
          )}
        >
          {/* as a row (a payment's or receipt's cards): "UPI app" on the left, and the apps as the same accordion as the
              card's other picks (its rows open in place, then only the pick, see-through with ▾, at the right edge) */}
          {idAsRow ? <span>{t("upiApp")}</span> : idLabel && <span>{idLabel}</span>}
          {idAsRow ? (
            <PlacePicker
              quiet
              bare
              alignEnd
              label={t("upiApp")}
              places={upiIds.map((u) => ({ id: u, name: appName(u), disabled: false }))}
              value={picked}
              onPick={setUpiId}
              invalid={false}
            />
          ) : (
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
          )}
        </div>
      )}
      {/* a payment's or receipt's cards: the ID's name on the left; on the right the ID in plain words on one line (no
          box, only the amount is filled there) and the pen under it, in line with the ▾ of the picks above. With more
          than one ID it comes under the UPI app picked, showing that app's ID */}
      {!hideId && !row && idLabel && idAsRow && (
        <div className={cn("w-full min-w-0", oneLineRow)}>
          <span>{idLabel}</span>
          <span className="flex min-w-0 flex-col items-end px-3.5">
            <span className="flex min-h-12 max-w-full items-center overflow-x-auto whitespace-nowrap text-base font-medium">
              {picked}
            </span>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={tp2("editUpi")}
                className="-mr-2.5 grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            )}
          </span>
        </div>
      )}
      {/* otherwise "UPI ID" on top, then the ID in its box (a long one cut short, in full on hover), the pen at its
          right edge */}
      {!hideId && !row && upiIds.length === 1 && idLabel && !idAsRow && (
        <div className="flex w-full min-w-0 flex-col gap-2 text-xs font-semibold">
          <span>{idLabel}</span>
          <span className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-control bg-ivory px-3 font-semibold shadow-[0_0_5px_0] shadow-chestnut/40">
            <span className="min-w-0 truncate text-base" title={picked}>
              {picked}
            </span>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={tp2("editUpi")}
                className="-mr-2 grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
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
            <span className="flex min-h-11 min-w-0 items-center gap-1 rounded-control bg-ivory px-3 shadow-[0_0_5px_0] shadow-chestnut/40">
              <span className="min-w-0 flex-1 truncate text-sm font-normal" title={picked}>
                {listOpen ? "" : picked}
              </span>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label={tp2("editUpi")}
                  className="-mr-2 grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
              )}
            </span>
          </div>
        </div>
      )}
      {/* the code: dark on white with a quiet margin, the size a phone reads from arm's length; the amount large
          under it. A payment's cards: as a row, "QR code" on the left and the code (as wide as the right side) on
          the right, like the card's other rows */}
      {idAsRow ? (
        <div className={cn("w-full", pickRow)}>
          <span>{tp2("qrCode")}</span>
          <span className="flex min-w-0 flex-col items-center gap-2">
            {code("w-full")}
            <span className="tabular font-heading text-2xl font-bold leading-none">
              {rupees(amount)}
            </span>
          </span>
        </div>
      ) : (
        <>
          {code()}
          <p className="tabular font-heading text-3xl font-bold leading-none">{rupees(amount)}</p>
        </>
      )}
    </div>
  );

  // the QR on white; `className` sizes its white box (the code fills it, square)
  function code(className?: string) {
    return (
      <div className={cn("rounded-xl bg-white p-3", className)}>
        <QRCode
          value={upiLink({ upiId: picked, payee: name, amount, note })}
          size={208}
          style={className ? { width: "100%", height: "auto" } : undefined}
          fgColor="#2b160e"
          bgColor="#ffffff"
          level="M"
        />
      </div>
    );
  }
}
