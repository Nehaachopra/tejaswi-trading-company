"use client";

import { Banknote, CircleAlert, CircleCheck, FileText, Landmark, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { CopyButton } from "~/components/ui/copy-button";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/icons/spinner";
import { useBankName } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { usePickableBanks } from "~/providers/accounts";
import {
  useMoneyHeld,
  useSavedDeposit,
  useSavedDrawing,
  useSavedOther,
  useSavedPayment,
  useSavedReceipt,
  useSavedSalaries,
  useSavedSalary,
  useSavedTransfer,
  useSavedWithdrawal,
} from "~/providers/saved";

import { NEW_TRANSACTION_HREF } from "../../shell/nav-items";

// /transaction/receipt/[id], /transaction/payment/[id] and /transaction/deposit/[id], where a saved receipt, payment or
// deposit lands (and a voucher returns to): that it worked, its number and voucher (a deposit has none), what the cash
// or bank account it used holds now (the admin's only), and the way to a new transaction
export function ReceiptSuccess({
  id,
  flow = "receipt",
  also = [],
}: {
  id: string;
  flow?: "receipt" | "payment" | "deposit" | "withdrawal" | "transfer" | "other" | "salary" | "drawing";
  // salary paid to many in one save: the other payments' ids
  also?: string[];
}) {
  // bank names in the language picked
  const bankName = useBankName();
  const base = useTranslations("transactions.receipt.success");
  // a payment's, deposit's or withdrawal's own words where it has them, the receipt's otherwise
  const ownPayment = useTranslations("transactions.payment.success");
  const ownDeposit = useTranslations("transactions.deposit.success");
  const ownWithdrawal = useTranslations("transactions.withdrawal.success");
  const ownTransfer = useTranslations("transactions.transfer.success");
  const ownOther = useTranslations("transactions.other.success");
  const ownSalary = useTranslations("transactions.salary.success");
  const ownDrawing = useTranslations("transactions.drawing.success");
  const tdr = useTranslations("transactions.drawing");
  const own =
    flow === "drawing"
      ? ownDrawing
      : flow === "deposit"
      ? ownDeposit
      : flow === "withdrawal"
        ? ownWithdrawal
        : flow === "transfer"
          ? ownTransfer
          : flow === "other"
            ? ownOther
            : flow === "salary"
              ? ownSalary
              : ownPayment;
  const t = ((key: string, values?: Record<string, string>) =>
    flow !== "receipt" && own.has(key as never)
      ? own(key as never, values as never)
      : base(key as never, values as never)) as typeof base;
  const tc = useTranslations("transactions.chat");
  const tf = useTranslations("transactions.receipt.form");
  const isPayment = flow === "payment";
  // a deposit, withdrawal or transfer: cash and an account, or two accounts; no voucher
  const isDeposit = flow === "deposit" || flow === "withdrawal" || flow === "transfer";
  // a journal entry (Others): no cash or bank, no voucher; only its number
  const isOther = flow === "other";
  const otherGet = useSavedOther(id, isOther);
  // a salary or advance: cash or one bank account, no voucher yet
  const isSalary = flow === "salary";
  const salaryGet = useSavedSalary(id, isSalary);
  // salary paid to many: every payment, each with its employee and number
  const salaryMany = useSavedSalaries(isSalary ? also : []);
  const many =
    isSalary && also.length > 0 && salaryGet.saved && salaryMany.salaries
      ? [salaryGet.saved, ...salaryMany.salaries]
      : null;
  // a drawing: money out of cash or one bank account, or goods at cost (no cash or bank: its cost and GST reversed)
  const isDrawing = flow === "drawing";
  const drawingGet = useSavedDrawing(id, isDrawing);
  const dr = drawingGet.saved;
  const receiptGet = useSavedReceipt(id, flow === "receipt");
  const paymentGet = useSavedPayment(id, isPayment);
  const depositGet = useSavedDeposit(id, flow === "deposit");
  const withdrawalGet = useSavedWithdrawal(id, flow === "withdrawal");
  const transferGet = useSavedTransfer(id, flow === "transfer");
  const contraGet =
    flow === "withdrawal" ? withdrawalGet : flow === "transfer" ? transferGet : depositGet;
  const asked = isDrawing
    ? drawingGet
    : isSalary
    ? salaryGet
    : isOther
      ? otherGet
      : isDeposit
        ? contraGet
        : isPayment
          ? paymentGet
          : receiptGet;
  // what this page shows of it, the same for every flow: a deposit or withdrawal moved cash and one account (shown as
  // cash and a bank), a transfer two accounts (the one it left, then the one it went into)
  const d = contraGet.saved;
  const contraBank = d ? (d.from ?? d.to) : null;
  const receipt = {
    loading: asked.loading,
    loadFailed: asked.loadFailed,
    data: isDrawing
      ? dr && {
          assignedId: dr.assignedId,
          bankDetailsId: dr.bank?.id ?? "",
          // goods touch no cash or bank: nothing to show (as Others)
          settledIn: dr.kind === "goods" ? ("none" as const) : dr.bank ? ("bank" as const) : ("cash" as const),
          moreBankParts: [] as { bankDetailsId: string }[],
          split: null,
        }
      : isSalary
      ? salaryGet.saved && {
          assignedId: salaryGet.saved.assignedId,
          bankDetailsId: salaryGet.saved.bankDetailsId ?? "",
          settledIn: salaryGet.saved.settledIn,
          moreBankParts: [] as { bankDetailsId: string }[],
          split: null,
        }
      : isOther
        ? otherGet.saved && {
            assignedId: otherGet.saved.assignedId,
            bankDetailsId: "",
            settledIn: "bank" as const,
            moreBankParts: [] as { bankDetailsId: string }[],
            split: null,
          }
        : isDeposit
          ? d &&
            contraBank && {
              assignedId: d.assignedId,
              bankDetailsId: contraBank.id,
              settledIn: d.from && d.to ? ("bank" as const) : ("cashAndBank" as const),
              moreBankParts: (d.from && d.to ? [{ bankDetailsId: d.to.id }] : []) as {
                bankDetailsId: string;
              }[],
              split: null,
            }
          : (isPayment ? paymentGet : receiptGet).saved,
  };
  // what cash and each bank account hold now, asked again so it includes this one (null for staff, who don't see them)
  const sources = useMoneyHeld({ fresh: true });
  const pickable = usePickableBanks();
  // only once asked again, so it never shows what they held before this one
  const held =
    sources.money && sources.money.cash !== null && !sources.fetching ? sources.money : null;
  // the account this one went into or out of: its name and what it holds now
  const usedBank = held?.banks.find((b) => b.id === receipt.data?.bankDetailsId);
  const usedBankName = usedBank
    ? bankName(pickable.banks?.find((x) => x.id === usedBank.id)?.bankName ?? usedBank.bankName)
    : "";
  // the places it used, each with what it holds now: cash, the bank account, or both (a payment from cash and a bank)
  const settledIn = receipt.data?.settledIn;
  const used = [
    ...(settledIn === "cash" || settledIn === "cashAndBank"
      ? [{ key: "cash", bank: false, name: tc("cash"), held: held?.cash ?? 0 }]
      : []),
    ...(settledIn !== "cash" && usedBank
      ? [
          {
            key: usedBank.id,
            bank: true,
            name: `${usedBankName} ••${usedBank.last4}`,
            held: usedBank.available ?? 0,
          },
        ]
      : []),
    // split over more accounts: each more account it used
    ...(receipt.data
      ? receipt.data.moreBankParts.flatMap((m) => {
          const b = held?.banks.find((x) => x.id === m.bankDetailsId);
          return b
            ? [
                {
                  key: b.id,
                  bank: true,
                  name: `${bankName(pickable.banks?.find((x) => x.id === b.id)?.bankName ?? b.bankName)} ••${b.last4}`,
                  held: b.available ?? 0,
                },
              ]
            : [];
        })
      : []),
  ];

  return (
    <main className={`${PAGE} pb-28`}>
      <h1 className="sr-only">{t("title")}</h1>

      {receipt.loading ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : receipt.loadFailed || !receipt.data ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <section
          role="status"
          className="on-ivory flex flex-col items-center gap-6 rounded-control bg-ivory p-6 text-center text-chestnut sm:p-8"
        >
          {/* it worked */}
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-20 place-items-center rounded-full bg-success/15">
              <CircleCheck className="size-12 text-success" strokeWidth={2.25} aria-hidden />
            </span>
            <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
          </div>

          {/* its number in a box like the rows below (label left, the ID and its copy button right), and the voucher
              beside it (under it on the phone) */}
          {many ? (
            <div className="flex w-full max-w-lg flex-col gap-2">
              <p className="text-sm font-semibold">
                {ownSalary("paidCount", { count: many.length })}
              </p>
              {many.map((m) => (
                <p
                  key={m.transactionId}
                  className="flex min-w-0 items-center justify-between gap-4 rounded-control border border-chestnut/25 py-1.5 pl-4 pr-2 text-left"
                >
                  <span className="truncate text-sm font-semibold">{m.employee.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="font-heading text-lg font-bold">{m.assignedId}</span>
                    <CopyButton value={m.assignedId} />
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <div className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:items-stretch">
              <p className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-control border border-chestnut/25 py-1.5 pl-4 pr-2 text-left">
                <span className="text-sm font-semibold">{t("number")}</span>
                <span className="flex items-center gap-1">
                  <span className="font-heading text-xl font-bold">{receipt.data.assignedId}</span>
                  <CopyButton value={receipt.data.assignedId} />
                </span>
              </p>
              {!isDeposit && !isOther && !isSalary && !isDrawing && (
                <Link
                  href={`/transaction/${flow}/${id}/voucher`}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-chestnut/50 px-4 text-sm font-semibold sm:w-auto"
                >
                  <FileText className="size-4" aria-hidden /> {t("voucher")}
                </Link>
              )}
            </div>
          )}

          {/* more than was owed (a customer paying us, a supplier we paid): what settled the due and what's an advance,
              a row each in one box */}
          {receipt.data?.split && (
            <div className="tabular flex w-full max-w-lg flex-col rounded-control border border-chestnut/25 px-4 text-left">
              {receipt.data.split.due > 0 && (
                <p className="flex items-baseline justify-between gap-4 border-b border-chestnut/15 py-3">
                  <span className="text-sm font-semibold">{tf("due")}</span>
                  <span className="font-heading text-xl font-bold">
                    {rupees(receipt.data.split.due)}
                  </span>
                </p>
              )}
              <p className="flex items-baseline justify-between gap-4 py-3">
                <span className="text-sm font-semibold">{tf("advancePart")}</span>
                <span className="font-heading text-xl font-bold">
                  {rupees(receipt.data.split.advance)}
                </span>
              </p>
            </div>
          )}

          {/* goods drawn: their cost and the GST reversed on them, a row each in one box */}
          {dr && dr.kind === "goods" && (
            <div className="tabular flex w-full max-w-lg flex-col rounded-control border border-chestnut/25 px-4 text-left">
              <p className="flex items-baseline justify-between gap-4 border-b border-chestnut/15 py-3">
                <span className="text-sm font-semibold">{tdr("cost")}</span>
                <span className="font-heading text-xl font-bold">{rupees(dr.cost)}</span>
              </p>
              <p className="flex items-baseline justify-between gap-4 py-3">
                <span className="text-sm font-semibold">{tdr("gstReversed")}</span>
                <span className="font-heading text-xl font-bold">{rupees(dr.itcReversal)}</span>
              </p>
            </div>
          )}

          {/* what the cash or bank accounts it used hold, a row each in one box */}
          {held && used.length > 0 && (
            <div className="tabular flex w-full max-w-lg flex-col rounded-control border border-chestnut/25 px-4 text-left">
              {used.map((u, i) => (
                <p
                  key={u.key}
                  className={cn(
                    "flex items-center justify-between gap-4 py-3",
                    i > 0 && "border-t border-chestnut/15",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    {u.bank ? (
                      <Landmark className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <Banknote className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">{t("balance", { where: u.name })}</span>
                  </span>
                  <span className="shrink-0 font-heading text-xl font-bold">{rupees(u.held)}</span>
                </p>
              ))}
            </div>
          )}

          {/* on to the next one */}
          <Link
            href={NEW_TRANSACTION_HREF}
            className="flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory transition-colors hover:bg-chestnut/90"
          >
            <Plus className="size-5" strokeWidth={2.5} aria-hidden /> {t("newTransaction")}
          </Link>
        </section>
      )}
    </main>
  );
}
