#!/usr/bin/env bash
# One-off creator for 5 World Cup 2026 markets.
# Resolution patterns intentionally match resolver.ts (wcWinner / wcSemifinal)
# so /api/cron/tick auto-resolves them via ESPN after the tournament.

set -euo pipefail

source "$(dirname "$0")/../.env"

CAST="/c/Users/moaci/.foundry/bin/cast.exe"
RPC="$ARC_RPC_URL"
KEY="$PRIVATE_KEY"
FACTORY="0xF7E0cf21B29B76C912690C65a5D0Bf244dF875A3"
USDC="0xd5413b391B3790CBEF25d9655d82a2ad99cD8b31"

# Deadlines (unix). Final 2026-07-19 ~20:00 UTC. Semis ~2026-07-14 / 15.
TD_WINNER=1784397600     # 2026-07-19 18:00 UTC (2h before final kickoff)
RD_WINNER=1785002400     # 2026-07-26 18:00 UTC
TD_SEMI=1783965600       # 2026-07-14 18:00 UTC
RD_SEMI=1784570400       # 2026-07-21 18:00 UTC
FEE=200                  # 2%
LIQ=1000000000           # 1000 USDC (6 decimals)

# question | description | source | td | rd
MARKETS=(
"Will France win the 2026 FIFA World Cup?|France national football team winning the FIFA World Cup 2026 final|FIFA official tournament results|$TD_WINNER|$RD_WINNER"
"Will England win the 2026 FIFA World Cup?|England national football team winning the FIFA World Cup 2026 final|FIFA official tournament results|$TD_WINNER|$RD_WINNER"
"Will Spain win the 2026 FIFA World Cup?|Spain national football team winning the FIFA World Cup 2026 final|FIFA official tournament results|$TD_WINNER|$RD_WINNER"
"Will Germany reach the semi-finals of the 2026 World Cup?|Germany (DFB) reaching the top-4 stage of the FIFA World Cup 2026 held in USA/Canada/Mexico|FIFA official bracket results - official FIFA.com or equivalent|$TD_SEMI|$RD_SEMI"
"Will Portugal reach the semi-finals of the 2026 World Cup?|Portugal national football team reaching the top-4 stage of the FIFA World Cup 2026 held in USA/Canada/Mexico|FIFA official bracket results - official FIFA.com or equivalent|$TD_SEMI|$RD_SEMI"
)

last_id() {
  "$CAST" call "$FACTORY" "getMarketIds()(bytes32[])" --rpc-url "$RPC" \
    | tr -d '[] ' | tr ',' '\n' | tail -n 1
}

for M in "${MARKETS[@]}"; do
  IFS='|' read -r Q D S TD RD <<< "$M"
  echo ""
  echo "=== Creating: $Q"

  BEFORE_LEN=$("$CAST" call "$FACTORY" "getMarketIds()(bytes32[])" --rpc-url "$RPC" \
    | tr -d '[] ' | tr ',' '\n' | grep -c '^0x' || true)

  CREATE_TX=$("$CAST" send "$FACTORY" \
    "createMarket(string,string,string,uint256,uint256,uint256)" \
    "$Q" "$D" "$S" "$TD" "$RD" "$FEE" \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  createTx: $CREATE_TX"

  AFTER_LEN=$("$CAST" call "$FACTORY" "getMarketIds()(bytes32[])" --rpc-url "$RPC" \
    | tr -d '[] ' | tr ',' '\n' | grep -c '^0x' || true)
  if [ "$AFTER_LEN" -le "$BEFORE_LEN" ]; then
    echo "  ERROR: market count did not grow ($BEFORE_LEN -> $AFTER_LEN)"; continue
  fi

  MID=$(last_id)
  MADDR=$("$CAST" call "$FACTORY" "getMarketAddress(bytes32)(address)" "$MID" --rpc-url "$RPC")
  echo "  marketId:  $MID"
  echo "  market:    $MADDR"

  APP_TX=$("$CAST" send "$USDC" "approve(address,uint256)" "$MADDR" "$LIQ" \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  approveTx: $APP_TX"

  LIQ_TX=$("$CAST" send "$MADDR" "addLiquidity(uint256,uint256)" "$LIQ" 0 \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  liquidity: $LIQ_TX"
done

echo ""
echo "Done."
