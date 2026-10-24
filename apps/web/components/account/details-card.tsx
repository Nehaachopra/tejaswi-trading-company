"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "~/lib/utils";

// the details on top of a bank account's or party's page: its name (and tags) with the ⋯ menu, opening to the
// details below. It starts closed so the ledger gets the room; the balance lives on the ledger's badge
export function DetailsCard({
  title,
  tags,
  menu,
  openLabel,
  children,
}: {
  title: string;
  tags?: React.ReactNode;
  menu?: React.ReactNode;
  // read out on the toggle: "Show details"
  openLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <section className="on-ivory rounded-control bg-ivory text-chestnut">
      <header className="flex items-center gap-2 p-2 pl-4">
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
          <h1 className="min-w-0 truncate font-heading text-2xl font-bold" title={title}>
            {title}
          </h1>
          {tags}
          <span className="sr-only">{openLabel}</span>
          <ChevronDown className={cn("ml-auto size-5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        {menu}
      </header>
      {open && (
        <div id={bodyId} className="border-t border-chestnut/15">
          {children}
        </div>
      )}
    </section>
  );
}

// the rows of details: a label on the left, its value on the right; two columns from 640px
export function DetailRows({ rows }: { rows: { label: string; value: string; number?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-1 divide-y divide-chestnut/10 px-4 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm sm:border-b sm:border-chestnut/10">
          <dt className="shrink-0 text-chestnut/70">{row.label}</dt>
          <dd className={cn("min-w-0 truncate text-right font-medium", row.number && "tabular")} title={row.value}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
