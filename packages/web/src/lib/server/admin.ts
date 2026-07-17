// Server-side admin wallet (uses ADMIN_PRIVATE_KEY env var).
// Never import this from client code — it would leak the key.

import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/config/chains";

const ADMIN_KEY = process.env.ADMIN_PRIVATE_KEY as `0x${string}` | undefined;

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0]),
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
      transport: http(arcTestnet.rpcUrls.default.http[0]),
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
