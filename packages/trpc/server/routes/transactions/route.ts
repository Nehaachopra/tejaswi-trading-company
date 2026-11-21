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
  historyMonthModel,
} from "@repo/services/transaction/model";

import { ledgerSummaryModel } from "@repo/services/accounts/model";
import { attachBillInputModel, createPurchaseInputModel, purchaseIdInputModel, purchaseModel, savedPurchaseModel } from "@repo/services/purchase/model";
import { editSaleInputModel, saleForEditModel } from "@repo/services/sale/edit-model";
import { createSaleInputModel, saleIdInputModel, saleInvoiceModel, saleShareKeyModel, saleSummaryModel, savedSaleModel, sharedSaleInputModel } from "@repo/services/sale/model";
import { placeOfBusinessModel } from "@repo/services/setting/model";
import { createSaleReturnInputModel, creditNoteModel, exchangeInputModel, saleForReturnModel, saleReturnIdInputModel, savedSaleReturnModel } from "@repo/services/sale-return/model";
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
import { contraIdInputModel, contraModel, type ContraKind, createContraInputModel, createTransferInputModel, savedContraModel } from "@repo/services/contra/model";
import { createOtherInputModel, otherIdInputModel, otherModel, savedOtherModel } from "@repo/services/other/model";
import { createDrawingInputModel, drawingIdInputModel, drawingModel, savedDrawingModel } from "@repo/services/drawing/model";
import { paySalariesInputModel, paySalaryInputModel, salaryEmployeeModel, salaryIdInputModel, salaryPaymentModel } from "@repo/services/salary/model";
import { opensSale, opensVoucher, saleKey, voucherKey } from "@repo/services/transaction/share-link";

import { accountsService, contraService, documentService, drawingService, dueService, otherService, paymentService, purchaseService, receiptService, salaryService, saleEditService, saleReturnService, saleService, settingService, transactionService } from "../../services";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../../trpc";
import { checkDate, limitSaves, onceFor } from "../../guards";

// History: every past transaction of every type (staff: only their own), one in full, and cancelling one (the admin
// only)
const historyRouter = router({
  list: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions", tags: ["transactions"] } })
    .input(listTransactionsInputModel)
    .output(z.array(transactionSummaryModel))
    .query(({ ctx, input }) => transactionService.list(input, ctx.session.user)),

  // the months it can be narrowed to
  months: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/months", tags: ["transactions"] } })
    .input(z.void())
    .output(z.array(historyMonthModel))
    .query(({ ctx }) => transactionService.months(ctx.session.user)),

  get: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/{id}", tags: ["transactions"] } })
    .input(transactionIdInputModel)
    .output(transactionModel)
    .query(({ ctx, input }) => transactionService.get(input, ctx.session.user)),

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

// sales: goods going out for cash or on credit, recorded by the admin or staff
const saleRouter = router({
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/sales", tags: ["transactions"] } })
    .input(createSaleInputModel)
    .output(savedSaleModel)
    .mutation(({ ctx, input }) => {
      // only the admin adds a customer while recording one
      if (input.newCustomer && ctx.session.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin adds customers." });
      // dated today or before (staff a few days back at most), within the user's saves a minute, and once per form
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return saleService.create(input, ctx.session.user);
      };
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  // a sale as its edit form opens it (the admin's)
  forEdit: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/sales/{transactionId}/edit", tags: ["transactions"] } })
    .input(saleIdInputModel)
    .output(saleForEditModel)
    .query(({ input }) => saleEditService.forEdit(input)),

  // an edit saved (the admin's): dated today or before, within the saves a minute, once per form
  edit: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/sales/{transactionId}/edit", tags: ["transactions"] } })
    .input(editSaleInputModel)
    .output(savedSaleModel)
    .mutation(({ ctx, input }) => {
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return saleEditService.edit(input, ctx.session.user);
      };
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  // a saved sale for its success page
  get: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/sales/{transactionId}", tags: ["transactions"] } })
    .input(saleIdInputModel)
    .output(saleSummaryModel)
    .query(({ input }) => saleService.get(input)),

  // a sale as its tax invoice
  invoice: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/sales/{transactionId}/invoice", tags: ["transactions"] } })
    .input(saleIdInputModel)
    .output(saleInvoiceModel)
    .query(({ input }) => saleService.invoice(input)),

  // the key for the invoice's link, sent to the customer on WhatsApp
  shareKey: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/sales/{transactionId}/share-key", tags: ["transactions"] } })
    .input(saleIdInputModel)
    .output(saleShareKeyModel)
    .query(({ input }) => ({ key: saleKey(input.transactionId) })),

  // the invoice from a shared link, for the customer: no login, only with the key from that link
  shared: publicProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/sales/{transactionId}/shared", tags: ["transactions"] } })
    .input(sharedSaleInputModel)
    .output(saleInvoiceModel)
    .query(({ input }) => {
      if (!opensSale(input.transactionId, input.key)) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found." });
      return saleService.invoice({ transactionId: input.transactionId });
    }),

  // where a cash sale goes unless changed: our place of business
  placeOfBusiness: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/sales/place-of-business", tags: ["transactions"] } })
    .input(z.void())
    .output(placeOfBusinessModel)
    .query(() => settingService.get("placeOfBusiness")),
});

// receipts: money coming in, recorded by the admin or staff
// purchases: goods coming in from a supplier, for cash or on credit, recorded by the admin or staff
const purchaseRouter = router({
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/purchases", tags: ["transactions"] } })
    .input(createPurchaseInputModel)
    .output(savedPurchaseModel)
    .mutation(({ ctx, input }) => {
      // only the admin adds a supplier or a product while recording one
      if (input.newSupplier && ctx.session.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin adds suppliers." });
      if (input.newProducts.length > 0 && ctx.session.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin adds products." });
      // dated today or before (staff a few days back at most), within the user's saves a minute, and once per form
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return purchaseService.create(input, ctx.session.user);
      };
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  // a purchase as it was recorded
  get: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/purchases/{transactionId}", tags: ["transactions"] } })
    .input(purchaseIdInputModel)
    .output(purchaseModel)
    .query(({ input }) => purchaseService.get(input)),

  // the supplier's bill (photo or PDF) attached or changed after saving
  attachBill: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/purchases/{transactionId}/bill", tags: ["transactions"] } })
    .input(attachBillInputModel)
    .output(purchaseModel)
    .mutation(({ input }) => purchaseService.attachBill(input)),
});

const receiptRouter = router({
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/receipts", tags: ["transactions"] } })
    .input(createReceiptInputModel)
    .output(savedReceiptModel)
    .mutation(({ ctx, input }) => {
      // only the admin adds a new ledger while recording one
      if ((input.newLedger || input.newParty || input.newBuyer) && ctx.session.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin adds ledgers." });
      // and only the admin adds a UPI ID to our bank account (its QR is what customers pay into)
      if (input.bankUpiIds.length > 0 && ctx.session.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin adds UPI IDs." });
      // dated today or before (staff a few days back at most), within the user's saves a minute, and once per form
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return receiptService.create(input, ctx.session.user);
      };
      return (input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save()).then((r) =>
        ctx.session.user.role === "admin" ? r : { ...r, balances: null },
      );
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
      // dated today or before (staff a few days back at most), within the user's saves a minute, and once per form
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return paymentService.create(input, ctx.session.user);
      };
      return (input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save()).then((p) => {
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

// money between cash and our bank accounts, recorded by the admin or staff: what every kind has, under its own path:
// cash and the accounts with their balances now (the admin's only), and its details (for staff too, no balances)
const contraReads = (kind: ContraKind) => {
  const path = `/transactions/${kind}s` as const;
  return {
    balances: protectedProcedure
      .meta({ openapi: { method: "GET", path: `${path}/{transactionId}/balances`, tags: ["transactions"] } })
      .input(contraIdInputModel)
      .output(z.array(ledgerSummaryModel).nullable())
      .query(({ ctx, input }) => (ctx.session.user.role === "admin" ? contraService.balances(input) : null)),

    get: protectedProcedure
      .meta({ openapi: { method: "GET", path: `${path}/{transactionId}`, tags: ["transactions"] } })
      .input(contraIdInputModel)
      .output(contraModel)
      .query(({ input }) => contraService.get(kind, input)),
  };
};

// a save's guards: dated today or before (staff a few days back at most), within the user's saves a minute, once per
// form; balances only for the admin
const saveContra = <T extends { saveKey: string | null; dateTime: Date }>(
  user: { id: string; role: string; name: string },
  input: T,
  save: () => Promise<{ balances: unknown }>,
) => {
  checkDate(input.dateTime, user.role);
  const run = () => {
    limitSaves(user.id);
    return save();
  };
  return (input.saveKey ? onceFor(user.id, input.saveKey, run) : run()).then((c) => (user.role === "admin" ? c : { ...c, balances: null }));
};

// a deposit (cash into a bank account) or a withdrawal (cash out of one)
const contraRouter = (kind: "deposit" | "withdrawal") =>
  router({
    create: protectedProcedure
      .meta({ openapi: { method: "POST", path: `/transactions/${kind}s`, tags: ["transactions"] } })
      .input(createContraInputModel)
      .output(savedContraModel)
      .mutation(({ ctx, input }) => saveContra(ctx.session.user, input, () => contraService.create(kind, input, ctx.session.user)) as ReturnType<typeof contraService.create>),
    ...contraReads(kind),
  });

// a transfer: from one of our bank accounts to another
const transferRouter = router({
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/transfers", tags: ["transactions"] } })
    .input(createTransferInputModel)
    .output(savedContraModel)
    .mutation(({ ctx, input }) => saveContra(ctx.session.user, input, () => contraService.transfer(input, ctx.session.user)) as ReturnType<typeof contraService.transfer>),
  ...contraReads("transfer"),
});

// drawings: what the owner takes out for themselves, money (cash or a bank account) or goods (from the godowns at
// cost); the admin's only. Dated today or before, within the user's saves a minute, once per form
const drawingRouter = router({
  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/drawings", tags: ["transactions"] } })
    .input(createDrawingInputModel)
    .output(savedDrawingModel)
    .mutation(({ ctx, input }) => {
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return drawingService.create(input, ctx.session.user);
      };
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/drawings/{transactionId}", tags: ["transactions"] } })
    .input(drawingIdInputModel)
    .output(drawingModel)
    .query(({ input }) => drawingService.get(input)),
});

// Others: a journal entry for anything no other page covers; the admin's only
const otherRouter = router({
  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/others", tags: ["transactions"] } })
    .input(createOtherInputModel)
    .output(savedOtherModel)
    .mutation(({ ctx, input }) => saveContra(ctx.session.user, input, () => otherService.create(input, ctx.session.user)) as ReturnType<typeof otherService.create>),

  // the ledgers it can use: our own heads only, with their balances
  ledgers: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/others/ledgers", tags: ["transactions"] } })
    .output(z.array(ledgerSummaryModel))
    .query(() => accountsService.journalLedgers()),

  balances: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/others/{transactionId}/balances", tags: ["transactions"] } })
    .input(otherIdInputModel)
    .output(z.array(ledgerSummaryModel))
    .query(({ input }) => otherService.balances(input)),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/others/{transactionId}", tags: ["transactions"] } })
    .input(otherIdInputModel)
    .output(otherModel)
    .query(({ input }) => otherService.get(input)),
});

// salary: what each employee is owed, and paying them (a month's salary or an advance); the admin's only. Months are
// posted by the jobs on each pay day
const salaryRouter = router({
  employees: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/salaries/employees", tags: ["transactions"] } })
    .output(z.array(salaryEmployeeModel))
    .query(() => salaryService.employees()),

  pay: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/salaries", tags: ["transactions"] } })
    .input(paySalaryInputModel)
    .output(salaryPaymentModel)
    .mutation(({ ctx, input }) => {
      // dated today or before, within the user's saves a minute, and once per form
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return salaryService.pay(input, ctx.session.user);
      };
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  // salary to many employees in one save: a transaction each
  payAll: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/salaries/many", tags: ["transactions"] } })
    .input(paySalariesInputModel)
    .output(z.array(salaryPaymentModel))
    .mutation(({ ctx, input }) => {
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return salaryService.payAll(input, ctx.session.user);
      };
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/salaries/{transactionId}", tags: ["transactions"] } })
    .input(salaryIdInputModel)
    .output(salaryPaymentModel)
    .query(({ input }) => salaryService.get(input)),
});

// sale returns: goods back against a saved sale, refunded or exchanged for a new sale (the admin's)
const saleReturnRouter = router({
  // a sale as the return form opens it
  forReturn: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/sales/{transactionId}/return", tags: ["transactions"] } })
    .input(saleIdInputModel)
    .output(saleForReturnModel)
    .query(({ input }) => saleReturnService.forReturn(input)),

  // a refund saved: dated today or before, within the saves a minute, once per form
  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/sale-returns", tags: ["transactions"] } })
    .input(createSaleReturnInputModel)
    .output(savedSaleReturnModel)
    .mutation(({ ctx, input }) => {
      checkDate(input.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return saleReturnService.create(input, ctx.session.user);
      };
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  // an exchange saved: the return and its new sale together
  exchange: adminProcedure
    .meta({ openapi: { method: "POST", path: "/transactions/sale-returns/exchange", tags: ["transactions"] } })
    .input(exchangeInputModel)
    .output(savedSaleReturnModel)
    .mutation(({ ctx, input }) => {
      checkDate(input.saleReturn.dateTime, ctx.session.user.role);
      checkDate(input.sale.dateTime, ctx.session.user.role);
      const save = () => {
        limitSaves(ctx.session.user.id);
        return saleReturnService.exchange(input, ctx.session.user);
      };
      return input.saveKey ? onceFor(ctx.session.user.id, input.saveKey, save) : save();
    }),

  // a return as its credit note
  creditNote: adminProcedure
    .meta({ openapi: { method: "GET", path: "/transactions/sale-returns/{transactionId}/credit-note", tags: ["transactions"] } })
    .input(saleReturnIdInputModel)
    .output(creditNoteModel)
    .query(({ input }) => saleReturnService.creditNote(input)),
});

export const transactionsRouter = router({
  history: historyRouter,
  sale: saleRouter,
  saleReturn: saleReturnRouter,
  purchase: purchaseRouter,
  receipt: receiptRouter,
  payment: paymentRouter,
  deposit: contraRouter("deposit"),
  withdrawal: contraRouter("withdrawal"),
  transfer: transferRouter,
  drawing: drawingRouter,
  other: otherRouter,
  salary: salaryRouter,
  due: dueRouter,
});
