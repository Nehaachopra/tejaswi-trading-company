import { BottomBar } from "./bottom-bar";
import type { Role } from "./nav-items";
import { Sidebar } from "./sidebar";
import { SiteHeader } from "./site-header";

// ivory header on top, ivory sidebar from 1024px, ivory bottom bar on phones; the page sits on chestnut.
// Used by the shell layout and the not-found page
export function AppFrame({ name, role, children }: { name: string; role: Role; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader name={name} role={role} />
      <div className="flex">
        <Sidebar role={role} />
        {/* the page; on phones it clears the bottom bar */}
        <div className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</div>
      </div>
      <BottomBar role={role} />
    </div>
  );
}
