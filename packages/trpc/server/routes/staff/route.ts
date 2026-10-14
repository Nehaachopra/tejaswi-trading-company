import {
  registerStaffInputModel,
  setActiveInputModel,
  setRoleInputModel,
  staffIdInputModel,
  staffModel,
  updateStaffInputModel,
} from "@repo/services/user/model";

import { z, zodUndefinedModel } from "../../schema";
import { elevatedProcedure, router } from "../../trpc";
import { userService } from "../../services";

// staff management lives under /admin, so every call needs passkey elevation
export const staffRouter = router({
  list: elevatedProcedure
    .meta({ openapi: { method: "GET", path: "/staff", tags: ["staff"] } })
    .input(zodUndefinedModel)
    .output(z.array(staffModel))
    .query(() => userService.list()),

  register: elevatedProcedure
    .meta({ openapi: { method: "POST", path: "/staff", tags: ["staff"] } })
    .input(registerStaffInputModel)
    .output(staffModel)
    .mutation(({ input }) => userService.register(input)),

  update: elevatedProcedure
    .meta({ openapi: { method: "PATCH", path: "/staff/{id}", tags: ["staff"] } })
    .input(updateStaffInputModel)
    .output(staffModel)
    .mutation(({ input }) => userService.update(input)),

  setRole: elevatedProcedure
    .meta({ openapi: { method: "POST", path: "/staff/{id}/role", tags: ["staff"] } })
    .input(setRoleInputModel)
    .output(staffModel)
    .mutation(({ input }) => userService.setRole(input)),

  setActive: elevatedProcedure
    .meta({ openapi: { method: "POST", path: "/staff/{id}/active", tags: ["staff"] } })
    .input(setActiveInputModel)
    .output(staffModel)
    .mutation(({ input }) => userService.setActive(input)),

  forceLogout: elevatedProcedure
    .meta({ openapi: { method: "POST", path: "/staff/{id}/logout", tags: ["staff"] } })
    .input(staffIdInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ input }) => {
      await userService.forceLogout(input.id);
      return { success: true as const };
    }),
});
