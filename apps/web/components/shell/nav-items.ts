import { Activity, ClipboardList, History, House, Landmark, type LucideIcon, Package, Receipt, Warehouse } from "lucide-react";

export type Role = "admin" | "staff";

export type NavItem = {
  href: string;
  // key under shell.nav in the translation files
  label: "home" | "history" | "orders" | "stock" | "products" | "accounts" | "gst" | "jobs";
  icon: LucideIcon;
  adminOnly?: boolean;
  // on phones: in the bottom bar, in the More sheet, or not at all (Home: the logo goes there)
  place: "bar" | "more" | "none";
};

// every page the shell links to, in sidebar order; New transaction (/transaction) has its own button
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "home", icon: House, place: "none" },
  { href: "/history", label: "history", icon: History, place: "bar" },
  { href: "/stock", label: "stock", icon: Warehouse, place: "bar" },
  { href: "/order", label: "orders", icon: ClipboardList, place: "bar" },
  { href: "/product", label: "products", icon: Package, adminOnly: true, place: "more" },
  { href: "/account", label: "accounts", icon: Landmark, adminOnly: true, place: "more" },
  { href: "/gst", label: "gst", icon: Receipt, adminOnly: true, place: "more" },
  { href: "/jobs", label: "jobs", icon: Activity, adminOnly: true, place: "more" },
];

export const NEW_TRANSACTION_HREF = "/transaction";

// staff never see admin-only pages
export const navFor = (role: Role) => NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");

// Home lights up only on "/"; every other item also for the pages under it (/product/categories → Products)
export const isCurrent = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
