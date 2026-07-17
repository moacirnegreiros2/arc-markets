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
        <Link href="/" className="flex items-center gap-2 group">
          <span className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-dim)] grid place-items-center text-[var(--color-bg-0)] font-bold text-sm">
            ▲
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Arc<span className="text-[var(--color-accent)]"> Markets</span>
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
