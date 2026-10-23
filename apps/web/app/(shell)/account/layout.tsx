import { getTranslations } from "next-intl/server";

import { getSession } from "~/trpc/session";

// every Accounts page is for the admin only, the one role that sees balances
// (the shell has already made sure someone is signed in)
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (session!.user.role !== "admin") {
    const t = await getTranslations("accounts");
    return (
      <main className="mx-auto max-w-sm px-4 pt-16">
        <p className="rounded-control bg-ivory p-6 text-chestnut">{t("adminOnly")}</p>
      </main>
    );
  }

  return children;
}
