import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { GlobalProviders } from "~/providers/global";
import { Inter, Figtree, Manrope, Outfit, Public_Sans, Montserrat, Noto_Serif, Noto_Sans, JetBrains_Mono, Geist, Noto_Sans_Kannada, Noto_Sans_Devanagari } from "next/font/google";
import { cn } from "~/lib/utils";
import { TooltipProvider } from "~/components/ui/tooltip";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

const geistHeading = Geist({subsets:['latin'],variable:'--font-heading'});

const montserratHeading = Montserrat({subsets:['latin'],variable:'--font-heading'});

const notoSerifHeading = Noto_Serif({subsets:['latin'],variable:'--font-heading'})

const notoSansHeading = Noto_Sans({subsets:['latin'],variable:'--font-heading'})

const jetBrainsMonoHeading = JetBrains_Mono({subsets:['latin'],variable:'--font-heading'})

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

// fallbacks for Kannada and Hindi text; not preloaded, the browser fetches them only when those letters appear
const notoKannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-kannada", preload: false });
const notoDevanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-devanagari", preload: false });

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

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
      className={cn("light", montserratHeading.variable, "font-sans", inter.variable, geistHeading.variable, notoKannada.variable, notoDevanagari.variable)}
    >
      <body className={`${geistSans.variable} ${geistMono.variable} bg-muted`}>
        <NextIntlClientProvider>
          <GlobalProviders><TooltipProvider>{children}</TooltipProvider></GlobalProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
