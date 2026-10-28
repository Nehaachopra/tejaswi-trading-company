import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  cancelTransactionInputModel,
  listTransactionsInputModel,
  transactionIdInputModel,
  transactionModel,
  transactionSummaryModel,
} from "@repo/services/transaction/model";

import { ledgerSummaryModel } from "@repo/services/accounts/model";
import { createReceiptInputModel, receiptIdInputModel, receiptModel, receiptShareKeyModel, savedReceiptModel, sharedReceiptInputModel } from "@repo/services/receipt/model";
import { opensVoucher, voucherKey } from "@repo/services/transaction/share-link";

import { receiptService, transactionService } from "../../services";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../../trpc";

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
      if ((input.newLedger || input.newParty) && ctx.session.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin adds ledgers." });
      return receiptService.create(input, ctx.session.user).then((r) => (ctx.session.user.role === "admin" ? r : { ...r, balances: null }));
    }),

  // the ledgers it moved with their balances now, for the page after a save; the admin's only (staff never see
  // balances, so they get none)
  balances: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/receipts/{transactionId}/balances", tags: ["transactions"] } })
    .input(receiptIdInputModel)
    .output(z.array(ledgerSummaryModel).nullable())
    .query(({ ctx, input }) => (ctx.session.user.role === "admin" ? receiptService.balances(input) : null)),

  // its details and voucher: for staff too (no balances in it)
  get: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/receipts/{transactionId}", tags: ["transactions"] } })
    .input(receiptIdInputModel)
    .output(receiptModel)
    .query(({ input }) => receiptService.get(input)),

  // the key for its voucher's link, to share it with the customer on WhatsApp
  shareKey: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/receipts/{transactionId}/share-key", tags: ["transactions"] } })
    .input(receiptIdInputModel)
    .output(receiptShareKeyModel)
    .query(({ input }) => ({ key: voucherKey(input.transactionId) })),

  // its voucher from a shared link, for the customer: no login, only with the key from that link
  shared: publicProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/receipts/{transactionId}/shared", tags: ["transactions"] } })
    .input(sharedReceiptInputModel)
    .output(receiptModel)
    .query(({ input }) => {
      if (!opensVoucher(input.transactionId, input.key)) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found." });
      return receiptService.get({ transactionId: input.transactionId });
    }),
});

export const transactionsRouter = router({
  history: historyRouter,
  receipt: receiptRouter,
});
