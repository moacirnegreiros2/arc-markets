"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Arc Prediction Markets",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo-project-id",
  chains: [arcTestnet],
  ssr: true,
});
