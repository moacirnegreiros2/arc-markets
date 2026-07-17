// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./Market.sol";
import "./OutcomeToken.sol";

/// @title MarketFactory
/// @notice Deploys prediction market clones and maintains the registry.
///         Uses OpenZeppelin Clones (EIP-1167 minimal proxies) to minimize deploy gas.
contract MarketFactory is Ownable, Pausable {
    address public immutable marketImplementation;
    address public immutable usdc;
    OutcomeToken public immutable outcomeToken;
    address public oracle;

    uint256 public defaultFeeBps = 200; // 2%
    uint256 public marketCount;

    mapping(bytes32 => address) public markets; // marketId => market address
    bytes32[] public marketIds;

    event MarketCreated(
        bytes32 indexed marketId,
        address indexed market,
        string question,
        uint256 tradingDeadline,
        uint256 resolutionDeadline
    );
    event OracleUpdated(address indexed newOracle);
    event DefaultFeeUpdated(uint256 newFeeBps);

    error InvalidDeadlines();
    error MarketAlreadyExists();
    error FeeTooHigh();

    constructor(address _usdc, address _outcomeToken, address _oracle) Ownable(msg.sender) {
        usdc = _usdc;
        outcomeToken = OutcomeToken(_outcomeToken);
        oracle = _oracle;

        marketImplementation = address(new Market());
    }

    /// @notice Create a new prediction market.
    function createMarket(
        string calldata question,
        string calldata description,
        string calldata resolutionSource,
        uint256 tradingDeadline,
        uint256 resolutionDeadline,
        uint256 feeBps
    ) external whenNotPaused onlyOwner returns (bytes32 marketId, address market) {
        if (tradingDeadline <= block.timestamp) revert InvalidDeadlines();
        if (resolutionDeadline <= tradingDeadline) revert InvalidDeadlines();
        if (feeBps > 1000) revert FeeTooHigh(); // max 10%

        marketId = keccak256(abi.encodePacked(block.chainid, address(this), marketCount++));

        if (markets[marketId] != address(0)) revert MarketAlreadyExists();

        market = Clones.clone(marketImplementation);

        Market(market)
            .initialize(
                marketId,
                usdc,
                address(outcomeToken),
                oracle,
                question,
                description,
                resolutionSource,
                tradingDeadline,
                resolutionDeadline,
                feeBps
            );

        // Grant the new market MINTER_ROLE on OutcomeToken
        outcomeToken.grantRole(outcomeToken.MINTER_ROLE(), market);

        markets[marketId] = market;
        marketIds.push(marketId);

        emit MarketCreated(marketId, market, question, tradingDeadline, resolutionDeadline);
    }

    function getMarketIds() external view returns (bytes32[] memory) {
        return marketIds;
    }

    function getMarketAddress(bytes32 marketId) external view returns (address) {
        return markets[marketId];
    }

    function setOracle(address newOracle) external onlyOwner {
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function setDefaultFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 1000) revert FeeTooHigh();
        defaultFeeBps = newFeeBps;
        emit DefaultFeeUpdated(newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
