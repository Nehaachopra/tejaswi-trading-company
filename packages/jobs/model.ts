import { z } from "zod";

export const jobStateModel = z.enum(["failed", "retry", "active", "created", "completed", "cancelled"]);

export type JobStateModel = z.infer<typeof jobStateModel>;

export const jobModel = z.object({
  id: z.string().uuid(),
  queue: z.string(),
  queueTitle: z.string(),
  state: jobStateModel,
  // attempts so far (the first run counts) and how many are allowed in all
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  // one language-free line about what the job is for ("+91 98765 43210"); never holds a sealed secret
  summary: z.string(),
  // the last error, or the worker's result once completed
  error: z.string().nullable(),
  result: z.unknown().nullable(),
  // ISO strings: there is no transformer, so a Date would reach the browser as a string anyway
  createdOn: z.string(),
  startedOn: z.string().nullable(),
  completedOn: z.string().nullable(),
});

export type JobModel = z.infer<typeof jobModel>;

export const listJobsInputModel = z
  .object({ state: jobStateModel.default("failed"), limit: z.coerce.number().int().min(1).max(200).default(50) })
  .default({ state: "failed", limit: 50 });

export type ListJobsInputModel = z.infer<typeof listJobsInputModel>;

export const listJobsOutputModel = z.object({
  counts: z.record(jobStateModel, z.number().int()),
  jobs: z.array(jobModel),
});

export type ListJobsOutputModel = z.infer<typeof listJobsOutputModel>;

export const retryJobInputModel = z.object({ queue: z.string().min(1), id: z.string().uuid() });

export type RetryJobInputModel = z.infer<typeof retryJobInputModel>;
