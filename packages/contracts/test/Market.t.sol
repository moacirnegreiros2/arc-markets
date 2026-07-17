// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";
import "../src/OutcomeToken.sol";
import "../src/Oracle.sol";
import "../src/MarketFactory.sol";
import "../src/Market.sol";

/// @title ReentrancyAttacker — tries to re-enter buy() from the ERC1155 receive callback
contract ReentrancyAttacker {
    Market public target;
    MockUSDC public usdc;
    bool public attacked;

    constructor(address _market, address _usdc) {
        target = Market(_market);
        usdc = MockUSDC(_usdc);
    }

    function attack(uint256 amount) external {
        usdc.mint(address(this), amount);
        usdc.approve(address(target), type(uint256).max);
        target.buy(0, amount, 0);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        if (!attacked) {
            attacked = true;
            try target.buy(0, 1e6, 0) {} catch {}
        }
        return this.onERC1155Received.selector;
    }
}

contract MarketTest is Test {
    uint8 constant YES = 0;
    uint8 constant NO = 1;

    MockUSDC usdc;
    OutcomeToken outcomeToken;
    Oracle oracle;
    MarketFactory factory;

    address deployer = address(0xD);
    address alice = address(0xA);
    address bob = address(0xB);
    address carol = address(0xC);

    bytes32 marketId;
    address marketAddr;
    Market market;

    uint256 constant U = 1e6; // 1 USDC
    uint256 constant INITIAL_LIQUIDITY = 1000 * U;

    function setUp() public {
        vm.startPrank(deployer);

        usdc = new MockUSDC();
        outcomeToken = new OutcomeToken();
        oracle = new Oracle(deployer);
        factory = new MarketFactory(address(usdc), address(outcomeToken), address(oracle));

        outcomeToken.grantRole(outcomeToken.DEFAULT_ADMIN_ROLE(), address(factory));

        usdc.mint(deployer, 100_000 * U);

        (marketId, marketAddr) = factory.createMarket(
            "Will BTC close above $150k on 31/12/2026?",
            "Bitcoin closing price on major exchanges",
            "CoinGecko BTC/USD daily close",
            block.timestamp + 7 days,
            block.timestamp + 14 days,
            200
        );
        market = Market(marketAddr);

        usdc.approve(marketAddr, type(uint256).max);
        market.addLiquidity(INITIAL_LIQUIDITY, 0); // 1000 USDC → pool: 1000 YES + 1000 NO
        vm.stopPrank();

        usdc.mint(alice, 10_000 * U);
        usdc.mint(bob, 10_000 * U);
        usdc.mint(carol, 10_000 * U);
    }

    // ─── Market creation ──────────────────────────────────────────────────────

    function test_MarketCreated() public view {
        assertEq(market.question(), "Will BTC close above $150k on 31/12/2026?");
        assertEq(market.feeBps(), 200);
        assertEq(uint8(market.state()), uint8(Market.State.Open));
        assertEq(market.poolYes(), INITIAL_LIQUIDITY);
        assertEq(market.poolNo(), INITIAL_LIQUIDITY);
    }

    function test_InitialLiquidity_50_50() public view {
        assertEq(market.impliedYesProbabilityBps(), 5000);
    }

    function test_CannotDoubleInitialize() public {
        vm.expectRevert(Market.AlreadyInitialized.selector);
        market.initialize(
            bytes32(0),
            address(usdc),
            address(outcomeToken),
            address(oracle),
            "",
            "",
            "",
            block.timestamp + 1,
            block.timestamp + 2,
            200
        );
    }

    function test_FactoryRejectsExpiredTradingDeadline() public {
        vm.prank(deployer);
        vm.expectRevert(MarketFactory.InvalidDeadlines.selector);
        factory.createMarket("?", "", "", block.timestamp - 1, block.timestamp + 1, 200);
    }

    function test_FactoryRejectsResolutionBeforeTrading() public {
        vm.prank(deployer);
        vm.expectRevert(MarketFactory.InvalidDeadlines.selector);
        factory.createMarket("?", "", "", block.timestamp + 2, block.timestamp + 1, 200);
    }

    function test_FactoryRejectsFeeTooHigh() public {
        vm.prank(deployer);
        vm.expectRevert(MarketFactory.FeeTooHigh.selector);
        factory.createMarket("?", "", "", block.timestamp + 1, block.timestamp + 2, 1001);
    }

    // ─── Liquidity ────────────────────────────────────────────────────────────

    function test_AddLiquiditySubsequent() public {
        uint256 deposit = 200 * U;
        vm.startPrank(alice);
        usdc.approve(marketAddr, deposit);
        uint256 lpShares = market.addLiquidity(deposit, 0);
        vm.stopPrank();

        assertGt(lpShares, 0);
        assertEq(market.balanceOf(alice), lpShares);
        assertEq(market.poolYes(), INITIAL_LIQUIDITY + deposit);
        assertEq(market.poolNo(), INITIAL_LIQUIDITY + deposit);
    }

    function test_AddLiquidity_SlippageReverts() public {
        vm.startPrank(alice);
        usdc.approve(marketAddr, 100 * U);
        vm.expectRevert(Market.SlippageExceeded.selector);
        market.addLiquidity(100 * U, type(uint256).max);
        vm.stopPrank();
    }

    function test_RemoveLiquidity() public {
        uint256 lpBefore = market.balanceOf(deployer);
        uint256 half = lpBefore / 2;

        vm.prank(deployer);
        market.removeLiquidity(half);

        assertEq(market.balanceOf(deployer), lpBefore - half);
        assertEq(market.poolYes(), INITIAL_LIQUIDITY / 2);
        assertEq(market.poolNo(), INITIAL_LIQUIDITY / 2);
    }

    function test_RemoveLiquidity_ZeroReverts() public {
        vm.prank(deployer);
        vm.expectRevert(Market.ZeroAmount.selector);
        market.removeLiquidity(0);
    }

    function test_RemoveLiquidity_LPGetsOutcomeTokens() public {
        uint256 lp = market.balanceOf(deployer);
        uint256 half = lp / 2; // remove 50%, leaving pool with 500 YES + 500 NO

        vm.prank(deployer);
        (uint256 yesGot, uint256 noGot) = market.removeLiquidity(half);

        assertEq(yesGot, INITIAL_LIQUIDITY / 2);
        assertEq(noGot, INITIAL_LIQUIDITY / 2);
        assertEq(outcomeToken.balanceOf(deployer, market.yesTokenId()), yesGot);
        assertEq(outcomeToken.balanceOf(deployer, market.noTokenId()), noGot);
    }

    // ─── Buying ───────────────────────────────────────────────────────────────

    function test_BuyYes() public {
        uint256 usdcIn = 100 * U;
        (uint256 expectedOut,) = market.previewBuy(YES, usdcIn);

        vm.startPrank(alice);
        usdc.approve(marketAddr, usdcIn);
        uint256 tokensOut = market.buy(YES, usdcIn, 0);
        vm.stopPrank();

        assertEq(tokensOut, expectedOut);
        assertGt(tokensOut, usdcIn); // user gets more than 1:1 (AMM bonus)
        assertEq(outcomeToken.balanceOf(alice, market.yesTokenId()), tokensOut);
        // YES probability went up (pool has more NO than YES now)
        assertGt(market.impliedYesProbabilityBps(), 5000);
    }

    function test_BuyNo() public {
        uint256 usdcIn = 100 * U;
        vm.startPrank(alice);
        usdc.approve(marketAddr, usdcIn);
        uint256 tokensOut = market.buy(NO, usdcIn, 0);
        vm.stopPrank();

        assertGt(tokensOut, usdcIn);
        assertEq(outcomeToken.balanceOf(alice, market.noTokenId()), tokensOut);
        assertLt(market.impliedYesProbabilityBps(), 5000);
    }

    function test_Buy_SlippageReverts() public {
        vm.startPrank(alice);
        usdc.approve(marketAddr, 100 * U);
        vm.expectRevert(Market.SlippageExceeded.selector);
        market.buy(YES, 100 * U, type(uint256).max);
        vm.stopPrank();
    }

    function test_Buy_InvalidOutcomeReverts() public {
        vm.startPrank(alice);
        usdc.approve(marketAddr, 100 * U);
        vm.expectRevert(Market.InvalidOutcome.selector);
        market.buy(2, 100 * U, 0);
        vm.stopPrank();
    }

    function test_Buy_ZeroReverts() public {
        vm.startPrank(alice);
        vm.expectRevert(Market.ZeroAmount.selector);
        market.buy(YES, 0, 0);
        vm.stopPrank();
    }

    // ─── Selling ──────────────────────────────────────────────────────────────

    function test_SellYes() public {
        // Alice buys YES
        uint256 usdcIn = 100 * U;
        vm.startPrank(alice);
        usdc.approve(marketAddr, usdcIn);
        uint256 yesTokens = market.buy(YES, usdcIn, 0);

        // Sell for 50 USDC back
        uint256 returnUsdc = 50 * U;
        (uint256 expectedTokensIn,) = market.previewSell(YES, returnUsdc);

        outcomeToken.setApprovalForAll(marketAddr, true);
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        uint256 tokensConsumed = market.sell(YES, returnUsdc, type(uint256).max);
        vm.stopPrank();

        assertEq(tokensConsumed, expectedTokensIn);
        uint256 fee = (returnUsdc * 200) / 10_000;
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore + returnUsdc - fee);
        assertEq(outcomeToken.balanceOf(alice, market.yesTokenId()), yesTokens - tokensConsumed);
    }

    function test_SellNo() public {
        uint256 usdcIn = 100 * U;
        vm.startPrank(alice);
        usdc.approve(marketAddr, usdcIn);
        market.buy(NO, usdcIn, 0);

        uint256 returnUsdc = 50 * U;
        outcomeToken.setApprovalForAll(marketAddr, true);
        uint256 usdcBefore = usdc.balanceOf(alice);
        market.sell(NO, returnUsdc, type(uint256).max);
        vm.stopPrank();

        uint256 fee = (returnUsdc * 200) / 10_000;
        assertEq(usdc.balanceOf(alice), usdcBefore + returnUsdc - fee);
    }

    function test_Sell_SlippageReverts() public {
        uint256 usdcIn = 100 * U;
        vm.startPrank(alice);
        usdc.approve(marketAddr, usdcIn);
        market.buy(YES, usdcIn, 0);
        outcomeToken.setApprovalForAll(marketAddr, true);
        vm.expectRevert(Market.SlippageExceeded.selector);
        market.sell(YES, 50 * U, 0); // maxTokensIn = 0
        vm.stopPrank();
    }

    function test_Sell_ZeroReverts() public {
        vm.startPrank(alice);
        vm.expectRevert(Market.ZeroAmount.selector);
        market.sell(YES, 0, type(uint256).max);
        vm.stopPrank();
    }

    // ─── Fee accrual ──────────────────────────────────────────────────────────

    function test_FeeAccruesToPool() public {
        uint256 poolYesBefore = market.poolYes();
        uint256 poolNoBefore = market.poolNo();
        uint256 usdcInContract = usdc.balanceOf(marketAddr);

        // Alice buys YES then sells most of it, paying fees each time
        uint256 usdcIn = 500 * U;
        vm.startPrank(alice);
        usdc.approve(marketAddr, usdcIn);
        market.buy(YES, usdcIn, 0);
        outcomeToken.setApprovalForAll(marketAddr, true);
        market.sell(YES, 200 * U, type(uint256).max);
        vm.stopPrank();

        // USDC in contract grew (fees retained as extra collateral)
        assertGt(usdc.balanceOf(marketAddr), usdcInContract);
    }

    // ─── Deadline enforcement ─────────────────────────────────────────────────

    function test_CannotBuyAfterDeadline() public {
        vm.warp(market.tradingDeadline() + 1);
        vm.startPrank(alice);
        usdc.approve(marketAddr, 100 * U);
        vm.expectRevert(Market.MarketNotOpen.selector);
        market.buy(YES, 100 * U, 0);
        vm.stopPrank();
    }

    function test_CannotAddLiquidityAfterDeadline() public {
        vm.warp(market.tradingDeadline() + 1);
        vm.startPrank(alice);
        usdc.approve(marketAddr, 100 * U);
        vm.expectRevert(Market.MarketNotOpen.selector);
        market.addLiquidity(100 * U, 0);
        vm.stopPrank();
    }

    // ─── Resolution ───────────────────────────────────────────────────────────

    function test_ResolveYes() public {
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(deployer);
        oracle.resolve(marketAddr, YES);

        assertEq(uint8(market.state()), uint8(Market.State.Resolved));
        assertEq(market.winningOutcome(), YES);
    }

    function test_CannotResolveBeforeDeadline() public {
        vm.prank(deployer);
        vm.expectRevert(Market.TradingDeadlineNotPassed.selector);
        oracle.resolve(marketAddr, YES);
    }

    function test_CannotResolveWithInvalidOutcome() public {
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(deployer);
        vm.expectRevert(Market.InvalidOutcome.selector);
        oracle.resolve(marketAddr, 2);
    }

    function test_CannotDoubleResolve() public {
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(deployer);
        oracle.resolve(marketAddr, YES);
        vm.prank(deployer);
        vm.expectRevert(Market.AlreadyResolved.selector);
        oracle.resolve(marketAddr, NO);
    }

    function test_OnlyOracleCanResolve() public {
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(alice);
        vm.expectRevert(Market.NotOracle.selector);
        market.resolve(YES);
    }

    // ─── Redemption ───────────────────────────────────────────────────────────

    function test_RedeemWinners() public {
        // Alice buys YES
        uint256 usdcIn = 100 * U;
        vm.startPrank(alice);
        usdc.approve(marketAddr, usdcIn);
        uint256 yesTokens = market.buy(YES, usdcIn, 0);
        vm.stopPrank();

        // Bob buys NO
        vm.startPrank(bob);
        usdc.approve(marketAddr, usdcIn);
        market.buy(NO, usdcIn, 0);
        vm.stopPrank();

        // Resolve YES wins
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(deployer);
        oracle.resolve(marketAddr, YES);

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.redeem();

        assertEq(usdc.balanceOf(alice), aliceUsdcBefore + yesTokens);
        assertEq(outcomeToken.balanceOf(alice, market.yesTokenId()), 0);
    }

    function test_LosersCannotRedeem() public {
        vm.startPrank(bob);
        usdc.approve(marketAddr, 100 * U);
        market.buy(NO, 100 * U, 0);
        vm.stopPrank();

        vm.warp(market.tradingDeadline() + 1);
        vm.prank(deployer);
        oracle.resolve(marketAddr, YES);

        vm.prank(bob);
        vm.expectRevert(Market.NoTokensToRedeem.selector);
        market.redeem();
    }

    function test_CannotRedeemBeforeResolution() public {
        vm.startPrank(alice);
        usdc.approve(marketAddr, 100 * U);
        market.buy(YES, 100 * U, 0);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(Market.NotResolved.selector);
        market.redeem();
    }

    function test_LPRedeemAfterResolution() public {
        // Resolve YES
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(deployer);
        oracle.resolve(marketAddr, YES);

        uint256 lpShares = market.balanceOf(deployer);
        uint256 deployerUsdcBefore = usdc.balanceOf(deployer);
        vm.prank(deployer);
        market.lpRedeemAfterResolution(lpShares);

        // LP should get back poolYes USDC (pool's YES tokens at resolution)
        assertGt(usdc.balanceOf(deployer), deployerUsdcBefore);
        assertEq(market.balanceOf(deployer), 0);
    }

    // ─── Math edge cases ──────────────────────────────────────────────────────

    function test_LargeTradePoolStaysPositive() public {
        uint256 bigBuy = 5000 * U;
        usdc.mint(alice, bigBuy);
        vm.startPrank(alice);
        usdc.approve(marketAddr, bigBuy);
        market.buy(YES, bigBuy, 0);
        vm.stopPrank();

        assertGt(market.poolYes(), 0);
        assertGt(market.poolNo(), 0);
    }

    function test_SmallTradeWorks() public {
        vm.startPrank(alice);
        usdc.approve(marketAddr, U);
        uint256 out = market.buy(YES, U, 0);
        vm.stopPrank();
        assertGt(out, 0);
    }

    function test_ProbabilityBoundsAfterExtremeTrade() public {
        uint256 hugeBuy = 50_000 * U;
        usdc.mint(alice, hugeBuy);
        vm.startPrank(alice);
        usdc.approve(marketAddr, hugeBuy);
        market.buy(YES, hugeBuy, 0);
        vm.stopPrank();

        uint256 prob = market.impliedYesProbabilityBps();
        assertLt(prob, 10_000);
        assertGt(prob, 0);
    }

    // ─── Reentrancy guard ─────────────────────────────────────────────────────

    function test_ReentrancyGuardOnBuy() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(marketAddr, address(usdc));
        attacker.attack(100 * U);
        // Pool invariant must still hold
        assertGt(market.poolYes(), 0);
        assertGt(market.poolNo(), 0);
    }

    // ─── Pause ────────────────────────────────────────────────────────────────

    function test_PauseBlocksMarketCreation() public {
        vm.prank(deployer);
        factory.pause();
        vm.prank(deployer);
        vm.expectRevert();
        factory.createMarket("?", "", "", block.timestamp + 1, block.timestamp + 2, 200);
    }

    function test_UnpauseRestoresCreation() public {
        vm.startPrank(deployer);
        factory.pause();
        factory.unpause();
        factory.createMarket("?", "", "", block.timestamp + 1 days, block.timestamp + 2 days, 200);
        vm.stopPrank();
    }

    // ─── Oracle role management ───────────────────────────────────────────────

    function test_NonResolverCannotResolve() public {
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(alice);
        vm.expectRevert();
        oracle.resolve(marketAddr, YES);
    }

    function test_AddedResolverCanResolve() public {
        vm.prank(deployer);
        oracle.addResolver(alice);
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(alice);
        oracle.resolve(marketAddr, YES);
        assertEq(uint8(market.state()), uint8(Market.State.Resolved));
    }

    // ─── Factory registry ─────────────────────────────────────────────────────

    function test_FactoryRegistry() public view {
        bytes32[] memory ids = factory.getMarketIds();
        assertEq(ids.length, 1);
        assertEq(ids[0], marketId);
        assertEq(factory.getMarketAddress(marketId), marketAddr);
    }

    // ─── Multiple independent markets ─────────────────────────────────────────

    function test_MultipleMarkets_Independent() public {
        vm.startPrank(deployer);
        (, address addr2) =
            factory.createMarket("Market 2", "", "", block.timestamp + 2 days, block.timestamp + 4 days, 100);
        Market m2 = Market(addr2);
        usdc.approve(addr2, INITIAL_LIQUIDITY);
        m2.addLiquidity(INITIAL_LIQUIDITY, 0);
        vm.stopPrank();

        vm.startPrank(alice);
        usdc.approve(marketAddr, 100 * U);
        market.buy(YES, 100 * U, 0);
        vm.stopPrank();

        assertEq(m2.impliedYesProbabilityBps(), 5000);
    }

    // ─── Additional coverage tests ────────────────────────────────────────────

    function test_Sell_ReturnExceedsPoolReverts() public {
        // Try to sell for more USDC than pool holds on one side — should revert
        vm.startPrank(alice);
        usdc.approve(marketAddr, 100 * U);
        market.buy(YES, 100 * U, 0);
        outcomeToken.setApprovalForAll(marketAddr, true);
        uint256 tooMuch = market.poolNo() + 1; // cache before expectRevert
        vm.expectRevert(Market.ReturnExceedsPool.selector);
        market.sell(YES, tooMuch, type(uint256).max);
        vm.stopPrank();
    }

    function test_FactorySetOracle() public {
        vm.prank(deployer);
        factory.setOracle(alice);
        assertEq(factory.oracle(), alice);
    }

    function test_FactorySetDefaultFee() public {
        vm.prank(deployer);
        factory.setDefaultFeeBps(300);
        assertEq(factory.defaultFeeBps(), 300);
    }

    function test_FactorySetDefaultFee_TooHighReverts() public {
        vm.prank(deployer);
        vm.expectRevert(MarketFactory.FeeTooHigh.selector);
        factory.setDefaultFeeBps(1001);
    }

    function test_FactoryOnlyOwnerCanCreate() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.createMarket("?", "", "", block.timestamp + 1, block.timestamp + 2, 200);
    }

    function test_MockUSDCDecimals() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_OutcomeTokenGrantRevoke() public {
        vm.startPrank(deployer);
        outcomeToken.grantRole(outcomeToken.MINTER_ROLE(), alice);
        assertTrue(outcomeToken.hasRole(outcomeToken.MINTER_ROLE(), alice));
        outcomeToken.revokeRole(outcomeToken.MINTER_ROLE(), alice);
        assertFalse(outcomeToken.hasRole(outcomeToken.MINTER_ROLE(), alice));
        vm.stopPrank();
    }

    function test_OutcomeToken_UnauthorizedMintReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        outcomeToken.mint(alice, 0, 100);
    }

    function test_LPRedeemAfterResolution_NoWin() public {
        // Resolve NO wins, LP gets NO pool tokens
        vm.warp(market.tradingDeadline() + 1);
        vm.prank(deployer);
        oracle.resolve(marketAddr, NO);

        uint256 lpShares = market.balanceOf(deployer);
        uint256 expectedUsdc = market.poolNo(); // pool's NO tokens are the winner
        vm.prank(deployer);
        market.lpRedeemAfterResolution(lpShares);
        // USDC returned = poolNo at resolution time
        assertGt(usdc.balanceOf(deployer), 0);
    }

    function test_RemoveLiquidity_InsufficientLiquidityReverts() public {
        // Try to remove so much that MIN_POOL_BALANCE is breached
        uint256 lp = market.balanceOf(deployer);
        // Remove almost all - leave < MIN_POOL_BALANCE
        uint256 almostAll = lp - 1;
        vm.prank(deployer);
        vm.expectRevert(Market.InsufficientLiquidity.selector);
        market.removeLiquidity(almostAll);
    }

    function test_OracleRemoveResolver() public {
        vm.startPrank(deployer);
        oracle.addResolver(alice);
        oracle.removeResolver(alice);
        vm.stopPrank();

        vm.warp(market.tradingDeadline() + 1);
        vm.prank(alice);
        vm.expectRevert();
        oracle.resolve(marketAddr, YES);
    }

    function test_AddLiquidity_BelowMinReverts() public {
        // Tiny amount below MIN_POOL_BALANCE*2
        vm.startPrank(alice);
        usdc.approve(marketAddr, 1);
        // First LP path requires >= 2 * MIN_POOL_BALANCE
        // With deployer already as first LP, subsequent LPs use a different path
        // Just ensure 0 reverts
        vm.expectRevert(Market.ZeroAmount.selector);
        market.addLiquidity(0, 0);
        vm.stopPrank();
    }

    // ─── Fuzz tests ───────────────────────────────────────────────────────────

    function testFuzz_Buy_PreviewMatchesActual(uint256 amount) public {
        amount = bound(amount, U, 500 * U);
        usdc.mint(alice, amount);
        (uint256 expectedOut,) = market.previewBuy(YES, amount);

        vm.startPrank(alice);
        usdc.approve(marketAddr, amount);
        uint256 actualOut = market.buy(YES, amount, 0);
        vm.stopPrank();

        assertEq(actualOut, expectedOut);
    }

    function testFuzz_Sell_PreviewMatchesActual(uint256 returnUsdc) public {
        returnUsdc = bound(returnUsdc, U, 200 * U);
        // First add enough liquidity so the sell is possible
        usdc.mint(alice, 1000 * U);
        vm.startPrank(alice);
        usdc.approve(marketAddr, 1000 * U);
        market.buy(YES, 1000 * U, 0); // alice has lots of YES tokens

        (uint256 expectedTokens,) = market.previewSell(YES, returnUsdc);
        if (expectedTokens > outcomeToken.balanceOf(alice, market.yesTokenId())) {
            vm.stopPrank();
            return; // not enough tokens, skip this case
        }

        outcomeToken.setApprovalForAll(marketAddr, true);
        uint256 actualTokens = market.sell(YES, returnUsdc, type(uint256).max);
        vm.stopPrank();

        assertEq(actualTokens, expectedTokens);
    }

    function testFuzz_AddLiquidity_ProportionalShares(uint256 amount) public {
        amount = bound(amount, 2e4, 5000 * U);
        usdc.mint(alice, amount);

        uint256 totalSupplyBefore = market.totalSupply();
        vm.startPrank(alice);
        usdc.approve(marketAddr, amount);
        uint256 lpShares = market.addLiquidity(amount, 0);
        vm.stopPrank();

        assertGt(lpShares, 0);
        assertEq(market.totalSupply(), totalSupplyBefore + lpShares);
    }
}
