import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { formatIso, toDayNumber } from "./excel-date";
import { buildExportFileName, buildWorkbookBuffer } from "./export";
import { InvalidSourceError, readDatasetFromFile, validateSourceBuffer } from "./load";
import { buildReport } from "./report";
import type { NomenclatureDataset } from "./types";

const PERIOD = { start: "2025-04-01", end: "2026-04-30" };

let dataset: NomenclatureDataset;

beforeAll(async () => {
  dataset = await readDatasetFromFile();
}, 60_000);

describe("real nomenclature file", () => {
  it("parses every data row of the June 2026 sheet", () => {
    expect(dataset.sourceSheet).toBe("Nomenclature Juin 2026");
    expect(dataset.totalRows).toBe(5381);
  });

  it("exposes the date bounds computed from the data", () => {
    expect(formatIso(dataset.maxDay!)).toBe("2026-06-28");
    expect(formatIso(dataset.minDay!)).toBe("1996-02-14");
  });

  it("counts the expected number of laboratories and DCI", () => {
    const laboratories = new Set(dataset.registrations.map((row) => row.laboratoryKey));
    const dci = new Set(dataset.registrations.map((row) => row.dciKey));
    expect(laboratories.size).toBeGreaterThanOrEqual(500);
    expect(laboratories.size).toBeLessThanOrEqual(560);
    expect(dci.size).toBeGreaterThanOrEqual(1350);
    expect(dci.size).toBeLessThanOrEqual(1450);
  });

  it("skips only the rows whose initial date is unusable", () => {
    expect(dataset.skipped.missingInitialDate).toBe(19);
    expect(dataset.skipped.missingLaboratory).toBe(0);
    expect(dataset.skipped.missingDci).toBe(0);
    expect(dataset.datedRegistrations).toHaveLength(dataset.totalRows - 19);
  });

  it("matches the reference figures for 01/04/2025 → 30/04/2026", () => {
    const report = buildReport(dataset, PERIOD.start, PERIOD.end);
    expect(report.stats.registrations).toBe(254);
    expect(report.stats.laboratories).toBe(89);
    expect(report.stats.laboratoryMolecules).toBe(186);
    expect(report.summary[0].laboratory).toBe("BIOPHARM");
  });

  it("uses the newest date of the file when the end date is left empty", () => {
    const report = buildReport(dataset, PERIOD.start, null);
    expect(formatIso(report.range.endDay)).toBe("2026-06-28");
    expect(report.stats.registrations).toBeGreaterThan(254);
  });
});

describe("workbook export", () => {
  it("builds the three sheets with real date cells", async () => {
    const report = buildReport(dataset, PERIOD.start, PERIOD.end);
    expect(buildExportFileName(report)).toBe("nomenclature_laboratoires_2025-04-01_2026-04-30.xlsx");

    const buffer = await buildWorkbookBuffer(report, new Date(Date.UTC(2026, 7, 26, 18, 30)));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Synthèse",
      "Molécules par laboratoire",
      "Détail",
    ]);

    const summary = workbook.getWorksheet("Synthèse")!;
    expect(summary.getCell("A1").value).toBe("Période analysée");
    expect(summary.getCell("B1").value).toBe("01/04/2025 → 30/04/2026");
    expect(summary.getCell("B2").value).toBe("26/08/2026");
    expect(summary.rowCount).toBe(8 + report.summary.length);

    const molecules = workbook.getWorksheet("Molécules par laboratoire")!;
    expect(molecules.rowCount).toBe(1 + report.molecules.length);
    expect(molecules.getRow(1).font?.bold).toBe(true);
    expect(molecules.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(molecules.autoFilter).toBeTruthy();
    const firstDate = molecules.getCell("C2");
    expect(firstDate.value).toBeInstanceOf(Date);
    expect(firstDate.numFmt).toBe("dd/mm/yyyy");
    expect(toDayNumber(firstDate.value as Date)).toBe(
      toDayNumber(report.molecules[0].firstRegistrationDate),
    );

    const detail = workbook.getWorksheet("Détail")!;
    expect(detail.rowCount).toBe(1 + report.registrations.length);
    expect(detail.columnCount).toBe(12);
  }, 60_000);
});

describe("validateSourceBuffer", () => {
  const MAX = 4_000_000;
  const sourcePath = path.join(process.cwd(), "data", "nomenclature.xlsx");

  it("accepts the real workbook", async () => {
    const buffer = await readFile(sourcePath);
    const validated = await validateSourceBuffer(buffer, MAX);
    expect(validated.totalRows).toBe(5381);
    expect(formatIso(validated.maxDay!)).toBe("2026-06-28");
  }, 60_000);

  it("refuses an empty file", async () => {
    await expect(validateSourceBuffer(Buffer.alloc(0), MAX)).rejects.toBeInstanceOf(InvalidSourceError);
  });

  it("refuses a file over the size limit", async () => {
    await expect(validateSourceBuffer(Buffer.alloc(MAX + 1), MAX)).rejects.toThrow(/dépasse/);
  });

  it("refuses anything that is not a .xlsx", async () => {
    await expect(validateSourceBuffer(Buffer.from("du texte, pas un classeur"), MAX)).rejects.toThrow(
      /n'est pas un fichier .xlsx/,
    );
  });

  it("refuses a truncated workbook without touching anything", async () => {
    const truncated = (await readFile(sourcePath)).subarray(0, 40_000);
    await expect(validateSourceBuffer(truncated, MAX)).rejects.toThrow(/Classeur illisible/);
  }, 60_000);
});
