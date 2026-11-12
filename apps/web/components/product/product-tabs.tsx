"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { PageTabs } from "~/components/ui/page-tabs";

// the two pages of the products area, one tap apart
export function ProductTabs() {
  const t = useTranslations("products.tabs");
  const pathname = usePathname();

  return (
    <PageTabs
      label={t("label")}
      tabs={[
        {
          key: "categories",
          label: t("categories"),
          href: "/product/categories",
          current: pathname === "/product/categories",
        },
        {
          key: "products",
          label: t("products"),
          href: "/product",
          current: pathname === "/product",
        },
      ]}
    />
  );
}
