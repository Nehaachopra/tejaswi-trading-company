"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { toast } from "~/components/ui/toast";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { type Head, usualSide } from "./balance";

// what the sheet is for: a new ledger under a head, or a new name for one the admin added
export type LedgerSheetFor = { kind: "new"; head: Exclude<Head, "profit" | "loss"> } | { kind: "rename"; id: string; head: Head; name: string };

const NAME_MAX = 150;

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// a new ledger's name, or a new name for one the admin added; its opening balance is set on the Opening balances
// page. The head decides whether it is a debit account (Asset, Expense) or a credit account (Liability, Income)
export function LedgerSheet({ open, onClose }: { open: LedgerSheetFor | null; onClose: () => void }) {
  const t = useTranslations("accounts.ledgerForm");
  const th = useTranslations("accounts.overview.heads");
  const utils = trpc.useUtils();
  const create = trpc.accounts.ledger.create.useMutation();
  const update = trpc.accounts.ledger.update.useMutation();
  const [name, setName] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // start afresh each time it opens
  useEffect(() => {
    if (!open) return;
    setName(open.kind === "rename" ? titleCase(open.name) : "");
    setTried(false);
    setError(null);
  }, [open]);

  if (!open) return null;
  const bad = name.trim() === "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (bad) return setError(t("errors.fill"));
    try {
      const saved = open!.kind === "new" ? await create.mutateAsync({ head: open!.head, name: name.trim() }) : await update.mutateAsync({ id: open!.id, name: name.trim() });
      toast.success(t(open!.kind === "new" ? "toast.added" : "toast.saved", { name: titleCase(saved.name) }));
      void utils.accounts.invalidate();
      onClose();
    } catch (err) {
      const data = (err as { data?: { code?: string } })?.data;
      setError(t(`errors.${!data ? "network" : data.code === "CONFLICT" ? "taken" : "failed"}`));
    }
  }

  return (
    <Sheet open title={open.kind === "new" ? t("addTitle", { head: th(open.head) }) : t("renameTitle")} closeLabel={t("close")} onClose={onClose}>
      <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          {/* the name, and the kind of account its head makes it */}
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm">
              {t("name")}
              <span className="rounded-control bg-chestnut px-2 py-0.5 text-xs font-semibold text-ivory">{t(usualSide(open.head) === "debit" ? "debitAccount" : "creditAccount")}</span>
            </span>
            <input
              autoFocus
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder={open.kind === "new" ? t(`namePlaceholder.${open.head}`) : undefined}
              aria-invalid={(tried && bad) || undefined}
              className={input(tried && bad)}
            />
          </label>
          {open.kind === "new" && <p className="text-xs">{t("openingLater")}</p>}
          {error && <FieldMessage>{error}</FieldMessage>}
        </div>
        <footer className="flex shrink-0 flex-col border-t border-chestnut/15 px-5 py-4">
          <SubmitButton busy={create.isPending || update.isPending}>{t(open.kind === "new" ? "save" : "saveName")}</SubmitButton>
        </footer>
      </form>
    </Sheet>
  );
}
