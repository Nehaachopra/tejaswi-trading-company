import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { JobsBoard } from "~/components/jobs/jobs-board";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Jobs · Tejaswi trading company" };

// background work (OTP SMS today): what failed, why, and a way to run it again; admin only
export default async function JobsPage() {
  const session = await getSession();

  if (session!.user.role !== "admin") {
    const t = await getTranslations("jobs");
    return (
      <main className="mx-auto max-w-sm px-4 pt-16">
        <p className="rounded-control bg-ivory p-6 text-chestnut">{t("adminOnly")}</p>
      </main>
    );
  }

  return <JobsBoard />;
}
