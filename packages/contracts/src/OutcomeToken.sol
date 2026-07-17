// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title OutcomeToken
/// @notice ERC1155 representing YES/NO outcome tokens per market.
///         tokenId = keccak256(abi.encodePacked(marketId, outcomeIndex))
///         Only addresses with MINTER_ROLE can mint/burn (i.e., the Market contracts).
contract OutcomeToken is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Derives the token ID for a given market and outcome index.
    function tokenId(bytes32 marketId, uint8 outcomeIndex) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(marketId, outcomeIndex)));
    }

    function mint(address to, uint256 id, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, "");
    }

    function burn(address from, uint256 id, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, id, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
