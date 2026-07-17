# Contracts Reference

## MockUSDC.sol

Testnet-only ERC-20 mimicking Circle USDC (6 decimals, open `mint`).

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `decimals()` | view | Returns 6 |
| `mint(to, amount)` | external | Open mint for testing |

In production on Arc, the canonical USDC is the native gas token — replace `MockUSDC` with `0x...` Circle USDC address.

---

## OutcomeToken.sol (ERC-1155 + AccessControl)

Holds YES/NO tokens for *all* markets in a single contract. `tokenId` derived as `keccak256(marketId, outcomeIndex)`.

| Role | Holder | Permission |
|------|--------|------------|
| `DEFAULT_ADMIN_ROLE` | Deployer + MarketFactory | grant/revoke MINTER |
| `MINTER_ROLE` | Each Market clone | mint, burn |

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `tokenId(marketId, outcomeIndex)` | pure | Derive token ID |
| `mint(to, id, amount)` | onlyMinter | Mint outcome tokens |
| `burn(from, id, amount)` | onlyMinter | Burn outcome tokens |

---

## Market.sol (clone target)

Core contract. Deployed once as implementation, then clone-deployed for each market.

### State variables

```solidity
IERC20 usdc;            // collateral token
OutcomeToken outcomeToken;
address oracle;
bytes32 marketId;
string question, description, resolutionSource;
uint256 tradingDeadline, resolutionDeadline, feeBps;
uint256 poolYes, poolNo;       // pool token balances
State state;                   // Open | Closed | Resolved
uint8 winningOutcome;
uint256 yesTokenId, noTokenId;
```

### Public functions

| Function | Effect |
|----------|--------|
| `initialize(...)` | One-time setup, called by factory |
| `addLiquidity(usdcAmount, minLpShares)` | Mint paired YES+NO to pool, mint LP shares to caller |
| `removeLiquidity(lpShares)` | Burn LP shares, return proportional pool tokens to LP |
| `buy(outcomeIndex, usdcIn, minTokensOut)` | CPMM buy, mint outcome tokens |
| `sell(outcomeIndex, returnUsdc, maxTokensIn)` | CPMM sell, USDC-out interface |
| `redeem()` | Burn winning tokens 1:1 for USDC after resolution |
| `lpRedeemAfterResolution(lpShares)` | LP exit after resolution |
| `resolve(winningOutcome)` | onlyOracle: lock outcome |
| `previewBuy(outcome, usdcIn) → (tokensOut, fee)` | View |
| `previewSell(outcome, returnUsdc) → (tokensIn, fee)` | View |
| `impliedYesProbabilityBps()` | View, basis points 0–10000 |

### Events
- `LiquidityAdded(provider, usdcAmount, lpShares)`
- `LiquidityRemoved(provider, lpShares, yesReturned, noReturned)`
- `Trade(trader, outcomeIndex, isBuy, collateralAmount, outcomeTokenAmount, fee)`
- `MarketResolved(winningOutcome)`
- `Redeemed(redeemer, outcomeTokenAmount, usdcAmount)`
- `LPRedeemed(lp, lpShares, usdcAmount)`

### Custom errors

`NotOracle`, `AlreadyInitialized`, `MarketNotOpen`, `TradingDeadlineNotPassed`, `SlippageExceeded`, `ZeroAmount`, `InsufficientLiquidity`, `InvalidOutcome`, `AlreadyResolved`, `NotResolved`, `NoTokensToRedeem`, `ReturnExceedsPool`.

---

## MarketFactory.sol (Ownable + Pausable)

Deploys market clones, maintains registry.

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `createMarket(question, description, source, tradingDeadline, resolutionDeadline, feeBps)` | onlyOwner, whenNotPaused | Clone + initialize a market |
| `getMarketIds()` | view | All marketId bytes32 |
| `getMarketAddress(marketId)` | view | Lookup |
| `setOracle(newOracle)` | onlyOwner | Update default oracle |
| `setDefaultFeeBps(newFeeBps)` | onlyOwner | Max 10% (1000bps) |
| `pause() / unpause()` | onlyOwner | Pause new market creation |

### Events
- `MarketCreated(marketId, market, question, tradingDeadline, resolutionDeadline)`
- `OracleUpdated(newOracle)`
- `DefaultFeeUpdated(newFeeBps)`

---

## Oracle.sol (AccessControl)

Minimal resolver wrapper. v1 has manual resolution only.

| Role | Permission |
|------|------------|
| `DEFAULT_ADMIN_ROLE` | grant/revoke RESOLVER |
| `RESOLVER_ROLE` | call `resolve(market, outcome)` |

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `resolve(market, winningOutcome)` | onlyResolver | Forward to `Market.resolve` |
| `addResolver(addr)` / `removeResolver(addr)` | onlyAdmin | Manage resolver set |

The interface is designed so `Oracle` can later be replaced with a UMA / Chainlink-backed contract without touching `Market` storage.

---

## Gas profile (Solidity 0.8.24, optimizer 200, via_ir)

From `forge test --gas-report`:

| Action | Gas |
|--------|-----|
| `factory.createMarket` (clone + init + grant) | ~610k |
| `addLiquidity` (first LP) | ~330k |
| `addLiquidity` (subsequent) | ~130k |
| `buy` | ~135k |
| `sell` | ~190k |
| `removeLiquidity` | ~125k |
| `redeem` | ~80k |
| `resolve` | ~60k |

With Arc Testnet's USDC gas (6 decimals, currently ~20 gwei equivalent), a buy costs roughly $0.003 in USDC.
