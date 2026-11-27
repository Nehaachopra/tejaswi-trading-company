"use client";

import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { CopyButton } from "~/components/ui/copy-button";
import { Spinner } from "~/components/ui/icons/spinner";
import { PAGE } from "~/components/ui/page-styles";
import { rupees } from "~/lib/format";
import { useSavedReceipt } from "~/providers/saved";

// /history/[id]/edit/done for a receipt, as an edited purchase's: Edit successful, its transaction ID with its copy
// button, the new amount in a box, and back to the receipt in History
export function ReceiptEditSuccess({ id }: { id: string }) {
  const te = useTranslations("history.receipt.edit");
  const read = useSavedReceipt(id, true);

  return (
    <main className={`${PAGE} pb-28`}>
      <h1 className="sr-only">{te("done")}</h1>

      {read.loading ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {te("loading")}
        </p>
      ) : read.loadFailed || !read.saved ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {te("loadFailed")}
        </p>
      ) : (
        <section role="status" className="on-ivory flex flex-col items-center gap-6 rounded-control bg-ivory p-6 text-center text-chestnut sm:p-8">
          {/* it worked */}
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-20 place-items-center rounded-full bg-success/15">
              <CircleCheck className="size-12 text-success" strokeWidth={2.25} aria-hidden />
            </span>
            <h2 className="font-heading text-2xl font-bold">{te("done")}</h2>
          </div>

          {/* its transaction ID and the new amount, a row each in one box */}
          <div className="tabular flex w-full max-w-lg flex-col rounded-control border border-chestnut/25 px-4 text-left">
            <p className="flex items-center justify-between gap-4 py-1.5 pr-0">
              <span className="text-sm font-semibold">{te("number")}</span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-heading text-xl font-bold">{read.saved.assignedId}</span>
                <CopyButton value={read.saved.assignedId} />
              </span>
            </p>
            <p className="flex items-baseline justify-between gap-4 border-t border-chestnut/15 py-3">
              <span className="text-sm font-semibold">{te("amount")}</span>
              <span className="min-w-0 truncate font-heading text-xl font-bold">{rupees(read.saved.amount)}</span>
            </p>
          </div>

          {/* back to the receipt */}
          <Link
            href={`/history/${id}`}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory transition-colors hover:bg-chestnut/90 sm:w-auto"
          >
            {te("viewReceipt")} <ArrowRight className="size-5" strokeWidth={2.5} aria-hidden />
          </Link>
        </section>
      )}
    </main>
  );
}
