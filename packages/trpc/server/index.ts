import { router } from "./trpc";

import { authRouter } from "./routes/auth/route";
import { healthRouter } from "./routes/health/route";
import { inventoryRouter } from "./routes/inventory/route";
import { jobsRouter } from "./routes/jobs/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  inventory: inventoryRouter,
  jobs: jobsRouter,
});

export { createContext, sessionFromRequest } from "./context";
export { authService } from "./services";
export type ServerRouter = typeof serverRouter;
