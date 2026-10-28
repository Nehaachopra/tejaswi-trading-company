import { pgEnum } from "drizzle-orm/pg-core";

export const invoiceTypeEnum =
  pgEnum(
    "invoice_type",
    [
      "regular",
      "sez",
      "deemed",
      "export",
    ],
  );

export const supplyTypeEnum =
  pgEnum(
    "supply_type",
    [
      "inter",
      "intra",
    ],
  );

  export const productTypeEnum =
  pgEnum(
    "product_type",
    [
      "stock",
      "non_stock",
    ],
  );

  export const gstTypeEnum =
  pgEnum(
    "gst_type",
    [
      "cgst",
      "sgst",
      "igst"
    ],
  );

  export const gstPlaceOfSupplyEnum = pgEnum(
    "gst_place_of_supply",
    [
      "01", // Jammu & Kashmir
      "02", // Himachal Pradesh
      "03", // Punjab
      "04", // Chandigarh
      "05", // Uttarakhand
      "06", // Haryana
      "07", // Delhi
      "08", // Rajasthan
      "09", // Uttar Pradesh
      "10", // Bihar
      "11", // Sikkim
      "12", // Arunachal Pradesh
      "13", // Nagaland
      "14", // Manipur
      "15", // Mizoram
      "16", // Tripura
      "17", // Meghalaya
      "18", // Assam
      "19", // West Bengal
      "20", // Jharkhand
      "21", // Odisha
      "22", // Chhattisgarh
      "23", // Madhya Pradesh
      "24", // Gujarat
      "26", // Dadra & Nagar Haveli and Daman & Diu
      "27", // Maharashtra
      "29", // Karnataka
      "30", // Goa
      "31", // Lakshadweep
      "32", // Kerala
      "33", // Tamil Nadu
      "34", // Puducherry
      "35", // Andaman & Nicobar Islands
      "36", // Telangana
      "37", // Andhra Pradesh
      "38", // Ladakh
      "97", // Other Territory
      "99", // Centre Jurisdiction
    ],
  );

  export const returnTypeEnum =
  pgEnum(
    "return_type",
    [
      "exchange",
      "cash",
    ],
  );

  export const appUserRoleEnum = pgEnum(
    "app_user_role",
    [
      "admin",
      "staff",
    ],
  );

  export const addressTypeEnum = pgEnum(
  "address_type",
  ["billing", "shipping", "both", "registered"],
);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "completed",
  "cancelled",
]);

export const transactedInEnum = pgEnum("transacted_in", ["cash", "credit", "both"]);

export const settledInEnum = pgEnum("settled_in", ["cash", "bank"]);

// what a receipt was for: a customer's payment, a loan received, a loan repaid to us, capital, a refund, other income
export const receivedForEnum = pgEnum("received_for", ["customer", "loan_received", "loan_repaid", "capital", "refund", "other_income"]);

export const paymentModeEnum = pgEnum("payment_mode", ["cash", "upi", "net_banking", "card"]);

export const ledgerTransactionTypeEnum = pgEnum("ledger_transaction_type", ["debit", "credit"]);

export const gstReturnTypeEnum = pgEnum("gst_return_type", ["gstr1", "gstr3b"]);

export const salaryKindEnum = pgEnum("salary_kind", ["salary", "advance"]);
