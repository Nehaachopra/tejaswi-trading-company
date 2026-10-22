import type { Metadata } from "next";

import { ProductsBoard } from "~/components/product/products/products-board";

export const metadata: Metadata = { title: "Products · Tejaswi trading company" };

// the layout already checked for an admin session
export default function ProductPage() {
  return <ProductsBoard />;
}
