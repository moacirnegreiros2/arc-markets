// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/MockUSDC.sol";
import "../src/MarketFactory.sol";
import "../src/Market.sol";

/// @title AddMarkets2
/// @notice Adds 10 more prediction markets across new categories.
contract AddMarkets2 is Script {
    address constant USDC = 0xd5413b391B3790CBEF25d9655d82a2ad99cD8b31;
    address constant FACTORY = 0xF7E0cf21B29B76C912690C65a5D0Bf244dF875A3;

    uint256 constant LIQUIDITY = 500 * 1e6;
    uint256 constant FEE_BPS = 200;

    struct M {
        string question;
        string description;
        string source;
        uint256 tradingDays;
        uint256 resolveDays;
    }

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        MockUSDC usdc = MockUSDC(USDC);
        MarketFactory factory = MarketFactory(FACTORY);

        vm.startBroadcast(deployerKey);

        M[10] memory markets = [
            // Motorsport
            M({
                question: "Will Max Verstappen win the 2026 F1 Drivers Championship?",
                description: "Max Verstappen winning the FIA Formula 1 World Drivers Championship for the 2026 season",
                source: "FIA official 2026 season standings",
                tradingDays: 200,
                resolveDays: 215
            }),
            // Tennis
            M({
                question: "Will Carlos Alcaraz win Wimbledon 2026 (mens singles)?",
                description: "Carlos Alcaraz winning the 2026 Wimbledon Championships mens singles title",
                source: "Wimbledon official tournament results",
                tradingDays: 65,
                resolveDays: 75
            }),
            // Movies
            M({
                question: "Will the next Avatar movie gross over $2B worldwide?",
                description: "The next theatrical Avatar release reaching cumulative worldwide box office above $2,000,000,000 USD",
                source: "Box Office Mojo / The Numbers worldwide gross",
                tradingDays: 60,
                resolveDays: 180
            }),
            // Awards
            M({
                question: "Will Taylor Swift win Album of the Year at the 2027 Grammys?",
                description: "Taylor Swift winning the Album of the Year category at the 69th Annual Grammy Awards in 2027",
                source: "Recording Academy / GRAMMYs official winners list",
                tradingDays: 280,
                resolveDays: 290
            }),
            // AI benchmarks
            M({
                question: "Will any AI model score above 85% on FrontierMath in 2026?",
                description: "A frontier AI model achieving >85% on the FrontierMath benchmark, verified on the public leaderboard, before Dec 31 2026",
                source: "Epoch AI FrontierMath official leaderboard",
                tradingDays: 240,
                resolveDays: 245
            }),
            // Crypto markets
            M({
                question: "Will Bitcoin dominance be above 55% on Dec 31 2026?",
                description: "Bitcoin market capitalization share of total crypto market cap above 55% on Dec 31 2026 UTC",
                source: "CoinGecko / TradingView BTC dominance",
                tradingDays: 240,
                resolveDays: 245
            }),
            // Business / M&A
            M({
                question: "Will Coinbase be acquired before 2028?",
                description: "Coinbase Global Inc. (COIN) being acquired by another entity before Jan 1 2028",
                source: "SEC filings / press release announcing acquisition",
                tradingDays: 600,
                resolveDays: 610
            }),
            // IPOs
            M({
                question: "Will Stripe go public via IPO before 2027?",
                description: "Stripe Inc. completing an initial public offering on a US stock exchange before Jan 1 2027",
                source: "SEC S-1 filing and successful IPO",
                tradingDays: 240,
                resolveDays: 245
            }),
            // Climate
            M({
                question: "Will 2026 be the hottest year on record per NASA GISS?",
                description: "Year 2026 ranking #1 in NASA GISTEMP global mean surface temperature anomaly historical record",
                source: "NASA GISS Surface Temperature Analysis (GISTEMP v4)",
                tradingDays: 260,
                resolveDays: 290
            }),
            // Politics
            M({
                question: "Will the UK hold a general election before May 2027?",
                description: "United Kingdom holding a general election for the House of Commons before May 1 2027",
                source: "UK Parliament / Electoral Commission official records",
                tradingDays: 360,
                resolveDays: 365
            })
        ];

        usdc.approve(FACTORY, type(uint256).max);

        for (uint256 i = 0; i < markets.length; i++) {
            uint256 td = block.timestamp + markets[i].tradingDays * 1 days;
            uint256 rd = block.timestamp + markets[i].resolveDays * 1 days;

            (, address mAddr) = factory.createMarket(
                markets[i].question, markets[i].description, markets[i].source, td, rd, FEE_BPS
            );
            usdc.approve(mAddr, type(uint256).max);
            Market(mAddr).addLiquidity(LIQUIDITY, 0);

            console.log("Created:", markets[i].question);
            console.log("  addr:", mAddr);
        }

        vm.stopBroadcast();
    }
}
