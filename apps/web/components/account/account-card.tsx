"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "~/lib/utils";

// a card on the account pages, as the Entities cards are: on the left the name (with its tags beside it) and a line or
// two under it; on the right its balance on top, any post-dated part under it, and the arrow that opens it. Active:
// ivory; inactive: a dashed outline on the chestnut page. A link, or a button for one that has no page yet
export function AccountCard({
  href,
  onClick,
  name,
  title,
  tags,
  lines,
  amount,
  postDated,
  inactive = false,
  oneLine = false,
}: {
  // a ledger's card: one line, the name on the left, its balance and the arrow on the right (a post-dated part, if any,
  // under the name)
  oneLine?: boolean;
  href?: string;
  onClick?: () => void;
  name: string;
  // the name in full on hover, where it's cut short
  title?: string;
  // beside the name: Added, Inactive ...
  tags?: React.ReactNode;
  // under the name: the full name, a phone and town, how many ledgers ...
  lines?: React.ReactNode;
  amount: React.ReactNode;
  postDated?: string | null;
  inactive?: boolean;
}) {
  const card = cn(
    "flex w-full min-w-0 items-center gap-2 rounded-control border p-2 pl-4 text-left",
    inactive
      ? "border-dashed border-ivory/60 text-ivory"
      : "on-ivory border-ivory bg-ivory text-chestnut",
  );
  const body = (
    <>
      <span className="min-w-0 flex-1 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-heading text-xl font-bold leading-7" title={title}>
            {name}
          </span>
          {tags}
        </span>
        {lines}
        {oneLine && postDated && (
          <span className="tabular block text-xs opacity-70">{postDated}</span>
        )}
      </span>
      {oneLine ? (
        <span className="flex shrink-0 items-center gap-2 pr-2">
          {amount}
          <ChevronRight className="size-5 opacity-60" aria-hidden />
        </span>
      ) : (
        <span className="flex shrink-0 flex-col items-end gap-1 py-1.5 pr-2">
          {amount}
          {postDated && <span className="tabular text-xs opacity-70">{postDated}</span>}
          <ChevronRight className="size-5 opacity-60" aria-hidden />
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={card}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={card}>
      {body}
    </button>
  );
}

// a tag beside a card's name (Added, Inactive), as the Entities cards' type tags
export function CardTag({
  children,
  strong = false,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-control border px-2 py-0.5 text-xs",
        strong ? "border-current" : "border-current/40",
      )}
    >
      {children}
    </span>
  );
}

// the small line under a card's name: its pieces side by side with a little space, faint
export const CARD_LINE = "flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs opacity-70";

// the grid the account pages' cards sit in, as the Entities lists
export const CARD_GRID = "grid grid-cols-1 gap-3 lg:grid-cols-2";
