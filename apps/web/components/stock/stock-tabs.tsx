"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

const TABS = [
  { href: "/stock", key: "godowns" },
  { href: "/stock/count", key: "count" },
] as const;

// the two parts of stock, one tap apart: Godowns (with how many active ones) and Stock count
export function StockTabs() {
  const t = useTranslations("stock.tabs");
  const pathname = usePathname();
  const godowns = trpc.inventory.godown.list.useQuery({ includeInactive: false });

  return (
    // sticky just below the 64px header; its chestnut fill hides the cards scrolling underneath
    <nav aria-label={t("label")} className="sticky top-16 z-20 -mx-4 overflow-x-auto bg-chestnut px-4 sm:-mx-6 sm:px-6">
      <ul className="flex min-w-max gap-1 border-b">
        {TABS.map((tab) => {
          const current = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm transition-colors",
                  current ? "border-ivory font-semibold text-ivory" : "border-transparent text-ivory/70 hover:text-ivory",
                )}
              >
                {t(tab.key)}
                {/* the godown count beside its name */}
                {tab.key === "godowns" && (
                  <span
                    className={cn(
                      "tabular min-w-6 rounded-control px-1.5 text-center text-xs leading-5",
                      current ? "bg-ivory text-chestnut" : "bg-ivory/[0.12]",
                    )}
                  >
                    {godowns.data?.length ?? "–"}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
