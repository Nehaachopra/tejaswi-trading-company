"use client";

import { Fragment } from "react";

import { ArrowLeft, CircleAlert, Download, Flag, Mail, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/icons/spinner";
import { WhatsAppIcon } from "~/components/ui/icons/whatsapp-icon";
import { amountInWords } from "~/lib/amount-words";
import { useBankName } from "~/lib/bank-names";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";

import { BlockedButton } from "../../history/blocked-button";
import { CancelledNote } from "../../history/cancelled-note";
import { EditedNote } from "../../history/edited-note";
import { EditLog } from "../../history/edit-log";
import { Breakup, type BreakupRow, DocHead, LAST_COL, Remarks } from "./document-parts";
import {
  usePaymentShareKey,
  useReceiptShareKey,
  useSavedPayment,
  useSavedReceipt,
  useSharedPayment,
  useSharedReceipt,
  useStoredCopies,
} from "~/providers/saved";
import type { RouterOutputs } from "@repo/trpc/client";

type Receipt = RouterOutputs["transactions"]["receipt"]["get"];
type Payment = RouterOutputs["transactions"]["payment"]["get"];

// what a voucher prints, the same for money in and out: what it was for, who it was with, and the rest as saved
type Voucher = Omit<
  Receipt,
  "receivedFor" | "receivedFromName" | "receivedFromLedgerId" | "settledIn" | "split" | "gst"
> & {
  // a scrap sale's GST, taken out of what was received
  gst?: Receipt["gst"];
  // a customer's receipt that left an advance: its due part and the advance
  split?: Receipt["split"];
  flow: "receipt" | "payment";
  // a payment can come from cash and a bank together, with what each paid
  settledIn: Payment["settledIn"];
  cashAmount?: Payment["cashAmount"];
  // how a payment's bank part was made
  bankMode?: Payment["bankMode"];
  bankAmount?: Payment["bankAmount"];
  // a payment no one account could cover: the other accounts, each with its part
  moreBankParts?: Payment["moreBankParts"];
  kind: string;
  counterName: string;
  // the PAN of whoever a payment's TDS was taken from
  tdsPan?: Payment["tdsPan"];
  // reverse charge, where the voucher is also our self-invoice; and the GST on a supplier's bill
  rcm?: Payment["rcm"];
  bill?: Payment["bill"];
};

const fromReceipt = ({
  receivedFor,
  receivedFromName,
  receivedFromLedgerId: _l,
  ...r
}: Receipt): Voucher => ({
  ...r,
  flow: "receipt",
  kind: receivedFor,
  counterName: receivedFromName,
});

const fromPayment = ({ paidFor, paidToName, paidToLedgerId: _l, ...p }: Payment): Voucher => ({
  ...p,
  flow: "payment",
  kind: paidFor,
  counterName: paidToName,
});

// a day as on a voucher: 24-10-2026 (India time)
export const dated = (d: Date | string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date(d))
    .replace(/\//g, "-");

// an amount with paise, Indian grouping: 10,204.08
export const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// the voucher's lines and boxes
export const cell = "border-chestnut/40 px-2 py-1.5";
export const band =
  "bg-chestnut px-2 py-1.5 font-heading text-base font-bold text-ivory print:bg-[#3b1f14]";

// one label and its value in the details grid (`nowrap`: the value stays on one line; the label wraps instead)
export function Detail({ label, value, nowrap = false }: { label: string; value: React.ReactNode; nowrap?: boolean }) {
  return (
    <>
      <span className={cn(cell, "border-b border-r font-medium")}>{label}</span>
      <span className={cn(cell, "border-b border-r tabular", nowrap && "whitespace-nowrap")}>{value ?? "—"}</span>
    </>
  );
}

// where the money went out from or came into: a row per place (cash, each bank account) with its mode, account and
// amount, and a Total row once there's more than one
function Sources({ r, label }: { r: Voucher; label: string }) {
  // bank names in the language picked
  const bankName = useBankName();
  const t = useTranslations("transactions.voucher");
  const more = r.moreBankParts ?? [];
  const moreSum = more.reduce((sum, m) => sum + m.amount, 0);
  const cashPart =
    r.settledIn === "cash" ? r.amount : r.settledIn === "cashAndBank" ? (r.cashAmount ?? 0) : 0;
  const bankAll = r.bankAmount ?? (r.settledIn === "bank" ? r.amount : 0);
  const found: { key: string; name: string; mode: string; account: string; amount: number }[] = [
    ...(r.settledIn !== "bank"
      ? [{ key: "cash", name: t("cash"), mode: "—", account: "—", amount: cashPart }]
      : []),
    ...(r.bank
      ? [
          {
            key: "bank",
            name: bankName(r.bank.name),
            mode: r.bankMode ? t(`modes.${r.bankMode}`) : "—",
            account: `•••• ${r.bank.last4}`,
            amount: Math.round((bankAll - moreSum) * 100) / 100,
          },
        ]
      : []),
    ...more.map((m) => ({
      key: m.bankDetailsId,
      name: bankName(m.name),
      mode: t(`modes.${m.mode}`),
      account: `•••• ${m.last4}`,
      amount: m.amount,
    })),
  ];
  // a bank payment with no account kept (older entries): one Bank row with the whole
  const rows =
    found.length > 0
      ? found
      : [{ key: "bank", name: t("bank"), mode: "—", account: "—", amount: r.amount }];
  const thCell = cn(cell, "border-b border-r font-semibold last:border-r-0");
  const td = cn(cell, "border-r last:border-r-0");
  return (
    <div className="flex min-w-0 flex-col">
      <p className={band}>{label}</p>
      <div className="overflow-x-auto">
        <table className="tabular w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={thCell}>{t("source")}</th>
              <th className={thCell}>{t("mode")}</th>
              <th className={thCell}>{t("account")}</th>
              <th className={cn(thCell, "text-right")}>{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key} className={cn(i < rows.length - 1 && "border-b border-chestnut/40")}>
                <td className={td}>{row.name}</td>
                <td className={td}>{row.mode}</td>
                <td className={cn(td, "whitespace-nowrap")}>{row.account}</td>
                <td className={cn(td, "text-right")}>{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
          {/* more than one place: what they add up to */}
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t border-chestnut/40 font-bold">
                <td colSpan={3} className={td}>
                  {t("total")}
                </td>
                <td className={cn(td, "text-right")}>{money(r.amount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// what the money was for, as the voucher's particulars: one line
function useParticulars() {
  const t = useTranslations("transactions.voucher.particulars");
  const tp = useTranslations("transactions.payment.voucher.particulars");
  const tf = useTranslations("transactions.loan.frequencies");
  return (r: Voucher): [string, number][] => {
    const loan = (words: typeof t | typeof tp) =>
      r.loan
        ? words("loan", {
            rate: r.loan.interestRate,
            frequency: tf(r.loan.frequency).toLowerCase(),
          })
        : words("loanPlain");
    if (r.flow === "receipt") {
      if (r.kind === "loanTaken") return [[loan(t), r.amount]];
      // a scrap sale: the dust at its price before GST (the GST has its own rows under the lines)
      if (r.kind === "otherIncome" && r.gst) return [[t("scrap"), r.gst.taxable]];
      if (r.kind === "otherIncome") return [[titleCase(r.counterName), r.amount]];
      // more than they owed: the due (with the TDS they took) and the advance, a line each; together the breakup's Total
      if (r.split) {
        const handed = Math.max(0, Math.round((r.split.due - (r.tdsAmount ?? 0)) * 100) / 100);
        const advance = Math.round((r.amount - handed) * 100) / 100;
        return [
          ...(r.split.due > 0 ? [[t("customer"), r.split.due] as [string, number]] : []),
          [t("advance"), advance],
        ];
      }
      return [[t(r.kind as never), r.amount]];
    }
    // more than we owed: the due (with the TDS taken out of it) and the advance paid, a line each; together the
    // breakup's Total
    if (r.kind === "supplier" && r.split) {
      const handed = Math.max(0, Math.round((r.split.due - (r.tdsAmount ?? 0)) * 100) / 100);
      const advance = Math.round((r.amount - handed) * 100) / 100;
      return [
        ...(r.split.due > 0 ? [[tp("supplier"), r.split.due] as [string, number]] : []),
        [tp("advance"), advance],
      ];
    }
    switch (r.kind) {
      case "loanGiven":
        return [[loan(tp), r.amount]];
      case "loanRepaid":
        return [[tp("loanRepaid"), r.amount]];
      case "interestPaid":
        return [[tp("interest"), r.amount]];
      // an expense or a tax: the head it was paid to
      case "expense":
        return [[titleCase(r.counterName), r.amount]];
      case "taxPaid":
        return [[`${tp("taxPaid")}: ${titleCase(r.counterName)}`, r.amount]];
      default:
        return [[tp(r.kind as never), r.amount]];
    }
  };
}

// WhatsApp opened on the customer's chat (or, with no phone kept, on a contact to pick) with a message ready to send:
// the voucher number, the amount and the link that opens the voucher without a login
function whatsAppLink(
  r: Voucher,
  key: string,
  t: (key: string, values?: Record<string, string>) => string,
) {
  const path =
    r.flow === "payment" ? `/voucher/payment/${r.transactionId}` : `/voucher/${r.transactionId}`;
  const url = `${window.location.origin}${path}?k=${encodeURIComponent(key)}`;
  const text = t("whatsAppMessage", {
    number: r.assignedId,
    amount: money(r.amount),
    company: r.company.name,
    url,
  });
  const to = r.partyPhone ? `91${r.partyPhone.replace(/\D/g, "").slice(-10)}` : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

// a button's look on the chestnut page, as on the invoice
const pill =
  "on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4";

// a receipt's voucher, laid out like our tax invoice: our details and the voucher's, who it came from with the
// remarks beside it, the particulars, where it was received with the totals, the amount in words, and signatures.
// It prints (or saves as a PDF) on its own. With a share key it's the customer's copy, opened from a link without a
// login: only the download, no way back into the app and nothing to share. Opened from History, as a sale's invoice:
// on the screen only who it was with beside what it was for, its ID, day and remarks, then the particulars with the
// breakup and where the money went; printed, the voucher as issued. Back goes to History, and the admin's Edit receipt
export function ReceiptVoucher({
  id,
  shareKey,
  flow = "receipt",
  history,
}: {
  id: string;
  shareKey?: string;
  flow?: "receipt" | "payment";
  history?: { record: HistoryTransaction; isAdmin: boolean };
}) {
  const base = useTranslations("transactions.voucher");
  // a payment's own words where it has them (Paid to, Paid from ...), the receipt's otherwise
  const ownWords = useTranslations("transactions.payment.voucher");
  const t = ((key: string, values?: Record<string, string>) =>
    flow === "payment" && ownWords.has(key as never)
      ? ownWords(key as never, values as never)
      : base(key as never, values as never)) as typeof base;
  const tk = useTranslations(
    flow === "payment" ? "transactions.payment.kinds" : "transactions.receipt.kinds",
  );
  const particulars = useParticulars();
  const th = useTranslations("history");
  const ti = useTranslations("transactions.sale.invoice");
  // opened from History: its History look on the screen (printed, the success card and shared links: as issued)
  const h = !!history;
  const record = history?.record;
  const shared = shareKey !== undefined;
  const isPayment = flow === "payment";
  const receiptOwn = useSavedReceipt(id, !shared && !isPayment);
  const receiptTheirs = useSharedReceipt(id, shareKey ?? "", shared && !isPayment);
  const paymentOwn = useSavedPayment(id, !shared && isPayment);
  const paymentTheirs = useSharedPayment(id, shareKey ?? "", shared && isPayment);
  const receipt = isPayment
    ? shared
      ? paymentTheirs
      : paymentOwn
    : shared
      ? receiptTheirs
      : receiptOwn;
  // the key for the link sent on WhatsApp
  const receiptLink = useReceiptShareKey(id, !shared && !isPayment);
  const paymentLink = usePaymentShareKey(id, !shared && isPayment);
  const link = isPayment ? paymentLink : receiptLink;
  // a payment under reverse charge has a copy kept as a file, once the job has stored it; the newest version comes first
  const documents = useStoredCopies(id, !shared && !!paymentOwn.saved?.rcm);
  const storedCopy = documents.copies[0];

  if (receipt.loading)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {t("loading")}
      </p>
    );
  if (receipt.loadFailed)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
      </p>
    );

  const r = isPayment ? fromPayment(receipt.saved as Payment) : fromReceipt(receipt.saved as Receipt);
  const p = r.party;
  // who it was paid to or received from: their full name, never the short name
  const fromName = p ? titleCase(p.name.toLowerCase()) : titleCase(r.counterName);
  const tds = r.tdsAmount ?? 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  // what it comes to before anything is taken off: the bill with its GST (reverse charge, a supplier's bill, the
  // scrap's), or what was handed over with the TDS; the table adds up to it and the breakup starts from it
  const gross = r.rcm
    ? round(r.rcm.taxable + r.rcm.gst)
    : r.bill
      ? round(r.bill.taxable + r.bill.gst)
      : r.gst
        ? round(r.gst.taxable + r.gst.cgst + r.gst.sgst + r.gst.igst)
        : round(r.amount + tds);
  // the lines; a single one shows the whole
  const found = particulars(r);
  const lines: [string, number][] = found.length === 1 ? [[found[0]![0], gross]] : found;
  // with GST (reverse charge, or the scrap's): its code, taxable value, rate and each tax get columns, as the invoice's
  const half = r.rcm ? round(r.rcm.gst / 2) : 0;
  const gstCols = r.rcm
    ? {
        code: "SAC",
        value: r.rcm.sac,
        taxable: r.rcm.taxable,
        rate: r.rcm.rate,
        taxes: (r.rcm.otherState
          ? [["IGST", r.rcm.gst]]
          : [
              ["CGST", half],
              ["SGST", round(r.rcm.gst - half)],
            ]) as [string, number][],
      }
    : r.gst
      ? {
          code: "HSN",
          value: r.gst.hsn,
          taxable: r.gst.taxable,
          rate: r.gst.rate,
          taxes: (r.gst.igst > 0
            ? [["IGST", r.gst.igst]]
            : [
                ["CGST", r.gst.cgst],
                ["SGST", r.gst.sgst],
              ]) as [string, number][],
        }
      : null;
  // the breakup: Total, then what came off it (reverse-charge GST paid by us, the TDS), when anything did
  const off: BreakupRow[] = [
    ...(r.rcm
      ? [
          {
            key: "rcm",
            label: ownWords("lessRcm", { rate: String(r.rcm.rate) }),
            value: `− ₹${money(r.rcm.gst)}`,
          },
        ]
      : []),
    ...(tds > 0
      ? [
          {
            key: "tds",
            label: isPayment
              ? ownWords("lessTds", { rate: String(r.tdsRate ?? 0) })
              : base("lessTds", { rate: String(r.tdsRate ?? 0) }),
            value: `− ₹${money(tds)}`,
          },
        ]
      : []),
  ];
  const breakup: BreakupRow[] =
    off.length > 0 ? [{ key: "total", label: base("total"), value: `₹${money(gross)}` }, ...off] : [];
  // a column head in the particulars
  const thCell = cn(cell, "border-r font-semibold");
  const cancelled = r.status === "cancelled";
  // who it was with: GSTIN or unregistered (reverse charge), the address, PAN, GSTIN and phone, a line each
  const partyLines = (
    <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
      {r.rcm && !p?.address?.gstin && <span>{r.rcm.supplierGstin ? `GSTIN : ${r.rcm.supplierGstin}` : ownWords("unregistered")}</span>}
      {p?.address && (
        <>
          <span className="flex items-start gap-1.5">
            <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {[p.address.line1, p.address.line2, `${p.address.city} - ${p.address.postalCode}`]
              .filter(Boolean)
              .map((part) => titleCase(part!))
              .join(", ")}
          </span>
          <span>
            {t("state")}: {p.address.state} {t("code")}: {p.address.stateCode}
          </span>
        </>
      )}
      {r.tdsPan && <span>PAN : {r.tdsPan}</span>}
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
  );

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to the receipt's page, sending it on WhatsApp, and the download; on a phone each button is full width,
          under the back link */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {shared ? (
          <span className="hidden sm:block" />
        ) : (
          <Link
            href={h ? "/history" : `/transaction/${flow}/${id}`}
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden /> {h ? th("title") : t("back")}
          </Link>
        )}
        {/* (from History, on a phone the buttons sit two to a row) */}
        <div className={cn(h ? "grid grid-cols-2" : "flex flex-col", "gap-2 sm:flex sm:flex-row sm:items-center")}>
          {!shared && !(h && cancelled) && (
            <button
              type="button"
              disabled={!link.key}
              onClick={() => window.open(whatsAppLink(r, link.key!, t), "_blank", "noopener")}
              aria-label={t("whatsApp")}
              className={pill}
            >
              {/* "Share on", then the icon that says where */}
              <span className="whitespace-nowrap">{base("shareOn")}</span>
              <WhatsAppIcon className="size-4 shrink-0" />
            </button>
          )}
          {/* the download: the GST copy kept as a file where there is one (the admin's), or the page printed as a PDF */}
          {storedCopy?.url ? (
            <a
              href={storedCopy.url}
              target="_blank"
              rel="noreferrer"
              className={pill}
            >
              <Download className="size-4" aria-hidden /> {t("download")}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => window.print()}
              className={pill}
            >
              <Download className="size-4" aria-hidden /> {t("download")}
            </button>
          )}
          {/* Edit receipt (the admin's, from History): greyed for a scrap sale once its GSTR-1 month is filed; a tap or
              hover says why */}
          {h &&
            !isPayment &&
            history.isAdmin &&
            !cancelled &&
            (record?.cancelBlockedBy === "gstFiled" ? (
              <BlockedButton className={pill} reason={th("editBlocked.gstFiledScrap")}>
                <Pencil className="size-4" aria-hidden /> {th("editReceipt")}
              </BlockedButton>
            ) : (
              <Link href={`/history/${id}/edit`} className={pill}>
                <Pencil className="size-4" aria-hidden /> {th("editReceipt")}
              </Link>
            ))}
        </div>
      </div>
      {/* a cancelled one: when, by whom and why; an edited one: when it was last edited, and by whom */}
      {record && cancelled && <CancelledNote at={record.cancelledAt} by={record.cancelledByName} reason={record.cancelReason} />}
      {record?.lastEditedAt && record.lastEditedByName && <EditedNote at={record.lastEditedAt} by={record.lastEditedByName} />}

      {/* the voucher itself: the same frame as the sale invoice; only the table's columns and the breakup differ */}
      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <DocHead
          title={r.rcm ? ownWords("selfInvoiceTitle") : r.gst ? t("taxInvoiceTitle") : t("title")}
          screenTitle={h ? th(isPayment ? "payment.title" : "receipt.title") : undefined}
          jurisdiction={t("jurisdiction", { place: r.company.jurisdiction })}
        />

        <div className="border border-chestnut/40">
          {/* on the screen (History): who it was with, beside what it was for, its ID, day and remarks (when typed) */}
          {h && (
            <div className="grid border-b border-chestnut/40 sm:grid-cols-2 print:hidden">
              <div className="flex min-w-0 flex-col border-b border-chestnut/40 sm:border-b-0 sm:border-r">
                <p className={cn(band, "break-words")}>
                  {t("from")}: {fromName}
                </p>
                {partyLines}
              </div>
              <div className="grid grid-cols-[auto_1fr] content-start [&>*:nth-child(2n)]:border-r-0 [&>*:nth-last-child(-n+2)]:border-b-0">
                <Detail label={t("for")} value={<span className="font-bold">{tk(r.kind as never)}</span>} />
                <Detail label={th("receipt.transactionId")} value={<span className="font-bold">{r.assignedId}</span>} />
                <Detail label={t("dated")} value={dated(r.dateTime)} />
                {r.remarks && <Detail label={t("remarks")} value={r.remarks} />}
              </div>
            </div>
          )}
          {/* our details, and the voucher's with the remarks under them (printed only, from History) */}
          <div className={cn("grid sm:grid-cols-[1fr_1.5fr]", h && "hidden print:grid")}>
            <div className="flex min-w-0 flex-col border-b border-chestnut/40 sm:border-r">
              <p className={band}>{r.company.name}</p>
              <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
                <span>{r.company.address}</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" aria-hidden /> {r.company.phone}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <Mail className="size-3.5 shrink-0" aria-hidden />{" "}
                  <span className="min-w-0 break-all">{r.company.email}</span>
                </span>
                <span>
                  {t("state")}: {r.company.state} {t("code")}: {r.company.stateCode}
                </span>
                <span>GSTIN : {r.company.gstin}</span>
                <span>FSSAI No : {r.company.fssai}</span>
              </div>
            </div>
            <div className="flex min-w-0 flex-col border-b border-chestnut/40">
              <div className="grid grid-cols-[auto_1fr] content-start [&>*:nth-child(2n)]:border-r-0 sm:grid-cols-[auto_1fr_auto_1fr] sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(4n)]:border-r-0">
                <Detail
                  label={t("number")}
                  value={<span className="font-bold">{r.assignedId}</span>}
                />
                <Detail label={t("dated")} value={dated(r.dateTime)} />
                <Detail label={t("for")} value={tk(r.kind as never)} />
                <Detail
                  label={t("mode")}
                  value={((bankWord) =>
                    r.settledIn === "cash"
                      ? t("cash")
                      : r.settledIn === "bank"
                        ? bankWord
                        : `${t("cash")} + ${bankWord}`)(
                    r.bankMode ? t(`modes.${r.bankMode}`) : t("bank"),
                  )}
                />
                {/* a receipt's reference: the bank's, or else the cash part's bill or voucher number (payments take none) */}
                {!isPayment && (
                  <>
                    <Detail
                      label={t("reference")}
                      value={r.referenceNumber ?? r.cashReferenceNumber}
                    />
                    <Detail
                      label={t("dated")}
                      value={(r.referenceNumber ?? r.cashReferenceNumber) ? dated(r.dateTime) : null}
                    />
                  </>
                )}
                {/* each more account's reference, on a receipt */}
                {!isPayment &&
                  (r.moreBankParts ?? []).map((m) => (
                    <Fragment key={m.bankDetailsId}>
                      <Detail label={t("reference")} value={m.referenceNumber} />
                      <Detail label={t("dated")} value={m.referenceNumber ? dated(r.dateTime) : null} />
                    </Fragment>
                  ))}
                {/* reverse charge: this is also our self-invoice */}
                {r.rcm && (
                  <>
                    <Detail label={ownWords("selfInvoiceNo")} value={r.assignedId} />
                    <Detail label="RCM" value={ownWords("yes")} />
                    <Detail
                      label={ownWords("placeOfSupply")}
                      value={`${r.company.state} (${r.company.stateCode})`}
                    />
                    <Detail label="SAC" value={r.rcm.sac} />
                  </>
                )}
              </div>
              <Remarks label={t("remarks")} text={r.remarks} />
            </div>
          </div>

          {/* who it was paid to or received from, the full width (from History: printed only) */}
          <div className={cn("flex min-w-0 flex-col border-b border-chestnut/40", h && "hidden print:flex")}>
            <p className={cn(band, "break-words")}>
              {t("from")}: {fromName}
            </p>
            {partyLines}
          </div>

          {/* the particulars: with GST, its code, taxable value, rate and each tax get columns; the last column is the
              whole, and the breakup's figures sit under it */}
          <div className="overflow-x-auto">
            <table className={cn("tabular w-full border-collapse", gstCols && "min-w-[40rem]")}>
              <thead>
                <tr className="border-b border-chestnut/40 text-left">
                  <th className={cn(thCell, "w-12")}>{t("sl")}</th>
                  <th className={thCell}>{t("particularsHead")}</th>
                  {gstCols && (
                    <>
                      <th className={thCell}>{gstCols.code}</th>
                      <th className={cn(thCell, "text-right")}>{ownWords("taxableValue")}</th>
                      <th className={cn(thCell, "text-right")}>GST %</th>
                      {gstCols.taxes.map(([tax]) => (
                        <th key={tax} className={cn(th, "text-right")}>
                          {tax}
                        </th>
                      ))}
                    </>
                  )}
                  <th className={cn(cell, LAST_COL, "text-right font-semibold")}>
                    {gstCols ? base("total") : t("amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map(([words, amount], i) => (
                  <tr key={i} className="align-top">
                    <td className={cn(cell, "border-r")}>{i + 1}</td>
                    <td className={cn(cell, "border-r")}>{words}</td>
                    {gstCols && (
                      <>
                        <td className={cn(cell, "border-r")}>{gstCols.value}</td>
                        <td className={cn(cell, "border-r text-right")}>{money(gstCols.taxable)}</td>
                        <td className={cn(cell, "border-r text-right")}>{gstCols.rate}%</td>
                        {gstCols.taxes.map(([tax, amt]) => (
                          <td key={tax} className={cn(cell, "border-r text-right")}>
                            {money(amt)}
                          </td>
                        ))}
                      </>
                    )}
                    <td className={cn(cell, "text-right")}>{money(amount)}</td>
                  </tr>
                ))}
                {/* room below the lines, as on the invoice */}
                <tr aria-hidden>
                  {Array.from({ length: gstCols ? 5 + gstCols.taxes.length : 2 }, (_, i) => (
                    <td key={i} className="h-14 border-r border-chestnut/40" />
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {/* where it was paid from or received in, beside the breakup (above it on a phone) */}
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0 border-b border-chestnut/40 sm:border-b-0 sm:border-r">
              <Sources r={r} label={t("receivedIn")} />
            </div>
            <Breakup
              rows={breakup}
              label={h ? ti("amount") : isPayment ? ownWords("amountPaid") : base("amountIn")}
              amount={`₹${money(r.amount)}`}
            />
          </div>

          {/* the amount in words: the chestnut figure */}
          <div className={cn("grid border-t border-chestnut/40 sm:grid-cols-[12rem_1fr]", h && "hidden print:grid")}>
            <span className={cn(cell, "font-semibold sm:border-r")}>{t("inWords")}</span>
            <span className={cell}>{amountInWords(r.amount)}</span>
          </div>

          {/* the GST on the supplier's bill */}
          {r.bill && (
            <p className={cn(cell, "border-t")}>
              {ownWords("billGst", {
                number: r.bill.number,
                gstin: r.bill.gstin,
                rate: r.bill.rate,
                gst: `₹${money(r.bill.gst)}`,
              })}
            </p>
          )}
        </div>

        {/* computer generated, and the signatures */}
        <p className={cn("pt-2 font-semibold", h && "hidden print:block")}>{t("computerGenerated")}</p>
        <div className={cn("mt-12 flex items-end justify-between gap-6", h && "hidden print:flex")}>
          <p>
            {t("receivedBy")}: {r.createdByName}
          </p>
          {r.rcm && <p className="font-semibold">{t("signatory")}</p>}
          <p className="font-semibold">{isPayment ? t("receiverSign") : t("signatory")}</p>
        </div>

        {/* cancelled: stamped across it */}
        {r.status === "cancelled" && (
          <p
            aria-label={t("cancelled")}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <span className="-rotate-12 rounded-control border-4 border-danger px-6 py-2 font-heading text-4xl font-bold uppercase tracking-widest text-danger opacity-80">
              {t("cancelled")}
            </span>
          </p>
        )}
      </article>

      {/* and its edits */}
      {record && <EditLog edits={record.edits} />}
    </main>
  );
}
