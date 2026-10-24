import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  cancelTransactionInputModel,
  listTransactionsInputModel,
  transactionIdInputModel,
  transactionModel,
  transactionSummaryModel,
} from "@repo/services/transaction/model";

import { createReceiptInputModel, receiptIdInputModel, receiptModel, savedReceiptModel } from "@repo/services/receipt/model";

import { receiptService, transactionService } from "../../services";
import { adminProcedure, protectedProcedure, router } from "../../trpc";

// History: every past transaction of every type, one in full, and cancelling one; the admin only
const historyRouter = router({
  list: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions", tags: ["transactions"] } })
    .input(listTransactionsInputModel)
    .output(z.array(transactionSummaryModel))
    .query(({ input }) => transactionService.list(input)),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/{id}", tags: ["transactions"] } })
    .input(transactionIdInputModel)
    .output(transactionModel)
    .query(({ input }) => transactionService.get(input)),

  // reverses it with entries dated today; the number is kept and it's marked cancelled with the reason
  cancel: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/{id}/cancel", tags: ["transactions"] } })
    .input(cancelTransactionInputModel)
    .output(transactionModel)
    .mutation(({ ctx, input }) => transactionService.cancel(input, ctx.session.user)),
});

// receipts: money coming in, recorded by the admin or staff
const receiptRouter = router({
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/receipts", tags: ["transactions"] } })
    .input(createReceiptInputModel)
    .output(savedReceiptModel)
    .mutation(({ ctx, input }) => {
      // only the admin adds a new ledger while recording one
      if (input.newLedger && ctx.session.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin adds ledgers." });
      return receiptService.create(input, ctx.session.user);
    }),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/receipts/{transactionId}", tags: ["transactions"] } })
    .input(receiptIdInputModel)
    .output(receiptModel)
    .query(({ input }) => receiptService.get(input)),
});

export const transactionsRouter = router({
  history: historyRouter,
  receipt: receiptRouter,
});
