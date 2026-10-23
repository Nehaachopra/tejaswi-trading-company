"use client";

import { CircleAlert, History, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { trpc } from "~/trpc/client";

import { chip } from "../../product/row-styles";
import { StockTabs } from "../stock-tabs";
import { AddGodownSheet } from "./add-godown-sheet";
import { EditGodownSheet } from "./edit-godown-sheet";
import { GodownCard } from "./godown-card";
import { type MoveStart, MoveStockSheet } from "./move-stock-sheet";
import { MovesSheet } from "./moves-sheet";

const outline = "flex min-h-11 items-center justify-center gap-2 rounded-control border border-ivory/50 px-4 text-sm font-medium text-ivory hover:border-ivory";

// /stock, the Godowns tab: a card per godown with the products it holds; Moves (and each product's Move) for
// everyone, Add godown, Edit and Mark inactive for the admin
export function GodownsBoard({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("stock.godowns");
  const tf = useTranslations("stock.form");
  const utils = trpc.useUtils();
  const stock = trpc.inventory.stock.byGodown.useQuery();
  const [showInactive, setShowInactive] = useState(false);
  const godowns = trpc.inventory.godown.list.useQuery({ includeInactive: showInactive });
  const setActive = trpc.inventory.godown.setActive.useMutation();

  // the open sheets
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [moving, setMoving] = useState<MoveStart | null>(null);
  const [history, setHistory] = useState(false);

  // inactive godowns hold nothing, so they come from the godown list with an empty card
  const inactive = (godowns.data ?? [])
    .filter((g) => !g.isActive)
    .map((g) => ({ godownId: g.id, godownName: g.godownName, beingCounted: g.beingCounted, productCount: 0, products: [] }));
  const cards = stock.data ?? [];

  // mark a godown inactive or active again
  async function toggleActive(godownId: string, name: string, makeActive: boolean) {
    try {
      await setActive.mutateAsync({ id: godownId, isActive: makeActive });
      toast.success(t(makeActive ? "toast.reactivated" : "toast.deactivated", { name }));
      void utils.inventory.godown.list.invalidate();
      void utils.inventory.stock.byGodown.invalidate();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      const key = code === "PRECONDITION_FAILED" ? "hasProducts" : code === "CONFLICT" ? "counting" : code === undefined ? "network" : "failed";
      toast.error(tf(`errors.${key}`));
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      {/* the page's name, for screen readers only: the tabs say it visually */}
      <h1 className="sr-only">{t("title")}</h1>

      {/* Godowns · Stock count */}
      <StockTabs />

      {/* the actions: Add godown (admin), Moves; Show inactive for the admin */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ivory px-5 font-heading text-lg font-bold text-chestnut sm:w-auto"
          >
            <Plus className="size-5" aria-hidden /> {t("add")}
          </button>
        )}
        <button type="button" onClick={() => setHistory(true)} className={outline}>
          <History className="size-4" aria-hidden /> {t("moves")}
        </button>
        {isAdmin && (
          <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive((v) => !v)} className={chip(showInactive)}>
            {t("showInactive")}
          </button>
        )}
      </div>

      {/* the godown cards */}
      {stock.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : stock.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : cards.length + inactive.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{isAdmin ? t("emptyAdmin") : t("empty")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {cards.map((g) => (
            <GodownCard
              key={g.godownId}
              godown={g}
              isActive
              isAdmin={isAdmin}
              onEdit={() => setEditing(g.godownId)}
              onToggleActive={() => void toggleActive(g.godownId, g.godownName, false)}
              onMove={(productId) => setMoving({ fromGodownId: g.godownId, productId })}
            />
          ))}
          {showInactive &&
            inactive.map((g) => (
              <GodownCard
                key={g.godownId}
                godown={g}
                isActive={false}
                isAdmin={isAdmin}
                onEdit={() => setEditing(g.godownId)}
                onToggleActive={() => void toggleActive(g.godownId, g.godownName, true)}
                onMove={() => undefined}
              />
            ))}
        </div>
      )}

      {/* the sheets */}
      {isAdmin && <AddGodownSheet open={adding} onClose={() => setAdding(false)} />}
      {isAdmin && <EditGodownSheet godownId={editing} onClose={() => setEditing(null)} />}
      <MoveStockSheet start={moving} cards={cards} onClose={() => setMoving(null)} />
      <MovesSheet open={history} godowns={cards.map((c) => ({ id: c.godownId, name: c.godownName }))} onClose={() => setHistory(false)} />
    </main>
  );
}
