import { describe, expect, it } from "vitest";
import { buildLaboratorySummary, countUniqueMolecules, groupByLaboratoryAndMolecule } from "./aggregate";
import { formatIso, parseDateText } from "./excel-date";
import { DateRangeError, filterRegistrationsByDate, resolveDayRange } from "./filter";
import { normalizeLabName, toComparisonKey } from "./normalize";
import { buildReport } from "./report";
import type { IndexedRegistration, NomenclatureDataset } from "./types";

const day = (value: string) => parseDateText(value)!;

function registration(overrides: Partial<IndexedRegistration> & { laboratory: string; dci: string; date: string | null }): IndexedRegistration {
  const laboratory = normalizeLabName(overrides.laboratory) ?? "";
  const dci = normalizeLabName(overrides.dci) ?? "";
  const initialDay = overrides.date === null ? null : day(overrides.date);
  return {
    registrationNumber: overrides.registrationNumber ?? null,
    dci,
    brandName: overrides.brandName ?? null,
    form: null,
    dosage: null,
    packaging: null,
    laboratory,
    laboratoryCountry: null,
    initialRegistrationDate: null,
    finalRegistrationDate: null,
    type: null,
    status: null,
    laboratoryKey: toComparisonKey(laboratory),
    dciKey: toComparisonKey(dci),
    initialDay,
  };
}

const rows: IndexedRegistration[] = [
  registration({ laboratory: "BIOPHARM", dci: "PEMBROLIZUMAB", date: "2025-06-12", brandName: "KEYPHARM 50" }),
  registration({ laboratory: "BIOPHARM", dci: "Pembrolizumab", date: "2025-09-18", brandName: "KEYPHARM 100" }),
  registration({ laboratory: "BIOPHARM ", dci: "PEMBROLIZUMAB", date: "2026-01-05", brandName: "KEYPHARM 50" }),
  registration({ laboratory: "BIOPHARM", dci: "PEMBROLIZUMAB", date: "2025-04-01", brandName: null }),
  registration({ laboratory: "BIOPHARM", dci: "APIXABAN", date: "2025-07-02", brandName: "APIXA" }),
  registration({ laboratory: "ROCHE PHARMA  SCHWEIZ AG", dci: "ATEZOLIZUMAB", date: "2025-05-05" }),
  registration({ laboratory: "ROCHE PHARMA SCHWEIZ AG", dci: "ATEZOLIZUMAB", date: "2025-05-06" }),
  registration({ laboratory: "CNX THERAPEUTICS France", dci: "MIDAZOLAM", date: "2025-08-08" }),
  registration({ laboratory: "CNX THERAPEUTICS FRANCE", dci: "Midazolam ", date: "2025-08-09" }),
  registration({ laboratory: "HORS PERIODE", dci: "IBUPROFENE", date: "2025-03-31" }),
  registration({ laboratory: "HORS PERIODE", dci: "PARACETAMOL", date: "2026-05-01" }),
  registration({ laboratory: "SANS DATE", dci: "METFORMINE", date: null }),
];

const period = { start: "2025-04-01", end: "2026-04-30" };
const filtered = filterRegistrationsByDate(rows, day(period.start), day(period.end));

describe("filterRegistrationsByDate", () => {
  it("includes both bounds and excludes what falls outside", () => {
    const labs = filtered.map((row) => row.laboratory);
    expect(labs).toContain("BIOPHARM");
    expect(labs).not.toContain("HORS PERIODE");
    expect(filtered.some((row) => row.initialDay === day("2025-04-01"))).toBe(true);
  });

  it("keeps a registration landing exactly on the end bound", () => {
    const onBound = [registration({ laboratory: "L", dci: "D", date: "2026-04-30" })];
    expect(filterRegistrationsByDate(onBound, day(period.start), day(period.end))).toHaveLength(1);
  });

  it("ignores rows without an initial registration date", () => {
    expect(filtered.some((row) => row.laboratory === "SANS DATE")).toBe(false);
  });

  it("ignores rows without laboratory or DCI", () => {
    const invalid = [
      registration({ laboratory: "", dci: "PARACETAMOL", date: "2025-06-01" }),
      registration({ laboratory: "LABO", dci: "", date: "2025-06-01" }),
    ];
    expect(filterRegistrationsByDate(invalid, day(period.start), day(period.end))).toHaveLength(0);
  });
});

describe("groupByLaboratoryAndMolecule", () => {
  const molecules = groupByLaboratoryAndMolecule(filtered);

  it("deduplicates a DCI registered several times by the same laboratory", () => {
    const pembro = molecules.filter((molecule) => molecule.dci.toUpperCase() === "PEMBROLIZUMAB");
    expect(pembro).toHaveLength(1);
    expect(pembro[0].laboratory).toBe("BIOPHARM");
    expect(pembro[0].registrationsCount).toBe(4);
  });

  it("keeps the earliest date inside the period", () => {
    const pembro = molecules.find((molecule) => molecule.dci.toUpperCase() === "PEMBROLIZUMAB")!;
    expect(formatIso(Math.round(pembro.firstRegistrationDate.getTime() / 86_400_000))).toBe("2025-04-01");
  });

  it("lists distinct brands only", () => {
    const pembro = molecules.find((molecule) => molecule.dci.toUpperCase() === "PEMBROLIZUMAB")!;
    expect(pembro.brands).toEqual(["KEYPHARM 50", "KEYPHARM 100"]);
  });

  it("merges typography variants of the same laboratory", () => {
    const roche = molecules.filter((molecule) => molecule.laboratory.startsWith("ROCHE"));
    expect(roche).toHaveLength(1);
    expect(roche[0].registrationsCount).toBe(2);
  });

  it("merges case variants of laboratories and DCI", () => {
    const cnx = molecules.filter((molecule) => molecule.laboratory.toUpperCase().startsWith("CNX"));
    expect(cnx).toHaveLength(1);
    expect(cnx[0].registrationsCount).toBe(2);
  });

  it("does not merge different companies sharing a prefix", () => {
    const distinct = groupByLaboratoryAndMolecule([
      registration({ laboratory: "PHARMA ALPHA", dci: "X", date: "2025-05-01" }),
      registration({ laboratory: "PHARMA ALPHA INDUSTRIE", dci: "X", date: "2025-05-01" }),
    ]);
    expect(distinct).toHaveLength(2);
  });

  it("sorts by laboratory then DCI", () => {
    const keys = molecules.map((molecule) => `${molecule.laboratory}|${molecule.dci}`);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b, "fr")));
  });
});

describe("buildLaboratorySummary", () => {
  const summary = buildLaboratorySummary(groupByLaboratoryAndMolecule(filtered));

  it("counts unique molecules per laboratory, biggest first", () => {
    expect(summary[0]).toEqual({ laboratory: "BIOPHARM", moleculesCount: 2 });
    expect(summary.map((line) => line.moleculesCount)).toEqual([...summary.map((line) => line.moleculesCount)].sort((a, b) => b - a));
  });

  it("breaks ties alphabetically", () => {
    const ties = buildLaboratorySummary(
      groupByLaboratoryAndMolecule([
        registration({ laboratory: "ZETA", dci: "A", date: "2025-05-01" }),
        registration({ laboratory: "ALPHA", dci: "A", date: "2025-05-01" }),
      ]),
    );
    expect(ties.map((line) => line.laboratory)).toEqual(["ALPHA", "ZETA"]);
  });

  it("counts distinct DCI across laboratories", () => {
    expect(countUniqueMolecules(groupByLaboratoryAndMolecule(filtered))).toBe(4);
  });
});

describe("resolveDayRange and buildReport", () => {
  const dataset: NomenclatureDataset = {
    registrations: rows,
    datedRegistrations: rows.filter((row) => row.initialDay !== null),
    minDay: day("2025-03-31"),
    maxDay: day("2026-05-01"),
    totalRows: rows.length,
    skipped: { missingInitialDate: 1, missingLaboratory: 0, missingDci: 0 },
    sourceSheet: "test",
    loadedAt: new Date(0),
  };

  it("falls back to the newest date in the file when no end date is given", () => {
    const range = resolveDayRange(dataset, "2025-04-01", null);
    expect(formatIso(range.endDay)).toBe("2026-05-01");
  });

  it("falls back to the oldest date in the file when no start date is given", () => {
    const range = resolveDayRange(dataset, "", undefined);
    expect(formatIso(range.startDay)).toBe("2025-03-31");
  });

  it("rejects an inverted period with the expected message", () => {
    expect(() => resolveDayRange(dataset, "2026-01-01", "2025-01-01")).toThrow(DateRangeError);
    expect(() => resolveDayRange(dataset, "2026-01-01", "2025-01-01")).toThrow(
      "La date de début doit être antérieure à la date de fin.",
    );
  });

  it("rejects an unparsable date", () => {
    expect(() => resolveDayRange(dataset, "hier", null)).toThrow(DateRangeError);
  });

  it("computes consistent statistics", () => {
    const report = buildReport(dataset, period.start, period.end);
    expect(report.stats).toEqual({
      laboratories: 3,
      uniqueMolecules: 4,
      laboratoryMolecules: 4,
      registrations: 9,
    });
  });

  it("narrows the report with the search query, laboratory or molecule", () => {
    const search = (query: string) => buildReport(dataset, period.start, period.end, { query });
    expect(search("biopharm").stats.laboratoryMolecules).toBe(2);
    expect(search("midazolam").stats).toMatchObject({
      laboratories: 1,
      laboratoryMolecules: 1,
      registrations: 2,
    });
    expect(search("keypharm").stats.laboratoryMolecules).toBe(1);
    expect(search("  ").stats.laboratoryMolecules).toBe(4);
  });

  it("narrows the report with the laboratory dropdown", () => {
    const report = buildReport(dataset, period.start, period.end, { laboratory: "BIOPHARM" });
    expect(report.stats).toMatchObject({ laboratories: 1, laboratoryMolecules: 2, registrations: 5 });
    expect(report.molecules.every((molecule) => molecule.laboratory === "BIOPHARM")).toBe(true);
  });

  it("matches the laboratory whatever its typography", () => {
    const report = buildReport(dataset, period.start, period.end, {
      laboratory: "roche pharma schweiz ag",
    });
    expect(report.stats.laboratoryMolecules).toBe(1);
    expect(report.stats.registrations).toBe(2);
  });

  it("narrows the report with the DCI dropdown", () => {
    const report = buildReport(dataset, period.start, period.end, { dci: "PEMBROLIZUMAB" });
    expect(report.stats).toMatchObject({ laboratories: 1, laboratoryMolecules: 1, registrations: 4 });
  });

  it("combines both dropdowns", () => {
    expect(
      buildReport(dataset, period.start, period.end, { laboratory: "BIOPHARM", dci: "APIXABAN" }).stats,
    ).toMatchObject({ laboratories: 1, laboratoryMolecules: 1, registrations: 1 });
    expect(
      buildReport(dataset, period.start, period.end, { laboratory: "BIOPHARM", dci: "MIDAZOLAM" }).stats
        .laboratoryMolecules,
    ).toBe(0);
  });

  it("keeps the filters on the report so the export can label them", () => {
    const report = buildReport(dataset, period.start, period.end, {
      query: " apix ",
      laboratory: " BIOPHARM ",
      dci: null,
    });
    expect(report.query).toBe("apix");
    expect(report.laboratory).toBe("BIOPHARM");
    expect(report.dci).toBeNull();
  });

  it("returns an empty report instead of failing when nothing matches", () => {
    const empty = buildReport(dataset, "2025-04-02", "2025-04-03");
    expect(empty.stats.registrations).toBe(0);
    expect(empty.molecules).toEqual([]);
    expect(empty.summary).toEqual([]);
  });
});
