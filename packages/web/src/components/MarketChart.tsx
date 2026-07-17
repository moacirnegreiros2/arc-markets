"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, parseAbiItem } from "viem";
import { arcTestnet } from "@/config/chains";
import { MARKET_ABI } from "@/lib/abis";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type DataPoint = { time: string; yesPct: number };

type Props = { marketAddress: `0x${string}` };

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

export function MarketChart({ marketAddress }: Props) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const logs = await client.getLogs({
          address: marketAddress,
          event: parseAbiItem(
            "event Trade(address indexed trader, uint8 indexed outcomeIndex, bool isBuy, uint256 collateralAmount, uint256 outcomeTokenAmount, uint256 fee)"
          ),
          fromBlock: "earliest",
          toBlock: "latest",
        });

        if (cancelled) return;

        if (logs.length === 0) {
          setData([{ time: "Now", yesPct: 50 }]);
          setLoading(false);
          return;
        }

        // Reconstruct price history by replaying pool states
        // We can't easily get exact pool state per trade without an indexer,
        // so we approximate by linearly interpolating from trade data.
        const points: DataPoint[] = [];
        let poolYes = 1000e6;
        let poolNo = 1000e6;

        for (const log of logs) {
          const { outcomeIndex, isBuy, collateralAmount } = log.args as {
            outcomeIndex: number;
            isBuy: boolean;
            collateralAmount: bigint;
          };

          const net = Number(collateralAmount) * 0.98;
          if (isBuy) {
            if (outcomeIndex === 0) {
              const k = poolYes * poolNo;
              poolNo += net;
              poolYes = k / poolNo;
            } else {
              const k = poolYes * poolNo;
              poolYes += net;
              poolNo = k / poolYes;
            }
          }

          const yesPct = (poolNo / (poolYes + poolNo)) * 100;
          const block = log.blockNumber?.toString() ?? "?";
          points.push({ time: `#${block}`, yesPct: parseFloat(yesPct.toFixed(1)) });
        }

        if (!cancelled) {
          setData(points);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setData([{ time: "Now", yesPct: 50 }]);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [marketAddress]);

  if (loading) {
    return <div className="h-40 bg-zinc-800/50 rounded animate-pulse" />;
  }

  if (data.length <= 1) {
    return (
      <div className="h-40 flex items-center justify-center text-zinc-500 text-sm">
        No trades yet — be the first to trade!
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#71717a" }} />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
          formatter={(v) => typeof v === "number" ? [`${v.toFixed(1)}%`, "YES Probability"] : [v, "YES Probability"]}
        />
        <Line
          type="monotone"
          dataKey="yesPct"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
