// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/MockUSDC.sol";
import "../src/MarketFactory.sol";
import "../src/Market.sol";

/// @title AddMarkets
/// @notice Adds 10 new prediction markets across categories (sports, crypto, tech, politics, macro).
contract AddMarkets is Script {
    address constant USDC = 0xd5413b391B3790CBEF25d9655d82a2ad99cD8b31;
    address constant FACTORY = 0xF7E0cf21B29B76C912690C65a5D0Bf244dF875A3;

    uint256 constant LIQUIDITY = 500 * 1e6; // 500 USDC per market
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
        address deployer = vm.addr(deployerKey);
        MockUSDC usdc = MockUSDC(USDC);
        MarketFactory factory = MarketFactory(FACTORY);

        vm.startBroadcast(deployerKey);

        // Mint extra USDC if needed
        usdc.mint(deployer, 100_000 * 1e6);

        M[10] memory markets = [
            // Sports
            M({
                question: "Will Argentina win the 2026 FIFA World Cup?",
                description: "Argentina national football team winning the FIFA World Cup 2026 final",
                source: "FIFA official tournament results",
                tradingDays: 70,
                resolveDays: 80
            }),
            M({
                question: "Will the Lakers win the 2025-26 NBA Finals?",
                description: "Los Angeles Lakers winning the NBA Finals for the 2025-26 season",
                source: "NBA.com official championship result",
                tradingDays: 50,
                resolveDays: 60
            }),
            M({
                question: "Will Real Madrid win the 2025-26 UEFA Champions League?",
                description: "Real Madrid CF winning the 2025-26 UCL final",
                source: "UEFA.com official tournament result",
                tradingDays: 35,
                resolveDays: 45
            }),
            // Crypto
            M({
                question: "Will ETH close above $5,000 on Dec 31 2026?",
                description: "Ethereum (ETH) closing price on Dec 31 2026 UTC across major spot exchanges",
                source: "CoinGecko ETH/USD daily close on Dec 31 2026",
                tradingDays: 240,
                resolveDays: 245
            }),
            M({
                question: "Will SOL surpass $300 before Jan 1 2027?",
                description: "Solana (SOL) reaching a USD spot price above 300 at any point before Jan 1 2027",
                source: "CoinGecko SOL/USD spot price (any 1h close above 300 counts)",
                tradingDays: 240,
                resolveDays: 245
            }),
            // Tech / AI
            M({
                question: "Will OpenAI release a model named GPT-5 before Dec 2026?",
                description: "Public release (API or product) of an OpenAI model officially named GPT-5",
                source: "OpenAI official blog or system card",
                tradingDays: 215,
                resolveDays: 220
            }),
            M({
                question: "Will Tesla deliver more than 2M vehicles in 2026?",
                description: "Tesla Inc. global deliveries reported in their Q4 2026 earnings exceeding 2,000,000 units",
                source: "Tesla Q4 2026 earnings release",
                tradingDays: 270,
                resolveDays: 300
            }),
            // Politics / Macro
            M({
                question: "Will the Fed cut rates at the next FOMC meeting?",
                description: "US Federal Reserve cutting the federal funds rate at the next scheduled FOMC meeting",
                source: "FOMC official statement",
                tradingDays: 25,
                resolveDays: 30
            }),
            M({
                question: "Will US CPI YoY be below 3% for Q4 2026?",
                description: "US Consumer Price Index year-over-year inflation for Dec 2026 reading below 3.0%",
                source: "BLS CPI release for December 2026",
                tradingDays: 250,
                resolveDays: 270
            }),
            // Pop culture / world
            M({
                question: "Will SpaceX land humans on the Moon before 2027?",
                description: "SpaceX (or via NASA Artemis using Starship HLS) successfully landing astronauts on the lunar surface before Jan 1 2027",
                source: "NASA / SpaceX official mission confirmation",
                tradingDays: 240,
                resolveDays: 245
            })
        ];

        usdc.approve(FACTORY, type(uint256).max);

        for (uint256 i = 0; i < markets.length; i++) {
            uint256 td = block.timestamp + markets[i].tradingDays * 1 days;
            uint256 rd = block.timestamp + markets[i].resolveDays * 1 days;

            (bytes32 mid, address mAddr) = factory.createMarket(
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
