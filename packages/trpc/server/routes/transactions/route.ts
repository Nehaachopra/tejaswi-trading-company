import { z } from "zod";

import {
  cancelTransactionInputModel,
  listTransactionsInputModel,
  transactionIdInputModel,
  transactionModel,
  transactionSummaryModel,
} from "@repo/services/transaction/model";

import { transactionService } from "../../services";
import { adminProcedure, router } from "../../trpc";

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

export const transactionsRouter = router({
  history: historyRouter,
});
