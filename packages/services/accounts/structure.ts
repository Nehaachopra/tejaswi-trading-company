// the accounting structure the app creates itself (the one exception to "no seed data"):
// groups, the masters that hold one ledger per bank account, party or employee, and the fixed ledgers

export type GroupType = "asset" | "liability" | "income" | "expense";

// profit and loss has no group of its own: it is worked out from income and expense
export const GROUPS: Record<GroupType, string> = {
  asset: "Asset",
  liability: "Liability",
  income: "Income",
  expense: "Expense",
};

export const MASTERS = {
  debtors: { group: "asset", name: "Debtors" },
  // parties who are both customer and supplier: one net ledger each
  debtorCreditors: { group: "asset", name: "Debtor-creditors" },
  bank: { group: "asset", name: "Bank" },
  creditors: { group: "liability", name: "Creditors" },
  employees: { group: "liability", name: "Employees" },
  // parties with no sale or purchase yet (added from a receipt or in Entities); their first sale or purchase moves
  // them to Debtors or Creditors
  parties: { group: "asset", name: "Parties" },
} as const satisfies Record<string, { group: GroupType; name: string }>;

export type MasterKey = keyof typeof MASTERS;

// names are stored in lowercase (screens show them in the reader's language, by key)
export const LEDGERS = {
  cash: { group: "asset", name: "cash" },
  inputCgst: { group: "asset", name: "input cgst" },
  inputSgst: { group: "asset", name: "input sgst" },
  inputIgst: { group: "asset", name: "input igst" },
  // TDS customers deduct from us
  tdsReceivable: { group: "asset", name: "tds receivable" },

  outputCgst: { group: "liability", name: "output cgst" },
  outputSgst: { group: "liability", name: "output sgst" },
  outputIgst: { group: "liability", name: "output igst" },
  // reverse-charge GST stays apart from normal output GST, for GSTR-3B
  outputCgstRcm: { group: "liability", name: "output cgst (rcm)" },
  outputSgstRcm: { group: "liability", name: "output sgst (rcm)" },
  outputIgstRcm: { group: "liability", name: "output igst (rcm)" },
  // TDS we deduct from others
  tdsPayable: { group: "liability", name: "tds payable" },
  tcs: { group: "liability", name: "tcs" },
  drawings: { group: "liability", name: "drawings" },
  // the other side of every opening balance
  capital: { group: "liability", name: "capital" },

  sale: { group: "income", name: "sale" },
  // goods sent back to a supplier take back what the purchase cost
  purchaseReturn: { group: "income", name: "purchase return" },
  discountReceived: { group: "income", name: "discount received" },
  scrapSale: { group: "income", name: "scrap sale" },
  insuranceClaim: { group: "income", name: "insurance claim" },
  interestReceived: { group: "income", name: "interest received" },

  salary: { group: "expense", name: "salary" },
  purchase: { group: "expense", name: "purchase" },
  // goods a customer sends back take back what the sale earned
  saleReturn: { group: "expense", name: "sale return" },
  discountGiven: { group: "expense", name: "discount given" },
  rent: { group: "expense", name: "rent" },
  electricity: { group: "expense", name: "electricity" },
  wifi: { group: "expense", name: "wifi expense" },
} as const satisfies Record<string, { group: GroupType; name: string }>;

export type LedgerKey = keyof typeof LEDGERS;
