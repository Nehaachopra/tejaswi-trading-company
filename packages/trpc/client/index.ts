import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";

import { type ServerRouter } from "../server";

export type RouterOutputs = inferRouterOutputs<ServerRouter>;
export type RouterInputs = inferRouterInputs<ServerRouter>;

export type { ServerRouter } from "../server";

export * from "@trpc/client";

// how a bank payment was made, and the reference each way has
export { BANK_MODE_REFERENCE, type BankMode } from "@repo/services/payment/model";

// the account number lengths each bank keeps to, shared with the bank form
export { lengthFits, lengthsFor } from "@repo/services/bank/account-lengths";

// what a phone and a GSTIN can be, shared with the forms and the receipt chat
export { GSTIN_PATTERN, PHONE_PATTERN } from "@repo/services/party/model";

// the UPI handles each app gives out, shared with the bank form
export { appOfUpi, UPI_HANDLES, upiFormatOk, upiProblem } from "@repo/services/bank/upi-handles";
