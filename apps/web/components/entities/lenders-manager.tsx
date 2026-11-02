"use client";

import { CircleAlert, Ellipsis, Pencil, Plus, Power, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ClearButton } from "~/components/ui/clear-button";
import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Menu, MenuItem } from "~/components/ui/menu";
import { ADD_BUTTON, FILTER_BAR, PAGE } from "~/components/ui/page-styles";
import { RequiredMark } from "~/components/ui/required-mark";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { chip } from "../product/row-styles";
import { type BankLender, BankNamePick, lenderLabel } from "../transaction/lender-fields";

type Lender = RouterOutputs["accounts"]["lender"]["list"][number];

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// /entities/lenders, admin only: the banks and NBFCs we took loans from, apart from parties. + Add lender, a search with
// Show inactive, then a row per lender: its name, branch and type
export function LendersManager() {
  const t = useTranslations("lenders");
  const tc = useTranslations("common");
  const tl = useTranslations("transactions.loan");
  const utils = trpc.useUtils();
  const setActive = trpc.accounts.lender.setActive.useMutation();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  // the sheet: a new lender, or the one being edited
  const [open, setOpen] = useState<Lender | "new" | null>(null);

  const lenders = trpc.accounts.lender.list.useQuery({ includeInactive: showInactive });
  const needle = search.trim().toLowerCase();
  const shown = (lenders.data ?? []).filter((l) => needle === "" || lenderLabel(l).toLowerCase().includes(needle));

  // inactive only once it has no loan left to repay
  async function toggleActive(l: Lender) {
    try {
      await setActive.mutateAsync({ id: l.id, isActive: !l.isActive });
      void utils.accounts.lender.invalidate();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      toast.error(t(code === "PRECONDITION_FAILED" ? "hasLoans" : "failed"));
    }
  }

  return (
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>

      <button type="button" onClick={() => setOpen("new")} className={ADD_BUTTON}>
        <Plus className="size-5" aria-hidden /> {t("add")}
      </button>

      {/* search and Show inactive, under the header while the list scrolls */}
      <div className={`mt-3 ${FILTER_BAR}`}>
        <label className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control border border-ivory/40 px-3">
          <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
          <input
            type="search"
            value={search}
            maxLength={150}
            aria-label={t("search")}
            placeholder={t("search")}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base text-ivory outline-none placeholder:text-ivory/60"
          />
          {search && <ClearButton onClear={() => setSearch("")} label={tc("clearSearch")} />}
        </label>
        <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive((on) => !on)} className={chip(showInactive)}>
          {t("showInactive")}
        </button>
      </div>

      {lenders.isPending && (
        <p className="mt-8 flex items-center justify-center gap-2 text-ivory">
          <Spinner className="size-5" /> {t("loading")}
        </p>
      )}
      {lenders.isError && (
        <p className="mt-8 flex items-center gap-2 text-ivory">
          <CircleAlert className="size-5 shrink-0" aria-hidden /> {t("failed")}
        </p>
      )}
      {lenders.data && shown.length === 0 && <p className="mt-8 text-center text-ivory/70">{t(needle ? "noMatch" : "empty")}</p>}

      {/* a row per lender */}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {shown.map((l) => (
          <li key={l.id} className={cn("flex items-center gap-2 rounded-control px-3 py-2", l.isActive ? "on-ivory bg-ivory text-chestnut" : "border border-ivory/30 text-ivory")}>
            <button type="button" onClick={() => setOpen(l)} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
              <span className="truncate font-semibold">{l.name}</span>
              <span className="truncate text-xs opacity-75">{[l.branch, tl(`lenders.${l.type}`), !l.isActive && t("inactive")].filter(Boolean).join(" · ")}</span>
            </button>
            <Menu plain label={t("menu")} surface={l.isActive ? "ivory" : "chestnut"} triggerClassName="size-11 shrink-0" trigger={<Ellipsis className="size-5" aria-hidden />}>
              {(close) => (
                <>
                  <MenuItem
                    onClick={() => {
                      close();
                      setOpen(l);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden /> {t("edit")}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      close();
                      void toggleActive(l);
                    }}
                  >
                    <Power className="size-4" aria-hidden /> {t(l.isActive ? "deactivate" : "reactivate")}
                  </MenuItem>
                </>
              )}
            </Menu>
          </li>
        ))}
      </ul>

      {open && <LenderSheet key={open === "new" ? "new" : open.id} lender={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </main>
  );
}

// a lender's details: only what a bank or NBFC has. Its type is set once, as its loans' TDS follows it
function LenderSheet({ lender, onClose }: { lender: Lender | null; onClose: () => void }) {
  const t = useTranslations("lenders");
  const tf = useTranslations("transactions.lender");
  const tl = useTranslations("transactions.loan");
  const utils = trpc.useUtils();
  const create = trpc.accounts.lender.create.useMutation();
  const update = trpc.accounts.lender.update.useMutation();
  const [type, setType] = useState<BankLender>(lender?.type ?? "bank");
  const [name, setName] = useState(lender?.name ?? "");
  const [branch, setBranch] = useState(lender?.branch ?? "");
  const [pan, setPan] = useState(lender?.pan ?? "");
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const noName = tried && name.trim() === "";
  const badPan = pan !== "" && !PAN_RE.test(pan);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setFailed(null);
    if (name.trim() === "" || badPan) return;
    try {
      if (lender) await update.mutateAsync({ id: lender.id, name: name.trim(), branch: branch.trim(), pan });
      else await create.mutateAsync({ name: name.trim(), branch: branch.trim(), type, pan });
      void utils.accounts.lender.invalidate();
      onClose();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      setFailed(t(code === "CONFLICT" ? "duplicate" : "failed"));
    }
  }

  return (
    <Sheet open title={t(lender ? "editTitle" : "addTitle")} closeLabel={t("close")} onClose={onClose}>
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4 p-4">
        {!lender && (
          <div role="radiogroup" aria-label={tl("lender")} className="flex flex-col gap-2.5">
            <span className="text-xs font-semibold">{tl("lender")}</span>
            <div className="flex gap-2">
              {(["bank", "nbfc"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)} className={cn("min-h-10 rounded-control border px-3 text-sm font-medium", type === k ? "border-chestnut bg-chestnut text-ivory" : "border-chestnut/50")}>
                  {tl(`lenders.${k}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-2.5 text-xs font-semibold">
          <span>
            {tf("name")}
            <RequiredMark />
          </span>
          {type === "bank" ? (
            <BankNamePick value={name} onChange={setName} invalid={noName} />
          ) : (
            <input autoFocus value={name} maxLength={150} placeholder={tf("namePlaceholder")} onChange={(e) => setName(e.target.value)} aria-invalid={noName || undefined} className={input(noName)} />
          )}
        </label>
        <label className="flex flex-col gap-2.5 text-xs font-semibold">
          {tf("branch")}
          <input value={branch} maxLength={100} onChange={(e) => setBranch(e.target.value)} className={input(false)} />
        </label>
        {type === "nbfc" && (
          <label className="flex flex-col gap-2.5 text-xs font-semibold sm:w-56">
            {tf("pan")}
            <input value={pan} maxLength={10} placeholder="ABCDE1234F" onChange={(e) => setPan(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase())} aria-invalid={badPan || undefined} className={cn(input(badPan && (tried || pan.length === 10)), "tabular uppercase")} />
          </label>
        )}
        {failed && <FieldMessage className="mt-0">{failed}</FieldMessage>}
        <SubmitButton busy={create.isPending || update.isPending}>{t("save")}</SubmitButton>
      </form>
    </Sheet>
  );
}
