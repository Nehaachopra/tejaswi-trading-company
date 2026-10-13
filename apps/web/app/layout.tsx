import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { GlobalProviders } from "~/providers/global";
import { Inter, Figtree, Manrope, Outfit, Public_Sans, Montserrat, Noto_Serif, Noto_Sans, JetBrains_Mono } from "next/font/google";
import { cn } from "~/lib/utils";
import { TooltipProvider } from "~/components/ui/tooltip";

const publicSansHeading = Public_Sans({subsets:['latin'],variable:'--font-heading'});

const montserratHeading = Montserrat({subsets:['latin'],variable:'--font-heading'});

const notoSerifHeading = Noto_Serif({subsets:['latin'],variable:'--font-heading'})

const notoSansHeading = Noto_Sans({subsets:['latin'],variable:'--font-heading'})

const jetBrainsMonoHeading = JetBrains_Mono({subsets:['latin'],variable:'--font-heading'})

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("light", "font-sans", inter.variable, montserratHeading.variable)}>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <GlobalProviders><TooltipProvider>{children}</TooltipProvider></GlobalProviders>
      </body>
    </html>
  );
}
