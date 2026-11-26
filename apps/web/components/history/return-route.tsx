"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/icons/spinner";
import { useHistoryTransaction } from "~/providers/history";

import { PurchaseReturnForm } from "../transaction/purchase-return/form";
import { ReturnForm } from "../transaction/sale-return/form";

// /history/[id]/return: a sale's return form, or a purchase's, by what the transaction is
export function ReturnRoute({ id }: { id: string }) {
  const t = useTranslations("history");
  const { transaction, loading, notFound } = useHistoryTransaction(id);
  if (loading)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {t("loading")}
      </p>
    );
  if (!transaction)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {notFound ? t("notFound") : t("loadOneError")}
      </p>
    );
  return transaction.type === "purchase" ? <PurchaseReturnForm id={id} /> : <ReturnForm id={id} />;
}
