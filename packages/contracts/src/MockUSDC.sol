// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice Testnet-only USDC mock with 6 decimals and open mint.
///         On production Arc Testnet use the native Circle USDC instead.
contract MockUSDC is ERC20, Ownable {
    constructor() ERC20("USD Coin", "USDC") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Anyone can mint on testnet to fund testing flows.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
