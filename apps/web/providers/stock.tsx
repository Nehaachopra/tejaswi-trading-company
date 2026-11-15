"use client";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type MovesIn = Extract<RouterInputs["inventory"]["stock"]["moves"], object>;

// the godowns: active only, or with the inactive ones
export function useGodowns(includeInactive: boolean) {
  return trpc.inventory.godown.list.useQuery({ includeInactive });
}

// one godown's saved details, for its edit sheet (asked only once a godown is picked)
export function useGodown(id: string | null) {
  return trpc.inventory.godown.get.useQuery({ id: id ?? "" }, { enabled: !!id });
}

// what each godown holds, pack size by pack size
export function useStockByGodown() {
  return trpc.inventory.stock.byGodown.useQuery();
}

// stock moved between godowns, newest first: the first page, and a way to read the older pages one at a time
export function useStockMoves(input: MovesIn, enabled: boolean) {
  const utils = trpc.useUtils();
  const first = trpc.inventory.stock.moves.useQuery(input, { enabled });
  return { first, fetchOlder: (before: MovesIn["before"]) => utils.inventory.stock.moves.fetch({ ...input, before }) };
}

// a godown's saves (add, details, active or inactive), moving stock, and what is read again after them
export function useGodownActions() {
  const utils = trpc.useUtils();
  // what each godown holds
  const refreshStock = () => void utils.inventory.stock.byGodown.invalidate();
  return {
    create: trpc.inventory.godown.create.useMutation(),
    update: trpc.inventory.godown.update.useMutation(),
    setActive: trpc.inventory.godown.setActive.useMutation(),
    move: trpc.inventory.stock.move.useMutation(),
    refreshStock,
    // the godown list and what each holds
    refreshGodowns: () => {
      void utils.inventory.godown.list.invalidate();
      refreshStock();
    },
    // a godown's details changed: its own details too
    refreshGodown: () => {
      void utils.inventory.godown.invalidate();
      refreshStock();
    },
    // a godown added with stock in it: the products' quantities too
    refreshWithProducts: () => {
      void utils.inventory.godown.list.invalidate();
      refreshStock();
      void utils.inventory.product.list.invalidate();
    },
    // stock moved: everything about stock (what's held, the moves) and the godown list
    refreshMoved: () => {
      void utils.inventory.stock.invalidate();
      void utils.inventory.godown.list.invalidate();
    },
  };
}
