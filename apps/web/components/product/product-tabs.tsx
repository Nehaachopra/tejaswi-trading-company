"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { PageTabs } from "~/components/ui/page-tabs";
import { trpc } from "~/trpc/client";

// the two pages of the products area, one tap apart, each with how many active ones there are
export function ProductTabs() {
  const t = useTranslations("products.tabs");
  const pathname = usePathname();

  // the counts: active categories, and active products (a product with three pack sizes counts once)
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });
  const products = trpc.inventory.product.list.useQuery({ includeInactive: false });

  return (
    <PageTabs
      label={t("label")}
      tabs={[
        { key: "categories", label: t("categories"), href: "/product/categories", current: pathname === "/product/categories", count: categories.data?.length ?? null },
        { key: "products", label: t("products"), href: "/product", current: pathname === "/product", count: products.data?.length ?? null },
      ]}
    />
  );
}
