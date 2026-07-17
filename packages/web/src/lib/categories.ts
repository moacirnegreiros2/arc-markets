// Client-side categorization by keyword match — runs over each market's question.

export type Category =
  | "All"
  | "Sports"
  | "Crypto"
  | "Politics"
  | "Tech & AI"
  | "Business"
  | "Entertainment"
  | "Macro"
  | "Science"
  | "Other";

const RULES: { cat: Exclude<Category, "All" | "Other">; keywords: RegExp }[] = [
  {
    cat: "Sports",
    keywords:
      /\b(world cup|nba|champions league|wimbledon|f1|formula 1|olympics|grand prix|super bowl|drivers championship|copa|fifa|uefa|lakers|verstappen|alcaraz|argentina|brazil|brasil|real madrid)\b/i,
  },
  {
    cat: "Crypto",
    keywords:
      /\b(btc|bitcoin|eth|ethereum|sol|solana|memecoin|dominance|tvl|base|usdc|stablecoin|defi|crypto)\b/i,
  },
  {
    cat: "Politics",
    keywords:
      /\b(president|election|vance|lula|republican|democrat|nominee|fomc|fed|parliament|general election|approval rating|uk)\b/i,
  },
  {
    cat: "Tech & AI",
    keywords:
      /\b(openai|gpt|claude|anthropic|ai|frontiermath|llm|model|tesla|apple|vision pro|netflix|stripe|coinbase ipo)\b/i,
  },
  {
    cat: "Business",
    keywords: /\b(ipo|acquire|acquisition|coinbase|stripe|deliver|earnings)\b/i,
  },
  {
    cat: "Entertainment",
    keywords:
      /\b(grammy|grammys|avatar|swift|movie|film|album|netflix|box office|wimbledon)\b/i,
  },
  {
    cat: "Macro",
    keywords:
      /\b(cpi|inflation|ibovespa|fed|fomc|interest rate|dollar|recession|gdp)\b/i,
  },
  {
    cat: "Science",
    keywords:
      /\b(spacex|moon|nasa|gistemp|fda|glp-1|semaglutide|tirzepatide|climate|hottest year)\b/i,
  },
];

export function categorize(question: string): Category {
  for (const { cat, keywords } of RULES) {
    if (keywords.test(question)) return cat;
  }
  return "Other";
}

export const ALL_CATEGORIES: Category[] = [
  "All",
  "Sports",
  "Crypto",
  "Politics",
  "Tech & AI",
  "Business",
  "Entertainment",
  "Macro",
  "Science",
  "Other",
];

export const CATEGORY_ICON: Record<Category, string> = {
  All: "◎",
  Sports: "⚽",
  Crypto: "₿",
  Politics: "🗳",
  "Tech & AI": "⚡",
  Business: "📈",
  Entertainment: "🎬",
  Macro: "💵",
  Science: "🔬",
  Other: "•",
};
