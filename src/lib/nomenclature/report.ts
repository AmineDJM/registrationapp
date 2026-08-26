import { buildLaboratorySummary, countUniqueMolecules, groupByLaboratoryAndMolecule } from "./aggregate";
import { filterRegistrationsByDate, resolveDayRange } from "./filter";
import { filterMolecules } from "./search";
import type {
  DayRange,
  IndexedRegistration,
  LaboratoryMolecule,
  LaboratorySummary,
  NomenclatureDataset,
} from "./types";

export type ReportStats = {
  laboratories: number;
  uniqueMolecules: number;
  laboratoryMolecules: number;
  registrations: number;
};

export type NomenclatureReport = {
  range: DayRange;
  query: string | null;
  registrations: IndexedRegistration[];
  molecules: LaboratoryMolecule[];
  summary: LaboratorySummary[];
  stats: ReportStats;
};

/**
 * Full pipeline: date range resolution, filtering, laboratory/DCI grouping and counters.
 * `query` narrows the report exactly like the on-screen search does.
 */
export function buildReport(
  dataset: NomenclatureDataset,
  startInput: string | null | undefined,
  endInput: string | null | undefined,
  query?: string | null,
): NomenclatureReport {
  const range = resolveDayRange(dataset, startInput, endInput);
  const rows = filterRegistrationsByDate(dataset.datedRegistrations, range.startDay, range.endDay);
  const allMolecules = groupByLaboratoryAndMolecule(rows);

  const trimmedQuery = query?.trim() ? query.trim() : null;
  const molecules = filterMolecules(allMolecules, trimmedQuery);
  const registrations = trimmedQuery ? restrictRowsToPairs(rows, molecules) : rows;
  const summary = buildLaboratorySummary(molecules);

  return {
    range,
    query: trimmedQuery,
    registrations,
    molecules,
    summary,
    stats: {
      laboratories: summary.length,
      uniqueMolecules: countUniqueMolecules(molecules),
      laboratoryMolecules: molecules.length,
      registrations: registrations.length,
    },
  };
}

function restrictRowsToPairs(
  rows: IndexedRegistration[],
  molecules: LaboratoryMolecule[],
): IndexedRegistration[] {
  const kept = new Set(
    molecules.map(
      (pair) => `${pair.laboratory.toLocaleUpperCase("fr-FR")}|${pair.dci.toLocaleUpperCase("fr-FR")}`,
    ),
  );
  return rows.filter((row) => kept.has(`${row.laboratoryKey}|${row.dciKey}`));
}
