"use client";

import { CircleAlert, CircleCheck, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { CopyButton } from "~/components/ui/copy-button";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/icons/spinner";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useMoneyHeld } from "~/providers/saved";
import { useCreditNote } from "~/providers/sale-return";

import { NEW_TRANSACTION_HREF } from "../../shell/nav-items";

// a row of a box: its name on the left, the figure on the right, a line between rows
function Rows({ rows }: { rows: { key: string; label: string; value: React.ReactNode }[] }) {
  return (
    <div className="tabular flex w-full max-w-lg flex-col rounded-control border border-chestnut/25 px-4 text-left">
      {rows.map((r, i) => (
        <p key={r.key} className={cn("flex items-baseline justify-between gap-4 py-3", i > 0 && "border-t border-chestnut/15")}>
          <span className="text-sm font-semibold">{r.label}</span>
          <span className="min-w-0 truncate font-heading text-xl font-bold">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

// /transaction/sale-return/[id], where a saved return lands: that it worked, its transaction ID with its copy button and
// the credit note beside it, then what it came to and where it went (off the account, paid back, or the exchange's new
// sale, with its number to copy); after money is paid back, what cash and each bank account hold now; then the way to
// a new transaction
export function ReturnSuccess({ id }: { id: string }) {
  const t = useTranslations("transactions.saleReturn.done");
  const tc = useTranslations("transactions.chat");
  const locale = useLocale();
  const { note, loading, loadFailed } = useCreditNote(id);
  // what cash and the banks hold, asked again so it includes this one (only once it's in hand)
  const sources = useMoneyHeld({ fresh: true, enabled: !!note && note.settled.refunded > 0 });
  const held = sources.money && sources.money.cash !== null && !sources.fetching ? sources.money : null;

  return (
    <main className={`${PAGE} pb-28`}>
      <h1 className="sr-only">{t("title")}</h1>

      {loading ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : loadFailed || !note ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <section role="status" className="on-ivory flex flex-col items-center gap-6 rounded-control bg-ivory p-6 text-center text-chestnut sm:p-8">
          {/* it worked */}
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-20 place-items-center rounded-full bg-success/15">
              <CircleCheck className="size-12 text-success" strokeWidth={2.25} aria-hidden />
            </span>
            <h2 className="font-heading text-2xl font-bold">{note.exchangeSale ? t("exchangeTitle") : t("title")}</h2>
          </div>

          {/* its transaction ID (label left, the ID and its copy button right), the credit note beside it */}
          <div className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:items-stretch">
            <p className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-control border border-chestnut/25 py-1.5 pl-4 pr-2 text-left">
              <span className="text-sm font-semibold">{t("number")}</span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-heading text-xl font-bold">{note.assignedId}</span>
                <CopyButton value={note.assignedId} />
              </span>
            </p>
            <Link
              href={`/transaction/sale-return/${id}/credit-note`}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-chestnut/50 px-4 text-sm font-semibold sm:w-auto"
            >
              <FileText className="size-4" aria-hidden /> {t("creditNote")}
            </Link>
          </div>

          {/* what it came to and where it went */}
          <Rows
            rows={[
              { key: "total", label: t("total"), value: rupees(note.total) },
              ...(note.settled.onAccount > 0 ? [{ key: "account", label: t("onAccount"), value: rupees(note.settled.onAccount) }] : []),
              ...(note.settled.refunded > 0 ? [{ key: "refunded", label: t("refunded"), value: rupees(note.settled.refunded) }] : []),
              ...(note.exchangeSale
                ? [
                    {
                      key: "sale",
                      label: t("newSale"),
                      value: (
                        <span className="flex items-center gap-1">
                          <Link href={`/transaction/sale/${note.exchangeSale.transactionId}`} className="underline underline-offset-4">
                            {note.exchangeSale.assignedId}
                          </Link>
                          <CopyButton value={note.exchangeSale.assignedId} />
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />

          {/* money paid back: what cash and each bank account hold now */}
          {held && (
            <Rows
              rows={[
                { key: "cash", label: tc("cash"), value: rupees(held.cash ?? 0) },
                ...held.banks.map((b) => ({ key: b.id, label: `${bankNameIn(b.bankName, locale)} ••${b.last4}`, value: rupees(b.available ?? 0) })),
              ]}
            />
          )}

          {/* on to the next one */}
          <Link
            href={NEW_TRANSACTION_HREF}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory transition-colors hover:bg-chestnut/90 sm:w-auto"
          >
            <Plus className="size-5" strokeWidth={2.5} aria-hidden /> {t("newTransaction")}
          </Link>
        </section>
      )}
    </main>
  );
}
