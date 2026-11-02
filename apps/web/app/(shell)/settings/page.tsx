import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SettingsBoard } from "~/components/settings/settings-board";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Settings · Tejaswi trading company" };

// the website's settings (TDS on suppliers today); admin only
export default async function SettingsPage() {
  const session = await getSession();

  if (session!.user.role !== "admin") {
    const t = await getTranslations("settings");
    return (
      <main className="mx-auto max-w-sm px-4 pt-16">
        <p className="rounded-control bg-ivory p-6 text-chestnut">{t("adminOnly")}</p>
      </main>
    );
  }

  return <SettingsBoard />;
}
