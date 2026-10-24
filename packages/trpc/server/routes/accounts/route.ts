import { z } from "zod";

import {
  createLedgerInputModel,
  ledgerIdInputModel,
  ledgerModel,
  openingSheetModel,
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
  setPartyActiveInputModel,
  updatePartyInputModel,
} from "@repo/services/party/model";

import { accountsService, bankService, partyService } from "../../services";
import { adminProcedure, router } from "../../trpc";

// bank accounts: only the admin sees or changes them (and their balances)
const bankRouter = router({
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
});

// any ledger and its statement, for the admin; ledgers of its own (a loan, other income, an expense head) added,
// renamed and made inactive, and any ledger's opening balance set
const ledgerRouter = router({
  create: adminProcedure
    .meta({ openapi: { method: "POST", path: "/accounts/ledgers", tags: ["accounts"] } })
    .input(createLedgerInputModel)
    .output(ledgerModel)
    .mutation(({ ctx, input }) => accountsService.createLedger(input, ctx.session.user)),

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
