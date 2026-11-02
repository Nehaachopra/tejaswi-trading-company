"use client";

import { CircleAlert, RefreshCw, RotateCcw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import type { RouterOutputs } from "@repo/trpc/client";

import { FILTER_BAR, PAGE } from "~/components/ui/page-styles";
import { chip } from "../product/row-styles";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
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
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>

      {/* state chips with their counts, then Refresh on the right, under the header while the list scrolls */}
      <div className={FILTER_BAR}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={state === f}
            onClick={() => setState(f)}
            className={`tabular ${chip(state === f)}`}
          >
            {t(`filters.${f}`)} {jobs.data ? `· ${jobs.data.counts[f]}` : ""}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void jobs.refetch()}
          disabled={jobs.isFetching}
          aria-busy={jobs.isFetching}
          className={`ml-auto flex items-center gap-1.5 aria-busy:opacity-80 ${chip(false)}`}
        >
          {jobs.isFetching ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />} {t("refresh")}
        </button>
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
