import { cn } from "~/lib/utils";

import { BottomBar } from "./bottom-bar";
import { type Role, SHELL_WIDTH } from "./nav-items";
import { Sidebar } from "./sidebar";
import { SiteHeader } from "./site-header";

// ivory header on top, ivory sidebar from 1024px, ivory bottom bar on phones; the page sits on chestnut. On a wide
// screen it all stays within SHELL_WIDTH, centred, so lines don't run across the whole screen. Used by the shell
// layout and the not-found page
export function AppFrame({ name, role, children }: { name: string; role: Role; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader name={name} role={role} />
      {/* on a wide screen the space left of the sidebar is ivory too (the left half of the band behind it), so the
          sidebar reaches the edge; the page covers the rest in chestnut */}
      <div className="lg:min-h-[calc(100dvh-4rem)] lg:bg-[linear-gradient(to_right,var(--color-ivory)_50%,transparent_50%)]">
        <div className={cn("flex lg:min-h-[calc(100dvh-4rem)]", SHELL_WIDTH)}>
          <Sidebar role={role} />
          {/* the page; on phones it clears the bottom bar */}
          <div className="min-w-0 flex-1 pb-24 lg:bg-chestnut lg:pb-0">{children}</div>
        </div>
      </div>
      <BottomBar role={role} />
    </div>
  );
}
