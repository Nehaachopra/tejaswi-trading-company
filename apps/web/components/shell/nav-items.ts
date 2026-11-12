import {
  Activity,
  ClipboardList,
  HandCoins,
  History,
  House,
  Landmark,
  type LucideIcon,
  Package,
  Receipt,
  Settings,
  Users,
  Warehouse,
} from "lucide-react";

export type Role = "admin" | "staff";

export type NavItem = {
  href: string;
  // key under shell.nav in the translation files
  label:
    | "home"
    | "history"
    | "orders"
    | "stock"
    | "products"
    | "entities"
    | "accounts"
    | "dues"
    | "gst"
    | "jobs"
    | "settings";
  icon: LucideIcon;
  adminOnly?: boolean;
  // on phones: in the bottom bar, in the More sheet, or not at all (Home: the logo goes there)
  place: "bar" | "more" | "none";
  // pages listed under it (Accounts: the six heads); `also` are paths that belong to one, such as a bank
  // account's pages under Asset
  children?: { href: string; label: SubLabel; also?: string[] }[];
};

// keys under shell.nav.heads
export type SubLabel = HeadLabel | "opening" | "parties" | "landlords" | "lenders" | "banks";

// the six heads (listed under Debit or Credit)
export type HeadLabel = "asset" | "liability" | "income" | "expense" | "profit" | "loss";

// the six heads sit under Debit or Credit; the other pages under a group don't
const HEADS: readonly string[] = ["asset", "liability", "income", "expense", "profit", "loss"];
export const isHead = (label: SubLabel): label is HeadLabel => HEADS.includes(label);

// the side a head's accounts sit on: Asset, Expense and Loss are debit accounts, the rest credit
export const sideOf = (head: HeadLabel) =>
  head === "asset" || head === "expense" || head === "loss" ? "debit" : "credit";

// a group's pages in sections: the heads under Debit (asset, expense, loss), then under Credit (liability, income,
// profit), then the rest without a heading (Opening balances). A group without heads is one section
type Child = NonNullable<NavItem["children"]>[number];
export function bySide(children: Child[]): { side: "debit" | "credit" | null; items: Child[] }[] {
  const heads = (side: "debit" | "credit") =>
    children.filter((c) => isHead(c.label) && sideOf(c.label) === side);
  return [
    { side: "debit" as const, items: heads("debit") },
    { side: "credit" as const, items: heads("credit") },
    { side: null, items: children.filter((c) => !isHead(c.label)) },
  ].filter((g) => g.items.length > 0);
}

// every page the shell links to, in sidebar order; New transaction (/transaction) has its own button
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "home", icon: House, place: "none" },
  { href: "/history", label: "history", icon: History, place: "bar" },
  { href: "/stock", label: "stock", icon: Warehouse, place: "bar" },
  { href: "/order", label: "orders", icon: ClipboardList, place: "bar" },
  { href: "/product", label: "products", icon: Package, adminOnly: true, place: "more" },
  // the people and accounts the business deals with, added and edited here (Accounts shows their ledgers)
  {
    href: "/entities",
    label: "entities",
    icon: Users,
    adminOnly: true,
    place: "more",
    children: [
      // landlords and lenders are reached from Parties (and their pages still open by address)
      { href: "/entities/parties", label: "parties" },
      { href: "/entities/banks", label: "banks" },
    ],
  },
  {
    href: "/account",
    label: "accounts",
    icon: Landmark,
    adminOnly: true,
    place: "more",
    children: [
      {
        href: "/account/asset",
        label: "asset",
        also: ["/account/bank", "/account/debtor", "/account/debtor-creditor", "/account/parties"],
      },
      { href: "/account/liability", label: "liability", also: ["/account/creditor"] },
      { href: "/account/income", label: "income" },
      { href: "/account/expense", label: "expense" },
      { href: "/account/profit", label: "profit" },
      { href: "/account/loss", label: "loss" },
      // every ledger's opening balance, on one page
      { href: "/account/opening", label: "opening" },
    ],
  },
  // what's owed both ways: debtors, creditors, loans given and taken
  { href: "/dues", label: "dues", icon: HandCoins, adminOnly: true, place: "more" },
  { href: "/gst", label: "gst", icon: Receipt, adminOnly: true, place: "more" },
  { href: "/jobs", label: "jobs", icon: Activity, adminOnly: true, place: "more" },
  { href: "/settings", label: "settings", icon: Settings, adminOnly: true, place: "more" },
];

export const NEW_TRANSACTION_HREF = "/transaction";

// how wide the app gets on a wide screen: 1440px, centred (the header's contents, the sidebar and the page)
export const SHELL_WIDTH = "mx-auto w-full max-w-[90rem]";

// staff never see admin-only pages
export const navFor = (role: Role) =>
  NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");

// a page under an item lights up on its own path and on the paths that belong to it
export const isSubCurrent = (child: NonNullable<NavItem["children"]>[number], pathname: string) =>
  [child.href, ...(child.also ?? [])].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );

// Home lights up only on "/"; every other item also for the pages under it (/product/categories → Products)
export const isCurrent = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
