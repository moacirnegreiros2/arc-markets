// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/MockUSDC.sol";
import "../src/OutcomeToken.sol";
import "../src/Oracle.sol";
import "../src/MarketFactory.sol";
import "../src/Market.sol";

/// @title Deploy
/// @notice Deploys all contracts to Arc Testnet and seeds 3 example markets.
contract Deploy is Script {
    // Initial liquidity per market: 500 USDC per side (1000 USDC total per market)
    uint256 constant INITIAL_LIQUIDITY = 1000 * 1e6;
    uint256 constant FEE_BPS = 200; // 2%

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerKey);

        // 1. MockUSDC (testnet only — in production use Circle's native USDC)
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC:", address(usdc));

        // Mint USDC for deployer to fund markets (1M USDC for testing)
        usdc.mint(deployer, 1_000_000 * 1e6);

        // 2. OutcomeToken (ERC1155)
        OutcomeToken outcomeToken = new OutcomeToken();
        console.log("OutcomeToken:", address(outcomeToken));

        // 3. Oracle (deployer has RESOLVER_ROLE)
        Oracle oracle = new Oracle(deployer);
        console.log("Oracle:", address(oracle));

        // 4. MarketFactory
        MarketFactory factory = new MarketFactory(address(usdc), address(outcomeToken), address(oracle));
        console.log("MarketFactory:", address(factory));

        // Grant factory DEFAULT_ADMIN_ROLE so it can grant MINTER_ROLE to each market
        outcomeToken.grantRole(outcomeToken.DEFAULT_ADMIN_ROLE(), address(factory));

        // 5. Approve factory's market contracts to spend deployer's USDC
        usdc.approve(address(factory), type(uint256).max);

        // 6. Create 3 example markets
        uint256 tradingEnd1 = block.timestamp + 240 days; // ~31 Dec 2026
        uint256 resolveEnd1 = tradingEnd1 + 30 days;

        (bytes32 id1, address m1) = factory.createMarket(
            "Will BTC close above $150k on 31/12/2026?",
            "Bitcoin (BTC) closing price on major spot exchanges (Binance, Coinbase) on 31 December 2026",
            "CoinGecko BTC/USD daily close on 31 Dec 2026",
            tradingEnd1,
            resolveEnd1,
            FEE_BPS
        );
        usdc.approve(m1, type(uint256).max);
        Market(m1).addLiquidity(INITIAL_LIQUIDITY, 0);
        console.log("Market1 (BTC):", m1);
        console.log("Market1 ID:", vm.toString(id1));

        uint256 tradingEnd2 = block.timestamp + 30 days; // ~1 June 2026
        uint256 resolveEnd2 = tradingEnd2 + 14 days;

        (bytes32 id2, address m2) = factory.createMarket(
            "Will Anthropic launch Claude Opus 5 before 01/06/2026?",
            "Claude Opus 5 refers to a new frontier model released by Anthropic under the Opus tier, succeeding Claude Opus 4",
            "Anthropic official blog / press release / X announcement before June 1 2026 UTC",
            tradingEnd2,
            resolveEnd2,
            FEE_BPS
        );
        usdc.approve(m2, type(uint256).max);
        Market(m2).addLiquidity(INITIAL_LIQUIDITY, 0);
        console.log("Market2 (Claude):", m2);
        console.log("Market2 ID:", vm.toString(id2));

        uint256 tradingEnd3 = block.timestamp + 370 days; // ~Copa 2026 semi
        uint256 resolveEnd3 = tradingEnd3 + 30 days;

        (bytes32 id3, address m3) = factory.createMarket(
            "Will Brazil reach the semi-finals of the 2026 World Cup?",
            "Brazil (CBF) reaching the top-4 stage of the FIFA World Cup 2026 held in USA/Canada/Mexico",
            "FIFA official bracket results - official FIFA.com or equivalent",
            tradingEnd3,
            resolveEnd3,
            FEE_BPS
        );
        usdc.approve(m3, type(uint256).max);
        Market(m3).addLiquidity(INITIAL_LIQUIDITY, 0);
        console.log("Market3 (Brazil):", m3);
        console.log("Market3 ID:", vm.toString(id3));

        vm.stopBroadcast();

        // Write deployment JSON (not inside broadcast)
        string memory json = string(
            abi.encodePacked(
                '{"chainId":5042002,',
                '"deployer":"',
                vm.toString(deployer),
                '",',
                '"MockUSDC":"',
                vm.toString(address(usdc)),
                '",',
                '"OutcomeToken":"',
                vm.toString(address(outcomeToken)),
                '",',
                '"Oracle":"',
                vm.toString(address(oracle)),
                '",',
                '"MarketFactory":"',
                vm.toString(address(factory)),
                '",',
                '"markets":[',
                '{"id":"',
                vm.toString(id1),
                '","address":"',
                vm.toString(m1),
                '","question":"Will BTC close above $150k on 31/12/2026?"},',
                '{"id":"',
                vm.toString(id2),
                '","address":"',
                vm.toString(m2),
                '","question":"Will Anthropic launch Claude Opus 5 before 01/06/2026?"},',
                '{"id":"',
                vm.toString(id3),
                '","address":"',
                vm.toString(m3),
                '","question":"Will Brazil reach the semi-finals of the 2026 World Cup?"}',
                "]}"
            )
        );

        vm.writeFile("deployments/arc-testnet.json", json);
        console.log("Deployment written to deployments/arc-testnet.json");
    }
}
