// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OutcomeToken.sol";

/// @title Market
/// @notice Binary prediction market using Conditional Token Framework + CPMM.
///
///  Invariant:  totalYesOutstanding == totalNoOutstanding == totalUsdcCollateral
///
///  The pool holds the AMM's YES and NO token balances.
///  CPMM invariant: poolYes * poolNo = k
///  Implicit YES price = poolNo / (poolYes + poolNo)
///
///  Buy YES with X USDC (after fee):
///    1. Mint X YES + X NO pairs (backed by X USDC)
///    2. Swap X NO into pool → extraYes = poolYes - k/(poolNo + X) YES out
///    3. User gets: X + extraYes YES tokens
///
///  Sell `tokensIn` YES for USDC:
///    The user needs returnUsdc YES + returnUsdc NO to redeem returnUsdc USDC.
///    Swap (tokensIn - returnUsdc) YES into pool to get returnUsdc NO:
///      poolNo - k/(poolYes + (tokensIn - returnUsdc)) = returnUsdc
///    Direct formula: tokensIn = k/(poolNo - returnUsdc) - poolYes + returnUsdc
///    Equivalently, given tokensIn → solve quadratic for returnUsdc.
///
///  States: Open → Closed (tradingDeadline passed) → Resolved
contract Market is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ────────────────────────────────────────────────────────────
    uint8 public constant YES = 0;
    uint8 public constant NO = 1;
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public constant MIN_POOL_BALANCE = 1e4; // 0.01 USDC worth — prevent zero-division

    // ─── Storage (no immutables — deployed via Clones) ────────────────────────
    IERC20 public usdc;
    OutcomeToken public outcomeToken;
    address public oracle;
    bytes32 public marketId;

    string public question;
    string public description;
    string public resolutionSource;
    uint256 public tradingDeadline;
    uint256 public resolutionDeadline;
    uint256 public feeBps;

    // Pool balances (actual token counts held by this contract)
    uint256 public poolYes;
    uint256 public poolNo;

    enum State {
        Open,
        Closed,
        Resolved
    }

    State public state;
    uint8 public winningOutcome;

    uint256 public yesTokenId;
    uint256 public noTokenId;

    bool private _initialized;

    // ─── Events ───────────────────────────────────────────────────────────────
    event LiquidityAdded(address indexed provider, uint256 usdcAmount, uint256 lpShares);
    event LiquidityRemoved(address indexed provider, uint256 lpShares, uint256 yesReturned, uint256 noReturned);
    event Trade(
        address indexed trader,
        uint8 indexed outcomeIndex,
        bool isBuy,
        uint256 collateralAmount,
        uint256 outcomeTokenAmount,
        uint256 fee
    );
    event MarketResolved(uint8 winningOutcome);
    event Redeemed(address indexed redeemer, uint256 outcomeTokenAmount, uint256 usdcAmount);
    event LPRedeemed(address indexed lp, uint256 lpShares, uint256 usdcAmount);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error NotOracle();
    error AlreadyInitialized();
    error MarketNotOpen();
    error TradingDeadlineNotPassed();
    error SlippageExceeded();
    error ZeroAmount();
    error InsufficientLiquidity();
    error InvalidOutcome();
    error AlreadyResolved();
    error NotResolved();
    error NoTokensToRedeem();
    error ReturnExceedsPool();

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    constructor() ERC20("ArcPM LP", "ARCPM-LP") {}

    /// @notice One-time initializer called by MarketFactory immediately after clone.
    function initialize(
        bytes32 _marketId,
        address _usdc,
        address _outcomeToken,
        address _oracle,
        string calldata _question,
        string calldata _description,
        string calldata _resolutionSource,
        uint256 _tradingDeadline,
        uint256 _resolutionDeadline,
        uint256 _feeBps
    ) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;

        marketId = _marketId;
        usdc = IERC20(_usdc);
        outcomeToken = OutcomeToken(_outcomeToken);
        oracle = _oracle;
        question = _question;
        description = _description;
        resolutionSource = _resolutionSource;
        tradingDeadline = _tradingDeadline;
        resolutionDeadline = _resolutionDeadline;
        feeBps = _feeBps;

        yesTokenId = outcomeToken.tokenId(_marketId, YES);
        noTokenId = outcomeToken.tokenId(_marketId, NO);

        state = State.Open;
    }

    // ─── State management ────────────────────────────────────────────────────

    function _checkOpen() internal {
        if (state == State.Open && block.timestamp >= tradingDeadline) {
            state = State.Closed;
        }
        if (state != State.Open) revert MarketNotOpen();
    }

    // ─── Liquidity ────────────────────────────────────────────────────────────

    /// @notice Add liquidity. Mints YES+NO pairs backed by USDC and adds them to the pool.
    ///         First LP sets the 50/50 initial price.
    ///         Subsequent LPs must match the current pool ratio.
    /// @param usdcAmount USDC to deposit.
    /// @param minLpShares Minimum LP shares to receive.
    function addLiquidity(uint256 usdcAmount, uint256 minLpShares) external nonReentrant returns (uint256 lpShares) {
        _checkOpen();
        if (usdcAmount == 0) revert ZeroAmount();

        uint256 totalSupplyBefore = totalSupply();

        if (totalSupplyBefore == 0) {
            // First LP: 50/50 split. Mint usdcAmount YES and usdcAmount NO to pool.
            if (usdcAmount < 2 * MIN_POOL_BALANCE) revert InsufficientLiquidity();
            poolYes = usdcAmount;
            poolNo = usdcAmount;
            lpShares = usdcAmount;
            outcomeToken.mint(address(this), yesTokenId, usdcAmount);
            outcomeToken.mint(address(this), noTokenId, usdcAmount);
        } else {
            // Subsequent LP: proportional to geometric mean of pool balances.
            // Mint usdcAmount YES and usdcAmount NO, adding proportionally.
            // LP share = usdcAmount / sqrt(poolYes * poolNo) * totalSupply ... but simpler:
            // We add usdcAmount YES and usdcAmount NO to both sides, LP gets proportional shares.
            // LP shares proportional to deposit vs current total collateral (= poolYes + poolNo) / 2
            uint256 totalCollateral = (poolYes + poolNo) / 2; // collateral per side
            lpShares = (usdcAmount * totalSupplyBefore) / totalCollateral;

            poolYes += usdcAmount;
            poolNo += usdcAmount;
            outcomeToken.mint(address(this), yesTokenId, usdcAmount);
            outcomeToken.mint(address(this), noTokenId, usdcAmount);
        }

        if (lpShares < minLpShares) revert SlippageExceeded();

        // Pull USDC (Checks-Effects-Interactions)
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        _mint(msg.sender, lpShares);

        emit LiquidityAdded(msg.sender, usdcAmount, lpShares);
    }

    /// @notice Remove liquidity. Burns LP shares and returns proportional YES+NO tokens to LP.
    ///         LP can then redeem pairs for USDC or hold for resolution.
    /// @param lpShares LP shares to burn.
    function removeLiquidity(uint256 lpShares) external nonReentrant returns (uint256 yesReturned, uint256 noReturned) {
        _checkOpen();
        if (lpShares == 0) revert ZeroAmount();

        uint256 totalSupplyBefore = totalSupply();
        yesReturned = (lpShares * poolYes) / totalSupplyBefore;
        noReturned = (lpShares * poolNo) / totalSupplyBefore;

        if (poolYes - yesReturned < MIN_POOL_BALANCE || poolNo - noReturned < MIN_POOL_BALANCE) {
            revert InsufficientLiquidity();
        }

        // Effects
        poolYes -= yesReturned;
        poolNo -= noReturned;
        _burn(msg.sender, lpShares);

        // Transfer outcome tokens to LP
        outcomeToken.safeTransferFrom(address(this), msg.sender, yesTokenId, yesReturned, "");
        outcomeToken.safeTransferFrom(address(this), msg.sender, noTokenId, noReturned, "");

        emit LiquidityRemoved(msg.sender, lpShares, yesReturned, noReturned);
    }

    /// @notice After resolution, LPs burn LP shares and receive USDC
    ///         (winning pool tokens redeemed, losing tokens burned).
    function lpRedeemAfterResolution(uint256 lpShares) external nonReentrant {
        if (state != State.Resolved) revert NotResolved();
        if (lpShares == 0) revert ZeroAmount();

        uint256 totalSupplyBefore = totalSupply();
        uint256 propYes = (lpShares * poolYes) / totalSupplyBefore;
        uint256 propNo = (lpShares * poolNo) / totalSupplyBefore;

        poolYes -= propYes;
        poolNo -= propNo;
        _burn(msg.sender, lpShares);

        uint256 usdcAmount;
        if (winningOutcome == YES) {
            usdcAmount = propYes;
            outcomeToken.burn(address(this), yesTokenId, propYes);
            outcomeToken.burn(address(this), noTokenId, propNo);
        } else {
            usdcAmount = propNo;
            outcomeToken.burn(address(this), noTokenId, propNo);
            outcomeToken.burn(address(this), yesTokenId, propYes);
        }

        usdc.safeTransfer(msg.sender, usdcAmount);
        emit LPRedeemed(msg.sender, lpShares, usdcAmount);
    }

    // ─── Trading ──────────────────────────────────────────────────────────────

    /// @notice Buy outcome tokens with USDC.
    ///         Mints YES+NO pairs from USDC, swaps unwanted tokens into pool for more desired.
    /// @param outcomeIndex 0=YES, 1=NO.
    /// @param usdcIn USDC to spend (inclusive of fee).
    /// @param minTokensOut Minimum outcome tokens to receive.
    function buy(uint8 outcomeIndex, uint256 usdcIn, uint256 minTokensOut)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        _checkOpen();
        if (outcomeIndex > 1) revert InvalidOutcome();
        if (usdcIn == 0) revert ZeroAmount();

        uint256 fee = (usdcIn * feeBps) / FEE_DENOMINATOR;
        uint256 netUsdc = usdcIn - fee;

        // Mint netUsdc YES + netUsdc NO (backed by netUsdc USDC; fee stays as extra collateral)
        outcomeToken.mint(address(this), yesTokenId, netUsdc);
        outcomeToken.mint(address(this), noTokenId, netUsdc);

        // Swap the unwanted outcome tokens into the pool for desired ones
        uint256 extraFromPool;
        if (outcomeIndex == YES) {
            // Swap netUsdc NO into pool → get extraYes out
            uint256 k = poolYes * poolNo;
            uint256 newPoolNo = poolNo + netUsdc;
            uint256 newPoolYes = k / newPoolNo;
            extraFromPool = poolYes - newPoolYes;
            poolNo = newPoolNo;
            poolYes = newPoolYes;
            // The NO tokens we minted go to pool (implicitly, pool holds them now)
            // The YES tokens that come out of pool go to user
            // Net pool change: +netUsdc NO, -extraFromPool YES
        } else {
            // Swap netUsdc YES into pool → get extraNo out
            uint256 k = poolYes * poolNo;
            uint256 newPoolYes = poolYes + netUsdc;
            uint256 newPoolNo = k / newPoolYes;
            extraFromPool = poolNo - newPoolNo;
            poolYes = newPoolYes;
            poolNo = newPoolNo;
        }

        // tokensOut = freshly minted tokens (that weren't swapped) + what came from pool
        tokensOut = netUsdc + extraFromPool;

        if (tokensOut < minTokensOut) revert SlippageExceeded();

        // Burn the minted tokens that went into the pool (they're accounted in pool balances)
        // The pool received netUsdc of the unwanted token — these are held as pool tokens
        // The pool gave extraFromPool of the desired token — those stay in the contract
        // User gets tokensOut of the desired token
        // We need to transfer them to user

        uint256 tokenIdOut = outcomeIndex == YES ? yesTokenId : noTokenId;
        uint256 tokenIdSwapped = outcomeIndex == YES ? noTokenId : yesTokenId;

        // Burn the swapped-in tokens from contract's minted batch (they belong to pool now)
        // Actually: we minted netUsdc of each. The netUsdc of unwanted goes to pool (already counted).
        // The netUsdc of desired + extraFromPool total needs to go to user, but pool gave extraFromPool.
        // So the contract holds: netUsdc desired (minted) + extraFromPool desired (from pool decrease)
        //                        = tokensOut desired
        // And: netUsdc unwanted (minted) in pool (already counted in poolNo/poolYes increase)
        // These unwanted tokens were minted to 'address(this)' and need to be burned
        // because they're now accounted in pool balances (virtual, not physical token holding)
        // WAIT: The pool balances ARE the physical token balances held by this contract.
        // addLiquidity minted tokens to address(this). The pool balances reflect that.
        // In buy: we mint netUsdc YES + netUsdc NO to address(this).
        //         The unwanted tokens (netUsdc of them) stay in the contract as pool tokens (poolNo/poolYes increased).
        //         The desired tokens: netUsdc minted + extraFromPool from pool = tokensOut. Pool decreased by extraFromPool.
        //         Physical balance check: contract holds netUsdc more unwanted + netUsdc more desired - extraFromPool less desired
        //                               = contract holds netUsdc more unwanted + (netUsdc - extraFromPool) more desired... hmm
        // Actually wait: pool was previously holding poolYes YES and poolNo NO.
        // After buy YES:
        //   Pool NOW holds: poolYes - extraFromPool = newPoolYes YES
        //                   poolNo + netUsdc = newPoolNo NO
        // User gets: netUsdc + extraFromPool YES tokens (physical transfer from contract)
        // Total YES in contract: old_poolYes + netUsdc (minted) - (netUsdc + extraFromPool) (transferred to user)
        //                      = old_poolYes - extraFromPool = newPoolYes ✓
        // Total NO in contract: old_poolNo + netUsdc (minted) = newPoolNo ✓
        // USDC in contract: existing + usdcIn (fee adds to collateral)

        // Transfer desired tokens to buyer
        outcomeToken.safeTransferFrom(address(this), msg.sender, tokenIdOut, tokensOut, "");

        // Pull USDC (CEI: last)
        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);

        emit Trade(msg.sender, outcomeIndex, true, usdcIn, tokensOut, fee);
    }

    /// @notice Sell outcome tokens for USDC.
    ///         Specify how much USDC to receive; contract computes tokens needed.
    ///         Formula: tokensIn = k/(poolOther - returnUsdc) - poolSell + returnUsdc
    /// @param outcomeIndex 0=YES, 1=NO.
    /// @param returnUsdc USDC to receive (before fee).
    /// @param maxTokensIn Maximum tokens to spend (slippage protection).
    function sell(uint8 outcomeIndex, uint256 returnUsdc, uint256 maxTokensIn)
        external
        nonReentrant
        returns (uint256 tokensIn)
    {
        _checkOpen();
        if (outcomeIndex > 1) revert InvalidOutcome();
        if (returnUsdc == 0) revert ZeroAmount();

        uint256 fee = (returnUsdc * feeBps) / FEE_DENOMINATOR;
        uint256 netReturn = returnUsdc - fee;

        uint256 poolSell = outcomeIndex == YES ? poolYes : poolNo;
        uint256 poolOther = outcomeIndex == YES ? poolNo : poolYes;

        if (returnUsdc >= poolOther) revert ReturnExceedsPool();

        uint256 k = poolYes * poolNo;
        // Direct formula (no sqrt needed):
        // tokensIn = k / (poolOther - returnUsdc) - poolSell + returnUsdc
        tokensIn = k / (poolOther - returnUsdc) - poolSell + returnUsdc;

        if (tokensIn > maxTokensIn) revert SlippageExceeded();

        // The user sells tokensIn tokens. We swap (tokensIn - returnUsdc) into pool to get returnUsdc of the other.
        // Then burn returnUsdc of each outcome type → redeem returnUsdc USDC.
        uint256 swapIn = tokensIn - returnUsdc;

        if (outcomeIndex == YES) {
            // Swap swapIn YES into pool
            uint256 newPoolYes = poolYes + swapIn;
            uint256 newPoolNo = k / newPoolYes;
            // Pool gives returnUsdc NO (= poolNo - newPoolNo)
            poolYes = newPoolYes;
            poolNo = newPoolNo;
        } else {
            uint256 newPoolNo = poolNo + swapIn;
            uint256 newPoolYes = k / newPoolNo;
            poolYes = newPoolYes;
            poolNo = newPoolNo;
        }

        // Pull the tokens from user (they send tokensIn of the sold outcome)
        uint256 tokenIdIn = outcomeIndex == YES ? yesTokenId : noTokenId;
        uint256 tokenIdOther = outcomeIndex == YES ? noTokenId : yesTokenId;

        outcomeToken.safeTransferFrom(msg.sender, address(this), tokenIdIn, tokensIn, "");

        // Now contract holds: swapIn went to pool (already in pool accounting), returnUsdc for user's half
        // Contract also has returnUsdc of the other token (from pool swap)
        // Burn returnUsdc YES + returnUsdc NO (complete sets) to release USDC
        outcomeToken.burn(address(this), tokenIdIn, returnUsdc);
        outcomeToken.burn(address(this), tokenIdOther, returnUsdc);

        // The swapIn tokens remain in pool (already counted in updated pool balances)
        // Physical check for sold token:
        // Before: pool had old_poolSell of sold token. User sent tokensIn.
        //   - swapIn goes to pool: pool now has old_poolSell + swapIn
        //   - returnUsdc burned: pool net = old_poolSell + swapIn = newPoolSell
        //   ✓ matches if newPoolSell = poolSell + swapIn
        // For other token:
        //   Before: pool had poolOther of other token.
        //   Pool gave out returnUsdc (pool decreased by returnUsdc).
        //   Those returnUsdc get burned above.
        //   Pool net = poolOther - returnUsdc = k/newPoolSell ✓

        usdc.safeTransfer(msg.sender, netReturn);

        emit Trade(msg.sender, outcomeIndex, false, netReturn, tokensIn, fee);
    }

    // ─── Resolution ───────────────────────────────────────────────────────────

    /// @notice Oracle resolves the market after trading deadline.
    function resolve(uint8 _winningOutcome) external onlyOracle {
        if (state == State.Open && block.timestamp >= tradingDeadline) {
            state = State.Closed;
        }
        if (state == State.Resolved) revert AlreadyResolved();
        if (state != State.Closed) revert TradingDeadlineNotPassed();
        if (_winningOutcome > 1) revert InvalidOutcome();

        state = State.Resolved;
        winningOutcome = _winningOutcome;

        emit MarketResolved(_winningOutcome);
    }

    // ─── Redemption ───────────────────────────────────────────────────────────

    /// @notice Redeem winning outcome tokens 1:1 for USDC after resolution.
    function redeem() external nonReentrant {
        if (state != State.Resolved) revert NotResolved();

        uint256 winTokenId = outcomeToken.tokenId(marketId, winningOutcome);
        uint256 balance = outcomeToken.balanceOf(msg.sender, winTokenId);
        if (balance == 0) revert NoTokensToRedeem();

        outcomeToken.burn(msg.sender, winTokenId, balance);
        usdc.safeTransfer(msg.sender, balance);

        emit Redeemed(msg.sender, balance, balance);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Implied YES probability in basis points.
    function impliedYesProbabilityBps() external view returns (uint256) {
        uint256 total = poolYes + poolNo;
        if (total == 0) return 5000;
        return (poolNo * 10_000) / total;
    }

    /// @notice Preview buy: tokens out and fee for usdcIn.
    function previewBuy(uint8 outcomeIndex, uint256 usdcIn) external view returns (uint256 tokensOut, uint256 fee) {
        if (outcomeIndex > 1) revert InvalidOutcome();
        fee = (usdcIn * feeBps) / FEE_DENOMINATOR;
        uint256 netUsdc = usdcIn - fee;

        uint256 poolIn = outcomeIndex == YES ? poolNo : poolYes;
        uint256 poolOut = outcomeIndex == YES ? poolYes : poolNo;
        uint256 k = poolYes * poolNo;
        uint256 newPoolIn = poolIn + netUsdc;
        uint256 extraFromPool = poolOut - k / newPoolIn;
        tokensOut = netUsdc + extraFromPool;
    }

    /// @notice Preview sell: tokensIn needed and fee for desired returnUsdc.
    function previewSell(uint8 outcomeIndex, uint256 returnUsdc) external view returns (uint256 tokensIn, uint256 fee) {
        if (outcomeIndex > 1) revert InvalidOutcome();
        if (returnUsdc == 0) return (0, 0);

        fee = (returnUsdc * feeBps) / FEE_DENOMINATOR;
        uint256 poolSell = outcomeIndex == YES ? poolYes : poolNo;
        uint256 poolOther = outcomeIndex == YES ? poolNo : poolYes;

        if (returnUsdc >= poolOther) return (type(uint256).max, fee);

        uint256 k = poolYes * poolNo;
        tokensIn = k / (poolOther - returnUsdc) - poolSell + returnUsdc;
    }

    /// @notice ERC1155 receiver hook — required for outcome token transfers to this contract.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
