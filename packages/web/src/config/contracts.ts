// Auto-generated from packages/contracts/deployments/arc-testnet.json
// Update after each redeploy

export const CONTRACTS = {
  MockUSDC: "0xd5413b391B3790CBEF25d9655d82a2ad99cD8b31" as `0x${string}`,
  OutcomeToken: "0xd150e8e77fB8c4dD3FAD25afdE4e12AEbcefCAeC" as `0x${string}`,
  Oracle: "0x50FA75b98C2238ED1917dD01948Aab86c14A311E" as `0x${string}`,
  MarketFactory: "0xF7E0cf21B29B76C912690C65a5D0Bf244dF875A3" as `0x${string}`,
} as const;

export const DEPLOYER = "0x6400B4fDBc04F31F82f122E194e2aB0ECEfD1B28" as `0x${string}`;

export type ContractName = keyof typeof CONTRACTS;

export const EXAMPLE_MARKETS: {
  id: `0x${string}`;
  address: `0x${string}`;
  question: string;
}[] = [
  {
    id: "0xda06692003dbc8e8b8372289cdcf66f2530ef58c5b51bb8e708b9aa061aa8645",
    address: "0x17bEb0630Ec37e9C28d903F1c22a8Ce971b36f5D",
    question: "Will BTC close above $150k on 31/12/2026?",
  },
  {
    id: "0x54d97334e202eea2c8ba272e15ae70bae93daab965df749d01e9d5a7a97f06c5",
    address: "0x89c1136B184DD6FE30Dd2351c86fAd107B0505ef",
    question: "Will Anthropic launch Claude Opus 5 before 01/06/2026?",
  },
  {
    id: "0xb55313d8dc221cb4d6fcc41ee44d4b38c8b1ec065ac62e6d9d2a5181f50ee226",
    address: "0x46c930fc0d789964E8F6b008abfDF4AFd376Eb43",
    question: "Will Brazil reach the semi-finals of the 2026 World Cup?",
  },
];
