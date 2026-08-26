"use client";

import { useState } from "react";
import type { MetaResponse } from "@/lib/nomenclature/api";
import { addMonthsIso, clampIso, formatCount, isoToFrench } from "@/lib/format";

type Props = {
  meta: MetaResponse;
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  invalidRange: boolean;
  loading: boolean;
  exportParams: string;
  exportDisabled: boolean;
};

const PRESETS = [
  { label: "6 mois", months: 6 },
  { label: "12 mois", months: 12 },
  { label: "24 mois", months: 24 },
] as const;

export function PeriodForm({
  meta,
  start,
  end,
  onStartChange,
  onEndChange,
  invalidRange,
  loading,
  exportParams,
  exportDisabled,
}: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const applyPreset = (months: number) => {
    onEndChange(meta.maxDate);
    onStartChange(clampIso(addMonthsIso(meta.maxDate, -months), meta.minDate, meta.maxDate));
  };

  const applyFullRange = () => {
    onStartChange(meta.minDate);
    onEndChange(meta.maxDate);
  };

  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch(`/api/nomenclature/export?${exportParams}`);
      if (!response.ok) throw new Error("L'export a échoué. Réessayez.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(response.headers.get("Content-Disposition")) ?? "nomenclature.xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "L'export a échoué. Réessayez.");
    } finally {
      setExporting(false);
    }
  };

  const isFullRange = start === meta.minDate && end === meta.maxDate;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow)] sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de début" htmlFor="start">
          <input
            id="start"
            type="date"
            value={start}
            min={meta.minDate}
            max={meta.maxDate}
            onChange={(event) => onStartChange(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Date de fin" htmlFor="end">
          <input
            id="end"
            type="date"
            value={end}
            min={meta.minDate}
            max={meta.maxDate}
            onChange={(event) => onEndChange(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset.months)}
            className={chipClass}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={applyFullRange}
          className={chipClass}
          aria-pressed={isFullRange}
        >
          Tout l&apos;historique
        </button>
      </div>

      <p className="mt-3 text-[13px] text-text-muted">
        Période analysée :{" "}
        <span className="font-medium tabular-nums text-text">
          {isoToFrench(start || meta.minDate)} → {isoToFrench(end || meta.maxDate)}
        </span>
      </p>
      <p className="mt-1 text-xs text-text-subtle">
        Données disponibles du {isoToFrench(meta.minDate)} au {isoToFrench(meta.maxDate)} ·{" "}
        {formatCount(meta.totalRows)} médicaments
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={download}
          disabled={exportDisabled || exporting || invalidRange}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {exporting ? "Génération…" : "Générer le fichier Excel"}
        </button>
        <span className="text-xs text-text-subtle" aria-live="polite">
          {loading ? "Calcul en cours…" : exportError ? <span className="text-danger">{exportError}</span> : null}
        </span>
      </div>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15";

const chipClass =
  "rounded-lg border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text";

function fileNameFrom(contentDisposition: string | null): string | null {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match ? match[1] : null;
}
