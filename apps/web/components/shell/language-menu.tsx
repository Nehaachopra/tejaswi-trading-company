"use client";

import { Check, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { setLocale } from "~/i18n/actions";
import { type Locale, localeNames, locales } from "~/i18n/locales";

// what the button shows for the language in use; each is written in its own script
const SHORT: Record<Locale, string> = { en: "EN", kn: "ಕ", hi: "हि" };

// the language toggle beside the profile button; the choice is saved in a cookie and the page re-renders in it
export function LanguageMenu() {
  const t = useTranslations("shell");
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Menu
      label={t("language")}
      triggerClassName="px-2.5"
      trigger={
        <>
          {pending ? <Spinner /> : <Languages className="size-4" aria-hidden />}
          <span lang={current} className="min-w-5 text-sm font-medium">
            {SHORT[current]}
          </span>
        </>
      }
    >
      {(close) =>
        locales.map((locale) => (
          <MenuItem
            key={locale}
            lang={locale}
            selected={locale === current}
            aria-current={locale === current ? "true" : undefined}
            onClick={() => {
              close();
              startTransition(async () => {
                await setLocale(locale);
                router.refresh();
              });
            }}
          >
            <span className="flex-1">{localeNames[locale]}</span>
            {locale === current && <Check className="size-4" aria-hidden />}
          </MenuItem>
        ))
      }
    </Menu>
  );
}
