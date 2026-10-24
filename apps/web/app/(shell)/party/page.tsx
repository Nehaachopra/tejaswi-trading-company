import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PartiesManager } from "~/components/party/parties-manager";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Parties · Tejaswi trading company" };

// customers and suppliers are added and edited here, by the admin only (the shell has already made sure someone
// is signed in)
export default async function PartiesPage() {
  const session = await getSession();
  if (session!.user.role !== "admin") {
    const t = await getTranslations("parties");
    return (
      <main className="mx-auto max-w-sm px-4 pt-16">
        <p className="rounded-control bg-ivory p-6 text-chestnut">{t("adminOnly")}</p>
      </main>
    );
  }
  return <PartiesManager />;
}
