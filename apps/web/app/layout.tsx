import type { Metadata } from "next";
import { Baloo_2, Baloo_Tamma_2, Inter, Noto_Sans_Devanagari, Noto_Sans_Kannada } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import "./globals.css";
import { cn } from "~/lib/utils";
import { GlobalProviders } from "~/providers/global";

// headings: round letters that read like food packaging, and they draw Kannada too
const baloo = Baloo_Tamma_2({ subsets: ["latin", "kannada"], weight: ["600", "700"], variable: "--font-baloo" });
// the same family drawn for Hindi; fetched only when Devanagari letters appear
const balooDeva = Baloo_2({ subsets: ["devanagari"], weight: ["600", "700"], variable: "--font-baloo-deva", preload: false });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// fallbacks for Kannada and Hindi text; not preloaded, the browser fetches them only when those letters appear
const notoKannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-kannada", preload: false });
const notoDevanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-devanagari", preload: false });

export const metadata: Metadata = {
  title: "Tejaswi trading company",
  description: "Wholesale grocery dealer",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    // next-themes sets the theme class on <html> in the browser, so its attributes differ from the server render
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(baloo.variable, balooDeva.variable, inter.variable, notoKannada.variable, notoDevanagari.variable)}
    >
      <body>
        <NextIntlClientProvider>
          <GlobalProviders>{children}</GlobalProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
