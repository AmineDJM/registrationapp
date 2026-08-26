import type { DayNumber } from "./types";

const MS_PER_DAY = 86_400_000;
/** Excel serial 25569 is 1970-01-01 in the 1900 date system. */
const EXCEL_EPOCH_OFFSET = 25_569;
/** Serial 61 = 1900-03-01; below it Excel's phantom 29/02/1900 shifts everything by one day. */
const EXCEL_LEAP_BUG_LIMIT = 61;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FR_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/** Converts a JS Date to a whole-day number, immune to the runtime timezone. */
export function toDayNumber(date: Date): DayNumber {
  return Math.round(date.getTime() / MS_PER_DAY);
}

/**
 * UTC calendar day of a timestamp. Unlike `toDayNumber` it never rounds up, so it
 * suits "now" (which carries a time) rather than a parsed spreadsheet cell.
 */
export function toUtcDayNumber(date: Date): DayNumber {
  return Math.floor(date.getTime() / MS_PER_DAY);
}

/** Rebuilds a UTC-midnight Date from a day number. */
export function dayToDate(day: DayNumber): Date {
  return new Date(day * MS_PER_DAY);
}

export function excelSerialToDayNumber(serial: number): DayNumber | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const corrected = serial < EXCEL_LEAP_BUG_LIMIT ? serial + 1 : serial;
  return Math.round(corrected - EXCEL_EPOCH_OFFSET);
}

/** Accepts whatever a spreadsheet reader hands over: Date, Excel serial, or textual date. */
export function toDayNumberFromCell(value: unknown): DayNumber | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toDayNumber(value);
  }
  if (typeof value === "number") return excelSerialToDayNumber(value);
  if (typeof value === "string") return parseDateText(value);
  if (typeof value === "object" && "result" in (value as Record<string, unknown>)) {
    return toDayNumberFromCell((value as { result: unknown }).result);
  }
  return null;
}

/** Parses `YYYY-MM-DD`, `DD/MM/YYYY` and bare Excel serials written as text. */
export function parseDateText(text: string): DayNumber | null {
  const raw = text.trim();
  if (!raw) return null;

  const iso = ISO_DATE.exec(raw);
  if (iso) return buildDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const fr = FR_DATE.exec(raw);
  if (fr) return buildDay(Number(fr[3]), Number(fr[2]), Number(fr[1]));

  if (/^\d+([.,]\d+)?$/.test(raw)) return excelSerialToDayNumber(Number(raw.replace(",", ".")));

  return null;
}

function buildDay(year: number, month: number, day: number): DayNumber | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  // Rejects impossible calendar dates such as 31/02.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return toDayNumber(date);
}

/** `YYYY-MM-DD`, the wire format of every API. */
export function formatIso(day: DayNumber): string {
  return dayToDate(day).toISOString().slice(0, 10);
}

/** `DD/MM/YYYY`, the only format shown to users. */
export function formatFr(day: DayNumber): string {
  const date = dayToDate(day);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}
