"use client";

import { Banknote, CircleAlert, CircleCheck, FileText, Landmark, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { CopyButton } from "~/components/ui/copy-button";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { useBankName } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

import { NEW_TRANSACTION_HREF } from "../../shell/nav-items";

// /transaction/receipt/[id] and /transaction/payment/[id], where a saved receipt or payment lands (and its voucher
// returns to): that it worked, its number and voucher, what the cash or bank account it used holds now (the admin's
// only), and the way to a new transaction
export function ReceiptSuccess({
  id,
  flow = "receipt",
}: {
  id: string;
  flow?: "receipt" | "payment";
}) {
  // bank names in the language picked
  const bankName = useBankName();
  const base = useTranslations("transactions.receipt.success");
  // a payment's own words where it has them, the receipt's otherwise
  const own = useTranslations("transactions.payment.success");
  const t = ((key: string, values?: Record<string, string>) =>
    flow === "payment" && own.has(key as never)
      ? own(key as never, values as never)
      : base(key as never, values as never)) as typeof base;
  const tc = useTranslations("transactions.chat");
  const tf = useTranslations("transactions.receipt.form");
  const isPayment = flow === "payment";
  const receiptGet = trpc.transactions.receipt.get.useQuery(
    { transactionId: id },
    { enabled: !isPayment },
  );
  const paymentGet = trpc.transactions.payment.get.useQuery(
    { transactionId: id },
    { enabled: isPayment },
  );
  const receipt = isPayment ? paymentGet : receiptGet;
  // what cash and each bank account hold now, asked again so it includes this one (null for staff, who don't see them)
  const sources = trpc.transactions.payment.sources.useQuery(undefined, {
    refetchOnMount: "always",
  });
  const banks = trpc.accounts.bank.pickable.useQuery();
  // only once asked again, so it never shows what they held before this one
  const held =
    sources.data && sources.data.cash !== null && !sources.isFetching ? sources.data : null;
  // the account this one went into or out of: its name and what it holds now
  const usedBank = held?.banks.find((b) => b.id === receipt.data?.bankDetailsId);
  const usedBankName = usedBank
    ? bankName(banks.data?.find((x) => x.id === usedBank.id)?.bankName ?? usedBank.bankName)
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
                  name: `${bankName(banks.data?.find((x) => x.id === b.id)?.bankName ?? b.bankName)} ••${b.last4}`,
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

      {receipt.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : receipt.isError ? (
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
          <div className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:items-stretch">
            <p className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-control border border-chestnut/25 py-1.5 pl-4 pr-2 text-left">
              <span className="text-sm font-semibold">{t("number")}</span>
              <span className="flex items-center gap-1">
                <span className="font-heading text-xl font-bold">{receipt.data.assignedId}</span>
                <CopyButton value={receipt.data.assignedId} />
              </span>
            </p>
            <Link
              href={`/transaction/${flow}/${id}/voucher`}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-chestnut/50 px-4 text-sm font-semibold sm:w-auto"
            >
              <FileText className="size-4" aria-hidden /> {t("voucher")}
            </Link>
          </div>

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
