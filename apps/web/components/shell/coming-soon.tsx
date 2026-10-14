import { getTranslations } from "next-intl/server";
import { Construction } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";

export async function ComingSoon({ page }: { page: "products" | "orders" | "accounts" | "inventory" }) {
  const nav = await getTranslations("shell.nav");
  const t = await getTranslations("placeholder");

  return (
    <Empty className="mt-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>
        <EmptyTitle>{t("title", { page: nav(page) })}</EmptyTitle>
        <EmptyDescription>{t("description")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
