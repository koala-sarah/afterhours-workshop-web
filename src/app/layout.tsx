import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk } from "next/font/google";

import { siteConfig } from "@/config/site";

import "./globals.css";

// Fonts used by the existing Squarespace site (confirmed in its site.css).
const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-archivo-black",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  openGraph: {
    siteName: siteConfig.name,
    locale: "en_NZ",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-NZ"
      className={`${archivoBlack.variable} ${spaceGrotesk.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
