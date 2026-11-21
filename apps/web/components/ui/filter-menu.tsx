"use client";

import { Check, ChevronDown } from "lucide-react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { FILTER_TRIGGER } from "~/components/ui/page-styles";
import { cn } from "~/lib/utils";

// how a filter looks on each surface: on the chestnut page a set filter turns ivory and its list floats over the page;
// on an ivory card a set filter turns chestnut and its list sits under it, pushing what's below down
const LOOK = {
  chestnut: { set: "border-ivory bg-ivory text-chestnut", extra: "", floating: true, inFlow: false },
  ivory: { set: "border-chestnut bg-chestnut text-ivory", extra: "min-h-10 rounded-control", floating: false, inFlow: true },
} as const;

// one filter dropdown: the "all" choice first, then each option; a pick closes it. Any list page or card borrows this
// one, so every filter looks and behaves the same
export function FilterMenu<K extends string>({
  label,
  allLabel,
  value,
  options,
  onPick,
  surface = "chestnut",
  disabled,
  className,
}: {
  label: string;
  allLabel: string;
  value: K | null;
  options: { key: K; label: string }[];
  onPick: (key: K | null) => void;
  surface?: "chestnut" | "ivory";
  disabled?: boolean;
  className?: string;
}) {
  const look = LOOK[surface];
  const picked = options.find((o) => o.key === value);
  return (
    <Menu
      label={label}
      surface={surface}
      align="left"
      boxed
      floating={look.floating}
      inFlow={look.inFlow}
      disabled={disabled}
      triggerClassName={cn(FILTER_TRIGGER, look.extra, "shrink-0", value !== null && look.set, className)}
      trigger={
        <>
          <span className="truncate">{picked ? picked.label : allLabel}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </>
      }
    >
      {(close) =>
        [{ key: null, label: allLabel }, ...options].map((o) => (
          <MenuItem
            key={o.key ?? "all"}
            selected={value === o.key}
            onClick={() => {
              onPick(o.key);
              close();
            }}
          >
            <span className="flex-1">{o.label}</span>
            {value === o.key && <Check className="size-4" aria-hidden />}
          </MenuItem>
        ))
      }
    </Menu>
  );
}
