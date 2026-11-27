import { cn } from "~/lib/utils";

// a slanted stamp across a document (printed too), over everything but not in the way: CANCELLED in red, RETURNED
// (every pack gone back) in chestnut
export function DocStamp({ label, tone }: { label: string; tone: "danger" | "chestnut" }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <span
        className={cn(
          "-rotate-[24deg] rounded-control border-4 px-5 pb-1 pt-3 font-heading text-6xl font-bold tracking-[0.06em] opacity-35 sm:text-8xl",
          tone === "danger" ? "border-danger text-danger" : "border-chestnut text-chestnut",
        )}
      >
        {label}
      </span>
    </div>
  );
}
