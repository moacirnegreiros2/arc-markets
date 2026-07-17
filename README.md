# ArcPM — Prediction Markets on Arc Testnet

Polymarket-style binary prediction markets running on **Arc Testnet** (Circle's EVM L1 with USDC as the native gas token, chain ID `5042002`).

## 🌐 Live demo

**https://arcmkt.vercel.app**

Connect any wallet, request the Arc Testnet network add (the app prompts automatically), and trade against the three seeded markets.

## What it is

- Binary YES/NO prediction markets settled in USDC
- AMM trading via Constant Product Market Maker (CPMM, `x * y = k`)
- Conditional Tokens Framework: 1 USDC ↔ 1 YES + 1 NO (always paired)
- ERC-1155 outcome tokens, ERC-20 LP shares
- Direct sell-formula (no on-chain sqrt) to keep gas low
- Fully client-side dApp — no backend, no subgraph

## Stack

- **Contracts**: Solidity `^0.8.24`, Foundry, OpenZeppelin v5
- **Frontend**: Next.js 16 (App Router), wagmi v2, viem v2, RainbowKit, TailwindCSS, Recharts, sonner
- **Indexing**: client-side `eth_getLogs` via viem (v2 simplification)
- **Tooling**: pnpm workspaces, ESLint, Prettier

## Architecture

```
                     ┌──────────────┐
                     │ MarketFactory│
                     │  (Pausable)  │
                     └──────┬───────┘
                            │ creates clones
                            ▼
            ┌───────────────────────────────┐
            │           Market              │
            │  ┌─────────────────────────┐  │
            │  │ CPMM: poolYes * poolNo  │  │
            │  │ ERC-20 LP shares        │  │
            │  │ State: Open→Closed→Resolved │
            │  └─────────────────────────┘  │
            └────┬────────────┬──────────┬──┘
                 │            │          │
        ┌────────▼─┐   ┌──────▼─────┐ ┌──▼────────┐
        │ MockUSDC │   │OutcomeToken│ │  Oracle   │
        │ (ERC-20) │   │ (ERC-1155) │ │(AccessCtl)│
        └──────────┘   └────────────┘ └───────────┘
```

See [docs/architecture.md](docs/architecture.md) for the full diagram.

## Live deployment (Arc Testnet, chain 5042002)

| Contract | Address |
|----------|---------|
| MockUSDC | [`0xd5413b39…cD8b31`](https://testnet.arcscan.app/address/0xd5413b391B3790CBEF25d9655d82a2ad99cD8b31) |
| OutcomeToken | [`0xd150e8e7…fCAeC`](https://testnet.arcscan.app/address/0xd150e8e77fB8c4dD3FAD25afdE4e12AEbcefCAeC) |
| Oracle | [`0x50FA75b9…4A311E`](https://testnet.arcscan.app/address/0x50FA75b98C2238ED1917dD01948Aab86c14A311E) |
| MarketFactory | [`0xF7E0cf21…f875A3`](https://testnet.arcscan.app/address/0xF7E0cf21B29B76C912690C65a5D0Bf244dF875A3) |

Three live markets, each seeded with 1000 USDC liquidity. Full E2E walkthrough with tx hashes: [docs/e2e-walkthrough.md](docs/e2e-walkthrough.md).

## Quick start

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)

### Install
```bash
pnpm install
```

### Run contracts test suite
```bash
cd packages/contracts
forge test
forge coverage --ir-minimum --report summary
```

### Deploy to Arc Testnet
1. Generate a deployer wallet:
   ```bash
   cast wallet new
   ```
2. Save the private key in `.env` and fund the address at [https://faucet.circle.com](https://faucet.circle.com).
3. Deploy:
   ```bash
   cd packages/contracts
   source ../../.env
   forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast
   ```
4. Copy the addresses from `deployments/arc-testnet.json` into `packages/web/src/config/contracts.ts`.

### Run the dApp
```bash
cd packages/web
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000), connect your wallet (the app auto-prompts to add the Arc Testnet network), and trade.

## Project layout

```
arcprediction/
├── packages/
│   ├── contracts/          # Foundry project
│   │   ├── src/
│   │   │   ├── MockUSDC.sol
│   │   │   ├── OutcomeToken.sol      # ERC-1155 outcome tokens
│   │   │   ├── Market.sol            # CPMM trading + LP + redemption
│   │   │   ├── MarketFactory.sol     # Clones markets
│   │   │   └── Oracle.sol            # RESOLVER_ROLE wrapper
│   │   ├── test/Market.t.sol         # 57 tests, 95%+ coverage
│   │   ├── script/Deploy.s.sol       # Seed 3 example markets
│   │   └── deployments/arc-testnet.json
│   └── web/                # Next.js App Router
│       └── src/
│           ├── app/
│           │   ├── page.tsx            # Market list
│           │   ├── market/[id]/page.tsx
│           │   ├── portfolio/page.tsx
│           │   └── admin/page.tsx
│           ├── components/             # MarketCard, TradePanel, etc.
│           ├── config/                 # chains, contracts, wagmi
│           ├── hooks/useMarkets.ts
│           └── lib/{abis,utils}.ts
├── docs/
│   ├── architecture.md
│   ├── contracts.md
│   ├── e2e-walkthrough.md
│   └── security.md
└── README.md
```

## Roadmap (v2)

What was deliberately skipped for v1:

- **Real oracle integration** (UMA Optimistic Oracle / Chainlink Any-API)
- **The Graph / Ponder subgraph** — currently using client-side `eth_getLogs`
- **Multi-outcome markets** (e.g. 4-way, 8-way) via expanded CTF
- **Order book hybrid** (Polymarket-style limit orders alongside the CPMM)
- **LMSR** alternative pricing curve
- **Mobile wallet deeplink** flows
- **Permit-style USDC approvals**

See [docs/security.md](docs/security.md) for the full list of v1 trade-offs.

## License

MIT
