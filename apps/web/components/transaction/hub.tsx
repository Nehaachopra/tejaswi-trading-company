"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
  Landmark,
  type LucideIcon,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { PAGE } from "~/components/ui/page-styles";
import { toast } from "~/components/ui/toast";

type Kind = { key: string; icon: LucideIcon; href?: string; adminOnly?: boolean };

// every kind of transaction, under what it's about: goods moving, orders, money, then the admin's own; the ones built
// so far open their page. Returns aren't here: they start from a sale's or purchase's row in History
const GROUPS: { key: string; kinds: Kind[] }[] = [
  {
    key: "goods",
    kinds: [
      { key: "sale", icon: ShoppingCart, href: "/transaction/sale" },
      { key: "purchase", icon: Truck, href: "/transaction/purchase" },
    ],
  },
  {
    key: "orders",
    kinds: [
      { key: "saleOrder", icon: ClipboardList, href: "/transaction/sale-order" },
      { key: "purchaseOrder", icon: ClipboardCheck, adminOnly: true, href: "/transaction/purchase-order" },
    ],
  },
  {
    key: "money",
    kinds: [
      { key: "receipt", icon: ArrowDownLeft, href: "/transaction/receipt" },
      { key: "payment", icon: ArrowUpRight, href: "/transaction/payment" },
      { key: "deposit", icon: Landmark, href: "/transaction/deposit" },
      { key: "withdrawal", icon: Wallet, href: "/transaction/withdrawal" },
      { key: "transfer", icon: ArrowLeftRight, href: "/transaction/transfer" },
      { key: "salary", icon: Users, adminOnly: true, href: "/transaction/salary" },
    ],
  },
  {
    key: "admin",
    kinds: [
      { key: "drawing", icon: HandCoins, adminOnly: true },
      { key: "others", icon: BookOpen, adminOnly: true, href: "/transaction/other" },
    ],
  },
];

const tile =
  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-control bg-ivory p-3 text-center font-heading text-base font-bold text-chestnut";

// /transaction: a tile for every kind of transaction the person may make, group by group under its heading (purchase
// orders, salary, drawings and others are the admin's; a group with nothing for the person isn't shown); a kind not
// built yet says so
export function TransactionHub({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("transactions.hub");
  const groups = GROUPS.map((g) => ({ ...g, kinds: g.kinds.filter((k) => isAdmin || !k.adminOnly) })).filter((g) => g.kinds.length > 0);

  return (
    <main className={`${PAGE} flex flex-col gap-6 pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`hub-${g.key}`}>
          <h2 id={`hub-${g.key}`} className="mb-2 font-heading text-lg font-bold">
            {t(`groups.${g.key}`)}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {g.kinds.map((k) => (
              <li key={k.key}>
                {k.href ? (
                  <Link href={k.href} className={`on-ivory ${tile}`}>
                    <k.icon className="size-7" aria-hidden />
                    {t(`kinds.${k.key}`)}
                  </Link>
                ) : (
                  <button type="button" onClick={() => toast.info(t("comingSoon"))} className={`on-ivory w-full opacity-60 ${tile}`}>
                    <k.icon className="size-7" aria-hidden />
                    {t(`kinds.${k.key}`)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
