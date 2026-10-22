import { TRPCError } from "@trpc/server";

import { boss } from "./boss";
import type { JobModel, JobStateModel, ListJobsInputModel, ListJobsOutputModel, RetryJobInputModel } from "./model";
import { sendOtpQueue } from "./queues/send-otp";

type JobData = Record<string, unknown>;

// how each queue shows on the Jobs page (the web app translates the title by queue name); summaries pick
// safe, language-free fields, so sealed secrets never leave the server
const QUEUES: Record<string, { title: string; summarize: (data: JobData) => string }> = {
  [sendOtpQueue.name]: {
    title: "Send OTP by SMS",
    summarize: (data) => {
      const phone = String(data.phone ?? "");
      return `${String(data.countryCode ?? "")} ${phone.slice(0, 5)} ${phone.slice(5)}`;
    },
  },
};

const STATES: JobStateModel[] = ["failed", "retry", "active", "created", "completed", "cancelled"];

type JobRow = {
  id: string;
  name: string;
  state: JobStateModel;
  retry_count: number;
  retry_limit: number;
  data: JobData | null;
  output: Record<string, unknown> | null;
  created_on: Date;
  started_on: Date | null;
  completed_on: Date | null;
};

// pg-boss keeps a thrown error in output as { message, stack, ... }
const errorOf = (row: JobRow) =>
  row.state === "failed" || row.state === "retry" ? String(row.output?.message ?? "No error message was recorded.") : null;

function toJob(row: JobRow): JobModel {
  const failedOrRetrying = row.state === "failed" || row.state === "retry";
  return {
    id: row.id,
    queue: row.name,
    queueTitle: QUEUES[row.name]?.title ?? row.name,
    state: row.state,
    attempts: row.retry_count + (row.state === "created" ? 0 : 1),
    maxAttempts: row.retry_limit + 1,
    summary: QUEUES[row.name]?.summarize(row.data ?? {}) ?? "",
    error: errorOf(row),
    result: failedOrRetrying ? null : (row.output ?? null),
    createdOn: new Date(row.created_on).toISOString(),
    startedOn: row.started_on ? new Date(row.started_on).toISOString() : null,
    completedOn: row.completed_on ? new Date(row.completed_on).toISOString() : null,
  };
}

// reads pgboss.job directly: pg-boss has no "jobs in this state, newest first" call
export default class JobsService {
  async list(input: ListJobsInputModel): Promise<ListJobsOutputModel> {
    const db = boss.getDb();

    const { rows: countRows } = await db.executeSql(
      `SELECT state::text AS state, count(*)::int AS count FROM pgboss.job GROUP BY state`,
    );
    const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<JobStateModel, number>;
    for (const row of countRows as { state: JobStateModel; count: number }[]) counts[row.state] = row.count;

    const { rows } = await db.executeSql(
      `SELECT id, name, state::text AS state, retry_count, retry_limit, data, output, created_on, started_on, completed_on
         FROM pgboss.job
        WHERE state = $1::pgboss.job_state
        ORDER BY created_on DESC
        LIMIT $2`,
      [input.state, input.limit],
    );

    return { counts, jobs: (rows as JobRow[]).map(toJob) };
  }

  // a failed job goes back in the queue with one more attempt allowed
  async retry(input: RetryJobInputModel) {
    const { rows } = await boss
      .getDb()
      .executeSql(`SELECT state::text AS state FROM pgboss.job WHERE name = $1 AND id = $2`, [input.queue, input.id]);
    if (rows[0]?.state !== "failed") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Only a failed job can be retried. This one may have run again already." });
    }
    await boss.retry(input.queue, input.id);
    return { success: true as const };
  }
}
