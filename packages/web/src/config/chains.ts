import { defineChain } from "viem";

// Public RPCs for Arc Testnet (from chainid.network). QuickNode and
// Blockdaemon act as fallbacks — the primary endpoint occasionally throttles
// aggregate3 payloads with "Request exceeds defined limit". viem's fallback
// transport (used in admin.ts) rotates among these on error, so a hiccup on
// one node doesn't take the whole tick down.
export const ARC_RPC_URLS = [
  "https://rpc.testnet.arc.network",
  "https://rpc.quicknode.testnet.arc.network",
  "https://rpc.blockdaemon.testnet.arc.network",
] as const;

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    decimals: 6,
    name: "USD Coin",
    symbol: "USDC",
  },
  rpcUrls: {
    default: { http: [...ARC_RPC_URLS] },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 1,
    },
  },
  testnet: true,
});
