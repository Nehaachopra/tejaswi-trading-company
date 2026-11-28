"use client";

import { ArrowLeft, CircleAlert, Download, Mail, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/icons/spinner";
import { amountInWords } from "~/lib/amount-words";
import { useBankName } from "~/lib/bank-names";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";
import { useSalaryVoucher } from "~/providers/saved";

import { CancelledNote } from "../../../history/cancelled-note";
import { EditedNote } from "../../../history/edited-note";
import { EditLog } from "../../../history/edit-log";
import { Breakup, type BreakupRow, DocHead, LAST_COL, Remarks } from "../../done/document-parts";
import { band, cell, dated, Detail, money, pill } from "../../done/voucher";

// /history/[id] for a salary or an advance: laid out as a payment's voucher in History, with no Paid to. Paid for, the
// day and the remarks, with Paid from under them; then the table (Sl, the employee, their transaction ID, the amount), and the amount with any advance taken back off it. Back to History and the download at the
// top; no edit
// (`record`: opened from History, its screen look; none: the voucher page from the success card, shown as printed)
export function SalaryVoucher({ id, record, isAdmin = false }: { id: string; record?: HistoryTransaction; isAdmin?: boolean }) {
  const t = useTranslations("transactions.voucher");
  const tp = useTranslations("transactions.payment.voucher");
  const ts = useTranslations("transactions.salary.voucher");
  const tk = useTranslations("transactions.salary.kinds");
  const th = useTranslations("history");
  const bankName = useBankName();
  const { voucher: v, loading, loadFailed } = useSalaryVoucher(id);

  if (loading)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {t("loading")}
      </p>
    );
  if (loadFailed || !v)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
      </p>
    );

  const cancelled = v.status === "cancelled";
  const h = !!record;
  const gross = Math.round((v.amount + v.advanceTaken) * 100) / 100;
  // the breakup: Total, then the advance taken back, when there was one
  const breakup: BreakupRow[] =
    v.advanceTaken > 0
      ? [
          { key: "total", label: tp("total"), value: `₹${money(gross)}` },
          { key: "advance", label: ts("lessAdvance"), value: `− ₹${money(v.advanceTaken)}` },
        ]
      : [];
  // where it was paid from: cash (when any), then each bank account, with a Total row once there's more than one
  const sources = [
    ...(v.cashAmount > 0 || v.banks.length === 0 ? [{ key: "cash", name: t("cash"), mode: "—", account: "—", amount: v.cashAmount }] : []),
    ...v.banks.map((b, i) => ({
      key: `bank-${i}`,
      name: bankName(b.name),
      mode: b.mode ? t(`modes.${b.mode}`) : "—",
      account: `•••• ${b.last4}`,
      amount: b.amount,
    })),
  ];
  const thCell = cn(cell, "border-b border-r font-semibold last:border-r-0");
  const td = cn(cell, "border-r last:border-r-0");

  // Paid from: a row per place, a Total row once there's more than one
  const paidFrom = (
        <div className="flex min-w-0 flex-col">
      <p className={band}>{tp("receivedIn")}</p>
      <div className="overflow-x-auto">
        <table className="tabular w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={thCell}>{t("source")}</th>
              <th className={thCell}>{t("account")}</th>
              <th className={thCell}>{t("mode")}</th>
              <th className={cn(thCell, "text-right")}>{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((row, i) => (
              <tr key={row.key} className={cn(i < sources.length - 1 && "border-b border-chestnut/40")}>
                <td className={td}>{row.name}</td>
                <td className={cn(td, "whitespace-nowrap")}>{row.account}</td>
                <td className={td}>{row.mode}</td>
                <td className={cn(td, "text-right")}>{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
          {sources.length > 1 && (
            <tfoot>
              <tr className="border-t border-chestnut/40 font-bold">
                <td colSpan={3} className={td}>
                  {t("total")}
                </td>
                <td className={cn(td, "text-right")}>{money(v.amount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
  // how it was paid, as a payment's printed voucher says it: Cash, the bank's way, or the two
  const bankWord = v.banks[0]?.mode ? t(`modes.${v.banks[0].mode}`) : t("bank");
  const mode = v.banks.length === 0 ? t("cash") : v.cashAmount > 0 ? `${t("cash")} + ${bankWord}` : bankWord;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{th("payment.title")}</h1>

      {/* back to History, and the download */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Link href={h ? "/history" : `/transaction/payment/salary/${id}`} className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
          <ArrowLeft className="size-4" aria-hidden /> {h ? th("title") : t("back")}
        </Link>
        {/* the download, then Edit payment (the admin's, from History; not once cancelled) */}
        <div className={cn(h && isAdmin && !cancelled ? "grid grid-cols-2" : "flex flex-col", "gap-2 sm:flex sm:flex-row sm:items-center")}>
          <button type="button" onClick={() => window.print()} className={pill}>
            <Download className="size-4" aria-hidden /> {t("download")}
          </button>
          {h && isAdmin && !cancelled && (
            <Link href={`/history/${id}/edit`} className={pill}>
              <Pencil className="size-4" aria-hidden /> {th("editPayment")}
            </Link>
          )}
        </div>
      </div>
      {/* a cancelled one: when, by whom and why; an edited one: when it was last edited, and by whom */}
      {record && cancelled && <CancelledNote at={record.cancelledAt} by={record.cancelledByName} reason={record.cancelReason} />}
      {record?.lastEditedAt && record.lastEditedByName && <EditedNote at={record.lastEditedAt} by={record.lastEditedByName} />}

      {/* the voucher: the same frame as a payment's */}
      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <DocHead title={tp("title")} screenTitle={h ? th("payment.title") : undefined} jurisdiction={t("jurisdiction", { place: v.company.jurisdiction })} />

        <div className="border border-chestnut/40">
          {/* on the screen: as a payment's, two halves; Paid to's half left blank (salaries have no party block), what it
              was for, the day and remarks on the right with where it was paid from under them */}
          {h && (
          <div className="grid border-b border-chestnut/40 sm:grid-cols-2 print:hidden">
            <div aria-hidden className="hidden sm:block sm:border-r sm:border-chestnut/40" />
            <div className="flex min-w-0 flex-col">
              <div className="grid grid-cols-[auto_1fr] content-start border-b border-chestnut/40 [&>*:nth-child(2n)]:border-r-0 [&>*:nth-last-child(-n+2)]:border-b-0">
                <Detail label={tp("for")} value={<span className="font-bold">{v.kind === "advance" ? ts("advanceLine") : tk("salary")}</span>} />
                <Detail label={t("dated")} value={dated(v.dateTime)} />
                {v.remarks && <Detail label={t("remarks")} value={v.remarks} />}
              </div>
              {paidFrom}
            </div>
          </div>
          )}

          {/* printed: our details, beside the voucher's (the day, what for, how) with the remarks and Paid from under them,
              as a payment's printed voucher */}
          <div className={cn("grid sm:grid-cols-[1fr_1.5fr]", h && "hidden print:grid")}>
            <div className="flex min-w-0 flex-col border-b border-r border-chestnut/40">
              <p className={band}>{v.company.name}</p>
              <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
                <span>{v.company.address}</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" aria-hidden /> {v.company.phone}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="min-w-0 break-all">{v.company.email}</span>
                </span>
                <span>
                  {t("state")}: {v.company.state} {t("code")}: {v.company.stateCode}
                </span>
                <span>GSTIN : {v.company.gstin}</span>
                <span>FSSAI No : {v.company.fssai}</span>
              </div>
            </div>
            <div className="flex min-w-0 flex-col border-b border-chestnut/40">
              <div className="grid grid-cols-[auto_1fr_auto_1fr] content-start [&>*:nth-child(4n)]:border-r-0">
                <Detail label={t("dated")} value={dated(v.dateTime)} />
                <Detail label={tp("for")} value={v.kind === "advance" ? ts("advanceLine") : tk("salary")} />
                <Detail label={t("mode")} value={mode} />
                <span className={cn(cell, "border-b")} />
                <span className={cn(cell, "border-b")} />
              </div>
              <Remarks label={t("remarks")} text={v.remarks} />
              <div className="border-t border-chestnut/40">{paidFrom}</div>
            </div>
          </div>

          {/* the particulars: Sl, the employee, their transaction ID, the amount */}
          <div className="overflow-x-auto">
            <table className="tabular w-full border-collapse">
              <thead>
                <tr className="border-b border-chestnut/40 text-left">
                  <th className={cn(cell, "w-12 border-r font-semibold")}>{t("sl")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>{ts("employee")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>{th("receipt.transactionId")}</th>
                  <th className={cn(cell, LAST_COL, "text-right font-semibold")}>{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="align-top">
                  <td className={cn(cell, "border-r")}>1</td>
                  {/* the employee: their name, then their phone, then their address */}
                  <td className={cn(cell, "border-r")}>
                    <span className="block font-semibold">{titleCase(v.employee.name.toLowerCase())}</span>
                    {v.employee.phone && <span className="block text-xs opacity-75">+91 {v.employee.phone}</span>}
                    {v.employee.address && (
                      <span className="block text-xs opacity-75">
                        {[v.employee.address.line1, v.employee.address.line2, `${v.employee.address.city} - ${v.employee.address.postalCode}`]
                          .filter(Boolean)
                          .map((part) => titleCase(part!))
                          .join(", ")}
                      </span>
                    )}
                  </td>
                  {/* the employee's own payment number (each employee paid is a transaction of its own) */}
                  <td className={cn(cell, "border-r whitespace-nowrap font-bold")}>{v.assignedId}</td>
                  <td className={cn(cell, "text-right")}>{money(gross)}</td>
                </tr>
                {/* room below the row, as on the invoice */}
                <tr aria-hidden>
                  <td className="h-14 border-r border-chestnut/40" />
                  <td className="h-14 border-r border-chestnut/40" />
                  <td className="h-14 border-r border-chestnut/40" />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {/* the amount, alone on the right: any advance taken back off the total */}
          <div className="grid border-t border-chestnut/40 sm:flex sm:justify-end">
            <Breakup rows={breakup} label={tp("amountPaid")} amount={`₹${money(v.amount)}`} />
          </div>

          {/* printed: the amount in words */}
          <div className={cn("grid border-t border-chestnut/40 sm:grid-cols-[12rem_1fr]", h && "hidden print:grid")}>
            <span className={cn(cell, "font-semibold sm:border-r")}>{t("inWords")}</span>
            <span className={cell}>{amountInWords(v.amount)}</span>
          </div>
        </div>

        {/* printed: computer generated, who paid it and the receiver's signature */}
        <p className={cn("pt-2 font-semibold", h && "hidden print:block")}>{t("computerGenerated")}</p>
        <div className={cn("mt-12 flex items-end justify-between gap-6", h && "hidden print:flex")}>
          <p>
            {tp("receivedBy")}: {v.createdByName}
          </p>
          <p className="font-semibold">{tp("receiverSign")}</p>
        </div>

        {/* cancelled: stamped across it */}
        {cancelled && (
          <p aria-label={t("cancelled")} className="pointer-events-none absolute inset-0 grid place-items-center">
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
