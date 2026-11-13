"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ADD_BUTTON, PAGE } from "~/components/ui/page-styles";

// /order: the orders taken. A new one is made from Home (/transaction/order), so + Add goes there; the admin's
export function OrdersBoard({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("orders");
  return (
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>
      {isAdmin && (
        <Link href="/transaction/order" className={ADD_BUTTON}>
          <Plus className="size-5" aria-hidden /> {t("addOrder")}
        </Link>
      )}
    </main>
  );
}
