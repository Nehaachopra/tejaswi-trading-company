import { router } from "./trpc";

import { accountsRouter } from "./routes/accounts/route";
import { transactionsRouter } from "./routes/transactions/route";
import { authRouter } from "./routes/auth/route";
import { healthRouter } from "./routes/health/route";
import { inventoryRouter } from "./routes/inventory/route";
import { jobsRouter } from "./routes/jobs/route";
import { liveRouter } from "./routes/live/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  inventory: inventoryRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  jobs: jobsRouter,
  live: liveRouter,
});

export { createContext, sessionFromRequest } from "./context";
export { accountsService, authService } from "./services";
export type ServerRouter = typeof serverRouter;
