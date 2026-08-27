import { buildLaboratorySummary, countUniqueMolecules, groupByLaboratoryAndMolecule } from "./aggregate";
import { filterRegistrationsByDate, resolveDayRange } from "./filter";
import { filterByDci, filterByLaboratory, filterMolecules } from "./search";
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

/** Everything that narrows a report beyond its period. */
export type ReportFilters = {
  query?: string | null;
  laboratory?: string | null;
  dci?: string | null;
};

export type NomenclatureReport = {
  range: DayRange;
  query: string | null;
  laboratory: string | null;
  dci: string | null;
  registrations: IndexedRegistration[];
  molecules: LaboratoryMolecule[];
  summary: LaboratorySummary[];
  stats: ReportStats;
};

/**
 * Full pipeline: date range resolution, filtering, laboratory/DCI grouping and counters.
 * The filters narrow the report exactly like the on-screen search and column dropdowns do.
 */
export function buildReport(
  dataset: NomenclatureDataset,
  startInput: string | null | undefined,
  endInput: string | null | undefined,
  filters: ReportFilters = {},
): NomenclatureReport {
  const range = resolveDayRange(dataset, startInput, endInput);
  const rows = filterRegistrationsByDate(dataset.datedRegistrations, range.startDay, range.endDay);
  const allMolecules = groupByLaboratoryAndMolecule(rows);

  const query = trimOrNull(filters.query);
  const laboratory = trimOrNull(filters.laboratory);
  const dci = trimOrNull(filters.dci);

  const molecules = filterByDci(filterByLaboratory(filterMolecules(allMolecules, query), laboratory), dci);
  const narrowed = query !== null || laboratory !== null || dci !== null;
  const registrations = narrowed ? restrictRowsToPairs(rows, molecules) : rows;
  const summary = buildLaboratorySummary(molecules);

  return {
    range,
    query,
    laboratory,
    dci,
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

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
