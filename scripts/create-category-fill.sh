#!/usr/bin/env bash
# Fill under-populated categories with resolver-friendly markets so every
# category on the home page has >= 3 open markets. Each question mirrors a
# regex the resolver.ts registry knows, or is intentionally manual with a
# clear resolution source.
set -eo pipefail
source "$(dirname "$0")/../.env"

CAST="/c/Users/moaci/.foundry/bin/cast.exe"
RPC="$ARC_RPC_URL"
KEY="$PRIVATE_KEY"
FACTORY="0xF7E0cf21B29B76C912690C65a5D0Bf244dF875A3"
USDC="0xd5413b391B3790CBEF25d9655d82a2ad99cD8b31"
FEE=200
LIQ=500000000  # 500 USDC each — half the batch size to conserve treasury

# Deadlines (unix). Today: 2026-09-15
TD_EOM=1791935940      # 2026-10-29 (end-of-Oct buffer for tournaments)
RD_EOM=1792540740

TD_EOY=1798761540      # 2026-12-31 23:59 UTC
RD_EOY=1799366340      # +7 days

TD_OSCARS=1804204740   # 2027-03-01
RD_OSCARS=1804809540

TD_F1=1793750340       # 2026-10-30 (Mexico City GP window)
RD_F1=1794355140

# question | description | source | td | rd
MARKETS=(
# Sports (+3)
"Will Max Verstappen win the 2026 F1 Drivers Championship?|Formula 1 Drivers World Champion for season 2026.|Wikipedia 2026 Formula One World Championship page|$TD_EOY|$RD_EOY"
"Will Lando Norris win the 2026 F1 Drivers Championship?|Formula 1 Drivers World Champion for season 2026.|Wikipedia 2026 Formula One World Championship page|$TD_EOY|$RD_EOY"
"Will Real Madrid win the 2026-27 UEFA Champions League?|UEFA Champions League 2026-27 final winner.|Wikipedia 2026-27 UEFA Champions League page|$TD_OSCARS|$RD_OSCARS"

# Business (+3, non-ticker questions)
"Will Coinbase acquire another public crypto exchange before 2028?|Any completed acquisition where Coinbase is the buyer of a listed crypto-native exchange, announced before 1 Jan 2028.|Coinbase 8-K filings and press releases|$TD_EOY|$RD_EOY"
"Will Stripe file for IPO before 2028?|Stripe Inc. files an S-1 with the SEC for a public listing before 1 Jan 2028.|SEC EDGAR filings|$TD_EOY|$RD_EOY"
"Will Tesla deliver more than 500k Cybertrucks in 2026?|Cybertruck delivery count in calendar year 2026 exceeds 500,000 units per Tesla earnings.|Tesla 10-K/earnings release for FY2026|$TD_EOM|$RD_EOM"

# Entertainment (+3)
"Will Avatar Fire and Ash gross above 3B worldwide before 2028?|Cumulative worldwide box office for Avatar: Fire and Ash exceeds three billion USD before 1 Jan 2028.|Box Office Mojo cumulative worldwide gross|$TD_EOY|$RD_EOY"
"Will Beyonce win Album of the Year at the 2027 Grammys?|Beyonce wins the Album of the Year award at the 69th Annual Grammy Awards.|The Recording Academy official winners list|$TD_OSCARS|$RD_OSCARS"
"Will Oppenheimer 2 be announced before 2028?|Christopher Nolan or Universal announces a sequel officially titled Oppenheimer 2 before 1 Jan 2028.|Universal Pictures or filmmaker press release|$TD_EOY|$RD_EOY"

# Politics (+2 — already has 4 but shore up)
"Will Milei's approval rating be above 50% on 31 Dec 2026?|Argentina president Javier Milei's approval rating in the Poliarquia poll dated 31 December 2026.|Poliarquia Consultores presidential approval poll|$TD_EOY|$RD_EOY"

# Science (+2, already has 3)
"Will SpaceX Starship reach orbit successfully before 2027?|SpaceX Starship completes a full-orbit test flight with successful re-entry before 1 Jan 2027.|SpaceX official launch announcement + FAA confirmation|$TD_EOY|$RD_EOY"

# Macro reinforcement (already has 3 but tick creates most)
"Will the S&P 500 close above 7500 on 31 Dec 2026?|S&P 500 Index (SPX) closing value on 31 December 2026 above 7500 points.|Yahoo Finance ^GSPC daily close on 31 Dec 2026|$TD_EOY|$RD_EOY"
)

for M in "${MARKETS[@]}"; do
  IFS='|' read -r Q D S TD RD <<< "$M"
  echo ""
  echo "=== $Q"
  TX=$("$CAST" send "$FACTORY" \
    "createMarket(string,string,string,uint256,uint256,uint256)" \
    "$Q" "$D" "$S" "$TD" "$RD" "$FEE" \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  createTx: $TX"
  MID=$("$CAST" call "$FACTORY" "getMarketIds()(bytes32[])" --rpc-url "$RPC" | tr -d '[] ' | tr ',' '\n' | tail -n 1)
  MADDR=$("$CAST" call "$FACTORY" "getMarketAddress(bytes32)(address)" "$MID" --rpc-url "$RPC")
  echo "  market: $MADDR"
  APP=$("$CAST" send "$USDC" "approve(address,uint256)" "$MADDR" "$LIQ" \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  LIQTX=$("$CAST" send "$MADDR" "addLiquidity(uint256,uint256)" "$LIQ" 0 \
    --rpc-url "$RPC" --private-key "$KEY" --json | python -c 'import json,sys; print(json.load(sys.stdin)["transactionHash"])')
  echo "  liq: $LIQTX"
done
echo ""
echo "Done."
