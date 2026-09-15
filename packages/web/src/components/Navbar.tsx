"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/admin", label: "Admin" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-[var(--color-bg-0)]/85 backdrop-blur-md border-b border-[var(--color-border-1)]">
      <div className="mx-auto max-w-[1400px] px-5 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* Custom mark: an arc curve rising into a peak — reads as
              "prediction" (probability curve) + "arc" (the network). */}
          <span className="relative w-8 h-8 grid place-items-center">
            <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-[var(--color-accent)] via-[var(--color-accent-2)] to-[var(--color-warm)] opacity-90" />
            <span className="absolute inset-[1px] rounded-[7px] bg-[var(--color-bg-0)]" />
            <svg
              viewBox="0 0 32 32"
              className="relative w-5 h-5"
              fill="none"
              stroke="url(#markGrad)"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <defs>
                <linearGradient id="markGrad" x1="0" y1="32" x2="32" y2="0">
                  <stop offset="0%" stopColor="var(--color-accent)" />
                  <stop offset="60%" stopColor="var(--color-accent-2)" />
                  <stop offset="100%" stopColor="var(--color-warm)" />
                </linearGradient>
              </defs>
              <path d="M5 25 C 9 8, 23 8, 27 25" />
              <circle cx="16" cy="10.5" r="1.6" fill="var(--color-warm)" stroke="none" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight leading-none">
            Arc
            <span className="text-gradient font-semibold"> Markets</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-2">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  active
                    ? "text-[var(--color-text-primary)] bg-[var(--color-bg-2)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-1)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-bg-2)] border border-[var(--color-border-1)] text-xs text-[var(--color-text-secondary)]">
          <span className="live-dot" />
          Arc Testnet
          <span className="text-[var(--color-text-muted)] mono">· 5042002</span>
        </div>

        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
        />
      </div>
    </header>
  );
}
