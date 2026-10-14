export const locales = ["en", "kn", "hi"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "locale";

// each language names itself, so it can be found whatever language is active
export const localeNames: Record<Locale, string> = {
  en: "English",
  kn: "ಕನ್ನಡ",
  hi: "हिन्दी",
};

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}
