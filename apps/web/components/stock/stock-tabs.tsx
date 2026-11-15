"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { PageTabs } from "~/components/ui/page-tabs";
import { useGodowns } from "~/providers/stock";

// the two parts of stock, one tap apart: Godowns (with how many active ones) and Stock count
export function StockTabs() {
  const t = useTranslations("stock.tabs");
  const pathname = usePathname();
  const godowns = useGodowns(false);

  return (
    <PageTabs
      label={t("label")}
      tabs={[
        { key: "godowns", label: t("godowns"), href: "/stock", current: pathname === "/stock", count: godowns.data?.length ?? null },
        { key: "count", label: t("count"), href: "/stock/count", current: pathname === "/stock/count" },
      ]}
    />
  );
}
