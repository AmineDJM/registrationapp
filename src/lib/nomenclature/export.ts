import ExcelJS from "exceljs";
import { formatFr, formatIso, toUtcDayNumber } from "./excel-date";
import type { NomenclatureReport } from "./report";

const DATE_FORMAT = "dd/mm/yyyy";
const HEADER_FILL = "FFF1F5F9";
const BORDER_COLOR = "FFE2E8F0";

type ColumnSpec = { header: string; width: number; isDate?: boolean };

/** `nomenclature_laboratoires_2025-04-01_2026-04-30.xlsx` */
export function buildExportFileName(report: NomenclatureReport): string {
  return `nomenclature_laboratoires_${formatIso(report.range.startDay)}_${formatIso(report.range.endDay)}.xlsx`;
}

export async function buildWorkbookBuffer(report: NomenclatureReport, generatedAt: Date): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nomenclature pharmaceutique";
  workbook.created = generatedAt;

  addSummarySheet(workbook, report, generatedAt);
  addMoleculesSheet(workbook, report);
  addDetailSheet(workbook, report);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: NomenclatureReport, generatedAt: Date): void {
  const sheet = workbook.addWorksheet("Synthèse");
  const period = `${formatFr(report.range.startDay)} → ${formatFr(report.range.endDay)}`;
  const meta: [string, string | number][] = [
    ["Période analysée", period],
    ["Date de génération", formatFr(toUtcDayNumber(generatedAt))],
    ["Nombre de laboratoires", report.stats.laboratories],
    ["Nombre de couples laboratoire / DCI", report.stats.laboratoryMolecules],
    ["Nombre de molécules (DCI) uniques", report.stats.uniqueMolecules],
    ["Nombre d'enregistrements", report.stats.registrations],
  ];
  if (report.query) meta.push(["Filtre appliqué", report.query]);

  for (const [label, value] of meta) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  sheet.addRow([]);

  const headerRowNumber = sheet.rowCount + 1;
  const columns: ColumnSpec[] = [
    { header: "Laboratoire", width: 52 },
    { header: "Nombre de molécules", width: 22 },
  ];
  styleHeader(sheet.addRow(columns.map((column) => column.header)));

  for (const line of report.summary) {
    const row = sheet.addRow([line.laboratory, line.moleculesCount]);
    styleBody(row, columns);
  }

  applyLayout(sheet, columns, headerRowNumber);
}

function addMoleculesSheet(workbook: ExcelJS.Workbook, report: NomenclatureReport): void {
  const sheet = workbook.addWorksheet("Molécules par laboratoire");
  const columns: ColumnSpec[] = [
    { header: "Laboratoire", width: 46 },
    { header: "DCI / Molécule", width: 42 },
    { header: "Première date d'enregistrement", width: 28, isDate: true },
    { header: "Nombre d'enregistrements", width: 24 },
    { header: "Marque(s)", width: 52 },
  ];
  styleHeader(sheet.addRow(columns.map((column) => column.header)));

  for (const molecule of report.molecules) {
    const row = sheet.addRow([
      molecule.laboratory,
      molecule.dci,
      molecule.firstRegistrationDate,
      molecule.registrationsCount,
      molecule.brands.join(", "),
    ]);
    styleBody(row, columns);
  }

  applyLayout(sheet, columns, 1);
}

/** Source rows behind the aggregation — useful columns only, for verification. */
function addDetailSheet(workbook: ExcelJS.Workbook, report: NomenclatureReport): void {
  const sheet = workbook.addWorksheet("Détail");
  const columns: ColumnSpec[] = [
    { header: "N° Enregistrement", width: 24 },
    { header: "Laboratoire", width: 42 },
    { header: "Pays", width: 18 },
    { header: "DCI", width: 38 },
    { header: "Nom de marque", width: 28 },
    { header: "Forme", width: 28 },
    { header: "Dosage", width: 18 },
    { header: "Conditionnement", width: 18 },
    { header: "Date d'enregistrement initial", width: 26, isDate: true },
    { header: "Date d'enregistrement final", width: 26, isDate: true },
    { header: "Type", width: 10 },
    { header: "Statut", width: 10 },
  ];
  styleHeader(sheet.addRow(columns.map((column) => column.header)));

  for (const registration of report.registrations) {
    const row = sheet.addRow([
      registration.registrationNumber,
      registration.laboratory,
      registration.laboratoryCountry,
      registration.dci,
      registration.brandName,
      registration.form,
      registration.dosage,
      registration.packaging,
      registration.initialRegistrationDate,
      registration.finalRegistrationDate,
      registration.type,
      registration.status,
    ]);
    styleBody(row, columns);
  }

  applyLayout(sheet, columns, 1);
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.alignment = { vertical: "middle" };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: BORDER_COLOR } } };
  });
}

function styleBody(row: ExcelJS.Row, columns: ColumnSpec[]): void {
  columns.forEach((column, index) => {
    if (column.isDate) row.getCell(index + 1).numFmt = DATE_FORMAT;
  });
}

function applyLayout(sheet: ExcelJS.Worksheet, columns: ColumnSpec[], headerRowNumber: number): void {
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: Math.max(headerRowNumber, sheet.rowCount), column: columns.length },
  };
}
