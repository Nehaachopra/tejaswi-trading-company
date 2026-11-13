"use client";

import { CircleAlert, CircleCheck, FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { CopyButton } from "~/components/ui/copy-button";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { WhatsAppIcon } from "~/components/ui/whatsapp-icon";
import { rupees, titleCase } from "~/lib/format";
import { phoneStartsBad } from "~/lib/number-words";
import { cn } from "~/lib/utils";
import { toast } from "~/components/ui/toast";
import { usePurchaseOrderDocument, usePurchaseOrderShareKey, useSaveSupplierPhone } from "~/providers/purchase-order";

import { orderWhatsAppLink } from "./document";

// a row of the box under the number: the label on the left, the value on the right
const row = "flex items-baseline justify-between gap-4 py-3";

// /transaction/order/[id], where a saved purchase order lands, as a payment's success page: that it worked, its number with
// Copy and View order beside it (under it on a phone), then the supplier, how many items and the amount, a row each
// in one box; then its one action, sharing the order with the supplier on WhatsApp. A supplier with no phone kept is
// asked their WhatsApp number first (a 10-digit mobile), right above the button; it's kept on the supplier, so the next
// share goes straight to WhatsApp
export function PurchaseOrderDone({ id }: { id: string }) {
  const t = useTranslations("orders");
  const doc = usePurchaseOrderDocument(id);
  const link = usePurchaseOrderShareKey(id);
  const savePhone = useSaveSupplierPhone(id);
  const d = doc.data;
  // no phone kept: Share first opens the number's box, then sends to it
  const [asking, setAsking] = useState(false);
  const [phone, setPhone] = useState("");
  const phoneOk = /^[6-9]\d{9}$/.test(phone);
  const phoneBad = phoneStartsBad(phone) || phone.startsWith("0");

  return (
    <main className={`${PAGE} pb-28`}>
      <h1 className="sr-only">{t("done.title")}</h1>
      {doc.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner />
        </p>
      ) : doc.isError || !d ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("done.loadFailed")}
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
            <h2 className="font-heading text-2xl font-bold">{t("done.title")}</h2>
          </div>

          {/* its number in a box (label left, the number and its copy button right), and View order beside it (under it
              on the phone) */}
          <div className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:items-stretch">
            <p className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-control border border-chestnut/25 py-1.5 pl-4 pr-2 text-left">
              <span className="text-sm font-semibold">{t("done.number")}</span>
              <span className="flex items-center gap-1">
                <span className="font-heading text-xl font-bold">{d.order.orderId}</span>
                <CopyButton value={d.order.orderId} />
              </span>
            </p>
            <Link
              href={`/transaction/order/${id}/view`}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-chestnut/50 px-4 text-sm font-semibold sm:w-auto"
            >
              <FileText className="size-4" aria-hidden /> {t("done.viewOrder")}
            </Link>
          </div>

          {/* what it is: a row each in one box */}
          <div className="tabular flex w-full max-w-lg flex-col rounded-control border border-chestnut/25 px-4 text-left">
            <p className={row}>
              <span className="text-sm font-semibold">{t("done.supplier")}</span>
              <span className="min-w-0 truncate font-semibold">{titleCase(d.order.party.name)}</span>
            </p>
            <p className={cn(row, "border-t border-chestnut/15")}>
              <span className="text-sm font-semibold">{t("done.items")}</span>
              <span className="font-semibold">{d.order.itemCount}</span>
            </p>
            <p className={cn(row, "border-t border-chestnut/15")}>
              <span className="text-sm font-semibold">{t("done.amount")}</span>
              <span className="font-heading text-xl font-bold">{rupees(d.order.totalAmount)}</span>
            </p>
          </div>

          {/* no phone kept: the supplier's WhatsApp number, asked once Share is tapped */}
          {asking && (
            <label className="flex w-full max-w-lg flex-col gap-2 text-left text-xs font-semibold">
              {t("done.whatsAppNumber")}
              <span className={cn("flex min-h-11 items-center gap-2 px-3", fieldClass(phoneBad))}>
                <span className="font-normal text-chestnut/70">+91</span>
                <input
                  autoFocus
                  value={phone}
                  inputMode="tel"
                  aria-invalid={phoneBad || undefined}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="tabular min-w-0 flex-1 bg-transparent text-base font-normal outline-none"
                />
              </span>
              {phoneBad && <span className="font-normal text-danger">{t("done.mobileBad")}</span>}
            </label>
          )}

          {/* the one action: WhatsApp opened on the supplier's chat with the order's link ready to send */}
          <button
            type="button"
            disabled={!link.data || (asking && !phoneOk)}
            onClick={() => {
              if (!d.supplier.phone && !asking) return setAsking(true);
              // WhatsApp first (a window opened after waiting is blocked), then the number kept on the supplier
              window.open(orderWhatsAppLink(d, link.data!.key, (v) => t("doc.whatsAppMessage", v), d.supplier.phone ?? phone), "_blank", "noopener");
              if (!d.supplier.phone) {
                savePhone.mutate(
                  { id, phone },
                  {
                    onSuccess: () => setAsking(false),
                    onError: (err) => toast.error(err.message || t("done.phoneNotSaved")),
                  },
                );
              }
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory transition-colors hover:bg-chestnut/90 disabled:opacity-50 sm:w-auto"
          >
            {t("done.share")}
            <WhatsAppIcon className="size-4 shrink-0" />
          </button>
        </section>
      )}
    </main>
  );
}
