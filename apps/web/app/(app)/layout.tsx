import { redirect } from "next/navigation";

import { AppShell } from "~/components/shell/app-shell";
import { getSession } from "~/trpc/session";

// every page in this group needs a signed-in, active user
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return <AppShell user={session.user}>{children}</AppShell>;
}
