import { LoaderCircle } from "lucide-react";

import { cn } from "~/lib/utils";

// shown inside a button while its request runs; the button's label stays beside it
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 shrink-0 animate-spin", className)} aria-hidden />;
}
