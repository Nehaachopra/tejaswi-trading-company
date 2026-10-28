import { z } from "zod";

import {
  createLedgerInputModel,
  ledgerIdInputModel,
  ledgerModel,
  openingSheetModel,
  pickLedgersInputModel,
  pickedLedgerModel,
  overviewModel,
  saveOpeningInputModel,
  setLedgerActiveInputModel,
  statementInputModel,
  statementModel,
  updateLedgerInputModel,
} from "@repo/services/accounts/model";
import {
  bankAccountIdInputModel,
  bankAccountModel,
  branchModel,
  branchSearchInputModel,
  ifscBranchModel,
  ifscInputModel,
  createBankAccountInputModel,
  listBankAccountsInputModel,
  setBankAccountActiveInputModel,
  updateBankAccountInputModel,
} from "@repo/services/bank/model";
import {
  createPartyInputModel,
  listPartiesInputModel,
  partyIdInputModel,
  partyModel,
  partySummaryModel,
  pinPlaceInputModel,
  pinPlaceModel,
  setPartyActiveInputModel,
  updatePartyInputModel,
} from "@repo/services/party/model";

import { accountsService, bankService, partyService } from "../../services";
import { adminProcedure, protectedProcedure, router } from "../../trpc";

// bank accounts: only the admin sees or changes them (and their balances)
const bankRouter = router({
  // the banks and their branches (from the IFSC dataset), for picking a branch without knowing its IFSC
  banks: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/banks/directory", tags: ["accounts"] } })
    .input(z.void())
    .output(z.array(z.string()))
    .query(() => bankService.banks()),

  ifsc: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/banks/directory/ifsc/{ifsc}", tags: ["accounts"] } })
    .input(ifscInputModel)
    .output(ifscBranchModel)
    .query(({ input }) => bankService.byIfsc(input)),

  branches: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/banks/directory/branches", tags: ["accounts"] } })
    .input(branchSearchInputModel)
    .output(z.array(branchModel))
    .query(({ input }) => bankService.branches(input)),

  // the active accounts money can go into or come from, for receipts and payments: names only (staff use it too)
  pickable: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/banks/pickable", tags: ["accounts"] } })
    .input(z.void())
    .output(z.array(z.object({ id: z.string(), bankName: z.string(), last4: z.string(), accountType: z.string() })))
    .query(async () =>
      (await bankService.list({ includeInactive: false })).map((b) => ({ id: b.id, bankName: b.bankName, last4: b.last4, accountType: b.accountType })),
    ),

  list: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/banks", tags: ["accounts"] } })
    .input(listBankAccountsInputModel)
    .output(z.array(bankAccountModel))
    .query(({ input }) => bankService.list(input)),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/banks/{id}", tags: ["accounts"] } })
    .input(bankAccountIdInputModel)
    .output(bankAccountModel)
    .query(({ input }) => bankService.get(input)),

  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/accounts/banks", tags: ["accounts"] } })
    .input(createBankAccountInputModel)
    .output(bankAccountModel)
    .mutation(({ ctx, input }) => bankService.create(input, ctx.session.user)),

  update: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/accounts/banks/{id}", tags: ["accounts"] } })
    .input(updateBankAccountInputModel)
    .output(bankAccountModel)
    .mutation(({ ctx, input }) => bankService.update(input, ctx.session.user)),

  // inactive only at a zero balance
  setActive: adminProcedure
    .meta({ openapi: { method: "POST", path: "/accounts/banks/{id}/active", tags: ["accounts"] } })
    .input(setBankAccountActiveInputModel)
    .output(bankAccountModel)
    .mutation(({ input }) => bankService.setActive(input)),
});

// customers, suppliers and parties who are both, for the admin (sales and purchases will pick from them)
const partyRouter = router({
  list: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/parties", tags: ["accounts"] } })
    .input(listPartiesInputModel)
    .output(z.array(partySummaryModel))
    .query(({ input }) => partyService.list(input)),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/parties/{id}", tags: ["accounts"] } })
    .input(partyIdInputModel)
    .output(partyModel)
    .query(({ input }) => partyService.get(input)),

  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/accounts/parties", tags: ["accounts"] } })
    .input(createPartyInputModel)
    .output(partyModel)
    .mutation(({ ctx, input }) => partyService.create(input, ctx.session.user)),

  update: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/accounts/parties/{id}", tags: ["accounts"] } })
    .input(updatePartyInputModel)
    .output(partyModel)
    .mutation(({ ctx, input }) => partyService.update(input, ctx.session.user)),

  // inactive only at a zero balance with no pending orders
  setActive: adminProcedure
    .meta({ openapi: { method: "POST", path: "/accounts/parties/{id}/active", tags: ["accounts"] } })
    .input(setPartyActiveInputModel)
    .output(partyModel)
    .mutation(({ input }) => partyService.setActive(input)),

  // a PIN code already on a saved address: its town, district and state, filled into a new address
  pinPlace: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/parties/pin/{postalCode}", tags: ["accounts"] } })
    .input(pinPlaceInputModel)
    .output(pinPlaceModel)
    .query(({ input }) => partyService.pinPlace(input)),
});

// any ledger and its statement, for the admin; ledgers of its own (a loan, other income, an expense head) added,
// renamed and made inactive, and any ledger's opening balance set
const ledgerRouter = router({
  // the ledgers a receipt can come from or a payment go to; staff record receipts and payments too, but only the
  // admin sees balances
  pickable: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/ledgers/pickable", tags: ["accounts"] } })
    .input(pickLedgersInputModel)
    .output(z.array(pickedLedgerModel))
    .query(async ({ ctx, input }) => {
      const ledgers = await accountsService.pickable(input);
      return ctx.session.user.role === "admin" ? ledgers : ledgers.map((l) => ({ ...l, balance: null }));
    }),

  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/accounts/ledgers", tags: ["accounts"] } })
    .input(createLedgerInputModel)
    .output(ledgerModel)
    .mutation(({ input }) => accountsService.createLedger(input)),

  update: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/accounts/ledgers/{id}", tags: ["accounts"] } })
    .input(updateLedgerInputModel)
    .output(ledgerModel)
    .mutation(({ input }) => accountsService.updateLedger(input)),

  // only ledgers the admin added, at a zero balance
  setActive: adminProcedure
    .meta({ openapi: { method: "POST", path: "/accounts/ledgers/{id}/active", tags: ["accounts"] } })
    .input(setLedgerActiveInputModel)
    .output(ledgerModel)
    .mutation(({ input }) => accountsService.setLedgerActive(input)),

  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/ledgers/{id}", tags: ["accounts"] } })
    .input(ledgerIdInputModel)
    .output(ledgerModel)
    .query(({ input }) => accountsService.ledger(input)),

  statement: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/ledgers/{ledgerId}/statement", tags: ["accounts"] } })
    .input(statementInputModel)
    .output(statementModel)
    .query(({ input }) => accountsService.statement(input)),
});

// the Opening balances page: every ledger's opening balance, read and saved at once on the date the books start
const openingRouter = router({
  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/opening", tags: ["accounts"] } })
    .input(z.void())
    .output(openingSheetModel)
    .query(() => accountsService.openingSheet()),

  save: adminProcedure
    .meta({ openapi: { method: "PUT", path: "/accounts/opening", tags: ["accounts"] } })
    .input(saveOpeningInputModel)
    .output(openingSheetModel)
    .mutation(({ ctx, input }) => accountsService.saveOpening(input, ctx.session.user)),
});

export const accountsRouter = router({
  opening: openingRouter,
  // /account: the six heads with their sub-groups, ledgers and totals
  overview: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts", tags: ["accounts"] } })
    .input(z.void())
    .output(overviewModel)
    .query(() => accountsService.overview()),

  bank: bankRouter,
  party: partyRouter,
  ledger: ledgerRouter,
});
