"use client";

import { Fragment } from "react";

import { ArrowLeft, CircleAlert, Download, Flag, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/spinner";
import { WhatsAppIcon } from "~/components/ui/whatsapp-icon";
import { amountInWords } from "~/lib/amount-words";
import { useBankName } from "~/lib/bank-names";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
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

// a figure in the strip that adds up to Total
export const total = "tabular font-heading text-base font-bold sm:text-lg";

// the voucher's lines and boxes
export const cell = "border-chestnut/40 px-2 py-1.5";
export const band =
  "bg-chestnut px-2 py-1.5 font-heading text-base font-bold text-ivory print:bg-[#3b1f14]";

// one label and its value in the details grid
export function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span className={cn(cell, "border-b border-r font-medium")}>{label}</span>
      <span className={cn(cell, "border-b border-r tabular")}>{value ?? "—"}</span>
    </>
  );
}

// where the money was received: our bank account (its bank, A/c and IFSC), or cash; a payment from both shows the
// cash part first, then the bank with its part
function ReceivedIn({ r, label, className }: { r: Voucher; label: string; className?: string }) {
  // bank names in the language picked
  const bankName = useBankName();
  const t = useTranslations("transactions.voucher");
  const both = r.settledIn === "cashAndBank";
  const more = r.moreBankParts ?? [];
  // each account's part shows when there's cash too, or more than one account
  const withAmounts = both || more.length > 0;
  const firstAmount = (r.bankAmount ?? 0) - more.reduce((sum, m) => sum + m.amount, 0);
  return (
    <div className={cn("grid grid-cols-[auto_1fr] content-start border-chestnut/40", className)}>
      {both && (
        <>
          <span className={cn(cell, "border-b border-r font-medium")}>{label}</span>
          <span className={cn(cell, "border-b tabular")}>
            {t("cash")} ₹ {money(r.cashAmount ?? 0)}
          </span>
        </>
      )}
      {r.bank ? (
        <>
          <span className={cn(cell, "border-b border-r font-medium")}>
            {both ? t("bank") : label}
          </span>
          <span className={cn(cell, "border-b")}>
            {bankName(r.bank.name)}
            {withAmounts && <span className="tabular"> ₹ {money(firstAmount)}</span>}
          </span>
          <span className={cn(cell, "border-b border-r font-medium")}>{t("account")}</span>
          <span className={cn(cell, "border-b tabular")}>•••• {r.bank.last4}</span>
          <span className={cn(cell, "border-r font-medium", more.length > 0 && "border-b")}>
            {t("ifsc")}
          </span>
          <span className={cn(cell, "tabular", more.length > 0 && "border-b")}>
            {r.bank.ifsc ?? "—"}
          </span>
          {/* each more account, the same way */}
          {more.map((m, i) => {
            const last = i === more.length - 1;
            return (
              <Fragment key={m.bankDetailsId}>
                <span className={cn(cell, "border-b border-r font-medium")}>{t("bank")}</span>
                <span className={cn(cell, "border-b")}>
                  {bankName(m.name)}
                  <span className="tabular"> ₹ {money(m.amount)}</span>
                </span>
                <span className={cn(cell, "border-b border-r font-medium")}>{t("account")}</span>
                <span className={cn(cell, "border-b tabular")}>•••• {m.last4}</span>
                <span className={cn(cell, "border-r font-medium", !last && "border-b")}>
                  {t("ifsc")}
                </span>
                <span className={cn(cell, "tabular", !last && "border-b")}>{m.ifsc ?? "—"}</span>
              </Fragment>
            );
          })}
        </>
      ) : (
        <>
          <span className={cn(cell, "border-r font-medium")}>{label}</span>
          <span className={cell}>{t("cash")}</span>
        </>
      )}
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
      // more than they owed: the due part (less the TDS, which has its own line) and the advance, a line each
      if (r.split) {
        const due = Math.max(0, Math.round((r.split.due - (r.tdsAmount ?? 0)) * 100) / 100);
        const advance = Math.round((r.amount - due) * 100) / 100;
        return [
          ...(due > 0 ? [[t("customer"), due] as [string, number]] : []),
          [t("advance"), advance],
        ];
      }
      return [[t(r.kind as never), r.amount]];
    }
    // more than we owed: the due part (less the TDS) and the advance paid, a line each
    if (r.kind === "supplier" && r.split) {
      const due = Math.max(0, Math.round((r.split.due - (r.tdsAmount ?? 0)) * 100) / 100);
      const advance = Math.round((r.amount - due) * 100) / 100;
      return [
        ...(due > 0 ? [[tp("supplier"), due] as [string, number]] : []),
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

// a receipt's voucher, laid out like our tax invoice: our details and the voucher's, who it came from with the
// remarks beside it, the particulars, where it was received with the totals, the amount in words, and signatures.
// It prints (or saves as a PDF) on its own. With a share key it's the customer's copy, opened from a link without a
// login: only the download, no way back into the app and nothing to share
export function ReceiptVoucher({
  id,
  shareKey,
  flow = "receipt",
}: {
  id: string;
  shareKey?: string;
  flow?: "receipt" | "payment";
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
  const shared = shareKey !== undefined;
  const isPayment = flow === "payment";
  const receiptOwn = trpc.transactions.receipt.get.useQuery(
    { transactionId: id },
    { enabled: !shared && !isPayment },
  );
  const receiptTheirs = trpc.transactions.receipt.shared.useQuery(
    { transactionId: id, key: shareKey ?? "" },
    { enabled: shared && !isPayment, retry: false },
  );
  const paymentOwn = trpc.transactions.payment.get.useQuery(
    { transactionId: id },
    { enabled: !shared && isPayment },
  );
  const paymentTheirs = trpc.transactions.payment.shared.useQuery(
    { transactionId: id, key: shareKey ?? "" },
    { enabled: shared && isPayment, retry: false },
  );
  const receipt = isPayment
    ? shared
      ? paymentTheirs
      : paymentOwn
    : shared
      ? receiptTheirs
      : receiptOwn;
  // the key for the link sent on WhatsApp
  const receiptLink = trpc.transactions.receipt.shareKey.useQuery(
    { transactionId: id },
    { enabled: !shared && !isPayment },
  );
  const paymentLink = trpc.transactions.payment.shareKey.useQuery(
    { transactionId: id },
    { enabled: !shared && isPayment },
  );
  const link = isPayment ? paymentLink : receiptLink;
  // a payment under reverse charge has a copy kept as a file, once the job has stored it; the newest version comes first
  const documents = trpc.transactions.history.documents.useQuery(
    { transactionId: id },
    { enabled: !shared && !!paymentOwn.data?.rcm, retry: false },
  );
  const storedCopy = documents.data?.[0];

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

  const r = isPayment ? fromPayment(receipt.data as Payment) : fromReceipt(receipt.data as Receipt);
  const p = r.party;
  // what it comes to with TDS and reverse-charge GST, as on the payment form
  const settled = Math.round((r.amount + (r.tdsAmount ?? 0) + (r.rcm?.gst ?? 0)) * 100) / 100;
  const fromName = p ? (p.shortName ?? titleCase(p.name.toLowerCase())) : titleCase(r.counterName);
  const lines = particulars(r);
  // a payment as the template lays it out: its value before tax, what came off or went on, and each tax
  const tds = r.tdsAmount ?? 0;
  const value = r.rcm?.taxable ?? r.bill?.taxable ?? Math.round((r.amount + tds) * 100) / 100;
  const taxed = isPayment && (tds > 0 || !!r.rcm);
  const worked = taxed || !!r.bill;
  // taxable value only where there's GST
  const valueWord = r.rcm || r.bill || r.gst ? ownWords("taxableValue") : t("amount");
  // a scrap sale's GST rows: CGST + SGST within our state, IGST outside it
  const saleGst: [string, number, number][] = r.gst
    ? r.gst.igst > 0
      ? [["IGST", r.gst.rate, r.gst.igst]]
      : [
          ["CGST", r.gst.rate / 2, r.gst.cgst],
          ["SGST", r.gst.rate / 2, r.gst.sgst],
        ]
    : [];
  // the code beside each line: a service's SAC (reverse charge) or the scrap's HSN
  const code = r.rcm ? { head: "SAC", value: r.rcm.sac } : r.gst ? { head: "HSN", value: r.gst.hsn } : null;
  const half = r.rcm ? Math.round((r.rcm.gst / 2) * 100) / 100 : 0;
  // the TDS row's base: what its rate is on, the period's whole once past a limit
  const tdsOn = r.tdsRate ? Math.round((tds / r.tdsRate) * 10000) / 100 : 0;
  const taxRows: [string, string, number, number, number, string][] = [
    ...(tds > 0
      ? ([["TDS", "", r.tdsRate ?? 0, tdsOn, tds, ownWords("toIncomeTax")]] as [
          string,
          string,
          number,
          number,
          number,
          string,
        ][])
      : []),
    ...(r.rcm
      ? r.rcm.otherState
        ? ([
            [
              "IGST",
              ownWords("reverseCharge"),
              r.rcm.rate,
              r.rcm.taxable,
              r.rcm.gst,
              ownWords("toGst"),
            ],
          ] as [string, string, number, number, number, string][])
        : (["CGST", "SGST"].map((tax) => [
            tax,
            ownWords("reverseCharge"),
            r.rcm!.rate / 2,
            r.rcm!.taxable,
            half,
            ownWords("toGst"),
          ]) as [string, string, number, number, number, string][])
      : []),
  ];

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
            href={`/transaction/${flow}/${id}`}
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden /> {t("back")}
          </Link>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!shared && (
            <button
              type="button"
              disabled={!link.data}
              onClick={() => window.open(whatsAppLink(r, link.data!.key, t), "_blank", "noopener")}
              aria-label={t("whatsApp")}
              className="on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4"
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
              className="on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut sm:px-4"
            >
              <Download className="size-4" aria-hidden /> {t("download")}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => window.print()}
              className="on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut sm:px-4"
            >
              <Download className="size-4" aria-hidden /> {t("download")}
            </button>
          )}
        </div>
      </div>

      {/* the voucher itself */}
      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <p className="pb-2 text-center font-heading text-2xl font-bold">
          {r.rcm ? ownWords("selfInvoiceTitle") : r.gst ? t("taxInvoiceTitle") : t("title")}
        </p>

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
              <p className={cn(cell, "mt-auto border-t font-semibold")}>
                {t("jurisdiction", { place: r.company.jurisdiction })}
              </p>
            </div>
            <div className="grid grid-cols-[auto_1fr] content-start border-b border-chestnut/40 [&>*:nth-child(2n)]:border-r-0 sm:grid-cols-[auto_1fr_auto_1fr] sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(4n)]:border-r-0">
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
              {/* each more account: how it paid (and on a receipt, its reference) */}
              {(r.moreBankParts ?? []).map((m) => (
                <Fragment key={m.bankDetailsId}>
                  <Detail label={t("mode")} value={t(`modes.${m.mode}`)} />
                  {!isPayment && <Detail label={t("reference")} value={m.referenceNumber} />}
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
          </div>

          {/* who it came from, with the remarks beside it */}
          <div className="grid border-b border-chestnut/40 sm:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col border-b border-chestnut/40 sm:border-b-0 sm:border-r">
              <p className={band}>
                {t("from")}: {fromName}
              </p>
              <div className={cn(cell, "flex flex-col gap-0.5")}>
                {p?.shortName && <span className="font-medium">{p.name}</span>}
                {r.rcm && !p?.address?.gstin && (
                  <span>
                    {r.rcm.supplierGstin
                      ? `GSTIN : ${r.rcm.supplierGstin}`
                      : ownWords("unregistered")}
                  </span>
                )}
                {p?.address && (
                  <>
                    <span className="flex items-start gap-1.5">
                      <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {[
                        p.address.line1,
                        p.address.line2,
                        `${p.address.city} - ${p.address.postalCode}`,
                      ]
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
            </div>
            <div className={cn(cell, "flex flex-col gap-1")}>
              <span className="font-semibold">{t("remarks")}:</span>
              <span>{r.remarks ?? "—"}</span>
            </div>
          </div>

          {/* on phones: where it was received, right after the remarks */}
          <ReceivedIn r={r} label={t("receivedIn")} className="border-b sm:hidden" />

          {/* the particulars */}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-chestnut/40 text-left">
                <th className={cn(cell, "w-12 border-r font-semibold")}>{t("sl")}</th>
                <th className={cn(cell, "border-r font-semibold")}>{t("particularsHead")}</th>
                {code && <th className={cn(cell, "w-20 border-r font-semibold")}>{code.head}</th>}
                <th className={cn(cell, "w-40 text-right font-semibold")}>
                  {worked || r.gst ? valueWord : t("amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map(([words, amount], i) => (
                <tr key={i} className="align-top">
                  <td className={cn(cell, "border-r")}>{i + 1}</td>
                  <td className={cn(cell, "border-r")}>{words}</td>
                  {code && <td className={cn(cell, "tabular border-r")}>{code.value}</td>}
                  <td className={cn(cell, "tabular text-right")}>
                    {money(isPayment && worked ? value : amount)}
                  </td>
                </tr>
              ))}
              {!isPayment && r.tdsAmount !== null && (
                <tr className="align-top">
                  <td className={cn(cell, "border-r")}>{lines.length + 1}</td>
                  <td className={cn(cell, "border-r")}>{t("tdsLine", { rate: r.tdsRate ?? 0 })}</td>
                  <td className={cn(cell, "tabular text-right")}>{money(r.tdsAmount)}</td>
                </tr>
              )}
              {/* room below the lines, as on the invoice */}
              <tr aria-hidden>
                <td className="h-16 border-r border-chestnut/40" />
                <td className="border-r border-chestnut/40" />
                {code && <td className="border-r border-chestnut/40" />}
                <td />
              </tr>
            </tbody>
          </table>

          {/* where it was received (on phones it sits after the remarks instead), and the totals */}
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[1fr_1.5fr]">
            <ReceivedIn r={r} label={t("receivedIn")} className="hidden sm:grid sm:border-r" />
            <div className="grid grid-cols-[1fr_9rem] content-start">
              {/* a payment: its value, what came off it, and what was paid */}
              {isPayment && (tds > 0 || r.bill) && (
                <>
                  <span className={cn(cell, "border-b border-r text-right")}>{valueWord}</span>
                  <span className={cn(cell, "border-b tabular text-right")}>{money(value)}</span>
                </>
              )}
              {r.bill && (
                <>
                  <span className={cn(cell, "border-b border-r text-right")}>
                    {ownWords("billRow", { rate: r.bill.rate })}
                  </span>
                  <span className={cn(cell, "border-b tabular text-right")}>
                    {money(r.bill.gst)}
                  </span>
                </>
              )}
              {isPayment && tds > 0 && (
                <>
                  <span className={cn(cell, "border-b border-r text-right")}>
                    {ownWords("lessTds", { rate: r.tdsRate ?? 0 })}
                  </span>
                  <span className={cn(cell, "border-b tabular text-right")}>({money(tds)})</span>
                </>
              )}
              {/* a scrap sale: its value before GST and each GST, then what was received */}
              {r.gst && (
                <>
                  <span className={cn(cell, "border-b border-r text-right")}>{valueWord}</span>
                  <span className={cn(cell, "border-b tabular text-right")}>
                    {money(r.gst.taxable)}
                  </span>
                  {saleGst.map(([tax, rate, amount]) => (
                    <Fragment key={tax}>
                      <span className={cn(cell, "border-b border-r text-right")}>
                        {t("gstRow", { tax, rate: String(rate) })}
                      </span>
                      <span className={cn(cell, "border-b tabular text-right")}>{money(amount)}</span>
                    </Fragment>
                  ))}
                </>
              )}
              <span
                className={cn(cell, "border-r text-right font-semibold", !isPayment && "border-b")}
              >
                {t("amountReceived")}
              </span>
              <span
                className={cn(cell, "tabular text-right font-semibold", !isPayment && "border-b")}
              >
                {money(r.amount)}
              </span>
              {/* a receipt: the TDS the customer took, and what it settled */}
              {!isPayment && r.tdsAmount !== null && (
                <>
                  <span className={cn(cell, "border-b border-r text-right font-semibold")}>
                    {t("tdsDeducted")}
                  </span>
                  <span className={cn(cell, "border-b tabular text-right")}>
                    {money(r.tdsAmount)}
                  </span>
                  <span className={cn(cell, "border-r text-right font-semibold")}>
                    {t("totalSettled")}
                  </span>
                  <span className={cn(cell, "tabular text-right font-bold")}>{money(settled)}</span>
                </>
              )}
            </div>
          </div>

          {/* each tax: its basis, rate, what it's on, and where it goes */}
          {taxed && (
            <div className="border-t border-chestnut/40">
              <p className={cn(cell, "border-b bg-chestnut/[0.06] font-semibold")}>
                {ownWords("taxBreakdown")}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse">
                  <thead>
                    <tr className="border-b border-chestnut/40 text-left">
                      <th className={cn(cell, "border-r font-semibold")}>{ownWords("tax")}</th>
                      <th className={cn(cell, "border-r font-semibold")}>{ownWords("basis")}</th>
                      <th className={cn(cell, "border-r text-right font-semibold")}>
                        {ownWords("rate")}
                      </th>
                      <th className={cn(cell, "border-r text-right font-semibold")}>
                        {ownWords("on")}
                      </th>
                      <th className={cn(cell, "border-r text-right font-semibold")}>
                        {t("amount")}
                      </th>
                      <th className={cn(cell, "font-semibold")}>{ownWords("goesTo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxRows.map(([tax, basis, rate, on, amount, goes]) => (
                      <tr key={tax} className="align-top">
                        <td className={cn(cell, "border-r")}>{tax}</td>
                        <td className={cn(cell, "border-r")}>{basis}</td>
                        <td className={cn(cell, "tabular border-r text-right")}>{rate}%</td>
                        <td className={cn(cell, "tabular border-r text-right")}>{money(on)}</td>
                        <td className={cn(cell, "tabular border-r text-right")}>{money(amount)}</td>
                        <td className={cell}>{goes}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-chestnut/40 font-bold">
                      <td colSpan={4} className={cn(cell, "border-r")}>
                        {ownWords("taxToDeposit")}
                      </td>
                      <td className={cn(cell, "tabular border-r text-right")}>
                        {money(tds + (r.rcm?.gst ?? 0))}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* what it all comes to: on a phone the parts share a row and Total takes the full width below them */}
              <div className="flex flex-col border-t border-chestnut/40 sm:flex-row">
                <div className="flex min-w-0 border-b border-chestnut/40 sm:contents">
                  <p
                    className={cn(
                      cell,
                      "flex min-w-0 flex-1 flex-col border-r last:border-r-0 sm:last:border-r",
                    )}
                  >
                    <span className="text-xs">
                      {ownWords(r.rcm?.service === "rent" ? "paidToLandlord" : "amountPaid")}
                    </span>
                    <span className={total}>₹{money(r.amount)}</span>
                  </p>
                  {tds > 0 && (
                    <p
                      className={cn(
                        cell,
                        "flex min-w-0 flex-1 flex-col border-r last:border-r-0 sm:last:border-r",
                      )}
                    >
                      <span className="text-xs">TDS {r.tdsRate}%</span>
                      <span className={total}>₹{money(tds)}</span>
                    </p>
                  )}
                  {r.rcm && (
                    <p
                      className={cn(
                        cell,
                        "flex min-w-0 flex-1 flex-col border-r last:border-r-0 sm:last:border-r",
                      )}
                    >
                      <span className="text-xs">RCM GST {r.rcm.rate}%</span>
                      <span className={total}>₹{money(r.rcm.gst)}</span>
                    </p>
                  )}
                </div>
                <p
                  className={cn(
                    cell,
                    "flex min-w-0 flex-1 flex-col bg-chestnut text-ivory print:bg-[#3b1f14]",
                  )}
                >
                  <span className="text-xs">{ownWords("total")}</span>
                  <span className={total}>₹{money(settled)}</span>
                </p>
              </div>
            </div>
          )}

          {/* the amount in words */}
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[12rem_1fr]">
            <span className={cn(cell, "font-semibold sm:border-r")}>{t("inWords")}</span>
            <span className={cell}>{amountInWords(isPayment ? settled : r.amount)}</span>
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
        <p className="pt-2 font-semibold">{t("computerGenerated")}</p>
        <div className="mt-12 flex items-end justify-between gap-6">
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
    </main>
  );
}
