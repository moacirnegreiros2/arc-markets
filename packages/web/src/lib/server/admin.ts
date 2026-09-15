// Server-side admin wallet (uses ADMIN_PRIVATE_KEY env var).
// Never import this from client code — it would leak the key.

import {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, ARC_RPC_URLS } from "@/config/chains";

const ADMIN_KEY = process.env.ADMIN_PRIVATE_KEY as `0x${string}` | undefined;

// Fallback transport: try the primary Arc RPC first, then QuickNode, then
// Blockdaemon on failure. `rank: false` keeps the order stable (the primary
// is preferred while healthy) instead of racing latencies. viem retries the
// same request against the next transport when one errors.
const rpcTransport = fallback(
  ARC_RPC_URLS.map((url) => http(url, { timeout: 30_000, retryCount: 1 })),
  { rank: false, retryCount: 0 },
);

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: rpcTransport,
});

export function getAdminClient() {
  if (!ADMIN_KEY) {
    throw new Error("ADMIN_PRIVATE_KEY not configured");
  }
  const account = privateKeyToAccount(ADMIN_KEY);
  return {
    account,
    walletClient: createWalletClient({
      account,
      chain: arcTestnet,
      transport: rpcTransport,
    }),
  };
}

export function assertCronAuth(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  // Vercel Cron sends "Bearer <secret>"
  if (!secret) throw new Error("CRON_SECRET not configured");
  if (auth !== `Bearer ${secret}`) {
    throw new Error("Unauthorized");
  }
}

export type AdminClient = ReturnType<typeof getAdminClient>;

export async function getMarketAddress(
  factory: Address,
  marketId: `0x${string}`,
  factoryAbi: readonly unknown[],
): Promise<Address> {
  return (await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "getMarketAddress",
    args: [marketId],
  })) as Address;
}
