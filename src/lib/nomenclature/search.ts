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

/** Exact match on a dropdown selection, insensitive to case and accents. */
export function matchesValue(value: string, selected: string | null | undefined): boolean {
  if (!selected) return true;
  return searchKey(value) === searchKey(selected);
}

export function filterByLaboratory<T extends { laboratory: string }>(
  items: T[],
  laboratory: string | null | undefined,
): T[] {
  return laboratory ? items.filter((item) => matchesValue(item.laboratory, laboratory)) : items;
}

export function filterByDci<T extends { dci: string }>(items: T[], dci: string | null | undefined): T[] {
  return dci ? items.filter((item) => matchesValue(item.dci, dci)) : items;
}
