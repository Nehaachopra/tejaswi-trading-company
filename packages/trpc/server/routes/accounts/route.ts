import { z } from "zod";

import { ledgerIdInputModel, ledgerSummaryModel, overviewModel, statementInputModel, statementModel } from "@repo/services/accounts/model";
import {
  bankAccountIdInputModel,
  bankAccountModel,
  createBankAccountInputModel,
  listBankAccountsInputModel,
  setBankAccountActiveInputModel,
  updateBankAccountInputModel,
} from "@repo/services/bank/model";

import { accountsService, bankService } from "../../services";
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

// any ledger and its statement, for the admin
const ledgerRouter = router({
  get: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/ledgers/{id}", tags: ["accounts"] } })
    .input(ledgerIdInputModel)
    .output(ledgerSummaryModel)
    .query(({ input }) => accountsService.ledger(input)),

  statement: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts/ledgers/{ledgerId}/statement", tags: ["accounts"] } })
    .input(statementInputModel)
    .output(statementModel)
    .query(({ input }) => accountsService.statement(input)),
});

export const accountsRouter = router({
  // /account: the six heads with their sub-groups, ledgers and totals
  overview: adminProcedure
    .meta({ openapi: { method: "GET", path: "/accounts", tags: ["accounts"] } })
    .input(z.void())
    .output(overviewModel)
    .query(() => accountsService.overview()),

  bank: bankRouter,
  ledger: ledgerRouter,
});
