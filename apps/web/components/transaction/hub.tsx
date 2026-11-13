"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  HandCoins,
  Landmark,
  type LucideIcon,
  Redo2,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { PAGE } from "~/components/ui/page-styles";
import { toast } from "~/components/ui/toast";

type Kind = { key: string; icon: LucideIcon; href?: string; adminOnly?: boolean };

// every kind of transaction, in the order people reach for them; the ones built so far open their page
const KINDS: Kind[] = [
  { key: "sale", icon: ShoppingCart },
  { key: "purchase", icon: Truck },
  { key: "order", icon: ClipboardList, adminOnly: true, href: "/transaction/order" },
  { key: "receipt", icon: ArrowDownLeft, href: "/transaction/receipt" },
  { key: "payment", icon: ArrowUpRight, href: "/transaction/payment" },
  { key: "deposit", icon: Landmark, href: "/transaction/deposit" },
  { key: "withdrawal", icon: Wallet, href: "/transaction/withdrawal" },
  { key: "transfer", icon: ArrowLeftRight, href: "/transaction/transfer" },
  { key: "saleReturn", icon: Undo2 },
  { key: "purchaseReturn", icon: Redo2 },
  { key: "salary", icon: Users, adminOnly: true, href: "/transaction/salary" },
  { key: "drawing", icon: HandCoins, adminOnly: true },
  { key: "others", icon: BookOpen, adminOnly: true, href: "/transaction/other" },
];

const tile =
  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-control bg-ivory p-3 text-center font-heading text-base font-bold text-chestnut";

// /transaction: a tile for every kind of transaction the person may make (salary, drawings and others are the
// admin's); a kind not built yet says so
export function TransactionHub({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("transactions.hub");

  return (
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {KINDS.filter((k) => isAdmin || !k.adminOnly).map((k) => (
          <li key={k.key}>
            {k.href ? (
              <Link href={k.href} className={`on-ivory ${tile}`}>
                <k.icon className="size-7" aria-hidden />
                {t(`kinds.${k.key}`)}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => toast.info(t("comingSoon"))}
                className={`on-ivory w-full opacity-60 ${tile}`}
              >
                <k.icon className="size-7" aria-hidden />
                {t(`kinds.${k.key}`)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
