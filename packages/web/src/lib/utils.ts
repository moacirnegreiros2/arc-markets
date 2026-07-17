import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsdc(amount: bigint, decimals = 6): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  return `${whole}.${frac.toString().padStart(decimals, "0").slice(0, 2)}`;
}

export function parseUsdc(value: string, decimals = 6): bigint {
  const [whole, frac = ""] = value.split(".");
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded);
}

export function formatProbability(bps: bigint): string {
  return ((Number(bps) / 100)).toFixed(1) + "%";
}

export function formatDeadline(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function timeLeft(deadline: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(deadline) - now;
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function explorerTxUrl(hash: string): string {
  return `https://testnet.arcscan.app/tx/${hash}`;
}

export function explorerAddressUrl(addr: string): string {
  return `https://testnet.arcscan.app/address/${addr}`;
}

export const MARKET_STATE = {
  0: "Open",
  1: "Closed",
  2: "Resolved",
} as const;

export const OUTCOME_LABEL = {
  0: "YES",
  1: "NO",
} as const;
