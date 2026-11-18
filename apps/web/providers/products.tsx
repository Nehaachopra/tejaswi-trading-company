"use client";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type ProductFilters = RouterInputs["inventory"]["product"]["list"];

// the products with their pack sizes, for the filters given
export function useProducts(filters: ProductFilters, enabled = true) {
  return trpc.inventory.product.list.useQuery(filters, { enabled });
}

// one pack size's recent prices, for its chart
export function usePriceHistory(productId: string) {
  return trpc.inventory.product.priceHistory.useQuery({ productId, range: "recent" });
}

// one pack size's last purchase costs, for a purchase order's cost chart
export function useCostHistory(productId: string) {
  return trpc.inventory.product.costHistory.useQuery({ productId });
}

// a product's saves (add, details, price, delete) and what is read again after them
export function useProductActions() {
  const utils = trpc.useUtils();
  return {
    create: trpc.inventory.product.create.useMutation(),
    updateDetails: trpc.inventory.product.updateDetails.useMutation(),
    updatePrice: trpc.inventory.product.updatePrice.useMutation(),
    remove: trpc.inventory.product.delete.useMutation(),
    // the product cards and the categories' product counts
    refreshProducts: () => {
      void utils.inventory.product.list.invalidate();
      void utils.inventory.category.list.invalidate();
    },
    // the product cards alone
    refreshList: () => void utils.inventory.product.list.invalidate(),
    // one pack size's price chart
    refreshPrices: (productId: string) => void utils.inventory.product.priceHistory.invalidate({ productId }),
    // take a pack size off the cards at once (a product with no pack size left goes too): from the lists that hide
    // inactive ones (made inactive), or from every list (deleted); the refetch after then confirms it
    dropPack: (productId: string, everywhere: boolean) =>
      utils.inventory.product.list.setQueriesData(
        {},
        { predicate: (q) => everywhere || !(q.queryKey[1] as { input?: { includeInactive?: boolean } } | undefined)?.input?.includeInactive },
        (groups) =>
          groups?.map((g) => ({ ...g, packs: g.packs.filter((p) => p.productId !== productId) })).filter((g) => g.packs.length > 0),
      ),
  };
}
