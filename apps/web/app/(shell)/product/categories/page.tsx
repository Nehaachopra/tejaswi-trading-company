import type { Metadata } from "next";

import { CategoriesBoard } from "~/components/product/categories/categories-board";

export const metadata: Metadata = { title: "Categories · Tejaswi trading company" };

// the layout already checked for an admin session
export default function CategoriesPage() {
  return <CategoriesBoard />;
}
