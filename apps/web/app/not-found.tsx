import { CircleAlert, House } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AppFrame } from "~/components/shell/app-frame";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Page not found · Tejaswi trading company" };

// any address the app doesn't have: inside the shell when signed in, on the bare page when not
export default async function NotFound() {
  const t = await getTranslations("notFound");
  const session = await getSession();

  // the message: an ivory card with what happened and the way back
  const card = (
    <main className="mx-auto flex max-w-sm flex-col px-4 pt-16">
      <section className="flex flex-col gap-4 rounded-control bg-ivory p-6 text-chestnut">
        <CircleAlert className="size-6" aria-hidden />
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-chestnut/80">{t("body")}</p>
        </div>
        <Link
          href="/"
          className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory"
        >
          <House className="size-5" aria-hidden /> {t("home")}
        </Link>
      </section>
    </main>
  );

  if (!session) return card;

  return (
    <AppFrame name={session.user.name} role={session.user.role}>
      {card}
    </AppFrame>
  );
}
