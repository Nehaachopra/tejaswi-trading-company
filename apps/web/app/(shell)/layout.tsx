import { redirect } from "next/navigation";

import { AppFrame } from "~/components/shell/app-frame";
import { LiveUpdates } from "~/components/shell/live-updates";
import { getSession } from "~/trpc/session";

// the frame around every page except /login
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  // every page in the shell needs someone signed in
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppFrame name={session.user.name} role={session.user.role}>
      {/* other people's changes show up without a refresh */}
      <LiveUpdates />
      {children}
    </AppFrame>
  );
}
