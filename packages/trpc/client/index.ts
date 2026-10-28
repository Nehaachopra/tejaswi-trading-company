import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";

import { type ServerRouter } from "../server";

export type RouterOutputs = inferRouterOutputs<ServerRouter>;
export type RouterInputs = inferRouterInputs<ServerRouter>;

export type { ServerRouter } from "../server";

export * from "@trpc/client";

// the account number lengths each bank keeps to, shared with the bank form
export { lengthFits, lengthsFor } from "@repo/services/bank/account-lengths";

// what a party's phone can be, shared with the party form and the receipt chat
export { PHONE_PATTERN } from "@repo/services/party/model";

// the UPI handles each app gives out, shared with the bank form
export { appOfUpi, UPI_HANDLES, upiProblem } from "@repo/services/bank/upi-handles";
