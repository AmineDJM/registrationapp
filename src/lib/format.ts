import { formatFr, parseDateText } from "./nomenclature/excel-date";

const MS_PER_DAY = 86_400_000;

/** `2025-04-01` → `01/04/2025`; returns the input untouched if it is not a date. */
export function isoToFrench(iso: string): string {
  const day = parseDateText(iso);
  return day === null ? iso : formatFr(day);
}

const numberFormatter = new Intl.NumberFormat("fr-FR");

export function formatCount(value: number): string {
  return numberFormatter.format(value);
}

export function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(value)} ${value > 1 ? plural : singular}`;
}

/** Shifts an ISO day by whole months, clamping to the end of the target month. */
export function addMonthsIso(iso: string, months: number): string {
  const day = parseDateText(iso);
  if (day === null) return iso;
  const date = new Date(day * MS_PER_DAY);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

export function clampIso(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}
