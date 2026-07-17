// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/MockUSDC.sol";
import "../src/MarketFactory.sol";
import "../src/Market.sol";

contract AddMarkets3 is Script {
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
            // Winter Olympics
            M({
                question: "Will Norway top the medal table at Milano-Cortina 2026?",
                description: "Norway finishing #1 in total medals at the 2026 Winter Olympics in Milano-Cortina",
                source: "IOC official medal table for Milano-Cortina 2026",
                tradingDays: 30,
                resolveDays: 35
            }),
            // US Politics 2028
            M({
                question: "Will JD Vance be the Republican nominee for US president in 2028?",
                description: "JD Vance being formally nominated as the Republican candidate for the 2028 US presidential election",
                source: "Republican National Convention 2028 nomination roll call",
                tradingDays: 850,
                resolveDays: 870
            }),
            // Brazil politics
            M({
                question: "Will Lula's approval rating be above 40% on Dec 31 2026?",
                description: "Lula's presidential approval rating above 40% in the last Datafolha or Quaest poll of December 2026",
                source: "Datafolha or Quaest December 2026 presidential approval poll",
                tradingDays: 240,
                resolveDays: 250
            }),
            // L2 / Crypto
            M({
                question: "Will Base reach $20B TVL before 2027?",
                description: "Base (Coinbase L2) total value locked exceeding $20,000,000,000 USD at any point before Jan 1 2027",
                source: "DeFiLlama Base chain TVL",
                tradingDays: 240,
                resolveDays: 245
            }),
            // Streaming
            M({
                question: "Will Netflix exceed 350M subscribers by end of 2026?",
                description: "Netflix global paid memberships reported in Q4 2026 earnings exceeding 350 million",
                source: "Netflix Q4 2026 shareholder letter",
                tradingDays: 280,
                resolveDays: 300
            }),
            // Box office
            M({
                question: "Will any 2026 film gross over $1.5B worldwide?",
                description: "At least one 2026 theatrical release reaching $1,500,000,000 or more in worldwide box office",
                source: "Box Office Mojo / The Numbers worldwide gross for any 2026 release",
                tradingDays: 240,
                resolveDays: 365
            }),
            // Tech product
            M({
                question: "Will Apple announce a Vision Pro 2 in 2026?",
                description: "Apple Inc. publicly announcing a successor product named Vision Pro 2 (or Vision Pro M5/equivalent next-gen) before Jan 1 2027",
                source: "Apple Newsroom official announcement",
                tradingDays: 240,
                resolveDays: 245
            }),
            // Memecoin
            M({
                question: "Will any memecoin reach a $50B market cap before 2027?",
                description: "Any meme-category cryptocurrency reaching fully-diluted or circulating market cap above $50,000,000,000 USD before Jan 1 2027",
                source: "CoinGecko / CoinMarketCap meme category",
                tradingDays: 240,
                resolveDays: 245
            }),
            // Pharma / health
            M({
                question: "Will the FDA approve a new GLP-1 drug indication in 2026?",
                description: "FDA approving a new indication for any GLP-1 receptor agonist (semaglutide, tirzepatide, etc.) during calendar year 2026",
                source: "FDA Drug Approvals database",
                tradingDays: 240,
                resolveDays: 245
            }),
            // Brazil markets
            M({
                question: "Will the Ibovespa close above 150,000 points on Dec 31 2026?",
                description: "B3 Ibovespa index closing above 150,000 points on the last trading day of 2026",
                source: "B3 official Ibovespa close on Dec 30 2026",
                tradingDays: 240,
                resolveDays: 245
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
