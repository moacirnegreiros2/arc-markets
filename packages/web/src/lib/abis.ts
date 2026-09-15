export const MARKET_ABI = [
  // View functions
  {
    name: "question",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "description",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    name: "state",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "winningOutcome",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "tradingDeadline",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "resolutionDeadline",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "feeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "poolYes",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "poolNo",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "yesTokenId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "noTokenId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "impliedYesProbabilityBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "previewBuy",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "outcomeIndex", type: "uint8" },
      { name: "usdcIn", type: "uint256" },
    ],
    outputs: [
      { name: "tokensOut", type: "uint256" },
      { name: "fee", type: "uint256" },
    ],
  },
  {
    name: "previewSell",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "outcomeIndex", type: "uint8" },
      { name: "returnUsdc", type: "uint256" },
    ],
    outputs: [
      { name: "tokensIn", type: "uint256" },
      { name: "fee", type: "uint256" },
    ],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "marketId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "oracle",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "resolutionSource",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  // Write functions
  {
    name: "buy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "outcomeIndex", type: "uint8" },
      { name: "usdcIn", type: "uint256" },
      { name: "minTokensOut", type: "uint256" },
    ],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    name: "sell",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "outcomeIndex", type: "uint8" },
      { name: "returnUsdc", type: "uint256" },
      { name: "maxTokensIn", type: "uint256" },
    ],
    outputs: [{ name: "tokensIn", type: "uint256" }],
  },
  {
    name: "addLiquidity",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "usdcAmount", type: "uint256" },
      { name: "minLpShares", type: "uint256" },
    ],
    outputs: [{ name: "lpShares", type: "uint256" }],
  },
  {
    name: "removeLiquidity",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "lpShares", type: "uint256" }],
    outputs: [
      { name: "yesReturned", type: "uint256" },
      { name: "noReturned", type: "uint256" },
    ],
  },
  {
    name: "redeem",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "lpRedeemAfterResolution",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "lpShares", type: "uint256" }],
    outputs: [],
  },
  // Events
  {
    name: "Trade",
    type: "event",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "outcomeIndex", type: "uint8", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "collateralAmount", type: "uint256", indexed: false },
      { name: "outcomeTokenAmount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    name: "LiquidityAdded",
    type: "event",
    inputs: [
      { name: "provider", type: "address", indexed: true },
      { name: "usdcAmount", type: "uint256", indexed: false },
      { name: "lpShares", type: "uint256", indexed: false },
    ],
  },
  {
    name: "MarketResolved",
    type: "event",
    inputs: [{ name: "winningOutcome", type: "uint8", indexed: false }],
  },
] as const;

export const FACTORY_ABI = [
  {
    name: "getMarketIds",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    name: "getMarketAddress",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "marketCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "oracle",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "createMarket",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "question", type: "string" },
      { name: "description", type: "string" },
      { name: "resolutionSource", type: "string" },
      { name: "tradingDeadline", type: "uint256" },
      { name: "resolutionDeadline", type: "uint256" },
      { name: "feeBps", type: "uint256" },
    ],
    outputs: [
      { name: "marketId", type: "bytes32" },
      { name: "market", type: "address" },
    ],
  },
  {
    name: "MarketCreated",
    type: "event",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "market", type: "address", indexed: true },
      { name: "question", type: "string", indexed: false },
      { name: "tradingDeadline", type: "uint256", indexed: false },
      { name: "resolutionDeadline", type: "uint256", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const ERC1155_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOfBatch",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "accounts", type: "address[]" },
      { name: "ids", type: "uint256[]" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

export const ORACLE_ABI = [
  {
    name: "resolve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "market", type: "address" },
      { name: "winningOutcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "hasRole",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
