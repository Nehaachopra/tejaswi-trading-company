import { listJobsInputModel, listJobsOutputModel, retryJobInputModel } from "@repo/jobs/model";

import { z } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { jobsService } from "../../services";

// background jobs (OTP SMS today): the admin sees what failed and why, and can run it again
export const jobsRouter = router({
  list: adminProcedure
    .meta({ openapi: { method: "GET", path: "/jobs", tags: ["jobs"] } })
    .input(listJobsInputModel)
    .output(listJobsOutputModel)
    .query(({ input }) => jobsService.list(input)),

  retry: adminProcedure
    .meta({ openapi: { method: "POST", path: "/jobs/{id}/retry", tags: ["jobs"] } })
    .input(retryJobInputModel)
    .output(z.object({ success: z.literal(true) }))
    .mutation(({ input }) => jobsService.retry(input)),
});
