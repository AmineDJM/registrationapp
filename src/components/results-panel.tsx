"use client";

import { useMemo, useState } from "react";
import type { LaboratoryRow, MoleculeRow, ReportResponse } from "@/lib/nomenclature/api";
import { toComparisonKey } from "@/lib/nomenclature/normalize";
import { formatCount, isoToFrench, pluralize } from "@/lib/format";

type View = {
  molecules: MoleculeRow[];
  laboratories: LaboratoryRow[];
  stats: ReportResponse["stats"];
};

type Tab = "laboratories" | "molecules";

const PAGE_SIZE = 50;
const NO_LABS: string[] = [];

export function ResultsPanel({
  view,
  periodKey,
  loading,
  error,
  query,
  onQueryChange,
}: {
  view: View | null;
  periodKey: string;
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("laboratories");
  // Pagination and expanded rows reset by themselves when the tab, search or period changes.
  const listKey = `${tab}|${query.trim()}|${periodKey}`;
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

  const visible = pagination.key === listKey ? pagination.visible : PAGE_SIZE;
  const expanded = expansion.key === listKey ? expansion.laboratories : NO_LABS;

  const toggleLaboratory = (laboratory: string) => {
    setExpansion({
      key: listKey,
      laboratories: expanded.includes(laboratory)
        ? expanded.filter((name) => name !== laboratory)
        : [...expanded, laboratory],
    });
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
  const rows = tab === "laboratories" ? view.laboratories : view.molecules;
  const shown = rows.slice(0, visible);

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
          className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-[15px] text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 sm:max-w-xs sm:text-sm"
        />
      </div>

      {query.trim() !== "" && !isEmpty ? (
        <p className="mt-2 text-xs text-text-subtle">Le fichier Excel généré reprendra ce filtre.</p>
      ) : null}

      {isEmpty ? (
        <p className="mt-4 rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
          {query.trim() === ""
            ? "Aucun enregistrement trouvé sur cette période."
            : `Aucun résultat pour « ${query.trim()} » sur cette période.`}
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
          {tab === "laboratories" ? (
            <LaboratoryTable
              rows={shown as LaboratoryRow[]}
              moleculesByLaboratory={moleculesByLaboratory}
              expanded={expanded}
              onToggle={toggleLaboratory}
            />
          ) : (
            <MoleculeTable rows={shown as MoleculeRow[]} />
          )}

          <div className="flex flex-col items-center gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-between">
            <span className="text-xs text-text-subtle">
              {formatCount(shown.length)} sur {formatCount(rows.length)}{" "}
              {tab === "laboratories" ? "laboratoires" : "couples laboratoire / molécule"}
            </span>
            {visible < rows.length ? (
              <button
                type="button"
                onClick={() => setPagination({ key: listKey, visible: visible + PAGE_SIZE * 4 })}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text"
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

const MOLECULE_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_104px_88px] sm:items-baseline sm:gap-y-1";

function MoleculeTable({ rows }: { rows: MoleculeRow[] }) {
  return (
    <div>
      <div
        className={`${MOLECULE_GRID} hidden border-b border-border bg-surface-muted px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-text-subtle sm:grid`}
      >
        <span>Laboratoire</span>
        <span>DCI / Molécule</span>
        <span>Première date</span>
        <span className="text-right">Enregistr.</span>
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
