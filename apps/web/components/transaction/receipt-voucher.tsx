"use client";

import { ArrowLeft, CircleAlert, Download, Flag, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/spinner";
import { WhatsAppIcon } from "~/components/ui/whatsapp-icon";
import { amountInWords } from "~/lib/amount-words";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

type Receipt = RouterOutputs["transactions"]["receipt"]["get"];

// a day as on a voucher: 24-10-2026 (India time)
const dated = (d: Date | string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)).replace(/\//g, "-");

// an amount with paise, Indian grouping: 10,204.08
const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// the voucher's lines and boxes
const cell = "border-chestnut/40 px-2 py-1.5";
const band = "bg-chestnut px-2 py-1.5 font-heading text-base font-bold text-ivory print:bg-[#3b1f14]";

// one label and its value in the details grid
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span className={cn(cell, "border-b border-r font-medium")}>{label}</span>
      <span className={cn(cell, "border-b border-r tabular")}>{value ?? "—"}</span>
    </>
  );
}

// where the money was received: our bank account (its bank, A/c and IFSC), or cash
function ReceivedIn({ r, className }: { r: Receipt; className?: string }) {
  const t = useTranslations("transactions.voucher");
  return (
    <div className={cn("grid grid-cols-[auto_1fr] content-start border-chestnut/40", className)}>
      {r.bank ? (
        <>
          <span className={cn(cell, "border-b border-r font-medium")}>{t("receivedIn")}</span>
          <span className={cn(cell, "border-b")}>{titleCase(r.bank.name)}</span>
          <span className={cn(cell, "border-b border-r font-medium")}>{t("account")}</span>
          <span className={cn(cell, "border-b tabular")}>•••• {r.bank.last4}</span>
          <span className={cn(cell, "border-r font-medium")}>{t("ifsc")}</span>
          <span className={cn(cell, "tabular")}>{r.bank.ifsc ?? "—"}</span>
        </>
      ) : (
        <>
          <span className={cn(cell, "border-r font-medium")}>{t("receivedIn")}</span>
          <span className={cell}>{t("cash")}</span>
        </>
      )}
    </div>
  );
}

// what the money was for, as the voucher's one particular
function useParticular() {
  const t = useTranslations("transactions.voucher.particulars");
  const tf = useTranslations("transactions.loan.frequencies");
  return (r: Receipt) => {
    switch (r.receivedFor) {
      case "loanTaken":
        return r.loan ? t("loan", { rate: r.loan.interestRate, frequency: tf(r.loan.frequency).toLowerCase() }) : t("loanPlain");
      case "otherIncome":
        return titleCase(r.receivedFromName);
      default:
        return t(r.receivedFor);
    }
  };
}

// WhatsApp opened on the customer's chat (or, with no phone kept, on a contact to pick) with a message ready to send:
// the voucher number, the amount and the link that opens the voucher without a login
function whatsAppLink(r: Receipt, key: string, t: (key: string, values?: Record<string, string>) => string) {
  const url = `${window.location.origin}/voucher/${r.transactionId}?k=${encodeURIComponent(key)}`;
  const text = t("whatsAppMessage", { number: r.assignedId, amount: money(r.amount), company: r.company.name, url });
  const to = r.partyPhone ? `91${r.partyPhone.replace(/\D/g, "").slice(-10)}` : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

// a receipt's voucher, laid out like our tax invoice: our details and the voucher's, who it came from with the
// remarks beside it, the particulars, where it was received with the totals, the amount in words, and signatures.
// It prints (or saves as a PDF) on its own. With a share key it's the customer's copy, opened from a link without a
// login: only the download, no way back into the app and nothing to share
export function ReceiptVoucher({ id, shareKey }: { id: string; shareKey?: string }) {
  const t = useTranslations("transactions.voucher");
  const tk = useTranslations("transactions.receipt.kinds");
  const particular = useParticular();
  const shared = shareKey !== undefined;
  const own = trpc.transactions.receipt.get.useQuery({ transactionId: id }, { enabled: !shared });
  const theirs = trpc.transactions.receipt.shared.useQuery({ transactionId: id, key: shareKey ?? "" }, { enabled: shared, retry: false });
  const receipt = shared ? theirs : own;
  // the key for the link sent on WhatsApp
  const link = trpc.transactions.receipt.shareKey.useQuery({ transactionId: id }, { enabled: !shared });

  if (receipt.isPending)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {t("loading")}
      </p>
    );
  if (receipt.isError)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
      </p>
    );

  const r = receipt.data;
  const p = r.party;
  const settled = Math.round((r.amount + (r.tdsAmount ?? 0)) * 100) / 100;
  const fromName = p ? (p.shortName ?? titleCase(p.name.toLowerCase())) : titleCase(r.receivedFromName);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to the receipt's page, sending it on WhatsApp, and the download; on a phone the two buttons share a row
          under the back link */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {shared ? (
          <span className="hidden sm:block" />
        ) : (
          <Link href={`/transaction/receipt/${id}`} className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
            <ArrowLeft className="size-4" aria-hidden /> {t("back")}
          </Link>
        )}
        <div className="grid grid-flow-col auto-cols-fr gap-2 sm:flex sm:items-center">
          {!shared && (
            <button
              type="button"
              disabled={!link.data}
              onClick={() => window.open(whatsAppLink(r, link.data!.key, t), "_blank", "noopener")}
              className="on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4"
            >
              <WhatsAppIcon className="size-4 shrink-0" />
              {/* just the name on a phone, so both buttons fit on one line */}
              <span className="whitespace-nowrap sm:hidden">WhatsApp</span>
              <span className="hidden whitespace-nowrap sm:inline">{t("whatsApp")}</span>
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut sm:px-4">
            <Download className="size-4" aria-hidden /> {t("download")}
          </button>
        </div>
      </div>

      {/* the voucher itself */}
      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <p className="pb-2 text-center font-heading text-2xl font-bold">{t("title")}</p>

        <div className="border border-chestnut/40">
          {/* our details, and the voucher's */}
          <div className="grid sm:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col border-b border-chestnut/40 sm:border-r">
              <p className={band}>{r.company.name}</p>
              <div className={cn(cell, "flex flex-col gap-0.5")}>
                <span>{r.company.address}</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden /> {r.company.phone}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden /> {r.company.email}
                </span>
                <span>
                  {t("state")}: {r.company.state} {t("code")}: {r.company.stateCode}
                </span>
                <span>GSTIN : {r.company.gstin}</span>
                <span>FSSAI No : {r.company.fssai}</span>
              </div>
              <p className={cn(cell, "mt-auto border-t font-semibold")}>{t("jurisdiction", { place: r.company.jurisdiction })}</p>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto_1fr] content-start border-b border-chestnut/40 [&>*:nth-child(4n)]:border-r-0">
              <Detail label={t("number")} value={<span className="font-bold">{r.assignedId}</span>} />
              <Detail label={t("dated")} value={dated(r.dateTime)} />
              <Detail label={t("for")} value={tk(r.receivedFor)} />
              <Detail label={t("mode")} value={r.settledIn === "cash" ? t("cash") : t("bank")} />
              <Detail label={t("reference")} value={r.referenceNumber} />
              <Detail label={t("dated")} value={r.referenceNumber ? dated(r.dateTime) : null} />
            </div>
          </div>

          {/* who it came from, with the remarks beside it */}
          <div className="grid border-b border-chestnut/40 sm:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col border-b border-chestnut/40 sm:border-b-0 sm:border-r">
              <p className={band}>
                {t("from")}: {fromName}
              </p>
              <div className={cn(cell, "flex flex-col gap-0.5")}>
                {p?.shortName && <span className="font-medium">{p.name}</span>}
                {p?.address && (
                  <>
                    <span className="flex items-start gap-1.5">
                      <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {[p.address.line1, p.address.line2, `${p.address.city} - ${p.address.postalCode}`].filter(Boolean).map((part) => titleCase(part!)).join(", ")}
                    </span>
                    <span>
                      {t("state")}: {p.address.state} {t("code")}: {p.address.stateCode}
                    </span>
                  </>
                )}
                {(p?.address?.gstin || r.partyPhone) && (
                  <span className="flex flex-wrap gap-x-4">
                    {p?.address?.gstin && <span>GSTIN : {p.address.gstin}</span>}
                    {r.partyPhone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="size-3.5" aria-hidden /> +91 {r.partyPhone}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className={cn(cell, "flex flex-col gap-1")}>
              <span className="font-semibold">{t("remarks")}:</span>
              <span>{r.remarks ?? "—"}</span>
            </div>
          </div>

          {/* on phones: where it was received, right after the remarks */}
          <ReceivedIn r={r} className="border-b sm:hidden" />

          {/* the particulars */}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-chestnut/40 text-left">
                <th className={cn(cell, "w-12 border-r font-semibold")}>{t("sl")}</th>
                <th className={cn(cell, "border-r font-semibold")}>{t("particularsHead")}</th>
                <th className={cn(cell, "w-36 text-right font-semibold")}>{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="align-top">
                <td className={cn(cell, "border-r")}>1</td>
                <td className={cn(cell, "border-r")}>{particular(r)}</td>
                <td className={cn(cell, "tabular text-right")}>{money(r.amount)}</td>
              </tr>
              {r.tdsAmount !== null && (
                <tr className="align-top">
                  <td className={cn(cell, "border-r")}>2</td>
                  <td className={cn(cell, "border-r")}>{t("tdsLine", { rate: r.tdsRate ?? 0 })}</td>
                  <td className={cn(cell, "tabular text-right")}>{money(r.tdsAmount)}</td>
                </tr>
              )}
              {/* room below the lines, as on the invoice */}
              <tr aria-hidden>
                <td className="h-16 border-r border-chestnut/40" />
                <td className="border-r border-chestnut/40" />
                <td />
              </tr>
            </tbody>
          </table>

          {/* where it was received (on phones it sits after the remarks instead), and the totals */}
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[1fr_1.5fr]">
            <ReceivedIn r={r} className="hidden sm:grid sm:border-r" />
            <div className="grid grid-cols-[1fr_9rem] content-start">
              <span className={cn(cell, "border-b border-r text-right font-semibold")}>{t("amountReceived")}</span>
              <span className={cn(cell, "border-b tabular text-right font-semibold")}>{money(r.amount)}</span>
              {r.tdsAmount !== null && (
                <>
                  <span className={cn(cell, "border-b border-r text-right font-semibold")}>{t("tdsDeducted")}</span>
                  <span className={cn(cell, "border-b tabular text-right")}>{money(r.tdsAmount)}</span>
                  <span className={cn(cell, "border-r text-right font-semibold")}>{t("totalSettled")}</span>
                  <span className={cn(cell, "tabular text-right font-bold")}>{money(settled)}</span>
                </>
              )}
            </div>
          </div>

          {/* the amount in words */}
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[12rem_1fr]">
            <span className={cn(cell, "font-semibold sm:border-r")}>{t("inWords")}</span>
            <span className={cell}>{amountInWords(r.amount)}</span>
          </div>
        </div>

        {/* computer generated, and the signatures */}
        <p className="pt-2 font-semibold">{t("computerGenerated")}</p>
        <div className="mt-12 flex items-end justify-between gap-6">
          <p>
            {t("receivedBy")}: {r.createdByName}
          </p>
          <p className="font-semibold">{t("signatory")}</p>
        </div>

        {/* cancelled: stamped across it */}
        {r.status === "cancelled" && (
          <p aria-label={t("cancelled")} className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded-control border-4 border-danger px-6 py-2 font-heading text-4xl font-bold uppercase tracking-widest text-danger opacity-80">
              {t("cancelled")}
            </span>
          </p>
        )}
      </article>
    </main>
  );
}
