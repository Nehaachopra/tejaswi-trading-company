import { Activity, ClipboardList, HandCoins, History, House, Landmark, type LucideIcon, Package, Receipt, Users, Warehouse } from "lucide-react";

export type Role = "admin" | "staff";

export type NavItem = {
  href: string;
  // key under shell.nav in the translation files
  label: "home" | "history" | "orders" | "stock" | "products" | "entities" | "accounts" | "dues" | "gst" | "jobs";
  icon: LucideIcon;
  adminOnly?: boolean;
  // on phones: in the bottom bar, in the More sheet, or not at all (Home: the logo goes there)
  place: "bar" | "more" | "none";
  // pages listed under it (Accounts: the six heads); `also` are paths that belong to one, such as a bank
  // account's pages under Asset
  children?: { href: string; label: SubLabel; also?: string[] }[];
};

// keys under shell.nav.heads
export type SubLabel = HeadLabel | "opening" | "parties" | "banks";

// the six heads (each tagged Debit or Credit)
export type HeadLabel = "asset" | "liability" | "income" | "expense" | "profit" | "loss";

// the six heads carry a Debit or Credit tag; the other pages under a group don't
const HEADS: readonly string[] = ["asset", "liability", "income", "expense", "profit", "loss"];
export const isHead = (label: SubLabel): label is HeadLabel => HEADS.includes(label);

// the side a head's accounts sit on, shown beside it: Asset, Expense and Loss are debit accounts, the rest credit
export const sideOf = (head: HeadLabel) => (head === "asset" || head === "expense" || head === "loss" ? "debit" : "credit");

// the side's tag: Debit filled, Credit outlined, so the two read apart at a glance
export const sideTag = (head: HeadLabel) =>
  `shrink-0 rounded-control border px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide ${
    sideOf(head) === "debit" ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut text-chestnut"
  }`;

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
      { href: "/account/asset", label: "asset", also: ["/account/bank", "/account/debtor", "/account/debtor-creditor", "/account/parties"] },
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
];

export const NEW_TRANSACTION_HREF = "/transaction";

// how wide the app gets on a wide screen: 1440px, centred (the header's contents, the sidebar and the page)
export const SHELL_WIDTH = "mx-auto w-full max-w-[90rem]";

// staff never see admin-only pages
export const navFor = (role: Role) => NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");

// a page under an item lights up on its own path and on the paths that belong to it
export const isSubCurrent = (child: NonNullable<NavItem["children"]>[number], pathname: string) =>
  [child.href, ...(child.also ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));

// Home lights up only on "/"; every other item also for the pages under it (/product/categories → Products)
export const isCurrent = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
