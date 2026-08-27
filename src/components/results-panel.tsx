"use client";

import { useMemo, useState } from "react";
import type { LaboratoryRow, MoleculeRow, ReportResponse } from "@/lib/nomenclature/api";
import { ColumnFilter } from "@/components/column-filter";
import { frenchCollator } from "@/lib/nomenclature/aggregate";
import { toComparisonKey } from "@/lib/nomenclature/normalize";
import { formatCount, isoToFrench, pluralize } from "@/lib/format";

type View = {
  molecules: MoleculeRow[];
  laboratories: LaboratoryRow[];
  laboratoryOptions: string[];
  dciOptions: string[];
  stats: ReportResponse["stats"];
};

type Tab = "laboratories" | "molecules";
/** `default` keeps the laboratory / DCI order; the two others sort on the first date. */
type SortMode = "default" | "asc" | "desc";

const PAGE_SIZE = 50;
const NO_LABS: string[] = [];

export function ResultsPanel({
  view,
  periodKey,
  loading,
  error,
  query,
  onQueryChange,
  laboratory,
  onLaboratoryChange,
  dci,
  onDciChange,
}: {
  view: View | null;
  periodKey: string;
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  laboratory: string;
  onLaboratoryChange: (value: string) => void;
  dci: string;
  onDciChange: (value: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("laboratories");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  // Pagination and expanded rows reset by themselves whenever the displayed list changes.
  const listKey = `${tab}|${query.trim()}|${laboratory}|${dci}|${sortMode}|${periodKey}`;
  const [pagination, setPagination] = useState({ key: listKey, visible: PAGE_SIZE });
  const [expansion, setExpansion] = useState<{ key: string; laboratories: string[] }>({
    key: listKey,
    laboratories: NO_LABS,
  });

  const moleculesByLaboratory = useMemo(() => {
    const grouped = new Map<string, MoleculeRow[]>();
    for (const molecule of view?.molecules ?? []) {
      // Keyed like the aggregation itself: two typography variants of one laboratory
      // share a single summary row, so they must share a single molecule list.
      const key = toComparisonKey(molecule.laboratory);
      const existing = grouped.get(key);
      if (existing) existing.push(molecule);
      else grouped.set(key, [molecule]);
    }
    return grouped;
  }, [view]);

  const sortedMolecules = useMemo(
    () => sortMolecules(view?.molecules ?? [], sortMode),
    [view, sortMode],
  );

  const visible = pagination.key === listKey ? pagination.visible : PAGE_SIZE;
  const expanded = expansion.key === listKey ? expansion.laboratories : NO_LABS;
  const hasColumnFilter = laboratory !== "" || dci !== "";

  const toggleLaboratory = (name: string) => {
    setExpansion({
      key: listKey,
      laboratories: expanded.includes(name)
        ? expanded.filter((current) => current !== name)
        : [...expanded, name],
    });
  };

  const resetFilters = () => {
    onLaboratoryChange("");
    onDciChange("");
    setSortMode("default");
  };

  if (error) {
    return (
      <p className="mt-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
        {error}
      </p>
    );
  }

  if (!view) {
    return <div className="mt-6 h-32 animate-pulse rounded-2xl border border-border bg-surface-muted" />;
  }

  const isEmpty = view.stats.laboratoryMolecules === 0;
  const rows = tab === "laboratories" ? view.laboratories : sortedMolecules;
  const shown = rows.slice(0, visible);
  const narrowed = query.trim() !== "" || hasColumnFilter;

  return (
    <section className={`mt-6 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`} aria-busy={loading}>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Laboratoires" value={view.stats.laboratories} />
        <Stat label="Molécules (DCI)" value={view.stats.uniqueMolecules} />
        <Stat label="Couples labo / DCI" value={view.stats.laboratoryMolecules} />
        <Stat label="Enregistrements" value={view.stats.registrations} />
      </dl>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-border bg-surface-muted p-1 text-sm">
          <TabButton active={tab === "laboratories"} onClick={() => setTab("laboratories")}>
            Laboratoires
          </TabButton>
          <TabButton active={tab === "molecules"} onClick={() => setTab("molecules")}>
            Molécules
          </TabButton>
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Rechercher un laboratoire, une molécule…"
          aria-label="Rechercher un laboratoire ou une molécule"
          className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 sm:max-w-xs sm:text-sm"
        />
      </div>

      {/* The dropdowns live in the Molecules table, so the other tab recalls them here. */}
      {tab === "laboratories" && hasColumnFilter ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {laboratory ? (
            <FilterChip label="Laboratoire" value={laboratory} onClear={() => onLaboratoryChange("")} />
          ) : null}
          {dci ? <FilterChip label="Molécule" value={dci} onClear={() => onDciChange("")} /> : null}
        </div>
      ) : null}

      {narrowed && !isEmpty ? (
        <p className="mt-2 text-xs text-text-subtle">
          Le fichier Excel généré reprendra {hasColumnFilter && query.trim() ? "ces filtres" : "ce filtre"}.
        </p>
      ) : null}

      {isEmpty ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-8 text-center">
          <p className="text-sm text-text-muted">
            {narrowed
              ? "Aucun résultat pour ces filtres sur cette période."
              : "Aucun enregistrement trouvé sur cette période."}
          </p>
          {hasColumnFilter ? (
            <button type="button" onClick={resetFilters} className={`${outlineButtonClass} mt-3`}>
              Réinitialiser les filtres
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-border bg-surface">
          {tab === "laboratories" ? (
            <LaboratoryTable
              rows={shown as LaboratoryRow[]}
              moleculesByLaboratory={moleculesByLaboratory}
              expanded={expanded}
              onToggle={toggleLaboratory}
            />
          ) : (
            <MoleculeTable
              rows={shown as MoleculeRow[]}
              laboratory={laboratory}
              onLaboratoryChange={onLaboratoryChange}
              laboratoryOptions={view.laboratoryOptions}
              dci={dci}
              onDciChange={onDciChange}
              dciOptions={view.dciOptions}
              sortMode={sortMode}
              onSortToggle={() => setSortMode(nextSortMode(sortMode))}
              onReset={resetFilters}
            />
          )}

          <div className="flex flex-col items-center gap-2 rounded-b-2xl border-t border-border px-4 py-3 sm:flex-row sm:justify-between">
            <span className="text-xs text-text-subtle">
              {formatCount(shown.length)} sur {formatCount(rows.length)}{" "}
              {tab === "laboratories" ? "laboratoires" : "couples laboratoire / molécule"}
            </span>
            {visible < rows.length ? (
              <button
                type="button"
                onClick={() => setPagination({ key: listKey, visible: visible + PAGE_SIZE * 4 })}
                className={outlineButtonClass}
              >
                Afficher plus
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

const outlineButtonClass =
  "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text";

function nextSortMode(mode: SortMode): SortMode {
  if (mode === "default") return "asc";
  return mode === "asc" ? "desc" : "default";
}

/** ISO dates compare chronologically as strings; ties keep the laboratory / DCI order. */
function sortMolecules(molecules: MoleculeRow[], mode: SortMode): MoleculeRow[] {
  if (mode === "default") return molecules;
  const direction = mode === "asc" ? 1 : -1;
  return [...molecules].sort(
    (a, b) =>
      direction * a.firstRegistrationDate.localeCompare(b.firstRegistrationDate) ||
      frenchCollator.compare(a.laboratory, b.laboratory) ||
      frenchCollator.compare(a.dci, b.dci),
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-text-subtle sm:text-xs">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums text-text sm:text-2xl">{formatCount(value)}</dd>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-surface text-text shadow-[var(--shadow)]" : "text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-text-muted">
      <span className="truncate">
        {label} : <span className="text-text">{value}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Retirer le filtre ${label}`}
        className="text-text-subtle transition-colors hover:text-text"
      >
        ✕
      </button>
    </span>
  );
}

/** Each laboratory unfolds to reveal its molecules and their first registration date. */
function LaboratoryTable({
  rows,
  moleculesByLaboratory,
  expanded,
  onToggle,
}: {
  rows: LaboratoryRow[];
  moleculesByLaboratory: Map<string, MoleculeRow[]>;
  expanded: string[];
  onToggle: (laboratory: string) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const isOpen = expanded.includes(row.laboratory);
        const molecules = moleculesByLaboratory.get(toComparisonKey(row.laboratory)) ?? [];
        const panelId = `labo-${row.laboratory.replace(/\W+/g, "-").toLowerCase()}`;
        return (
          <li key={row.laboratory}>
            <button
              type="button"
              onClick={() => onToggle(row.laboratory)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-muted sm:py-2.5"
            >
              <Chevron open={isOpen} />
              <span className="min-w-0 flex-1 truncate font-medium text-text">{row.laboratory}</span>
              <span className="shrink-0 tabular-nums text-text-muted">
                {pluralize(row.moleculesCount, "molécule")}
              </span>
            </button>

            {isOpen ? (
              <ul id={panelId} className="border-t border-border bg-surface-muted">
                {molecules.map((molecule) => (
                  <li
                    key={molecule.dci}
                    className="flex flex-col gap-0.5 border-b border-border/60 py-2 pl-11 pr-4 text-[13px] last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <span className="min-w-0 text-text sm:truncate">{molecule.dci}</span>
                    <span className="shrink-0 tabular-nums text-text-subtle">
                      {isoToFrench(molecule.firstRegistrationDate)}
                      {molecule.registrationsCount > 1
                        ? ` · ${pluralize(molecule.registrationsCount, "enregistrement")}`
                        : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 text-text-subtle transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Single source of truth for the column widths: header and rows must not drift apart. */
const COLUMN_TEMPLATE = "sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_124px_84px]";
const MOLECULE_GRID = `grid grid-cols-1 gap-x-4 gap-y-0.5 ${COLUMN_TEMPLATE} sm:items-baseline sm:gap-y-1`;

function MoleculeTable({
  rows,
  laboratory,
  onLaboratoryChange,
  laboratoryOptions,
  dci,
  onDciChange,
  dciOptions,
  sortMode,
  onSortToggle,
  onReset,
}: {
  rows: MoleculeRow[];
  laboratory: string;
  onLaboratoryChange: (value: string) => void;
  laboratoryOptions: string[];
  dci: string;
  onDciChange: (value: string) => void;
  dciOptions: string[];
  sortMode: SortMode;
  onSortToggle: () => void;
  onReset: () => void;
}) {
  const canReset = laboratory !== "" || dci !== "" || sortMode !== "default";

  return (
    <div>
      {/* Column titles are the filters: a compact bar on mobile, aligned columns above. */}
      <div
        className={`flex flex-wrap items-center gap-1 rounded-t-2xl border-b border-border bg-surface-muted px-3 py-2 sm:grid ${COLUMN_TEMPLATE} sm:gap-x-4 sm:py-1.5`}
      >
        <ColumnFilter
          title="Laboratoire"
          allLabel="Tous les laboratoires"
          value={laboratory}
          options={laboratoryOptions}
          onChange={onLaboratoryChange}
        />
        <ColumnFilter
          title="DCI / Molécule"
          allLabel="Toutes les molécules"
          value={dci}
          options={dciOptions}
          onChange={onDciChange}
        />
        <button
          type="button"
          onClick={onSortToggle}
          aria-label={sortLabel(sortMode)}
          title={sortLabel(sortMode)}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors ${
            sortMode === "default"
              ? "text-text-subtle hover:bg-surface hover:text-text"
              : "bg-accent-soft text-accent"
          }`}
        >
          Première date <SortIcon mode={sortMode} />
        </button>
        <div className="flex items-center justify-end gap-2">
          <span className="hidden text-[11px] font-medium uppercase tracking-wide text-text-subtle sm:inline">
            {canReset ? null : "Enregistr."}
          </span>
          {canReset ? (
            <button type="button" onClick={onReset} className={outlineButtonClass}>
              Réinitialiser
            </button>
          ) : null}
        </div>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={`${row.laboratory}|${row.dci}`} className={`${MOLECULE_GRID} px-4 py-3 text-sm`}>
            <span className="order-2 min-w-0 truncate text-text-muted sm:order-1 sm:text-text">
              {row.laboratory}
            </span>
            <span className="order-1 min-w-0 font-medium text-text sm:order-2 sm:truncate sm:font-normal">
              {row.dci}
            </span>
            {/* One compact line on mobile, two grid cells on wider screens. */}
            <div className="order-3 flex flex-wrap items-baseline gap-x-1.5 text-text-muted sm:contents">
              <span className="tabular-nums sm:order-3">
                <span className="sm:hidden">Depuis le </span>
                {isoToFrench(row.firstRegistrationDate)}
              </span>
              <span className="text-text-subtle sm:hidden">·</span>
              <span className="tabular-nums sm:order-4 sm:text-right">
                <span className="sm:hidden">{pluralize(row.registrationsCount, "enregistrement")}</span>
                <span className="hidden sm:inline">{row.registrationsCount}</span>
              </span>
            </div>
            {row.brands.length > 0 ? (
              <span className="order-4 truncate text-xs text-text-subtle sm:order-5 sm:col-span-3 sm:col-start-2">
                {row.brands.join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function sortLabel(mode: SortMode): string {
  if (mode === "asc") return "Date croissante";
  if (mode === "desc") return "Date décroissante";
  return "Trier par date";
}

function SortIcon({ mode }: { mode: SortMode }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0">
      <path
        d="M3 5 6 2l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={mode === "desc" ? 0.25 : 1}
      />
      <path
        d="M3 7l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={mode === "asc" ? 0.25 : 1}
      />
    </svg>
  );
}
