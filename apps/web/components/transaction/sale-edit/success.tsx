"use client";

import { ArrowRight, CircleAlert, CircleCheck, FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { CopyButton } from "~/components/ui/copy-button";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/icons/spinner";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useSavedSale } from "~/providers/sale";

// /history/[id]/edit/done, where a saved edit lands: the sale's success card with Edit successful: its transaction ID
// with its copy button and the invoice beside it (under it on a phone), then the items and new total in one box, and
// back to the sale in History
export function SaleEditSuccess({ id }: { id: string }) {
  const t = useTranslations("transactions.sale.done");
  const te = useTranslations("transactions.sale.edit");
  const read = useSavedSale(id);

  return (
    <main className={`${PAGE} pb-28`}>
      <h1 className="sr-only">{te("done")}</h1>

      {read.loading ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : read.loadFailed || !read.sale ? (
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
            <h2 className="font-heading text-2xl font-bold">{te("done")}</h2>
          </div>

          {/* its transaction ID in a box (label left, the ID and its copy button right), the invoice beside it (under it on a
              phone) */}
          <div className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:items-stretch">
            <p className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-control border border-chestnut/25 py-1.5 pl-4 pr-2 text-left">
              <span className="text-sm font-semibold">{t("number")}</span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-heading text-xl font-bold">
                  {read.sale.assignedId}
                </span>
                <CopyButton value={read.sale.assignedId} />
              </span>
            </p>
            <Link
              href={`/transaction/sale/${id}/invoice`}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-chestnut/50 px-4 text-sm font-semibold sm:w-auto"
            >
              <FileText className="size-4" aria-hidden /> {t("invoice")}
            </Link>
          </div>

          {/* the items and the total, a row each in one box */}
          <div className="tabular flex w-full max-w-lg flex-col rounded-control border border-chestnut/25 px-4 text-left">
            {[
              { key: "items", label: t("items"), value: read.sale.items.toLocaleString("en-IN") },
              { key: "total", label: t("total"), value: rupees(read.sale.total) },
            ].map((r, i) => (
              <p
                key={r.key}
                className={cn(
                  "flex items-baseline justify-between gap-4 py-3",
                  i > 0 && "border-t border-chestnut/15",
                )}
              >
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="min-w-0 truncate font-heading text-xl font-bold">{r.value}</span>
              </p>
            ))}
          </div>

          {/* back to the sale */}
          <Link
            href={`/history/${id}`}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory transition-colors hover:bg-chestnut/90 sm:w-auto"
          >
            {te("viewSale")} <ArrowRight className="size-5" strokeWidth={2.5} aria-hidden />
          </Link>
        </section>
      )}
    </main>
  );
}
