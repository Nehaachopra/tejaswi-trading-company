import { cn } from "~/lib/utils";

// a slanted stamp across a document (printed too), over everything but not in the way: CANCELLED in red, RETURNED
// (every pack gone back) in chestnut. `small`: sized for a part of it (the breakup)
export function DocStamp({ label, tone, small = false }: { label: string; tone: "danger" | "chestnut"; small?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <span
        className={cn(
          "rounded-control font-heading font-bold tracking-[0.06em] opacity-35",
          small ? "-rotate-[18deg] border-[3px] px-3 pb-0.5 pt-2 text-3xl sm:text-4xl" : "-rotate-[24deg] border-4 px-5 pb-1 pt-3 text-6xl sm:text-8xl",
          tone === "danger" ? "border-danger text-danger" : "border-chestnut text-chestnut",
        )}
      >
        {label}
      </span>
    </div>
  );
}
