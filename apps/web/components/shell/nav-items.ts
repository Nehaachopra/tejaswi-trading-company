import { Activity, ClipboardList, History, House, Landmark, type LucideIcon, Package, Receipt, Users, Warehouse } from "lucide-react";

export type Role = "admin" | "staff";

export type NavItem = {
  href: string;
  // key under shell.nav in the translation files
  label: "home" | "history" | "orders" | "stock" | "products" | "parties" | "accounts" | "gst" | "jobs";
  icon: LucideIcon;
  adminOnly?: boolean;
  // on phones: in the bottom bar, in the More sheet, or not at all (Home: the logo goes there)
  place: "bar" | "more" | "none";
  // pages listed under it (Accounts: the six heads); `also` are paths that belong to one, such as a bank
  // account's pages under Asset
  children?: { href: string; label: SubLabel; also?: string[] }[];
};

// keys under shell.nav.heads
export type SubLabel = "asset" | "liability" | "income" | "expense" | "profit" | "loss";

// every page the shell links to, in sidebar order; New transaction (/transaction) has its own button
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "home", icon: House, place: "none" },
  { href: "/history", label: "history", icon: History, place: "bar" },
  { href: "/stock", label: "stock", icon: Warehouse, place: "bar" },
  { href: "/order", label: "orders", icon: ClipboardList, place: "bar" },
  { href: "/product", label: "products", icon: Package, adminOnly: true, place: "more" },
  { href: "/party", label: "parties", icon: Users, adminOnly: true, place: "more" },
  {
    href: "/account",
    label: "accounts",
    icon: Landmark,
    adminOnly: true,
    place: "more",
    children: [
      { href: "/account/asset", label: "asset", also: ["/account/bank", "/account/debtor", "/account/debtor-creditor"] },
      { href: "/account/liability", label: "liability", also: ["/account/creditor"] },
      { href: "/account/income", label: "income" },
      { href: "/account/expense", label: "expense" },
      { href: "/account/profit", label: "profit" },
      { href: "/account/loss", label: "loss" },
    ],
  },
  { href: "/gst", label: "gst", icon: Receipt, adminOnly: true, place: "more" },
  { href: "/jobs", label: "jobs", icon: Activity, adminOnly: true, place: "more" },
];

export const NEW_TRANSACTION_HREF = "/transaction";

// staff never see admin-only pages
export const navFor = (role: Role) => NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");

// a page under an item lights up on its own path and on the paths that belong to it
export const isSubCurrent = (child: NonNullable<NavItem["children"]>[number], pathname: string) =>
  [child.href, ...(child.also ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));

// Home lights up only on "/"; every other item also for the pages under it (/product/categories → Products)
export const isCurrent = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
