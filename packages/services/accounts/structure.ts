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
} as const satisfies Record<string, { group: GroupType; name: string }>;

export type MasterKey = keyof typeof MASTERS;

export const LEDGERS = {
  cash: { group: "asset", name: "Cash" },
  inputCgst: { group: "asset", name: "Input CGST" },
  inputSgst: { group: "asset", name: "Input SGST" },
  inputIgst: { group: "asset", name: "Input IGST" },
  // TDS customers deduct from us
  tdsReceivable: { group: "asset", name: "TDS receivable" },

  outputCgst: { group: "liability", name: "Output CGST" },
  outputSgst: { group: "liability", name: "Output SGST" },
  outputIgst: { group: "liability", name: "Output IGST" },
  // reverse-charge GST stays apart from normal output GST, for GSTR-3B
  outputCgstRcm: { group: "liability", name: "Output CGST (RCM)" },
  outputSgstRcm: { group: "liability", name: "Output SGST (RCM)" },
  outputIgstRcm: { group: "liability", name: "Output IGST (RCM)" },
  // TDS we deduct from others
  tdsPayable: { group: "liability", name: "TDS payable" },
  tcs: { group: "liability", name: "TCS" },
  drawings: { group: "liability", name: "Drawings" },
  // the other side of every opening balance
  capital: { group: "liability", name: "Capital" },

  sale: { group: "income", name: "Sale" },
  saleReturn: { group: "income", name: "Sale return" },
  discountReceived: { group: "income", name: "Discount received" },

  salary: { group: "expense", name: "Salary" },
  purchase: { group: "expense", name: "Purchase" },
  purchaseReturn: { group: "expense", name: "Purchase return" },
  discountGiven: { group: "expense", name: "Discount given" },
  rent: { group: "expense", name: "Rent" },
  electricity: { group: "expense", name: "Electricity" },
  wifi: { group: "expense", name: "Wifi expense" },
} as const satisfies Record<string, { group: GroupType; name: string }>;

export type LedgerKey = keyof typeof LEDGERS;
