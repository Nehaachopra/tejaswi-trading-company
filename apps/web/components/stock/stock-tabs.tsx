"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { PageTabs } from "~/components/ui/page-tabs";
import { trpc } from "~/trpc/client";

// the two parts of stock, one tap apart: Godowns (with how many active ones) and Stock count
export function StockTabs() {
  const t = useTranslations("stock.tabs");
  const pathname = usePathname();
  const godowns = trpc.inventory.godown.list.useQuery({ includeInactive: false });

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
