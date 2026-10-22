"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocale } from "~/i18n/actions";
import { localeNames, locales } from "~/i18n/locales";
import { cn } from "~/lib/utils";

// each language is named in its own script, so it can be found whatever language is showing
export function LanguageSwitch() {
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label="Language" className="flex gap-2">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={current === locale}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocale(locale);
              router.refresh();
            })
          }
          className={cn(
            "min-h-9 rounded-control border px-3 text-sm transition-colors",
            current === locale ? "border-ivory bg-ivory font-medium text-chestnut" : "hover:border-ivory/60",
          )}
        >
          {localeNames[locale]}
        </button>
      ))}
    </div>
  );
}
