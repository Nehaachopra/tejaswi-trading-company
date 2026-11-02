import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

// fields and the primary button on an ivory card or sheet (chestnut ink): a field has no fill or edge, only a soft shadow all round it,
// so what's typed reads clearly; it turns red while it has an error
export const fieldClass = (invalid: boolean) =>
  cn(
    "rounded-control bg-transparent text-chestnut shadow-[0_0_5px_0] shadow-chestnut/40 outline-none transition-shadow focus:shadow-chestnut/80 focus-within:shadow-chestnut/80",
    invalid && "shadow-danger/80 focus:shadow-danger focus-within:shadow-danger",
  );

export function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      aria-busy={busy}
      className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory transition-opacity disabled:not-aria-busy:opacity-40 aria-busy:opacity-80"
    >
      {busy && <Spinner className="size-5" />}
      {children}
    </button>
  );
}
