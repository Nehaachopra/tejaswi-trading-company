"use client";

import { CircleAlert, RefreshCw, RotateCcw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import type { RouterOutputs } from "@repo/trpc/client";

import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

type Job = RouterOutputs["jobs"]["list"]["jobs"][number];
type State = Job["state"];

// the chips, in this order; cancelled jobs are rare enough to leave out
const FILTERS = ["failed", "retry", "created", "active", "completed"] as const satisfies readonly State[];

const WHEN = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" } as const;

// checks again every 15 s while the page is open, so a retried job moves along by itself
export function JobsBoard() {
  const t = useTranslations("jobs");
  const [state, setState] = useState<State>("failed");
  const jobs = trpc.jobs.list.useQuery({ state, limit: 50 }, { refetchInterval: 15_000, staleTime: 0 });

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      {/* header: title and Refresh */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-ivory/60">{t("eyebrow")}</p>
          <h1 className="font-heading text-4xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-ivory/70">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => void jobs.refetch()}
          disabled={jobs.isFetching}
          aria-busy={jobs.isFetching}
          className="flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-sm hover:border-ivory/60 aria-busy:opacity-80"
        >
          {jobs.isFetching ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />} {t("refresh")}
        </button>
      </header>

      {/* state chips with their counts */}
      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={state === f}
            onClick={() => setState(f)}
            className={cn(
              "tabular min-h-9 shrink-0 rounded-control border px-4 text-sm transition-colors",
              state === f ? "border-ivory bg-ivory font-medium text-chestnut" : "hover:border-ivory/60",
            )}
          >
            {t(`filters.${f}`)} {jobs.data ? `· ${jobs.data.counts[f]}` : ""}
          </button>
        ))}
      </div>

      {/* the list: loading, error, empty, or the cards */}
      {jobs.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : jobs.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2 text-ivory">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : jobs.data.jobs.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{t(`empty.${state}`)}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.data.jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </ul>
      )}
    </main>
  );
}

function JobCard({ job }: { job: Job }) {
  const t = useTranslations("jobs");
  const format = useFormatter();
  const utils = trpc.useUtils();
  const retry = trpc.jobs.retry.useMutation({
    onSuccess: () => {
      toast.success(t("queued"));
      void utils.jobs.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // a queue the translation files don't know yet shows the server's English title
  const title = t.has(`queues.${job.queue}`) ? t(`queues.${job.queue}`) : job.queueTitle;

  return (
    <li className="flex flex-col gap-3 rounded-control bg-ivory p-4 text-chestnut">
      {/* what the job was for, and when */}
      <div>
        <p className="text-xs text-chestnut/80">{format.dateTime(new Date(job.createdOn), WHEN)}</p>
        <h2 className="font-heading text-xl font-bold">{title}</h2>
        {job.summary && <p className="tabular text-sm">{job.summary}</p>}
      </div>

      {/* attempts, and when it ended */}
      <p className="tabular border-t border-chestnut/15 pt-3 text-sm text-chestnut/80">
        {t("attempt", { attempt: job.attempts, max: job.maxAttempts })}
        {job.completedOn && ` · ${t("ended", { time: format.dateTime(new Date(job.completedOn), WHEN) })}`}
      </p>

      {/* the last error, in red */}
      {job.error && (
        <p className="flex items-start gap-2 text-sm font-medium text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="break-words">{job.error}</span>
        </p>
      )}

      {/* Run again, for failed jobs only */}
      {job.state === "failed" && (
        <button
          type="button"
          onClick={() => retry.mutate({ queue: job.queue, id: job.id })}
          disabled={retry.isPending}
          aria-busy={retry.isPending}
          className="mt-auto flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-chestnut/60 px-3 text-sm font-medium hover:border-chestnut aria-busy:opacity-80"
        >
          {retry.isPending ? <Spinner /> : <RotateCcw className="size-4" aria-hidden />} {t("runAgain")}
        </button>
      )}
    </li>
  );
}
