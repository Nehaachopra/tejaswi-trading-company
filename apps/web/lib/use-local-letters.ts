"use client";

import { useLocale } from "next-intl";

import { titleCase } from "./format";
import { transliterate } from "./transliterate";

// a name or town as the screen shows it: in Kannada or Hindi letters when the app is in that language, else as typed
// (title case)
export function useLocalLetters() {
  const locale = useLocale();
  return (text: string) => (locale === "kn" || locale === "hi" ? transliterate(text, locale) : titleCase(text));
}
