"use client";

import { ChevronDown } from "lucide-react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { cn } from "~/lib/utils";

// a dropdown on an ivory sheet: the trigger shows the current choice, the panel lists the options
export function PickMenu<T extends string | null>({
  label,
  current,
  options,
  picked,
  onPick,
  disabled,
  invalid,
  className,
}: {
  label: string;
  current: string;
  options: { id: T; name: string; hint?: string }[];
  picked: T;
  onPick: (id: T) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <Menu
      label={label}
      align="left"
      disabled={disabled}
      triggerClassName={cn("min-h-11 w-full min-w-0 justify-between px-3 text-sm", invalid && "border-2 border-danger", className)}
      trigger={
        <>
          <span className="truncate">{current}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </>
      }
    >
      {(close) =>
        options.map((option) => (
          <MenuItem
            key={option.id ?? "none"}
            selected={picked === option.id}
            onClick={() => {
              onPick(option.id);
              close();
            }}
          >
            <span className="flex-1 truncate">{option.name}</span>
            {option.hint && <span className="tabular shrink-0 text-xs opacity-70">{option.hint}</span>}
          </MenuItem>
        ))
      }
    </Menu>
  );
}
