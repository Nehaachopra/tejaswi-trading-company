"use client";

import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";

// how long a problem's words stay; the red edge on the field stays until it's put right
export const ERROR_MS = 6000;

// one line under the field it's about: red for a problem, amber for a warning (it doesn't stop anything), green once
// it's done; the same size, weight and place for all three, only the colour and icon differ, and always with the icon
// so it never rests on colour alone. A warning stays as long as its caller shows it. It sits tight under a field in a roomy form; `className`
// changes that where the gaps are smaller. A problem goes after a few seconds, and comes back when its words change,
// a form is submitted, or Next or Save is tapped
export function FieldMessage({
  tone = "error",
  className,
  children,
}: {
  tone?: "error" | "warning" | "success";
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? CircleAlert : tone === "warning" ? TriangleAlert : CircleCheck;
  const words =
    typeof children === "string" || typeof children === "number" ? String(children) : "";
  const [shown, setShown] = useState(true);

  // shown again whenever its words change; gone after a while
  useEffect(() => {
    if (tone !== "error") return;
    setShown(true);
    const timer = setTimeout(() => setShown(false), ERROR_MS);
    return () => clearTimeout(timer);
  }, [tone, words]);

  // shown again (for another while) when a form is submitted or a Next or Save is tapped
  useEffect(() => {
    if (tone !== "error") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = (e: Event) => {
      if (
        e.type === "click" &&
        !(e.target as HTMLElement).closest?.("[data-recheck], button[type=submit]")
      )
        return;
      setShown(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShown(false), ERROR_MS);
    };
    document.addEventListener("click", again, true);
    document.addEventListener("submit", again, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", again, true);
      document.removeEventListener("submit", again, true);
    };
  }, [tone]);

  if (!shown) return null;
  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={cn(
        "-mt-3 flex items-start gap-2 text-sm font-medium",
        tone === "error" ? "text-danger" : tone === "warning" ? "text-amber-700" : "text-success",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
