import { redirect } from "next/navigation";

import { LoginFlow } from "~/components/auth/login-flow";
import { Brand } from "~/components/shell/brand";
import { getSession } from "~/trpc/session";

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-4">
        <Brand />
      </header>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-8 pb-12 sm:justify-center sm:pt-0">
        <LoginFlow />
      </div>
    </main>
  );
}
