#!/usr/bin/env bash
# One-off market batch for Sept 2026.
# All questions match existing resolvers in packages/web/src/lib/server/resolver.ts
# so the daily sweep (+ hourly tick) auto-resolves them via public data.

set -eo pipefail

source "$(dirname "$0")/../.env"

CAST="/c/Users/moaci/.foundry/bin/cast.exe"
RPC="$ARC_RPC_URL"
KEY="$PRIVATE_KEY"
FACTORY="0xF7E0cf21B29B76C912690C65a5D0Bf244dF875A3"
USDC="0xd5413b391B3790CBEF25d9655d82a2ad99cD8b31"

FEE=200
LIQ=1000000000  # 1000 USDC

# Deadlines (unix)
# EOY 2026 = 2026-12-31 23:59 UTC = 1798761540
# 2026-Q4  Fed FOMC final decision (dec 15/16 2026) — using dec 17 close
TD_EOY=1798761540
RD_EOY=1799366340  # +7 days
TD_FED=1797897540   # 2026-12-16
RD_FED=1798502340
TD_CPI=1792915140   # 2026-10-22 (CPI for Sep = last month of Q3, ~Oct 15 release)
RD_CPI=1793519940

MARKETS=(
"Will the Fed cut rates at the next FOMC meeting?|Whether the FOMC decision after the next scheduled meeting shows a reduction in the FEDFUNDS target rate versus the prior meeting.|FRED FEDFUNDS series|$TD_FED|$RD_FED"
"Will 2026 be the hottest year on record per NASA GISS?|Resolves YES if 2026 ranks #1 in the NASA GISTEMP global-mean annual anomaly ranking after year-end publication.|NASA GISTEMP annual anomaly for 2026|$TD_EOY|$RD_EOY"
"Will US CPI YoY be below 3% for Q3 2026?|US Consumer Price Index year-over-year change for the last month of Q3 2026, below 3%.|FRED CPIAUCNS series|$TD_CPI|$RD_CPI"
"Will BTC close above $150k on 31/12/2026?|Bitcoin (BTC) closing price on major spot exchanges (Binance, Coinbase) on 31 December 2026.|CoinGecko BTC/USD daily close on 31 Dec 2026|$TD_EOY|$RD_EOY"
"Will ETH close above $8k on 31/12/2026?|Ethereum (ETH) daily close on 31 December 2026.|CoinGecko ETH/USD daily close on 31 Dec 2026|$TD_EOY|$RD_EOY"
"Will Ethereum reach \$300B TVL before 31/12/2026?|Total-value-locked on the Ethereum L1 per DeFiLlama at any point before end of 2026.|DeFiLlama Ethereum chain TVL|$TD_EOY|$RD_EOY"
"Will Bitcoin dominance be above 55% on 31/12/2026?|BTC market-cap share of total crypto market on CoinGecko /global at year-end.|CoinGecko /global BTC market-cap percentage on 31 Dec 2026|$TD_EOY|$RD_EOY"
)

for M in "${MARKETS[@]}"; do
  IFS='|' read -r Q D S TD RD <<< "$M"
  echo ""
  echo "=== Creating: $Q"

  CREATE_TX=$("$CAST" send "$FACTORY" \
    "createMarket(string,string,string,uint256,uint256,uint256)" \
    "$Q" "$D" "$S" "$TD" "$RD" "$FEE" \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  createTx: $CREATE_TX"

  # Get last market id from getMarketIds
  MID=$("$CAST" call "$FACTORY" "getMarketIds()(bytes32[])" --rpc-url "$RPC" | tr -d '[] ' | tr ',' '\n' | tail -n 1)
  MADDR=$("$CAST" call "$FACTORY" "getMarketAddress(bytes32)(address)" "$MID" --rpc-url "$RPC")
  echo "  market: $MADDR"

  APP_TX=$("$CAST" send "$USDC" "approve(address,uint256)" "$MADDR" "$LIQ" \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  approveTx: $APP_TX"

  LIQ_TX=$("$CAST" send "$MADDR" "addLiquidity(uint256,uint256)" "$LIQ" 0 \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  liquidity: $LIQ_TX"
done

echo ""
echo "Done."
