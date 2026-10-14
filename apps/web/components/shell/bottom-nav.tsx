"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, ClipboardList, House, Package, Warehouse, type LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

const tabs: { key: "home" | "products" | "orders" | "accounts" | "inventory"; href: string; icon: LucideIcon }[] = [
  { key: "home", href: "/", icon: House },
  { key: "products", href: "/products", icon: Package },
  { key: "orders", href: "/orders", icon: ClipboardList },
  { key: "accounts", href: "/accounts", icon: BookOpen },
  { key: "inventory", href: "/inventory", icon: Warehouse },
];

export function BottomNav() {
  const t = useTranslations("shell.nav");
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {tabs.map(({ key, href, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 min-h-14 py-2 text-xs font-medium text-muted-foreground transition-colors",
                  active && "text-primary",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                <span className="max-w-full truncate px-1">{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
