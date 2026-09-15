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
      /\b(world cup|nba|champions league|wimbledon|f1|formula 1|olympics|grand prix|super bowl|drivers championship|copa|fifa|uefa|lakers|verstappen|alcaraz|sinner|argentina|brazil|brasil|real madrid|nfl|mlb|nhl|premier league|la liga|serie a|bundesliga|ballon d'or|us open|french open|australian open|masters|ryder cup|ufc|boxing)\b/i,
  },
  {
    cat: "Politics",
    keywords:
      /\b(president|election|vance|lula|republican|democrat|nominee|parliament|general election|approval rating|ukraine|nato|senate|congress|prime minister|referendum|impeach|bolsonaro|macron|milei)\b/i,
  },
  {
    cat: "Crypto",
    keywords:
      /\b(btc|bitcoin|eth|ethereum|sol|solana|memecoin|dominance|tvl|stablecoin|defi|crypto|xrp|ripple|doge|dogecoin|shiba|arbitrum|optimism|blast|base|sui|aptos|near|link|chainlink|avax|avalanche)\b/i,
  },
  {
    cat: "Tech & AI",
    keywords:
      /\b(openai|gpt|claude|anthropic|ai\b|frontiermath|llm|model|apple|vision pro|iphone|samsung|huawei|nvidia|amd|google|deepmind|meta|zuckerberg|xai|grok|mistral|gemini|self-driving|waymo|robotaxi)\b/i,
  },
  {
    cat: "Business",
    keywords:
      /\b(ipo|acquire|acquisition|coinbase|stripe|earnings|spy|qqq|dia|nvda|tsla|coin|mstr|s&p 500|nasdaq|dow jones|market cap|revenue|guidance|split|dividend|buyback|nike|walmart|amazon|starbucks|delivered?|tesla|cybertruck|model 3|model y|shareholder)\b/i,
  },
  {
    cat: "Entertainment",
    keywords:
      /\b(grammy|grammys|avatar|swift|movie|film|album|netflix|box office|oscar|academy award|best picture|streaming|marvel|disney|beyonce|drake|kendrick|game of the year|goty|the game awards|bafta|cannes)\b/i,
  },
  {
    cat: "Macro",
    keywords:
      /\b(cpi|inflation|ibovespa|fed cut|fed hike|fomc|interest rate|dollar index|dxy|recession|gdp|unemployment|payrolls|pce|jobless|yield|treasury|10-year|2-year)\b/i,
  },
  {
    cat: "Science",
    keywords:
      /\b(spacex|starship|moon|mars|nasa|gistemp|fda|glp-1|semaglutide|tirzepatide|climate|hottest year|vaccine|cern|fusion|quantum|dna|crispr|nobel|earthquake|hurricane)\b/i,
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
