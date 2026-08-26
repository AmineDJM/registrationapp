"use client";

import { useMemo, useState } from "react";
import { PeriodForm } from "@/components/period-form";
import { ResultsPanel } from "@/components/results-panel";
import { useReport } from "@/hooks/use-report";
import type { MetaResponse } from "@/lib/nomenclature/api";
import { buildLaboratorySummary, countUniqueMolecules } from "@/lib/nomenclature/aggregate";
import { filterMolecules } from "@/lib/nomenclature/search";
import { addMonthsIso, clampIso } from "@/lib/format";

const DEFAULT_MONTHS_BACK = 12;

export function NomenclatureTool({ meta }: { meta: MetaResponse }) {
  const [start, setStart] = useState(() =>
    clampIso(addMonthsIso(meta.maxDate, -DEFAULT_MONTHS_BACK), meta.minDate, meta.maxDate),
  );
  const [end, setEnd] = useState(meta.maxDate);
  const [query, setQuery] = useState("");

  const invalidRange = start !== "" && end !== "" && start > end;
  const { report, loading, error } = useReport(start, end, !invalidRange);

  const view = useMemo(() => {
    if (!report) return null;
    const trimmed = query.trim();
    if (!trimmed) return { molecules: report.molecules, laboratories: report.laboratories, stats: report.stats };

    const molecules = filterMolecules(report.molecules, trimmed);
    const laboratories = buildLaboratorySummary(molecules);
    return {
      molecules,
      laboratories,
      stats: {
        laboratories: laboratories.length,
        uniqueMolecules: countUniqueMolecules(molecules),
        laboratoryMolecules: molecules.length,
        registrations: molecules.reduce((total, molecule) => total + molecule.registrationsCount, 0),
      },
    };
  }, [report, query]);

  const exportParams = new URLSearchParams({ start, end });
  if (query.trim()) exportParams.set("q", query.trim());

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
      <header className="mb-8 sm:mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
          Nomenclature pharmaceutique
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted sm:text-base">
          Identifiez les molécules enregistrées par laboratoire sur une période donnée.
        </p>
      </header>

      <PeriodForm
        meta={meta}
        start={start}
        end={end}
        onStartChange={setStart}
        onEndChange={setEnd}
        invalidRange={invalidRange}
        loading={loading}
        exportParams={exportParams.toString()}
        exportDisabled={!view || view.stats.registrations === 0}
      />

      <ResultsPanel
        view={view}
        periodKey={`${start}|${end}`}
        loading={loading}
        error={invalidRange ? "La date de début doit être antérieure à la date de fin." : error}
        query={query}
        onQueryChange={setQuery}
      />
    </main>
  );
}
