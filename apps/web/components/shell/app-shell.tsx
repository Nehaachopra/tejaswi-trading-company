import { getTranslations } from "next-intl/server";
import { Bell, Search } from "lucide-react";

import type { RouterOutputs } from "@repo/trpc/client";

import { Button } from "~/components/ui/button";
import { Brand } from "./brand";
import { BottomNav } from "./bottom-nav";
import { ProfileMenu } from "./profile-menu";

// header + bottom navigation, the same on every signed-in page (see .claude/pages/shell.md)
export async function AppShell({ children, user }: { children: React.ReactNode; user: RouterOutputs["auth"]["me"]["user"] }) {
  const t = await getTranslations("shell");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Brand />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-11" aria-label={t("search")}>
              <Search />
            </Button>
            <Button variant="ghost" size="icon" className="size-11" aria-label={t("notifications")}>
              <Bell />
            </Button>
            <ProfileMenu user={user} />
          </div>
        </div>
      </header>

      {/* bottom padding keeps content clear of the fixed navigation */}
      <main className="mx-auto max-w-5xl pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</main>

      <BottomNav />
    </div>
  );
}
