export type SearchableMolecule = {
  laboratory: string;
  dci: string;
  brands: string[];
};

/** Case- and accent-insensitive search key. */
export function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tokenizeQuery(query: string): string[] {
  return searchKey(query).split(/\s+/).filter(Boolean);
}

/** A couple matches when every token appears in its laboratory, DCI or brands. */
export function matchesTokens(item: SearchableMolecule, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = searchKey(`${item.laboratory} ${item.dci} ${item.brands.join(" ")}`);
  return tokens.every((token) => haystack.includes(token));
}

/** Same filtering server-side (export) and client-side (on-screen search). */
export function filterMolecules<T extends SearchableMolecule>(items: T[], query: string | null | undefined): T[] {
  const tokens = query ? tokenizeQuery(query) : [];
  return tokens.length === 0 ? items : items.filter((item) => matchesTokens(item, tokens));
}
