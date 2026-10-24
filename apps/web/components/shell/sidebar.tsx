"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";

import { isCurrent, isSubCurrent, type NavItem, navFor, type Role, sideOf, sideTag } from "./nav-items";

const row = (current: boolean) =>
  cn(
    "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm transition-colors",
    current ? "bg-chestnut font-semibold text-ivory" : "text-chestnut/80 hover:bg-chestnut/6 hover:text-chestnut",
  );

// from 1024px, ivory with chestnut ink: every page the role may open; one with pages under it (Accounts)
// can be opened and closed
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
          if (item.children) return <Group key={item.href} item={item} current={current} pathname={pathname} label={t(item.label)} />;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={current ? "page" : undefined} className={row(current)}>
                <item.icon className="size-5" aria-hidden /> {t(item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// an item with pages under it (Accounts): tapping it only opens and closes the list; a page opens when one is
// picked. It opens by itself on arriving at one of its pages
function Group({ item, current, pathname, label }: { item: NavItem; current: boolean; pathname: string; label: string }) {
  const t = useTranslations("shell.nav");
  const [open, setOpen] = useState(current);
  const listId = `nav-${item.label}`;
  const children = item.children!;

  useEffect(() => {
    if (current) setOpen(true);
  }, [current]);

  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)} className={cn(row(current), "w-full text-left")}>
        <item.icon className="size-5" aria-hidden /> <span className="flex-1">{label}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {/* its pages, indented; the one open is tinted */}
      {open && (
        <ul id={listId} className="mt-1 flex flex-col gap-0.5 pl-8">
          {children.map((child) => {
            const here = isSubCurrent(child, pathname);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  aria-current={here ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center rounded-control px-3 text-sm transition-colors",
                    here ? "bg-chestnut/10 font-semibold text-chestnut" : "text-chestnut/80 hover:bg-chestnut/6 hover:text-chestnut",
                  )}
                >
                  <span className="flex-1">{t(`heads.${child.label}`)}</span>
                  {/* debit or credit account */}
                  {child.label !== "opening" && <span className={sideTag(child.label)}>{t(sideOf(child.label))}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
