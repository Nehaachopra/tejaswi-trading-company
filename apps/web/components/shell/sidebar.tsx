"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "~/lib/utils";

import { isCurrent, navFor, type Role } from "./nav-items";

// from 1024px, ivory with chestnut ink: every page the role may open
export function Sidebar({ role }: { role: Role }) {
  const t = useTranslations("shell.nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="on-ivory sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-chestnut/15 bg-ivory px-3 py-5 text-chestnut lg:flex"
    >
      {/* the pages; the current one is filled chestnut */}
      <ul className="flex flex-col gap-1">
        {navFor(role).map((item) => {
          const current = isCurrent(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm transition-colors",
                  current ? "bg-chestnut font-semibold text-ivory" : "text-chestnut/80 hover:bg-chestnut/6 hover:text-chestnut",
                )}
              >
                <item.icon className="size-5" aria-hidden /> {t(item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
