"use client";

import { ArrowRight, CircleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { PickMenu } from "../pick-menu";

type Move = RouterOutputs["inventory"]["stock"]["moves"][number];

const PAGE = 30;

// the move history, newest first, with a godown filter and Show older; read-only
export function MovesSheet({ open, godowns, onClose }: { open: boolean; godowns: { id: string; name: string }[]; onClose: () => void }) {
  const t = useTranslations("stock.moves");
  const format = useFormatter();
  const utils = trpc.useUtils();
  const [godownId, setGodownId] = useState<string | null>(null);

  // the first page, then older pages appended below it
  const first = trpc.inventory.stock.moves.useQuery({ godownId: godownId ?? undefined, limit: PAGE }, { enabled: open });
  const [older, setOlder] = useState<Move[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setOlder([]);
    setHasMore((first.data?.length ?? 0) === PAGE);
  }, [first.data]);

  const moves = [...(first.data ?? []), ...older];

  async function showOlder() {
    const last = moves[moves.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await utils.inventory.stock.moves.fetch({ godownId: godownId ?? undefined, before: last.movedAt, limit: PAGE });
      setOlder((o) => [...o, ...page]);
      setHasMore(page.length === PAGE);
    } finally {
      setLoadingMore(false);
    }
  }

  const close = () => {
    setGodownId(null);
    onClose();
  };

  return (
    <Sheet open={open} title={t("title")} closeLabel={t("close")} onClose={close} dismissible>
      {/* the godown filter */}
      <div className="shrink-0 border-b border-chestnut/15 px-5 py-3">
        <PickMenu
          label={t("godown")}
          current={godowns.find((g) => g.id === godownId)?.name ?? t("allGodowns")}
          options={[{ id: null, name: t("allGodowns") }, ...godowns.map((g) => ({ id: g.id as string | null, name: g.name }))]}
          picked={godownId}
          onPick={setGodownId}
          className="min-h-9"
        />
      </div>

      {/* the moves */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-3">
        {first.isPending ? (
          <p className="flex justify-center py-16 text-chestnut/70">
            <Spinner />
          </p>
        ) : first.isError ? (
          <p role="alert" className="flex items-center justify-center gap-2 py-16">
            <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
          </p>
        ) : moves.length === 0 ? (
          <p className="py-16 text-center text-chestnut/70">{t("empty")}</p>
        ) : (
          <>
            <ul className="divide-y divide-chestnut/10">
              {moves.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 py-3">
                  {/* the product and how many */}
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">{titleCase(m.productName)}</p>
                    <p className="tabular shrink-0 font-heading text-lg font-bold">× {m.quantity.toLocaleString("en-IN")}</p>
                  </div>
                  {/* from → to */}
                  <p className="flex items-center gap-1.5 text-sm">
                    <span className="truncate">{m.fromGodownName}</span>
                    <ArrowRight className="size-4 shrink-0 text-chestnut/60" aria-hidden />
                    <span className="truncate">{m.toGodownName}</span>
                  </p>
                  {/* who, when, the vehicle and remarks */}
                  <p className="text-xs text-chestnut/70">
                    {[
                      m.movedByName,
                      format.dateTime(new Date(m.movedAt), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
                      m.vehicleNumber ? t("vehicle", { number: m.vehicleNumber }) : null,
                      m.remarks,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                type="button"
                onClick={() => void showOlder()}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className="my-3 flex min-h-11 items-center justify-center gap-2 rounded-control border border-chestnut/50 text-sm font-medium hover:border-chestnut"
              >
                {loadingMore && <Spinner />} {t("more")}
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
