# Security & Trade-offs

## What's in v1

**Defenses applied:**
- `ReentrancyGuard` on every state-mutating function in `Market` (buy, sell, addLiquidity, removeLiquidity, redeem, lpRedeemAfterResolution)
- `SafeERC20` for USDC transfers (handles non-conforming `transfer`/`transferFrom`)
- Strict Checks-Effects-Interactions: state updates happen before external calls
- Slippage guards: `minTokensOut` on buy, `maxTokensIn` on sell, `minLpShares` on addLiquidity
- Deadline enforcement: `_checkOpen` blocks trading after `tradingDeadline`
- Role-based resolution: `onlyOracle` modifier on `Market.resolve`
- Factory-level pause switch (OpenZeppelin `Pausable`) on new market creation
- Explicit overflow panics via Solidity 0.8 default checked math
- `MIN_POOL_BALANCE` (1e4) to prevent division-by-zero in CPMM
- Custom errors instead of revert strings (cheaper, clearer)

**Tested:**
- 57 forge tests covering happy paths, slippage reverts, deadline enforcement, double-resolve protection, reentrancy attempt, pause/unpause, role management, fee accrual, multi-market isolation
- Fuzz tests on `previewBuy`/`previewSell`/`addLiquidity` proportionality with 1000 runs each
- Coverage: 95.5% lines, 93.1% statements, 72.7% branches

## Known trade-offs deliberately deferred to v2

### 1. Oracle is a single multisig-ready EOA
v1 oracle is whichever address holds `RESOLVER_ROLE` on `Oracle.sol`. There's no:
- Optimistic dispute window
- Bond / slashing
- Multi-sig requirement
- UMA integration

**Mitigation today**: deployer is the only resolver, the role is revocable by `DEFAULT_ADMIN_ROLE`, and the Oracle contract can be swapped via `factory.setOracle()` for *new* markets (existing markets are sticky to their oracle).

**v2 plan**: integrate UMA Optimistic Oracle. The `Oracle.sol` interface (single `resolve(market, outcome)` call) is intentionally minimal so it can be replaced.

### 2. No on-chain price feed for resolution
The market simply records what the oracle reports. Price data is *off-chain* (CoinGecko, FIFA, etc.) and the oracle is trusted to fetch it correctly.

### 3. Block-timestamp dependency for deadlines
`block.timestamp >= tradingDeadline` triggers state transitions. Validators can manipulate timestamps within ~15s, which is irrelevant for market deadlines (typically days).

### 4. Single CPMM curve (no LMSR)
LMSR (Logarithmic Market Scoring Rule) gives smoother price discovery in low-liquidity markets but requires `exp/ln` approximations on-chain (expensive). v1 uses CPMM for simplicity and correctness; LMSR was used historically by Gnosis but they migrated to CPMM in production.

### 5. No order book
v1 is purely an AMM. Polymarket production runs a CLOB+CPMM hybrid. Adding orders means a new contract layer.

### 6. Binary outcomes only
The `OutcomeToken` indexes by `(marketId, 0|1)`. Multi-outcome (e.g. "Who wins the election: A/B/C/D") would require generalizing to N outcomes and using a full Conditional Tokens Framework with position-id splitting.

### 7. Initial 50/50 LP price assumption
First LP is forced to seed the pool symmetrically. Markets where the actual probability is far from 50% will see an instant arbitrage opportunity to push the price toward truth — that's the design, but UX-wise it means the first LP eats some loss vs. a more sophisticated weighted-LP curve.

### 8. No subgraph / indexer
v1 reads trade history client-side via `eth_getLogs`. Works for low-volume testnets, but on mainnet this would be too slow and brittle. v2 should add Ponder or The Graph.

### 9. No permit-based USDC approvals
Users currently do `approve` + `buy` (two transactions). With ERC-20 permit (USDC supports it on most chains), this collapses to one tx. Not blocking for v1 testnet UX.

### 10. No fee tier per market
All markets use the same fee structure (no protocol fee, no LP fee split, no referral). Simple but inflexible.

### 11. Reentrancy attacker test only verifies state consistency
The `test_ReentrancyGuardOnBuy` test confirms that even if the ERC-1155 receive callback re-enters `buy`, the contract state remains consistent. It does *not* assert that the inner call reverted (the guard makes it revert silently in a `try/catch`). This is sufficient — the guard works — but the test could be stronger by emitting a marker event in the attacker.

### 12. No on-chain LP redemption math review for low-liquidity edge cases
After resolution, `lpRedeemAfterResolution` simply pays out `propYes` (winner) or `propNo` (winner) USDC per LP share. If trades dramatically depleted the winning side (e.g. YES wins but pool is mostly NO due to heavy YES buying), LPs can take a real loss. This is correct and intentional (LPs take market risk), but the UX should warn LPs about this dynamic.

## Slither / static analysis

`slither` was attempted but is not currently part of CI. To run:

```bash
pip install slither-analyzer
cd packages/contracts
slither . --config-file slither.config.json
```

A `slither.config.json` was not yet committed because the live runs surfaced only informational findings (mainly about `block.timestamp` use, which is acceptable for deadline enforcement). When integrating into CI, pin a `slither.config.json` with explicit suppressions and justifications.

## Audit recommendation

Before any mainnet deployment, this contract suite needs an external audit covering at minimum:
- Numerical precision in the CPMM math under extreme reserve ratios
- Reentrancy via the ERC-1155 callback path during `buy`/`sell` (we test it, but a fuzzer / formal verification could go deeper)
- LP exit dynamics for skewed pools at resolution
- Oracle replacement path for governance attacks

## Responsible disclosure

This is a testnet research project. If you find a vulnerability, please open an issue on GitHub with the `security` label or email the maintainers privately before public disclosure.
