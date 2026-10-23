"use client";

import { ChevronDown, Menu as MenuIcon, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Sheet } from "~/components/ui/sheet";
import { cn } from "~/lib/utils";

import { isCurrent, isSubCurrent, NEW_TRANSACTION_HREF, type NavItem, navFor, type Role } from "./nav-items";

const slot = "flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-xs transition-colors";
const tone = (current: boolean) => (current ? "font-semibold text-chestnut" : "text-chestnut/80 hover:text-chestnut");

// phones only, ivory: History · Stock · + · Orders · More, fixed to the bottom of the screen
export function BottomBar({ role }: { role: Role }) {
  const t = useTranslations("shell.nav");
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  // items with pages under them (Accounts) that were tapped open or shut in the More sheet; the one you're
  // in starts open, the rest shut
  const [toggled, setToggled] = useState<string[]>([]);

  const items = navFor(role);
  const [history, stock, orders] = items.filter((i) => i.place === "bar") as [NavItem, NavItem, NavItem];
  // staff have nothing in More, so their bar has no More button
  const more = items.filter((i) => i.place === "more");
  const inMore = more.some((i) => isCurrent(i.href, pathname));

  return (
    <>
      <nav
        aria-label={t("label")}
        className="on-ivory fixed inset-x-0 bottom-0 z-30 border-t border-chestnut/15 bg-ivory pb-[env(safe-area-inset-bottom)] text-chestnut lg:hidden"
      >
        <ul className={cn("mx-auto grid max-w-lg", more.length ? "grid-cols-5" : "grid-cols-4")}>
          {/* History and Stock */}
          {[history, stock].map((item) => (
            <li key={item.href}>
              <BarLink item={item} current={isCurrent(item.href, pathname)} label={t(item.label)} />
            </li>
          ))}

          {/* New transaction: the raised chestnut button in the middle */}
          <li className="flex justify-center">
            <Link
              href={NEW_TRANSACTION_HREF}
              aria-label={t("newTransaction")}
              aria-current={isCurrent(NEW_TRANSACTION_HREF, pathname) ? "page" : undefined}
              className="-mt-5 grid size-14 place-items-center rounded-control border-4 border-ivory bg-chestnut text-ivory"
            >
              <Plus className="size-6" strokeWidth={2.5} aria-hidden />
            </Link>
          </li>

          {/* Orders */}
          <li>
            <BarLink item={orders} current={isCurrent(orders.href, pathname)} label={t(orders.label)} />
          </li>

          {/* More: opens the sheet with the admin's remaining pages */}
          {more.length > 0 && (
            <li>
              <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={cn(slot, tone(inMore))}>
                <MenuIcon className="size-5" aria-hidden />
                {t("more")}
              </button>
            </li>
          )}
        </ul>
      </nav>

      {/* the More sheet, with the logo on top: Products, Accounts, GST and Jobs */}
      <Sheet
        open={moreOpen}
        title={t("more")}
        dismissible
        visual={<Image src="/logo-transparent.png" alt="" width={1200} height={400} className="h-10 w-auto" />}
        closeLabel={t("close")}
        onClose={() => setMoreOpen(false)}
      >
        <ul className="flex flex-col gap-1 overflow-y-auto p-3">
          {more.map((item) => {
            const current = isCurrent(item.href, pathname);
            const rowClass = cn("flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left text-base", current ? "bg-chestnut font-medium text-ivory" : "hover:bg-chestnut/[0.06]");
            const groupOpen = current !== toggled.includes(item.href);
            return (
              <li key={item.href}>
                {item.children ? (
                  // Accounts only opens and closes its list; a page opens when one is picked
                  <button
                    type="button"
                    aria-expanded={groupOpen}
                    onClick={() => setToggled((g) => (g.includes(item.href) ? g.filter((h) => h !== item.href) : [...g, item.href]))}
                    className={rowClass}
                  >
                    <item.icon className="size-5" aria-hidden /> <span className="flex-1">{t(item.label)}</span>
                    <ChevronDown className={cn("size-4 transition-transform", groupOpen && "rotate-180")} aria-hidden />
                  </button>
                ) : (
                  <Link href={item.href} onClick={() => setMoreOpen(false)} aria-current={current ? "page" : undefined} className={rowClass}>
                    <item.icon className="size-5" aria-hidden /> {t(item.label)}
                  </Link>
                )}
                {/* its pages, indented (Accounts: the six heads) */}
                {item.children && groupOpen && (
                  <ul className="mt-1 flex flex-col gap-0.5 pl-8">
                    {item.children.map((child) => {
                      const here = isSubCurrent(child, pathname);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={() => setMoreOpen(false)}
                            aria-current={here ? "page" : undefined}
                            className={cn("flex min-h-11 items-center rounded-control px-3 text-base", here ? "bg-chestnut/10 font-semibold" : "hover:bg-chestnut/[0.06]")}
                          >
                            {t(`heads.${child.label}`)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

// one icon-and-label slot in the bar
function BarLink({ item, current, label }: { item: NavItem; current: boolean; label: string }) {
  return (
    <Link href={item.href} aria-current={current ? "page" : undefined} className={cn(slot, tone(current))}>
      <item.icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
