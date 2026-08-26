import { parseDateText } from "./excel-date";
import type { DayNumber, DayRange, IndexedRegistration, NomenclatureDataset } from "./types";

export class DateRangeError extends Error {}

/**
 * Keeps the rows whose *initial* registration date falls inside the period.
 * Both bounds are inclusive; rows without a usable date, laboratory or DCI are never returned.
 */
export function filterRegistrationsByDate(
  rows: IndexedRegistration[],
  startDay: DayNumber,
  endDay: DayNumber,
): IndexedRegistration[] {
  return rows.filter(
    (row) =>
      row.initialDay !== null &&
      row.initialDay >= startDay &&
      row.initialDay <= endDay &&
      row.laboratory !== "" &&
      row.dci !== "",
  );
}

/**
 * Turns user input into a day range.
 * An empty end date falls back to the latest date found in the source file.
 */
export function resolveDayRange(
  dataset: NomenclatureDataset,
  startInput: string | null | undefined,
  endInput: string | null | undefined,
): DayRange {
  if (dataset.minDay === null || dataset.maxDay === null) {
    throw new DateRangeError("Aucune date d'enregistrement exploitable dans le fichier source.");
  }

  const startDay = startInput ? requireDay(startInput, "La date de début est invalide.") : dataset.minDay;
  const endDay = endInput ? requireDay(endInput, "La date de fin est invalide.") : dataset.maxDay;

  if (startDay > endDay) {
    throw new DateRangeError("La date de début doit être antérieure à la date de fin.");
  }
  return { startDay, endDay };
}

function requireDay(input: string, message: string): DayNumber {
  const day = parseDateText(input);
  if (day === null) throw new DateRangeError(message);
  return day;
}
