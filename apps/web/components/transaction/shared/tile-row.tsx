"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// an arrow over the row's edge: ivory with the soft shadow and corner of the boxes
const arrow =
  "absolute top-1/2 z-10 -translate-y-1/2 rounded-control bg-ivory p-2 text-chestnut shadow-[0_0_5px_0] shadow-chestnut/40 transition-shadow hover:shadow-chestnut/80";

// products in one row, swiped sideways: while more lie past the right edge, a › there moves the row on; once at the
// end, a ‹ on the left goes back to the start
export function TileRow({
  className,
  moreLabel,
  backLabel,
  children,
}: {
  className: string;
  moreLabel: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  const row = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState<"more" | "end" | "none">("none");
  const check = () => {
    const el = row.current;
    if (!el) return;
    // nothing hidden: no arrow; something past the right edge: ›; scrolled to the end: ‹
    if (el.scrollWidth <= el.clientWidth + 4) setEdge("none");
    else setEdge(el.scrollLeft + el.clientWidth < el.scrollWidth - 4 ? "more" : "end");
  };
  // checked on every render (tiles come and go), as the row scrolls and as it's resized
  useEffect(check);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const watch = new ResizeObserver(check);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <div className="relative">
      <ul ref={row} onScroll={check} className={className}>
        {children}
      </ul>
      {edge === "more" && (
        <button
          type="button"
          onClick={() => row.current?.scrollBy({ left: row.current.clientWidth * 0.8, behavior: "smooth" })}
          aria-label={moreLabel}
          className={`${arrow} -right-1`}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      )}
      {edge === "end" && (
        <button type="button" onClick={() => row.current?.scrollTo({ left: 0, behavior: "smooth" })} aria-label={backLabel} className={`${arrow} -left-1`}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
