import type { QueryClient } from "@tanstack/react-query";

// tRPC keys start with the procedure path as an array: [["inventory", "stock", "byGodown"], …] (a mutation's too)
export const scopeOf = (key: readonly unknown[] | undefined) =>
  Array.isArray(key?.[0]) && typeof key[0][0] === "string" ? (key[0][0] as string) : null;

// a change that moves stock (an order holds or frees it, a sale or purchase takes or adds it) also refreshes the
// products and stock, so an open order or sale shows what's free now; a sale or purchase may also dispatch or receive
// an order (and complete it), so it refreshes the orders too
const alsoRefresh: Record<string, string[]> = { orders: ["inventory"], transactions: ["inventory", "orders"] };

// signing in and out changes nothing on screen
const QUIET = new Set(["auth", "health"]);

// a part of the app changed (here, or in another tab): its queries refetch, with the parts it touches. Only the ones on
// screen fetch now; the rest refetch when next shown. Open forms keep what's typed: they copy the data once, when they
// open
export function refreshScope(queryClient: QueryClient, scope: string) {
  if (QUIET.has(scope)) return;
  const scopes = [scope, ...(alsoRefresh[scope] ?? [])];
  void queryClient.invalidateQueries({ predicate: (q) => scopes.includes(scopeOf(q.queryKey) ?? "") });
}
