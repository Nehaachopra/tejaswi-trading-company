import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LanguageSwitch } from "~/components/auth/language-switch";
import { LoginFlow } from "~/components/auth/login-flow";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Log in · Tejaswi trading company" };

// only paths inside this app; anything else lands on the default page
function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/product";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pb-10 pt-6">
      <div className="flex w-full max-w-sm justify-end">
        <LanguageSwitch />
      </div>
      <div className="flex w-full flex-1 items-center justify-center py-8">
        <LoginFlow next={next} />
      </div>
    </main>
  );
}
