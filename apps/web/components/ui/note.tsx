import { Info } from "lucide-react";

// a small disclaimer: every one starts with this icon
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-xs ${className ?? ""}`}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
