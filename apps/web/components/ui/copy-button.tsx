"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

// puts text on the clipboard; where the browser refuses the modern way (a page on plain http, say a phone on the local
// network), through a hidden field instead
async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = value;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const done = document.execCommand("copy");
    field.remove();
    return done;
  }
}

// a small button beside a value (a transaction's number) that copies it; it shows a tick for a moment once copied
export function CopyButton({ value }: { value: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => void copyText(value).then(setCopied)}
      aria-label={t(copied ? "copied" : "copy")}
      title={t(copied ? "copied" : "copy")}
      className="grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.06]"
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </button>
  );
}
