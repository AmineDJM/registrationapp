"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchKey } from "@/lib/nomenclature/search";
import { formatCount } from "@/lib/format";

/** Long lists stay responsive: the rest is reachable through the popover search. */
const MAX_VISIBLE_OPTIONS = 200;

/**
 * Column header that doubles as a filter, the way a spreadsheet autofilter does:
 * the title opens a searchable list of the values still available in that column.
 */
export function ColumnFilter({
  title,
  allLabel,
  value,
  options,
  onChange,
}: {
  title: string;
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const matching = useMemo(() => {
    const needle = searchKey(search.trim());
    return needle ? options.filter((option) => searchKey(option).includes(needle)) : options;
  }, [options, search]);

  const visible = matching.slice(0, MAX_VISIBLE_OPTIONS);
  const hidden = matching.length - visible.length;

  const select = (next: string) => {
    onChange(next);
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={container} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={value ? `${title} : ${value}. Modifier le filtre` : `Filtrer par ${title}`}
        className={`flex w-full min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors ${
          value
            ? "bg-accent-soft text-accent"
            : "text-text-subtle hover:bg-surface hover:text-text"
        }`}
      >
        <span className="truncate">{value || title}</span>
        <FunnelIcon active={value !== ""} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow)]">
          <input
            autoFocus
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Rechercher dans ${title.toLowerCase()}…`}
            aria-label={`Rechercher dans ${title}`}
            className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-base text-text outline-none focus:border-accent sm:text-sm"
          />

          <ul role="listbox" className="mt-1.5 max-h-64 overflow-y-auto">
            <li>
              <OptionButton selected={value === ""} onClick={() => select("")}>
                {allLabel}
              </OptionButton>
            </li>
            {visible.map((option) => (
              <li key={option}>
                <OptionButton selected={option === value} onClick={() => select(option)}>
                  {option}
                </OptionButton>
              </li>
            ))}
          </ul>

          {matching.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-text-subtle">Aucune valeur ne correspond.</p>
          ) : null}
          {hidden > 0 ? (
            <p className="border-t border-border px-2 pt-1.5 text-[11px] text-text-subtle">
              {formatCount(hidden)} autres valeurs — affinez la recherche.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-muted ${
        selected ? "bg-accent-soft font-medium text-accent" : "text-text"
      }`}
    >
      {children}
    </button>
  );
}

function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0">
      <path
        d="M1.5 2h9L7 6.2V10L5 9V6.2z"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
