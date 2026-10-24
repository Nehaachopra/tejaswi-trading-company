import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

// fields and the primary button on an ivory card or sheet (chestnut ink): a field has no fill, only a chestnut edge,
// so what's typed reads clearly; it turns red and thicker while it has an error
export const fieldClass = (invalid: boolean) =>
  cn(
    "rounded-control border border-chestnut/70 bg-transparent text-chestnut outline-none transition-colors focus:border-chestnut",
    invalid && "border-2 border-danger focus:border-danger focus-within:border-danger",
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
