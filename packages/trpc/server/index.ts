import { router } from "./trpc";

import { authRouter } from "./routes/auth/route";
import { healthRouter } from "./routes/health/route";
import { passkeyRouter } from "./routes/passkey/route";
import { staffRouter } from "./routes/staff/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  passkey: passkeyRouter,
  staff: staffRouter,
});

export { createContext } from "./context";
export { userService } from "./services";
export type ServerRouter = typeof serverRouter;
