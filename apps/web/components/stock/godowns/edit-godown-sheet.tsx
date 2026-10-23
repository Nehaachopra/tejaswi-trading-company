"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { trpc } from "~/trpc/client";

import { categoryError } from "../../product/categories/category-errors";
import { draftFrom, draftInput, draftOk, emptyDraft, GodownFields, type GodownDraft } from "./godown-fields";

// a godown's details, admin only; its stock changes only through moves, sales, purchases and counts
export function EditGodownSheet({ godownId, onClose }: { godownId: string | null; onClose: () => void }) {
  const t = useTranslations("stock.form");
  const tg = useTranslations("stock.godowns");
  const utils = trpc.useUtils();
  const godown = trpc.inventory.godown.get.useQuery({ id: godownId ?? "" }, { enabled: !!godownId });
  const update = trpc.inventory.godown.update.useMutation();

  const [draft, setDraft] = useState<GodownDraft>(emptyDraft);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // start from the saved details each time it opens
  useEffect(() => {
    if (godown.data) setDraft(draftFrom(godown.data));
    setTried(false);
    setError(null);
  }, [godown.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (!godownId || !draftOk(draft)) return;
    try {
      const saved = await update.mutateAsync({ id: godownId, details: draftInput(draft) });
      toast.success(tg("toast.saved", { name: saved.godownName }));
      void utils.inventory.godown.invalidate();
      void utils.inventory.stock.byGodown.invalidate();
      onClose();
    } catch (err) {
      const key = categoryError(err);
      setError(t(`errors.${key === "invalidName" ? "check" : key === "hasProducts" ? "failed" : key}`));
    }
  }

  return (
    <Sheet open={!!godownId} title={t("editTitle")} closeLabel={t("close")} onClose={onClose}>
      {godown.isPending ? (
        <p className="flex justify-center py-16 text-chestnut/70">
          <Spinner />
        </p>
      ) : (
        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <GodownFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} tried={tried} />
            {tried && !draftOk(draft) && <FieldMessage>{t("errors.fill")}</FieldMessage>}
            {error && <FieldMessage>{error}</FieldMessage>}
          </div>
          <footer className="flex shrink-0 flex-col border-t border-chestnut/15 px-5 py-4">
            <SubmitButton busy={update.isPending}>{t("saveDetails")}</SubmitButton>
          </footer>
        </form>
      )}
    </Sheet>
  );
}
