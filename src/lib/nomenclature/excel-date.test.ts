import { describe, expect, it } from "vitest";
import {
  dayToDate,
  toUtcDayNumber,
  excelSerialToDayNumber,
  formatFr,
  formatIso,
  parseDateText,
  toDayNumber,
  toDayNumberFromCell,
} from "./excel-date";

const iso = (value: unknown) => {
  const day = toDayNumberFromCell(value);
  return day === null ? null : formatIso(day);
};

describe("excel serial dates", () => {
  it("converts known serials to the right calendar day", () => {
    expect(formatIso(excelSerialToDayNumber(45411)!)).toBe("2024-04-29");
    expect(formatIso(excelSerialToDayNumber(38929)!)).toBe("2006-07-31");
    expect(formatIso(excelSerialToDayNumber(46201)!)).toBe("2026-06-28");
    expect(formatIso(excelSerialToDayNumber(25569)!)).toBe("1970-01-01");
  });

  it("compensates the 1900 leap year bug for early serials", () => {
    expect(formatIso(excelSerialToDayNumber(59)!)).toBe("1900-02-28");
    expect(formatIso(excelSerialToDayNumber(61)!)).toBe("1900-03-01");
  });

  it("rejects non-dates", () => {
    expect(excelSerialToDayNumber(0)).toBeNull();
    expect(excelSerialToDayNumber(Number.NaN)).toBeNull();
  });
});

describe("toDayNumberFromCell", () => {
  it("accepts what a spreadsheet reader may return", () => {
    expect(iso(new Date(Date.UTC(2025, 3, 1)))).toBe("2025-04-01");
    expect(iso(45748)).toBe("2025-04-01");
    expect(iso("2025-04-01")).toBe("2025-04-01");
    expect(iso("01/04/2025")).toBe("2025-04-01");
    expect(iso("45748")).toBe("2025-04-01");
    expect(iso({ result: 45748 })).toBe("2025-04-01");
  });

  it("returns null instead of crashing on unusable values", () => {
    expect(iso(null)).toBeNull();
    expect(iso(undefined)).toBeNull();
    expect(iso("")).toBeNull();
    expect(iso("   ")).toBeNull();
    expect(iso("00/00/2019")).toBeNull();
    expect(iso("31/02/2025")).toBeNull();
    expect(iso("à définir")).toBeNull();
    expect(iso(new Date("invalid"))).toBeNull();
  });

  it("reads dates the same way whatever the local midnight offset", () => {
    const utcMidnight = toDayNumber(new Date(Date.UTC(2025, 3, 1)));
    const shiftedForward = toDayNumber(new Date(Date.UTC(2025, 3, 1, 3)));
    const shiftedBackward = toDayNumber(new Date(Date.UTC(2025, 2, 31, 22)));
    expect(shiftedForward).toBe(utcMidnight);
    expect(shiftedBackward).toBe(utcMidnight);
  });
});

describe("formatting", () => {
  it("renders French dates", () => {
    expect(formatFr(parseDateText("2026-06-28")!)).toBe("28/06/2026");
    expect(formatFr(parseDateText("01/04/2025")!)).toBe("01/04/2025");
  });

  it("keeps the calendar day of a timestamp that carries a time", () => {
    expect(formatFr(toUtcDayNumber(new Date("2026-08-26T18:30:00Z")))).toBe("26/08/2026");
    expect(formatFr(toUtcDayNumber(new Date("2026-08-26T00:00:00Z")))).toBe("26/08/2026");
    expect(formatFr(toUtcDayNumber(new Date("2026-08-26T23:59:59Z")))).toBe("26/08/2026");
  });

  it("round-trips day numbers through Date", () => {
    const day = parseDateText("2025-12-31")!;
    expect(toDayNumber(dayToDate(day))).toBe(day);
  });
});
