#!/usr/bin/env bash
# Fill categories that stayed under 3 markets in the default 300-recent
# window. These stay in that window because they're the most recently
# created; older ones are still there via ?limit=all.
set -eo pipefail
source "$(dirname "$0")/../.env"
CAST="/c/Users/moaci/.foundry/bin/cast.exe"
RPC="$ARC_RPC_URL"; KEY="$PRIVATE_KEY"
FACTORY="0xF7E0cf21B29B76C912690C65a5D0Bf244dF875A3"
USDC="0xd5413b391B3790CBEF25d9655d82a2ad99cD8b31"
FEE=200; LIQ=500000000

TD_EOY=1798761540; RD_EOY=1799366340
TD_MAR=1804204740; RD_MAR=1804809540  # 2027-03-01
TD_JUN=1812153540; RD_JUN=1812758340  # 2027-06-01

MARKETS=(
# Tech & AI (+3)
"Will Anthropic release Claude Opus 5 before 2028?|A model officially branded Claude Opus 5 released by Anthropic before 1 Jan 2028.|Anthropic official blog / press release|$TD_EOY|$RD_EOY"
"Will Waymo launch robotaxi service in 5 more US cities before 2028?|Waymo (Alphabet) launches paid driverless robotaxi service in 5 additional US metropolitan areas beyond the current footprint before 1 Jan 2028.|Waymo official launch announcements|$TD_EOY|$RD_EOY"
"Will Apple release Vision Pro 2 before 2028?|Apple releases a second-generation Vision Pro (any model successor) before 1 Jan 2028.|Apple newsroom press release|$TD_EOY|$RD_EOY"

# Politics (+2)
"Will Lula run for re-election in the 2026 Brazil general election?|Luiz Inacio Lula da Silva files as candidate for president in the 2026 Brazilian general election.|TSE (Tribunal Superior Eleitoral) official candidacies|$TD_EOY|$RD_EOY"
"Will J.D. Vance's approval rating exceed 45% on 1 Mar 2027?|Vice President J.D. Vance approval rating in the Gallup or FiveThirtyEight rolling average exceeds 45% on 1 March 2027.|Gallup / FiveThirtyEight approval poll|$TD_MAR|$RD_MAR"

# Entertainment (+2)
"Will Oppenheimer 2 win Best Picture at the 2027 Oscars?|Only relevant if released; otherwise resolves NO by end of the 99th Academy Awards ceremony.|Academy of Motion Picture Arts and Sciences official winners|$TD_MAR|$RD_MAR"
"Will Drake and Kendrick Lamar release a collab track before 2028?|Officially released collaboration track credited to both Drake and Kendrick Lamar on major streaming platforms before 1 Jan 2028.|Spotify / Apple Music release metadata|$TD_EOY|$RD_EOY"

# Science (+2)
"Will NASA confirm 2026 as the hottest year on record by June 2027?|NASA GISTEMP publishes 2026 as rank #1 in the annual anomaly ranking before 30 June 2027.|NASA GISTEMP official ranking|$TD_JUN|$RD_JUN"
"Will a fusion company announce net energy gain on a commercial scale before 2028?|Any private or public fusion venture publicly announces sustained commercial-scale net energy gain from a fusion reactor before 1 Jan 2028.|Company press releases + peer-reviewed corroboration|$TD_EOY|$RD_EOY"

# Macro (+1)
"Will the Fed cut rates by at least 100bps cumulatively in 2026?|Sum of FOMC rate cuts announced during calendar year 2026 reaches or exceeds 100 basis points.|Federal Reserve FOMC statements|$TD_EOY|$RD_EOY"
)

for M in "${MARKETS[@]}"; do
  IFS='|' read -r Q D S TD RD <<< "$M"
  echo "=== $Q"
  TX=$("$CAST" send "$FACTORY" \
    "createMarket(string,string,string,uint256,uint256,uint256)" \
    "$Q" "$D" "$S" "$TD" "$RD" "$FEE" \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  createTx: $TX"
  MID=$("$CAST" call "$FACTORY" "getMarketIds()(bytes32[])" --rpc-url "$RPC" | tr -d '[] ' | tr ',' '\n' | tail -n 1)
  MADDR=$("$CAST" call "$FACTORY" "getMarketAddress(bytes32)(address)" "$MID" --rpc-url "$RPC")
  echo "  market: $MADDR"
  "$CAST" send "$USDC" "approve(address,uint256)" "$MADDR" "$LIQ" \
    --rpc-url "$RPC" --private-key "$KEY" --json >/dev/null
  "$CAST" send "$MADDR" "addLiquidity(uint256,uint256)" "$LIQ" 0 \
    --rpc-url "$RPC" --private-key "$KEY" --json >/dev/null
done
echo "Done."
