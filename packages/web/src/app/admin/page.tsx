"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { toast } from "sonner";
import { FACTORY_ABI, ORACLE_ABI, ERC20_ABI } from "@/lib/abis";
import { CONTRACTS, DEPLOYER } from "@/config/contracts";
import { arcTestnet } from "@/config/chains";
import { explorerTxUrl } from "@/lib/utils";
import Link from "next/link";

type PendingItem = {
  marketId: string;
  address: string;
  question: string;
  tradingDeadline: number;
  resolutionDeadline: number;
  canAutoResolve: boolean;
  suggestedOutcome: 0 | 1 | null;
  reason: string;
  source?: string;
};

type CronTrigger = { lastRun?: string; lastResult?: unknown; running: boolean };

export default function AdminPage() {
  const { address: user } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  const busy = isPending || isConfirming;

  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [loadingPending, setLoadingPending] = useState(false);
  const [cronResolve, setCronResolve] = useState<CronTrigger>({ running: false });
  const [cronCreate, setCronCreate] = useState<CronTrigger>({ running: false });
  const [cronSecret, setCronSecret] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("arcmarkets:cronSecret") || "";
    setCronSecret(saved);
  }, []);

  const saveCronSecret = (v: string) => {
    setCronSecret(v);
    if (typeof window !== "undefined") {
      if (v) localStorage.setItem("arcmarkets:cronSecret", v);
      else localStorage.removeItem("arcmarkets:cronSecret");
    }
  };

  const isAdmin =
    user && user.toLowerCase() === DEPLOYER.toLowerCase();

  const [form, setForm] = useState({
    question: "",
    description: "",
    resolutionSource: "",
    tradingDays: "30",
    resolutionDays: "44",
    feeBps: "200",
  });

  const refreshPending = async () => {
    setLoadingPending(true);
    try {
      const r = await fetch("/api/admin/pending", { cache: "no-store" });
      const j = await r.json();
      setPending(j.items ?? []);
    } catch (e) {
      toast.error("Failed to load pending queue");
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    if (isAdmin) refreshPending();
  }, [isAdmin]);

  const runCron = async (
    path: "/api/cron/resolve" | "/api/cron/create",
    setter: (v: CronTrigger) => void,
  ) => {
    setter({ running: true });
    try {
      const r = await fetch(path + "?manual=1", {
        headers: { authorization: `Bearer ${cronSecret}` },
      });
      const j = await r.json();
      setter({ running: false, lastRun: new Date().toISOString(), lastResult: j });
      if (r.ok) {
        toast.success(`${path} OK`);
        if (path === "/api/cron/resolve") refreshPending();
      } else {
        toast.error(j.error || `${path} failed`);
      }
    } catch (e) {
      setter({ running: false, lastResult: { error: (e as Error).message } });
      toast.error((e as Error).message);
    }
  };

  const handleCreate = () => {
    if (!form.question) {
      toast.error("Question is required");
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const tradingDeadline = BigInt(now + parseInt(form.tradingDays) * 86400);
    const resolutionDeadline = BigInt(now + parseInt(form.resolutionDays) * 86400);

    writeContract(
      {
        address: CONTRACTS.MarketFactory,
        abi: FACTORY_ABI,
        functionName: "createMarket",
        args: [
          form.question,
          form.description,
          form.resolutionSource,
          tradingDeadline,
          resolutionDeadline,
          BigInt(form.feeBps),
        ],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (hash) => {
          toast.success("Market created", {
            action: {
              label: "View",
              onClick: () => window.open(explorerTxUrl(hash), "_blank"),
            },
          });
          setForm({
            question: "",
            description: "",
            resolutionSource: "",
            tradingDays: "30",
            resolutionDays: "44",
            feeBps: "200",
          });
        },
        onError: (e) => toast.error(`Create failed: ${e.message.split("\n")[0]}`),
      },
    );
  };

  const handleMintUsdc = () => {
    if (!user) return;
    writeContract(
      {
        address: CONTRACTS.MockUSDC,
        abi: ERC20_ABI,
        functionName: "mint",
        args: [user, 10_000n * 1_000_000n],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (hash) =>
          toast.success("Minted 10,000 USDC", {
            action: {
              label: "View",
              onClick: () => window.open(explorerTxUrl(hash), "_blank"),
            },
          }),
        onError: (e) => toast.error(`Mint failed: ${e.message.split("\n")[0]}`),
      },
    );
  };

  const handleResolve = (
    marketAddress: `0x${string}`,
    outcome: 0 | 1,
  ) => {
    writeContract(
      {
        address: CONTRACTS.Oracle,
        abi: ORACLE_ABI,
        functionName: "resolve",
        args: [marketAddress, outcome],
        chainId: arcTestnet.id,
      },
      {
        onSuccess: (hash) => {
          toast.success(`Resolved as ${outcome === 0 ? "YES" : "NO"}`, {
            action: {
              label: "View",
              onClick: () => window.open(explorerTxUrl(hash), "_blank"),
            },
          });
          setTimeout(refreshPending, 4000);
        },
        onError: (e) => toast.error(`Resolve failed: ${e.message.split("\n")[0]}`),
      },
    );
  };

  if (!user) {
    return (
      <div className="text-center py-24">
        <p className="text-4xl mb-4">🔐</p>
        <h2 className="text-2xl font-semibold mb-2">Admin only</h2>
        <p className="text-[var(--color-text-secondary)]">
          Connect the deployer wallet to access admin tools.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-24">
        <p className="text-4xl mb-4">⛔</p>
        <h2 className="text-2xl font-semibold mb-2">Not authorized</h2>
        <p className="text-[var(--color-text-secondary)] text-sm">
          Your wallet doesn&apos;t hold admin privileges.
        </p>
      </div>
    );
  }

  const autoCount = pending?.filter((p) => p.canAutoResolve).length ?? 0;
  const manualCount = (pending?.length ?? 0) - autoCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-[var(--color-text-muted)] text-xs mono mt-1">
          {user}
        </p>
      </div>

      {/* Automation panel */}
      <section className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Automation</h2>
          <span className="text-[11px] text-[var(--color-text-muted)] mono">
            cron · resolve 12:00 UTC · create 13:00 UTC
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Resolve pending</span>
              <span className="mono text-[10px] text-[var(--color-text-muted)]">
                daily 12:00 UTC
              </span>
            </div>
            <button
              onClick={() => runCron("/api/cron/resolve", setCronResolve)}
              disabled={cronResolve.running}
              className="w-full py-1.5 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50 text-[var(--color-bg-0)] text-xs font-semibold"
            >
              {cronResolve.running ? "Running…" : "Run resolver now"}
            </button>
            {cronResolve.lastResult != null && (
              <pre className="mt-2 text-[10px] text-[var(--color-text-muted)] max-h-24 overflow-auto">
                {JSON.stringify(cronResolve.lastResult, null, 2)}
              </pre>
            )}
          </div>

          <div className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Create new markets</span>
              <span className="mono text-[10px] text-[var(--color-text-muted)]">
                daily 13:00 UTC
              </span>
            </div>
            <button
              onClick={() => runCron("/api/cron/create", setCronCreate)}
              disabled={cronCreate.running}
              className="w-full py-1.5 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50 text-[var(--color-bg-0)] text-xs font-semibold"
            >
              {cronCreate.running ? "Running…" : "Run creator now"}
            </button>
            {cronCreate.lastResult != null && (
              <pre className="mt-2 text-[10px] text-[var(--color-text-muted)] max-h-24 overflow-auto">
                {JSON.stringify(cronCreate.lastResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
        <div className="mt-3">
          <label className="text-[11px] text-[var(--color-text-muted)] block mb-1">
            CRON_SECRET (stored locally in your browser, sent only when you click the buttons above)
          </label>
          <input
            type="password"
            value={cronSecret}
            onChange={(e) => saveCronSecret(e.target.value)}
            placeholder="Paste your cron secret here"
            className="w-full bg-[var(--color-bg-2)] border border-[var(--color-border-1)] rounded-md px-2.5 py-1.5 text-xs mono focus:outline-none focus:border-[var(--color-accent)]/60"
          />
        </div>
      </section>

      {/* Pending queue */}
      <section className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">
            Resolution queue{" "}
            <span className="text-[var(--color-text-muted)] mono ml-1">
              ({pending?.length ?? "…"})
            </span>
          </h2>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-[var(--color-accent)]">
              {autoCount} auto-resolvable
            </span>
            <span className="text-amber-400">{manualCount} manual</span>
            <button
              onClick={refreshPending}
              disabled={loadingPending}
              className="px-2 py-1 rounded-md bg-[var(--color-bg-2)] border border-[var(--color-border-1)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              {loadingPending ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {pending && pending.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-6">
            No markets waiting for resolution right now.
          </p>
        )}

        <div className="space-y-2">
          {pending?.map((p) => (
            <div
              key={p.marketId}
              className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        p.canAutoResolve
                          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {p.canAutoResolve ? "Auto" : "Manual"}
                    </span>
                    {p.canAutoResolve && p.suggestedOutcome !== null && (
                      <span className="text-[10px] mono text-[var(--color-text-muted)]">
                        suggests:{" "}
                        <span
                          className={
                            p.suggestedOutcome === 0
                              ? "text-[var(--color-yes)]"
                              : "text-[var(--color-no)]"
                          }
                        >
                          {p.suggestedOutcome === 0 ? "YES" : "NO"}
                        </span>
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/market/${p.marketId}`}
                    className="text-sm font-medium hover:text-[var(--color-accent)] block"
                  >
                    {p.question}
                  </Link>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
                    {p.reason}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleResolve(p.address as `0x${string}`, 0)}
                    disabled={busy}
                    className="px-2.5 py-1 rounded-md bg-[var(--color-yes-bg)] border border-[var(--color-yes-border)] text-[var(--color-yes)] text-xs font-semibold hover:bg-[var(--color-yes)]/20 disabled:opacity-50"
                  >
                    YES
                  </button>
                  <button
                    onClick={() => handleResolve(p.address as `0x${string}`, 1)}
                    disabled={busy}
                    className="px-2.5 py-1 rounded-md bg-[var(--color-no-bg)] border border-[var(--color-no-border)] text-[var(--color-no)] text-xs font-semibold hover:bg-[var(--color-no)]/20 disabled:opacity-50"
                  >
                    NO
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Mint USDC */}
      <section className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-5">
        <h2 className="text-sm font-semibold mb-3">Mint test USDC</h2>
        <button
          onClick={handleMintUsdc}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-[var(--color-bg-3)] hover:bg-[var(--color-bg-4)] border border-[var(--color-border-2)] text-sm"
        >
          Mint 10,000 USDC to my wallet
        </button>
      </section>

      {/* Create market (manual) */}
      <section className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-5 space-y-3">
        <h2 className="text-sm font-semibold">Create market manually</h2>

        {[
          { key: "question", label: "Question *", placeholder: "Will X happen by Y?" },
          { key: "description", label: "Description", placeholder: "Context for traders" },
          {
            key: "resolutionSource",
            label: "Resolution source",
            placeholder: "Where will the result be verified?",
          },
        ].map((f) => (
          <div key={f.key}>
            <label className="text-[11px] text-[var(--color-text-muted)]">
              {f.label}
            </label>
            <input
              type="text"
              placeholder={f.placeholder}
              value={form[f.key as keyof typeof form]}
              onChange={(e) =>
                setForm((p) => ({ ...p, [f.key]: e.target.value }))
              }
              className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-1)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]/60"
            />
          </div>
        ))}

        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "tradingDays", label: "Trading days" },
            { key: "resolutionDays", label: "Resolution days" },
            { key: "feeBps", label: "Fee (bps)" },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-[11px] text-[var(--color-text-muted)]">
                {f.label}
              </label>
              <input
                type="number"
                value={form[f.key as keyof typeof form]}
                onChange={(e) =>
                  setForm((p) => ({ ...p, [f.key]: e.target.value }))
                }
                className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-1)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]/60 mono"
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleCreate}
          disabled={busy || !form.question}
          className="w-full py-2 rounded-md bg-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50 text-[var(--color-bg-0)] text-sm font-semibold"
        >
          {busy ? "Confirming…" : "Create market"}
        </button>
      </section>
    </div>
  );
}
