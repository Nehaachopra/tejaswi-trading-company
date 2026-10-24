import { getTranslations } from "next-intl/server";

import { getSession } from "~/trpc/session";

// parties and bank accounts are added and edited here, by the admin only (the shell has already made sure someone
// is signed in)
export default async function EntitiesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (session!.user.role !== "admin") {
    const t = await getTranslations("entities");
    return (
      <main className="mx-auto max-w-sm px-4 pt-16">
        <p className="rounded-control bg-ivory p-6 text-chestnut">{t("adminOnly")}</p>
      </main>
    );
  }

  return children;
}
