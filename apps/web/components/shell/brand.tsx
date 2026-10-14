import Link from "next/link";

// the brand stays in English in every language, like the printed logo
export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Tejaswi Trading Company home">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-surface font-serif text-sm font-bold text-brand-ink ring-1 ring-border">
        TTC
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-serif text-base font-bold tracking-wide text-brand-ink">TEJASWI</span>
        <span className="mt-1 text-xs font-semibold tracking-[0.12em] text-primary">TRADING COMPANY</span>
      </span>
    </Link>
  );
}
