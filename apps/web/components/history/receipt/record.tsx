"use client";

import { ArrowLeft, CircleAlert, FileText, Pencil } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/icons/spinner";
import { useBankName } from "~/lib/bank-names";
import { rupees, titleCase } from "~/lib/format";
import type { HistoryTransaction } from "~/providers/history";
import { useSavedReceipt } from "~/providers/saved";

import { BlockedButton } from "../blocked-button";
import { CancelledNote } from "../cancelled-note";
import { DocStamp } from "../doc-stamp";
import { EditedNote } from "../edited-note";
import { EditLog } from "../edit-log";

// a button's look on the chestnut page, as on a purchase's
const pill = "on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4";

// /history/[id] for a receipt, in two columns: on the left (chestnut) only what it was received for, from whom and how
// much; on the right (ivory) how it came in (cash and each bank account, with how and its reference) and its details
// (ID, day, then what its kind adds: TDS, dues and advance, a loan's interest, a scrap sale's GST; phone, GSTIN, and
// remarks when typed). A phone stacks them. Back goes to History; the voucher opens; the admin's Edit receipt. Under it
// its edits. A cancelled one has its note and a CANCELLED stamp
export function ReceiptRecord({ id, history }: { id: string; history: { record: HistoryTransaction; isAdmin: boolean } }) {
  const t = useTranslations("history.receipt");
  const th = useTranslations("history");
  const tv = useTranslations("transactions.voucher");
  const tf = useTranslations("transactions.loan.frequencies");
  const locale = useLocale();
  const bankName = useBankName();
  const read = useSavedReceipt(id, true);

  if (read.loading)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {th("loading")}
      </p>
    );
  if (read.loadFailed || !read.saved)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {th("loadOneError")}
      </p>
    );

  const r = read.saved;
  const record = history.record;
  const cancelled = r.status === "cancelled";
  // who it came from: the party's full name, or the ledger's
  const from = r.party ? titleCase(r.party.name.toLowerCase()) : titleCase(r.receivedFromName);
  const day = new Date(r.dateTime).toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

  // how it came in: cash, then each bank account with how and its reference. An older bank receipt kept no account:
  // one Bank row with the whole, as on its voucher
  const firstBank = Math.round((r.bankAmount - r.moreBankParts.reduce((a, m) => a + m.amount, 0)) * 100) / 100;
  const oldBank = r.settledIn === "bank" && !r.bank;
  const came: Row[] = [
    ...(oldBank ? [{ key: "bank", label: tv("bank"), value: rupees(r.amount) }] : []),
    ...(!oldBank && r.cashAmount > 0 ? [{ key: "cash", label: tv("cash"), sub: r.cashReferenceNumber, value: rupees(r.cashAmount) }] : []),
    ...(r.bank
      ? [{ key: "bank", label: `${bankName(r.bank.name)} ••${r.bank.last4}`, sub: [r.bankMode ? tv(`modes.${r.bankMode}`) : null, r.referenceNumber].filter(Boolean).join(", ") || null, value: rupees(firstBank) }]
      : []),
    ...r.moreBankParts.map((m) => ({ key: m.bankDetailsId, label: `${bankName(m.name)} ••${m.last4}`, sub: [tv(`modes.${m.mode}`), m.referenceNumber].filter(Boolean).join(", "), value: rupees(m.amount) })),
  ];

  // its details: the ID and day, then what its kind adds, then phone, GSTIN and remarks
  const gst = r.gst;
  const details: Row[] = [
    { key: "id", label: t("id"), value: r.assignedId },
    { key: "date", label: t("date"), value: day },
    ...(r.tdsAmount ? [{ key: "tds", label: t("tds", { rate: r.tdsRate ?? 0 }), value: rupees(r.tdsAmount) }] : []),
    ...(r.split
      ? [
          { key: "due", label: t("towardsDues"), value: rupees(r.split.due) },
          { key: "advance", label: t("advance"), value: rupees(r.split.advance) },
        ]
      : []),
    ...(r.loan ? [{ key: "interest", label: t("interest"), value: t("interestValue", { rate: r.loan.interestRate, frequency: tf(r.loan.frequency).toLowerCase() }) }] : []),
    ...(gst
      ? [
          { key: "hsn", label: "HSN", value: gst.hsn },
          { key: "taxable", label: t("taxable"), value: rupees(gst.taxable) },
          ...(gst.igst > 0
            ? [{ key: "igst", label: `IGST ${gst.rate}%`, value: rupees(gst.igst) }]
            : [
                { key: "cgst", label: `CGST ${gst.rate / 2}%`, value: rupees(gst.cgst) },
                { key: "sgst", label: `SGST ${gst.rate / 2}%`, value: rupees(gst.sgst) },
              ]),
        ]
      : []),
    ...(r.partyPhone ? [{ key: "phone", label: t("phone"), value: `+91 ${r.partyPhone}` }] : []),
    ...(r.party?.address?.gstin ? [{ key: "gstin", label: "GSTIN", value: r.party.address.gstin }] : []),
    ...(r.remarks ? [{ key: "remarks", label: t("remarks"), value: r.remarks, wrap: true }] : []),
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to History, the voucher and (the admin's) Edit receipt; on a phone two to a row */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Link href="/history" className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
          <ArrowLeft className="size-4" aria-hidden /> {th("title")}
        </Link>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center">
          <Link href={`/transaction/receipt/${id}/voucher`} className={pill}>
            <FileText className="size-4" aria-hidden /> {t("voucher")}
          </Link>
          {/* Edit receipt: greyed for a scrap sale once its GSTR-1 month is filed; a tap or hover says why */}
          {history.isAdmin &&
            !cancelled &&
            (record.cancelBlockedBy === "gstFiled" ? (
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
      {/* a cancelled one: when, by whom and why */}
      {cancelled && <CancelledNote at={record.cancelledAt} by={record.cancelledByName} reason={record.cancelReason} />}
      {record.lastEditedAt && record.lastEditedByName && <EditedNote at={record.lastEditedAt} by={record.lastEditedByName} />}

      <article className="relative grid overflow-hidden rounded-control md:grid-cols-[1fr_1.2fr]">
        {/* the left: what it was received for, from whom, how much */}
        <div className="flex flex-col gap-2.5 rounded-t-control border border-ivory p-5 md:rounded-l-control md:rounded-tr-none">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ivory/75">{gst ? t("kinds.scrap") : t(`kinds.${r.receivedFor}`)}</span>
          <span className="break-words font-heading text-2xl font-bold leading-tight">{from}</span>
          <span className="tabular mt-1.5 font-heading text-4xl font-bold">{rupees(r.amount)}</span>
        </div>

        {/* the right: how it came in, then the details */}
        <div className="on-ivory flex flex-col gap-5 bg-ivory p-5 text-chestnut">
          <RowList title={t("howCameIn")} rows={came} />
          <RowList title={t("details")} rows={details} />
        </div>

        {cancelled && <DocStamp label={th("stamp")} tone="danger" />}
      </article>

      {/* and its edits */}
      <EditLog edits={record.edits} />
    </main>
  );
}

type Row = { key: string; label: string; sub?: string | null; value: string; wrap?: boolean };

// a group of rows under a small heading: the name (with a line under it, where there is one) on the left, the value on
// the right
function RowList({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-chestnut/65">{title}</h2>
      {rows.map((row) => (
        <p key={row.key} className="flex items-baseline justify-between gap-3 border-t border-chestnut/15 py-2.5 text-sm">
          <span className="min-w-0">
            {row.label}
            {row.sub && <span className="block text-xs text-chestnut/65">{row.sub}</span>}
          </span>
          <span className={row.wrap ? "min-w-0 text-right font-semibold" : "tabular shrink-0 text-right font-semibold"}>{row.value}</span>
        </p>
      ))}
    </section>
  );
}
