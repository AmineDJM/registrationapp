import { formatIso, toDayNumber } from "./excel-date";
import type { NomenclatureReport, ReportStats } from "./report";
import type { NomenclatureDataset } from "./types";

export type MetaResponse = {
  minDate: string;
  maxDate: string;
  totalRows: number;
  sheet: string;
};

export type MoleculeRow = {
  laboratory: string;
  dci: string;
  firstRegistrationDate: string;
  registrationsCount: number;
  brands: string[];
};

export type LaboratoryRow = {
  laboratory: string;
  moleculesCount: number;
};

export type ReportResponse = {
  range: { start: string; end: string };
  stats: ReportStats;
  laboratories: LaboratoryRow[];
  molecules: MoleculeRow[];
};

export function serializeMeta(dataset: NomenclatureDataset): MetaResponse {
  if (dataset.minDay === null || dataset.maxDay === null) {
    throw new Error("Aucune date d'enregistrement exploitable dans le fichier source.");
  }
  return {
    minDate: formatIso(dataset.minDay),
    maxDate: formatIso(dataset.maxDay),
    totalRows: dataset.totalRows,
    sheet: dataset.sourceSheet,
  };
}

export function serializeReport(report: NomenclatureReport): ReportResponse {
  return {
    range: { start: formatIso(report.range.startDay), end: formatIso(report.range.endDay) },
    stats: report.stats,
    laboratories: report.summary.map((line) => ({
      laboratory: line.laboratory,
      moleculesCount: line.moleculesCount,
    })),
    molecules: report.molecules.map((molecule) => ({
      laboratory: molecule.laboratory,
      dci: molecule.dci,
      firstRegistrationDate: formatIso(toDayNumber(molecule.firstRegistrationDate)),
      registrationsCount: molecule.registrationsCount,
      brands: molecule.brands,
    })),
  };
}
