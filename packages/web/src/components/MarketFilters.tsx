"use client";

import { ALL_CATEGORIES, CATEGORY_ICON, type Category } from "@/lib/categories";

export type SortKey = "liquidity" | "ending" | "newest";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "liquidity", label: "Top liquidity" },
  { key: "ending", label: "Ending soon" },
  { key: "newest", label: "Newest" },
];

type Props = {
  selected: Category;
  onSelect: (c: Category) => void;
  search: string;
  onSearch: (s: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  counts: Partial<Record<Category, number>>;
};

export function MarketFilters({
  selected,
  onSelect,
  search,
  onSearch,
  sort,
  onSort,
  counts,
}: Props) {
  return (
    <div className="sticky top-14 z-40 -mx-5 px-5 py-3 bg-[var(--color-bg-0)]/90 backdrop-blur-md border-b border-[var(--color-border-1)]">
      <div className="flex flex-col gap-3">
        {/* Search + Sort row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none">
              ⌕
            </span>
            <input
              type="text"
              placeholder="Search markets…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full bg-[var(--color-bg-2)] border border-[var(--color-border-1)] rounded-md pl-8 pr-3 py-1.5 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-[var(--color-text-muted)] mr-1">
              Sort
            </span>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => onSort(o.key)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  sort === o.key
                    ? "bg-[var(--color-bg-3)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-1)]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-thin">
          {ALL_CATEGORIES.map((c) => {
            const active = selected === c;
            const count = counts[c] ?? 0;
            return (
              <button
                key={c}
                onClick={() => onSelect(c)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  active
                    ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)]/40 text-[var(--color-accent)]"
                    : "bg-[var(--color-bg-1)] border-[var(--color-border-1)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-2)]"
                }`}
              >
                <span className="opacity-80">{CATEGORY_ICON[c]}</span>
                <span>{c}</span>
                {count > 0 && (
                  <span
                    className={`mono text-[10px] px-1.5 rounded ${
                      active
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                        : "bg-[var(--color-bg-3)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
