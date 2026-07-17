// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./Market.sol";

/// @title Oracle
/// @notice Minimal oracle wrapper with RESOLVER_ROLE.
///         v1: manual resolution only. Interface is designed to allow plugging
///         UMA Optimistic Oracle or Chainlink Any API in v2 without changing Market.sol.
contract Oracle is AccessControl {
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");

    event MarketResolutionSubmitted(address indexed market, uint8 winningOutcome, address resolver);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RESOLVER_ROLE, admin);
    }

    /// @notice Resolve a market. Caller must have RESOLVER_ROLE.
    function resolve(address market, uint8 winningOutcome) external onlyRole(RESOLVER_ROLE) {
        Market(market).resolve(winningOutcome);
        emit MarketResolutionSubmitted(market, winningOutcome, msg.sender);
    }

    /// @notice Grant resolver permission to an address (admin only).
    function addResolver(address resolver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(RESOLVER_ROLE, resolver);
    }

    /// @notice Revoke resolver permission.
    function removeResolver(address resolver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(RESOLVER_ROLE, resolver);
    }
}
