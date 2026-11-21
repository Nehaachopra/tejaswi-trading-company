"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type CreateSaleIn = RouterInputs["transactions"]["sale"]["create"];
type EditSaleIn = RouterInputs["transactions"]["sale"]["edit"];

// what the sale form needs from the server before anything is typed: the active products, their categories, what each
// godown holds, our place of business (a cash sale goes there unless changed), the bank accounts, and the save; and
// for a dispatch on a sale order, that order. Made once for the page; the form reads it with useSaleData(). Every
// read is tried again by itself before it counts as failed; the save never is. Editing a sale (the admin's): the sale as
// it was saved, its customer as the Customer card picks one, and the edit's save
function useSaleDataState(orderId: string | null, editId: string | null, exchangePartyId: string | null) {
  const utils = trpc.useUtils();
  const products = trpc.inventory.product.list.useQuery({ includeInactive: false });
  const categories = trpc.inventory.category.list.useQuery({ includeInactive: false });
  const stock = trpc.inventory.stock.byGodown.useQuery();
  const place = trpc.transactions.sale.placeOfBusiness.useQuery();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const order = trpc.orders.sale.get.useQuery({ id: orderId ?? "" }, { enabled: orderId !== null });
  // the order's customer as the Customer card picks one (their ledger, with what they owe), when it's for a customer
  const orderPartyId = order.data?.status === "pending" ? order.data.customer.partyId : null;
  const orderLedger = trpc.accounts.ledger.pickable.useQuery(
    { purpose: "receipt", receiptKind: "customer", partyId: orderPartyId },
    { enabled: !!orderPartyId },
  );
  const create = trpc.transactions.sale.create.useMutation();
  // an edit: the sale as saved, and its customer (their ledger) when it has one
  const editing = trpc.transactions.sale.forEdit.useQuery({ transactionId: editId ?? "" }, { enabled: editId !== null });
  const editPartyId = editing.data?.customer?.partyId ?? null;
  const editLedger = trpc.accounts.ledger.pickable.useQuery(
    { purpose: "receipt", receiptKind: "customer", partyId: editPartyId },
    { enabled: !!editPartyId },
  );
  const edit = trpc.transactions.sale.edit.useMutation();
  // an exchange's new sale to a customer: their ledger, as the Customer card picks one
  const exchangeLedger = trpc.accounts.ledger.pickable.useQuery(
    { purpose: "receipt", receiptKind: "customer", partyId: exchangePartyId },
    { enabled: !!exchangePartyId },
  );

  // saves it; then what it changed is asked again (stock, balances, dues), and the saved sale is put in hand for its
  // success page
  async function saveSale(input: CreateSaleIn) {
    const sale = await create.mutateAsync(input);
    void utils.inventory.product.list.invalidate();
    void utils.inventory.stock.invalidate();
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    void utils.transactions.due.invalidate();
    void utils.orders.invalidate();
    return sale;
  }

  // an edit saved: the same reads again, and History and the sale's invoice
  async function saveEdit(input: EditSaleIn) {
    const sale = await edit.mutateAsync(input);
    void utils.inventory.product.list.invalidate();
    void utils.inventory.stock.invalidate();
    void utils.accounts.invalidate();
    void utils.transactions.invalidate();
    void utils.orders.invalidate();
    return sale;
  }

  const reads = [
    products,
    categories,
    stock,
    place,
    banks,
    ...(orderId !== null ? [order] : []),
    ...(orderPartyId ? [orderLedger] : []),
    ...(editId !== null ? [editing] : []),
    ...(editPartyId ? [editLedger] : []),
    ...(exchangePartyId ? [exchangeLedger] : []),
  ];
  return {
    // only an order still waiting for goods: a completed or cancelled one makes it a sale of its own
    order: orderId !== null && order.data?.status === "pending" ? order.data : null,
    orderLedger: orderPartyId ? (orderLedger.data?.[0] ?? null) : null,
    products: products.data,
    categories: categories.data,
    stock: stock.data,
    placeOfBusiness: place.data,
    banks: banks.data,
    loading: reads.some((r) => r.isPending),
    loadFailed: reads.some((r) => r.isError),
    retryLoad: () => reads.forEach((r) => r.isError && void r.refetch()),
    saveSale,
    editing: editId !== null ? (editing.data ?? null) : null,
    editLedger: editPartyId ? (editLedger.data?.[0] ?? null) : null,
    saveEdit,
    exchangeLedger: exchangePartyId ? (exchangeLedger.data?.[0] ?? null) : null,
    saving: create.isPending || edit.isPending,
    saved: create.isSuccess || edit.isSuccess,
  };
}

const SaleDataContext = createContext<ReturnType<typeof useSaleDataState> | null>(null);

export function SaleDataProvider({
  children,
  orderId = null,
  editId = null,
  exchangePartyId = null,
}: {
  children: React.ReactNode;
  orderId?: string | null;
  editId?: string | null;
  exchangePartyId?: string | null;
}) {
  const value = useSaleDataState(orderId, editId, exchangePartyId);
  return <SaleDataContext.Provider value={value}>{children}</SaleDataContext.Provider>;
}

export function useSaleData() {
  const value = useContext(SaleDataContext);
  if (!value) throw new Error("useSaleData is used outside SaleDataProvider");
  return value;
}

// a saved sale for its success page: its number, items, total and whether it was cash or credit
export function useSavedSale(transactionId: string) {
  const q = trpc.transactions.sale.get.useQuery({ transactionId });
  return { sale: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a sale as its tax invoice: ours, or (with the key from a shared link) the customer's copy, opened without a login
export function useSaleInvoice(transactionId: string, shareKey?: string) {
  const shared = shareKey !== undefined;
  const own = trpc.transactions.sale.invoice.useQuery({ transactionId }, { enabled: !shared });
  const theirs = trpc.transactions.sale.shared.useQuery({ transactionId, key: shareKey ?? "" }, { enabled: shared, retry: false });
  const q = shared ? theirs : own;
  return { invoice: q.data, loading: q.isPending, loadFailed: q.isError };
}

// the key for the invoice's link, sent to the customer on WhatsApp
// (undefined until it comes)
export function useSaleShareKey(transactionId: string, enabled = true) {
  const q = trpc.transactions.sale.shareKey.useQuery({ transactionId }, { enabled });
  return { key: q.data?.key };
}
