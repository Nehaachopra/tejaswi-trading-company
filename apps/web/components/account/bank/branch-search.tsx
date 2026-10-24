"use client";

import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

// the branch field when the IFSC isn't known: typing searches the bank's branches (by branch name or city) and
// lists them under the field; picking one gives its IFSC, which then fills in and locks the bank and branch.
// The name can still be typed by hand if the branch isn't listed
export function BranchSearch({
  bank,
  value,
  onType,
  onPick,
  className,
  invalid,
}: {
  bank: string;
  value: string;
  onType: (value: string) => void;
  onPick: (ifsc: string) => void;
  className: string;
  invalid: boolean;
}) {
  const t = useTranslations("accounts.bank.form");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);

  // search once typing pauses
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value.trim()), 250);
    return () => clearTimeout(timer);
  }, [value]);

  // a tap anywhere else closes the list
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const branches = trpc.accounts.bank.branches.useQuery({ bank, search }, { enabled: open && bank !== "" && search.length >= 2, placeholderData: (previous) => previous });

  return (
    <div ref={root} className="relative">
      <input
        value={value}
        maxLength={100}
        autoComplete="off"
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder={t("searchBranch")}
        aria-invalid={invalid || undefined}
        aria-autocomplete="list"
        aria-expanded={open}
        className={className}
      />
      {open && search.length >= 2 && (
        <div className="on-ivory absolute top-full z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-control border border-chestnut/25 bg-ivory p-1.5 text-chestnut">
          {branches.isFetching && !branches.data ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm">
              <Spinner className="size-4" /> {t("lookingUp")}
            </p>
          ) : (branches.data ?? []).length === 0 ? (
            <p className="px-3 py-3 text-sm">{t("noBranch")}</p>
          ) : (
            branches.data!.map((b) => (
              <button
                key={b.ifsc}
                type="button"
                onClick={() => {
                  onPick(b.ifsc);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 rounded-control px-3 py-2 text-left text-sm hover:bg-chestnut/[0.06]"
              >
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{titleCase(b.branch.toLowerCase())}</span>
                  <span className="block truncate text-xs">{[b.city, b.state].filter(Boolean).map((v) => titleCase(v!.toLowerCase())).join(", ")}</span>
                </span>
                <span className="tabular shrink-0 text-xs">{b.ifsc}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
