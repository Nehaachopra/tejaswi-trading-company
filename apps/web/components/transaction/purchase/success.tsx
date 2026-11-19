"use client";

import { CircleAlert, CircleCheck, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { CopyButton } from "~/components/ui/copy-button";
import { FieldMessage } from "~/components/ui/field-message";
import { Spinner } from "~/components/ui/icons/spinner";
import { PAGE } from "~/components/ui/page-styles";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useAttachBill, useSavedPurchase } from "~/providers/purchase";

import { NEW_TRANSACTION_HREF } from "../../shell/nav-items";
import { BillAttach } from "./bill-attach";

// /transaction/purchase/[id], where a saved purchase lands: as the sale's success card, that it worked, its number with
// its copy button, then the items, total, payment and what was paid in one box; the supplier's bill (attach it here if
// it wasn't attached), and the way to a new transaction
export function PurchaseSuccess({ id }: { id: string }) {
  const t = useTranslations("transactions.purchase.done");
  const ts = useTranslations("transactions.sale");
  const tp = useTranslations("transactions.purchase");
  const purchase = useSavedPurchase(id);
  const attach = useAttachBill();

  return (
    <main className={`${PAGE} pb-28`}>
      <h1 className="sr-only">{t("title")}</h1>

      {purchase.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : purchase.isError || !purchase.data ? (
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
            <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
          </div>

          {/* its number in a box: label left, the ID and its copy button right */}
          <p className="flex w-full max-w-lg min-w-0 items-center justify-between gap-4 rounded-control border border-chestnut/25 py-1.5 pl-4 pr-2 text-left">
            <span className="text-sm font-semibold">{t("number")}</span>
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-heading text-xl font-bold">{purchase.data.assignedId}</span>
              <CopyButton value={purchase.data.assignedId} />
            </span>
          </p>

          {/* the items, total, payment and what was paid, a row each in one box */}
          <div className="tabular flex w-full max-w-lg flex-col rounded-control border border-chestnut/25 px-4 text-left">
            {[
              { key: "items", label: t("items"), value: purchase.data.lines.length.toLocaleString("en-IN") },
              { key: "total", label: t("total"), value: rupees(purchase.data.total) },
              { key: "payment", label: t("payment"), value: ts(`kinds.${purchase.data.kind}`) },
              ...(purchase.data.kind === "cash" ? [{ key: "paid", label: tp("paidNow"), value: rupees(purchase.data.paid) }] : []),
            ].map((r, i) => (
              <p key={r.key} className={cn("flex items-baseline justify-between gap-4 py-3", i > 0 && "border-t border-chestnut/15")}>
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="min-w-0 truncate font-heading text-xl font-bold">{r.value}</span>
              </p>
            ))}
          </div>

          {/* the supplier's bill: attached, or attach it now */}
          <div className="flex w-full max-w-lg flex-col gap-2 text-left">
            <span className="text-sm font-semibold">{tp("billPhoto")}</span>
            <BillAttach
              value={purchase.data.invoiceUrl}
              onChange={(url) => url && attach.mutate({ transactionId: id, invoiceUrl: url })}
              onBusy={() => undefined}
              removable={false}
            />
            {attach.isError && <FieldMessage className="mt-0">{tp("billFailed")}</FieldMessage>}
          </div>

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
