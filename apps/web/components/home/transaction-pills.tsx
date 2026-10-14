"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Banknote,
  Ellipsis,
  HandCoins,
  Landmark,
  Package,
  Plus,
  RotateCcw,
  ShoppingCart,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type TransactionKey =
  | "sale"
  | "purchase"
  | "receipt"
  | "payment"
  | "deposit"
  | "withdrawal"
  | "drawings"
  | "returns"
  | "other";

// the nine actions from .claude/pages/home-page.md, in that order
const transactions: { key: TransactionKey; icon: LucideIcon }[] = [
  { key: "sale", icon: ShoppingCart },
  { key: "purchase", icon: Package },
  { key: "receipt", icon: HandCoins },
  { key: "payment", icon: Wallet },
  { key: "deposit", icon: Landmark },
  { key: "withdrawal", icon: Banknote },
  { key: "drawings", icon: User },
  { key: "returns", icon: RotateCcw },
  { key: "other", icon: Ellipsis },
];

export function TransactionPills() {
  const t = useTranslations("home");

  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {transactions.map(({ key, icon: Icon }) => {
        const label = t(`transactions.${key}`);
        return (
          <li key={key}>
            <button
              type="button"
              aria-label={t("add", { transaction: label })}
              onClick={() => toast(t("comingSoon", { transaction: label }))}
              className="flex h-12 w-full items-center gap-2.5 rounded-full border bg-card pr-1.5 pl-4 text-left text-sm font-medium shadow-xs transition-colors hover:bg-muted active:translate-y-px"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="size-4" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
