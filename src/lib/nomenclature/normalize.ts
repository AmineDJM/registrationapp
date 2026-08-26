const WHITESPACE = /\s+/g;

/** Collapses whitespace and trims; returns null when nothing is left. */
export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(typeof value === "object" ? extractRichText(value) : value)
    .replace(WHITESPACE, " ")
    .trim();
  return text.length > 0 ? text : null;
}

function extractRichText(value: object): string {
  const candidate = value as { text?: unknown; richText?: { text?: string }[]; result?: unknown };
  if (Array.isArray(candidate.richText)) return candidate.richText.map((part) => part.text ?? "").join("");
  if (typeof candidate.text === "string") return candidate.text;
  if (candidate.result !== undefined && candidate.result !== null) return String(candidate.result);
  return "";
}

/**
 * Display name of a laboratory: typography only (trim + single spaces).
 * Deliberately no fuzzy matching — two distinct companies must never be merged.
 */
export function normalizeLabName(value: unknown): string | null {
  return normalizeText(value);
}

export function normalizeDci(value: unknown): string | null {
  return normalizeText(value);
}

/** Case-insensitive grouping key derived from the display name. */
export function toComparisonKey(value: string): string {
  return value.toLocaleUpperCase("fr-FR");
}
