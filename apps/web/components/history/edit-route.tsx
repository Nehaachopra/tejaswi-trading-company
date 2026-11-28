"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/icons/spinner";
import { useHistoryTransaction } from "~/providers/history";

import { PurchaseEditForm } from "../transaction/purchase-edit/form";
import { PurchaseEditSuccess } from "../transaction/purchase-edit/success";
import { SaleEditForm } from "../transaction/sale-edit/form";
import { SaleEditSuccess } from "../transaction/sale-edit/success";
import { PaymentEditForm } from "./payment/edit/form";
import { PaymentEditSuccess } from "./payment/edit/success";
import { ReceiptEditForm } from "./receipt/edit/form";
import { ReceiptEditSuccess } from "./receipt/edit/success";
import { SalaryEditForm } from "./salary/edit/form";
import { SalaryEditSuccess } from "./salary/edit/success";

// /history/[id]/edit (and its done page): a sale's edit form, a purchase's, a receipt's, a payment's or a salary's, by
// what the transaction is
export function EditRoute({ id, done = false }: { id: string; done?: boolean }) {
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
  if (transaction.type === "receipt") return done ? <ReceiptEditSuccess id={id} /> : <ReceiptEditForm id={id} />;
  if (transaction.type === "payment") return done ? <PaymentEditSuccess id={id} /> : <PaymentEditForm id={id} />;
  // a salary or advance: paid from Payment, edited as one
  if (transaction.type === "salary") return done ? <SalaryEditSuccess id={id} /> : <SalaryEditForm id={id} />;
  if (transaction.type === "purchase") return done ? <PurchaseEditSuccess id={id} /> : <PurchaseEditForm id={id} />;
  return done ? <SaleEditSuccess id={id} /> : <SaleEditForm id={id} />;
}
