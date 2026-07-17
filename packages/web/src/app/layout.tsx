import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://arcmkt.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Arc Markets — Prediction markets on Arc",
  description:
    "Trade YES / NO on real-world outcomes. Powered by Arc Testnet, settled in USDC.",
  openGraph: {
    title: "Arc Markets",
    description:
      "Trade YES / NO on real-world outcomes. Powered by Arc Testnet, settled in USDC.",
    url: siteUrl,
    siteName: "Arc Markets",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Arc Markets",
    description:
      "Trade YES / NO on real-world outcomes. Powered by Arc Testnet, settled in USDC.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1 mx-auto w-full max-w-[1400px] px-5 py-6">
            {children}
          </main>
          <footer className="border-t border-[var(--color-border-1)] mt-auto">
            <div className="mx-auto max-w-[1400px] px-5 py-4 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <span>Arc Markets · Settled in USDC on Arc Testnet</span>
              <a
                href="https://testnet.arcscan.app"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--color-accent)]"
              >
                Explorer ↗
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
