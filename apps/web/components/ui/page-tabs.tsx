"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";

export type PageTab = {
  key: string;
  label: string;
  // a shorter name for a phone, where four tabs must fit
  short?: string;
  current: boolean;
  // a link to its page, or a tap on this one
  href?: string;
  onPick?: () => void;
  // how many, beside its name; null while it loads
  count?: number | null;
};

// a page's parts, one tap apart: every page with tabs uses these. Sticky just below the 64px header; the chestnut fill
// hides the cards scrolling underneath, and the tab picked stays in view on a phone
export function PageTabs({ label, tabs }: { label: string; tabs: PageTab[] }) {
  const currentTab = useRef<HTMLLIElement | null>(null);
  const currentKey = tabs.find((tab) => tab.current)?.key;
  useEffect(() => {
    currentTab.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentKey]);

  return (
    <nav aria-label={label} className="scrollbar-none sticky top-16 z-20 -mx-4 overflow-x-auto bg-chestnut px-4 sm:-mx-6 sm:px-6">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map((tab) => {
          const look = cn(
            "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm transition-colors",
            tab.current ? "border-ivory font-semibold text-ivory" : "border-transparent text-ivory/70 hover:text-ivory",
          );
          const body = (
            <>
              {tab.short ? (
                <>
                  <span className="sm:hidden">{tab.short}</span>
                  <span className="max-sm:hidden">{tab.label}</span>
                </>
              ) : (
                tab.label
              )}
              {tab.count !== undefined && (
                <span className={cn("tabular min-w-6 rounded-control px-1.5 text-center text-xs leading-5", tab.current ? "bg-ivory text-chestnut" : "bg-ivory/[0.12]")}>
                  {tab.count ?? "–"}
                </span>
              )}
            </>
          );
          return (
            <li key={tab.key} ref={tab.current ? currentTab : undefined}>
              {tab.href ? (
                <Link href={tab.href} aria-current={tab.current ? "page" : undefined} className={look}>
                  {body}
                </Link>
              ) : (
                <button type="button" aria-current={tab.current ? "page" : undefined} onClick={tab.onPick} className={look}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
