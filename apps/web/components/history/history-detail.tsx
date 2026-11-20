"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/icons/spinner";
import { useHistoryTransaction } from "~/providers/history";

import { SaleInvoice } from "../transaction/sale/invoice";

// /history/[id]: one transaction, shown its own way: a sale as its tax invoice (with Cancel for the admin). The other
// types come one at a time
export function HistoryDetail({ id, isAdmin }: { id: string; isAdmin: boolean }) {
  const t = useTranslations("history");
  const tx = useHistoryTransaction(id);

  if (tx.isPending)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {t("loading")}
      </p>
    );
  if (tx.isError)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {tx.error.data?.code === "NOT_FOUND" ? t("notFound") : t("loadOneError")}
      </p>
    );

  if (tx.data.type === "sale") return <SaleInvoice id={id} history={{ record: tx.data, isAdmin }} />;
  return <p className="mt-16 text-center text-ivory/70">{t("comingSoon")}</p>;
}
