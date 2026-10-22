import { CircleAlert, CircleCheck } from "lucide-react";

import { cn } from "~/lib/utils";

// one line under the field it's about: red for a problem, green once it's done,
// always with an icon so it never rests on colour alone
export function FieldMessage({ tone = "error", children }: { tone?: "error" | "success"; children: React.ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("-mt-3 flex items-start gap-2 text-sm font-medium", tone === "error" ? "text-danger" : "text-success")}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
