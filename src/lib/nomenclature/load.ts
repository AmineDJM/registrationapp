import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describeSource, getBundledFilePath, readSource, type SourceDescriptor } from "./storage";
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
  return getBundledFilePath();
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

/** Raised when an uploaded workbook cannot be used; the message is meant for the user. */
export class InvalidSourceError extends Error {}

const ZIP_SIGNATURE = [0x50, 0x4b];

export async function readDatasetFromBuffer(buffer: Buffer): Promise<NomenclatureDataset> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types the reader against its own Buffer alias; the Node buffer is what it actually consumes.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) throw new Error(`Onglet « ${SHEET_NAME} » introuvable dans le classeur.`);
  return buildDataset(sheet);
}

export async function readDatasetFromFile(filePath = getSourceFilePath()): Promise<NomenclatureDataset> {
  return readDatasetFromBuffer(await readFile(filePath));
}

/**
 * Checks an uploaded workbook end to end *before* it is allowed to replace the live one:
 * a file that cannot produce a usable dataset is rejected, and nothing is overwritten.
 */
export async function validateSourceBuffer(
  buffer: Buffer,
  maxBytes: number,
): Promise<NomenclatureDataset> {
  if (buffer.byteLength === 0) throw new InvalidSourceError("Le fichier est vide.");
  if (buffer.byteLength > maxBytes) {
    throw new InvalidSourceError(
      `Le fichier dépasse ${Math.floor(maxBytes / 1_000_000)} Mo. Réduisez-le ou déployez-le avec le code.`,
    );
  }
  if (!ZIP_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    throw new InvalidSourceError("Ce n'est pas un fichier .xlsx (format non reconnu).");
  }

  let dataset: NomenclatureDataset;
  try {
    dataset = await readDatasetFromBuffer(buffer);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "format illisible";
    throw new InvalidSourceError(`Classeur illisible : ${detail}`);
  }

  if (dataset.totalRows === 0) throw new InvalidSourceError("Le classeur ne contient aucune ligne de données.");
  if (dataset.datedRegistrations.length === 0 || dataset.minDay === null || dataset.maxDay === null) {
    throw new InvalidSourceError(
      "Aucune ligne exploitable : laboratoire, DCI et date d'enregistrement initial sont requis.",
    );
  }
  return dataset;
}

type CacheEntry = {
  descriptor: SourceDescriptor;
  dataset: NomenclatureDataset;
  checkedAt: number;
};

/** How long a loaded dataset is trusted before the source is checked for a newer version. */
const FRESHNESS_MS = 30_000;

let cache: CacheEntry | null = null;
let inFlight: Promise<NomenclatureDataset> | null = null;

/**
 * Parses once, then serves every request from memory. The source is re-checked at most
 * every 30 s so an upload made by another server instance is picked up by itself.
 */
export function getDataset(): Promise<NomenclatureDataset> {
  if (cache && Date.now() - cache.checkedAt < FRESHNESS_MS) return Promise.resolve(cache.dataset);
  if (inFlight) return inFlight;

  inFlight = refreshDataset().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function refreshDataset(): Promise<NomenclatureDataset> {
  const descriptor = await describeSource();
  if (cache && cache.descriptor.version === descriptor.version) {
    cache = { ...cache, checkedAt: Date.now() };
    return cache.dataset;
  }

  const dataset = await readDatasetFromBuffer(await readSource(descriptor));
  cache = { descriptor, dataset, checkedAt: Date.now() };
  return dataset;
}

/** Installs a dataset that was just validated, so the upload is visible immediately. */
export function primeDatasetCache(dataset: NomenclatureDataset, descriptor: SourceDescriptor): void {
  cache = { descriptor, dataset, checkedAt: Date.now() };
}

export function invalidateDatasetCache(): void {
  cache = null;
}

/** Describes what is currently served, for the settings screen. */
export async function getSourceState(): Promise<{ descriptor: SourceDescriptor; dataset: NomenclatureDataset }> {
  const dataset = await getDataset();
  return { descriptor: cache?.descriptor ?? (await describeSource()), dataset };
}
