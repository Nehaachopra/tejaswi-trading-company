import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { storeDocumentsSoon } from "@repo/jobs";
import { storedDocumentModel, storedDocumentsInputModel } from "@repo/services/document/model";

import {
  cancelTransactionInputModel,
  listTransactionsInputModel,
  transactionIdInputModel,
  transactionModel,
  transactionSummaryModel,
} from "@repo/services/transaction/model";

import { ledgerSummaryModel } from "@repo/services/accounts/model";
import { createReceiptInputModel, receiptIdInputModel, receiptModel, receiptShareKeyModel, savedReceiptModel, sharedReceiptInputModel } from "@repo/services/receipt/model";
import {
  cashTodayInputModel,
  createPaymentInputModel,
  interestTdsInputModel,
  interestTdsModel,
  paymentFitsInputModel,
  paymentIdInputModel,
  paymentModel,
  paymentShareKeyModel,
  paymentSourcesModel,
  supplierTdsInputModel,
  supplierTdsModel,
  expenseTaxInputModel,
  expenseTaxModel,
  savedPaymentModel,
  sharedPaymentInputModel,
} from "@repo/services/payment/model";
import {
  addOldDueInputModel,
  dueModel,
  duesBoardModel,
  listDuesInputModel,
  openLoansInputModel,
  partyDuesInputModel,
  partyDuesModel,
  writeOffInputModel,
} from "@repo/services/due/model";
import { opensVoucher, voucherKey } from "@repo/services/transaction/share-link";

import { documentService, dueService, paymentService, receiptService, transactionService } from "../../services";
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
    .mutation(async ({ ctx, input }) => {
      const cancelled = await transactionService.cancel(input, ctx.session.user);
      storeDocumentsSoon();
      return cancelled;
    }),

  // the GST documents kept for it, newest version first
  documents: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/{transactionId}/documents", tags: ["transactions"] } })
    .input(storedDocumentsInputModel)
    .output(z.array(storedDocumentModel))
    .query(({ input }) => documentService.list(input)),
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

// payments: money going out, recorded by the admin or staff
const paymentRouter = router({
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/payments", tags: ["transactions"] } })
    .input(createPaymentInputModel)
    .output(savedPaymentModel)
    .mutation(({ ctx, input }) => {
      // only the admin adds a new ledger or party while recording one
      if ((input.newLedger || input.newParty || input.newPayee) && ctx.session.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin adds ledgers." });
      return paymentService.create(input, ctx.session.user).then((p) => {
        if (p.rcm) storeDocumentsSoon();
        return ctx.session.user.role === "admin" ? p : { ...p, balances: null };
      });
    }),

  // cash and the bank accounts it can come from, with what each holds (the admin's only)
  sources: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/payments/sources", tags: ["transactions"] } })
    .output(paymentSourcesModel)
    .query(({ ctx }) => paymentService.sources(ctx.session.user.role === "admin")),

  // whether an amount can be paid from cash or bank accounts: never more than each holds today. The form's own check,
  // not in the API docs: its list of more accounts can't go in a GET address
  fits: protectedProcedure
    .input(paymentFitsInputModel)
    .output(z.object({ fits: z.boolean() }))
    .query(({ input }) => paymentService.fits(input)),

  // the cash already paid that day to the same person, for the cash limit warning (section 40A(3))
  cashToday: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/payments/cash-today", tags: ["transactions"] } })
    .input(cashTodayInputModel)
    .output(z.object({ paid: z.number() }))
    .query(({ input }) => paymentService.cashToday(input)),

  // (not in the OpenAPI document: its GST is an object, which a GET's query string can't carry)
  // an expense's tax as it's filled in: TDS on rent, contract work or brokerage, and reverse-charge GST on rent from a
  // landlord without a GSTIN; the website works both out, never typed
  expenseTax: protectedProcedure
    .input(expenseTaxInputModel)
    .output(expenseTaxModel)
    .query(({ input }) => paymentService.expenseTax(input)),

  // TDS on a loan's interest as it's filled in; the website works it out, never typed
  interestTds: protectedProcedure
    .input(interestTdsInputModel)
    .output(interestTdsModel)
    .query(({ input }) => paymentService.interestTds(input)),

  // a supplier's TDS for a payment being filled in: the website works it out (section 194Q), never typed
  supplierTds: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/payments/supplier-tds", tags: ["transactions"] } })
    .input(supplierTdsInputModel)
    .output(supplierTdsModel)
    .query(({ input }) => paymentService.supplierTds(input)),

  // the ledgers it moved with their balances now, for the page after a save; the admin's only
  balances: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/payments/{transactionId}/balances", tags: ["transactions"] } })
    .input(paymentIdInputModel)
    .output(z.array(ledgerSummaryModel).nullable())
    .query(({ ctx, input }) => (ctx.session.user.role === "admin" ? paymentService.balances(input) : null)),

  // its details and voucher: for staff too (no balances in it)
  get: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/payments/{transactionId}", tags: ["transactions"] } })
    .input(paymentIdInputModel)
    .output(paymentModel)
    .query(({ input }) => paymentService.get(input)),

  // the key for its voucher's link, to share it with the party on WhatsApp
  shareKey: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/payments/{transactionId}/share-key", tags: ["transactions"] } })
    .input(paymentIdInputModel)
    .output(paymentShareKeyModel)
    .query(({ input }) => ({ key: voucherKey(input.transactionId) })),

  // its voucher from a shared link, for the party: no login, only with the key from that link
  shared: publicProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/payments/{transactionId}/shared", tags: ["transactions"] } })
    .input(sharedPaymentInputModel)
    .output(paymentModel)
    .query(({ input }) => {
      if (!opensVoucher(input.transactionId, input.key)) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
      return paymentService.get({ transactionId: input.transactionId });
    }),
});

// dues: what's owed both ways (debtors, creditors, loans given and taken), and old ones from before the app
const dueRouter = router({
  // one kind's totals and each party's open dues, for /dues; the admin only
  list: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/dues", tags: ["transactions"] } })
    .input(listDuesInputModel)
    .output(duesBoardModel)
    .query(({ input }) => dueService.list(input)),

  // one party's dues page: its dues of one kind, what settled them, its pace; the admin only
  party: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/dues/party", tags: ["transactions"] } })
    .input(partyDuesInputModel)
    .output(partyDuesModel)
    .query(({ input }) => dueService.party(input)),

  // a debtor's or borrower's dues booked as a bad debt; the admin only
  writeOff: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/dues/write-off", tags: ["transactions"] } })
    .input(writeOffInputModel)
    .output(partyDuesModel)
    .mutation(({ ctx, input }) => dueService.writeOff(input, ctx.session.user)),

  // the open loans of one kind, for a receipt or payment to name the one it repays or pays interest on
  openLoans: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/dues/loans", tags: ["transactions"] } })
    .input(openLoansInputModel)
    .output(z.array(dueModel))
    .query(({ input }) => dueService.openLoans(input)),

  // a due from before the app, posted against Capital; the admin only
  addOld: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/dues/old", tags: ["transactions"] } })
    .input(addOldDueInputModel)
    .output(dueModel)
    .mutation(({ ctx, input }) => dueService.addOld(input, ctx.session.user)),
});

export const transactionsRouter = router({
  history: historyRouter,
  receipt: receiptRouter,
  payment: paymentRouter,
  due: dueRouter,
});
