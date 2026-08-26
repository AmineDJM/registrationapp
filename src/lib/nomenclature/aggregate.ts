import { dayToDate } from "./excel-date";
import type { DayNumber, IndexedRegistration, LaboratoryMolecule, LaboratorySummary } from "./types";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

type PairAccumulator = {
  laboratory: string;
  dci: string;
  firstDay: DayNumber;
  registrationsCount: number;
  brands: Map<string, string>;
};

/**
 * One entry per unique laboratory + DCI couple.
 * `firstRegistrationDate` is the earliest initial registration among the rows received,
 * i.e. inside the selected period. Sorted by laboratory then DCI.
 */
export function groupByLaboratoryAndMolecule(rows: IndexedRegistration[]): LaboratoryMolecule[] {
  const pairs = new Map<string, PairAccumulator>();

  for (const row of rows) {
    if (row.initialDay === null || !row.laboratoryKey || !row.dciKey) continue;
    const key = `${row.laboratoryKey}|${row.dciKey}`;
    const existing = pairs.get(key);
    if (existing) {
      existing.registrationsCount += 1;
      if (row.initialDay < existing.firstDay) existing.firstDay = row.initialDay;
      addBrand(existing.brands, row.brandName);
      continue;
    }
    const created: PairAccumulator = {
      laboratory: row.laboratory,
      dci: row.dci,
      firstDay: row.initialDay,
      registrationsCount: 1,
      brands: new Map(),
    };
    addBrand(created.brands, row.brandName);
    pairs.set(key, created);
  }

  return [...pairs.values()]
    .map((pair) => ({
      laboratory: pair.laboratory,
      dci: pair.dci,
      firstRegistrationDate: dayToDate(pair.firstDay),
      registrationsCount: pair.registrationsCount,
      brands: [...pair.brands.values()].sort((a, b) => collator.compare(a, b)),
    }))
    .sort((a, b) => collator.compare(a.laboratory, b.laboratory) || collator.compare(a.dci, b.dci));
}

function addBrand(brands: Map<string, string>, brand: string | null): void {
  if (!brand) return;
  const key = brand.toLocaleUpperCase("fr-FR");
  if (!brands.has(key)) brands.set(key, brand);
}

/** Molecule count per laboratory, sorted by count desc then laboratory asc. */
export function buildLaboratorySummary(pairs: { laboratory: string }[]): LaboratorySummary[] {
  const counts = new Map<string, LaboratorySummary>();
  for (const pair of pairs) {
    const key = pair.laboratory.toLocaleUpperCase("fr-FR");
    const existing = counts.get(key);
    if (existing) existing.moleculesCount += 1;
    else counts.set(key, { laboratory: pair.laboratory, moleculesCount: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => b.moleculesCount - a.moleculesCount || collator.compare(a.laboratory, b.laboratory),
  );
}

/** Distinct DCI across every laboratory of the period. */
export function countUniqueMolecules(pairs: { dci: string }[]): number {
  return new Set(pairs.map((pair) => pair.dci.toLocaleUpperCase("fr-FR"))).size;
}

export { collator as frenchCollator };
