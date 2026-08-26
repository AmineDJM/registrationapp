import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { dayToDate, toDayNumberFromCell } from "./excel-date";
import { normalizeDci, normalizeLabName, normalizeText, toComparisonKey } from "./normalize";
import type { IndexedRegistration, NomenclatureDataset } from "./types";

const SHEET_NAME = "Nomenclature Juin 2026";
const HEADER_SEARCH_DEPTH = 40;

type FieldName =
  | "registrationNumber"
  | "dci"
  | "brandName"
  | "form"
  | "dosage"
  | "packaging"
  | "laboratory"
  | "laboratoryCountry"
  | "initialRegistrationDate"
  | "finalRegistrationDate"
  | "type"
  | "status";

/** Header label expected in the source sheet + the column letter documented for it. */
const FIELD_SPECS: { field: FieldName; header: string; fallbackColumn: string; required: boolean }[] = [
  { field: "registrationNumber", header: "N ENREGISTREMENT", fallbackColumn: "B", required: false },
  { field: "dci", header: "DENOMINATION COMMUNE INTERNATIONALE", fallbackColumn: "D", required: true },
  { field: "brandName", header: "NOM DE MARQUE", fallbackColumn: "E", required: false },
  { field: "form", header: "FORME", fallbackColumn: "F", required: false },
  { field: "dosage", header: "DOSAGE", fallbackColumn: "G", required: false },
  { field: "packaging", header: "CONDITIONNEMENT", fallbackColumn: "H", required: false },
  { field: "laboratory", header: "LABORATOIRES DETENTEUR DE LA DECISION D ENREGISTREMENT", fallbackColumn: "M", required: true },
  { field: "laboratoryCountry", header: "PAYS DU LABORATOIRE DETENTEUR DE LA DECISION D ENREGISTREMENT", fallbackColumn: "N", required: false },
  { field: "initialRegistrationDate", header: "DATE D ENREGISTREMENT INITIAL", fallbackColumn: "O", required: true },
  { field: "finalRegistrationDate", header: "DATE D ENREGISTREMENT FINAL", fallbackColumn: "P", required: false },
  { field: "type", header: "TYPE", fallbackColumn: "Q", required: false },
  { field: "status", header: "STATUT", fallbackColumn: "R", required: false },
];

export function getSourceFilePath(): string {
  return process.env.NOMENCLATURE_FILE ?? path.join(process.cwd(), "data", "nomenclature.xlsx");
}

/** Uppercase, accent- and punctuation-free header used to match columns whatever the typography. */
function headerKey(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  const needles = [headerKey("DENOMINATION COMMUNE INTERNATIONALE"), headerKey("NOM DE MARQUE")];
  const depth = Math.min(sheet.rowCount, HEADER_SEARCH_DEPTH);
  for (let rowNumber = 1; rowNumber <= depth; rowNumber += 1) {
    const keys = new Set<string>();
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => keys.add(headerKey(cell.value)));
    if (needles.every((needle) => keys.has(needle))) return rowNumber;
  }
  throw new Error(`En-têtes introuvables dans les ${depth} premières lignes de « ${sheet.name} ».`);
}

function mapColumns(sheet: ExcelJS.Worksheet, headerRow: number): Record<FieldName, number> {
  const byHeader = new Map<string, number>();
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const key = headerKey(cell.value);
    if (key && !byHeader.has(key)) byHeader.set(key, columnNumber);
  });

  const columns = {} as Record<FieldName, number>;
  const missing: string[] = [];
  for (const spec of FIELD_SPECS) {
    const found = byHeader.get(headerKey(spec.header));
    const column = found ?? columnLetterToNumber(spec.fallbackColumn);
    if (found === undefined && spec.required) missing.push(spec.header);
    columns[spec.field] = column;
  }
  if (missing.length > 0) throw new Error(`Colonnes obligatoires introuvables : ${missing.join(", ")}.`);
  return columns;
}

function columnLetterToNumber(letter: string): number {
  return [...letter].reduce((total, char) => total * 26 + (char.charCodeAt(0) - 64), 0);
}

export function buildDataset(sheet: ExcelJS.Worksheet): NomenclatureDataset {
  const headerRow = findHeaderRow(sheet);
  const columns = mapColumns(sheet, headerRow);

  const registrations: IndexedRegistration[] = [];
  const datedRegistrations: IndexedRegistration[] = [];
  const skipped = { missingInitialDate: 0, missingLaboratory: 0, missingDci: 0 };
  let minDay: number | null = null;
  let maxDay: number | null = null;
  let totalRows = 0;

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const text = (field: FieldName) => normalizeText(row.getCell(columns[field]).value);
    const laboratory = normalizeLabName(row.getCell(columns.laboratory).value);
    const dci = normalizeDci(row.getCell(columns.dci).value);
    const registrationNumber = text("registrationNumber");
    if (!laboratory && !dci && !registrationNumber) continue; // trailing/blank spacer row

    totalRows += 1;
    const initialDay = toDayNumberFromCell(row.getCell(columns.initialRegistrationDate).value);
    const finalDay = toDayNumberFromCell(row.getCell(columns.finalRegistrationDate).value);

    if (!laboratory) skipped.missingLaboratory += 1;
    if (!dci) skipped.missingDci += 1;
    if (initialDay === null) skipped.missingInitialDate += 1;

    const registration: IndexedRegistration = {
      registrationNumber,
      dci: dci ?? "",
      brandName: text("brandName"),
      form: text("form"),
      dosage: text("dosage"),
      packaging: text("packaging"),
      laboratory: laboratory ?? "",
      laboratoryCountry: text("laboratoryCountry"),
      initialRegistrationDate: initialDay === null ? null : dayToDate(initialDay),
      finalRegistrationDate: finalDay === null ? null : dayToDate(finalDay),
      type: text("type"),
      status: text("status"),
      laboratoryKey: laboratory ? toComparisonKey(laboratory) : "",
      dciKey: dci ? toComparisonKey(dci) : "",
      initialDay,
    };
    registrations.push(registration);

    if (!laboratory || !dci || initialDay === null) continue;
    datedRegistrations.push(registration);
    if (minDay === null || initialDay < minDay) minDay = initialDay;
    if (maxDay === null || initialDay > maxDay) maxDay = initialDay;
  }

  return {
    registrations,
    datedRegistrations,
    minDay,
    maxDay,
    totalRows,
    skipped,
    sourceSheet: sheet.name,
    loadedAt: new Date(),
  };
}

export async function readDatasetFromFile(filePath = getSourceFilePath()): Promise<NomenclatureDataset> {
  const buffer = await readFile(filePath);
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types the reader against its own Buffer alias; the Node buffer is what it actually consumes.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) throw new Error(`Onglet « ${SHEET_NAME} » introuvable dans ${path.basename(filePath)}.`);
  return buildDataset(sheet);
}

let cache: Promise<NomenclatureDataset> | null = null;

/** Parses once, then serves every request from memory. */
export function getDataset(): Promise<NomenclatureDataset> {
  if (!cache) {
    cache = readDatasetFromFile().catch((error: unknown) => {
      cache = null; // a failed load must not poison the cache
      throw error;
    });
  }
  return cache;
}
