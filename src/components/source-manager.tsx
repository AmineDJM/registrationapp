"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { clearReportCache } from "@/hooks/use-report";
import { formatCount, isoToFrench } from "@/lib/format";

export type SourceState = {
  storage: "blob" | "filesystem";
  origin: "bundled" | "uploaded";
  updatedAt: string | null;
  bytes: number;
  maxUploadBytes: number;
  passwordRequired: boolean;
  passwordConfigured: boolean;
  meta: { minDate: string; maxDate: string; totalRows: number; sheet: string };
  skipped: { missingInitialDate: number; missingLaboratory: number; missingDci: number };
};

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; state: SourceState } | { kind: "error"; message: string };

export function SourceManager({ initial }: { initial: SourceState }) {
  const [state, setState] = useState(initial);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const blocked = state.passwordRequired && !state.passwordConfigured;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;

    setStatus({ kind: "sending" });
    const body = new FormData();
    body.set("file", file);
    body.set("password", password);

    try {
      const response = await fetch("/api/nomenclature/source", { method: "POST", body });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(readError(payload) ?? "La mise à jour a échoué.");
      }
      const next = { ...state, ...(payload as Partial<SourceState>) } as SourceState;
      clearReportCache(); // the tool must not serve counts from the previous workbook
      setState(next);
      setStatus({ kind: "done", state: next });
      setFile(null);
      setPassword("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "La mise à jour a échoué." });
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow)] sm:p-6">
        <h2 className="text-sm font-semibold text-text">Nomenclature en service</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <Row label="Onglet lu" value={state.meta.sheet} />
          <Row label="Lignes" value={`${formatCount(state.meta.totalRows)} médicaments`} />
          <Row
            label="Période couverte"
            value={`${isoToFrench(state.meta.minDate)} → ${isoToFrench(state.meta.maxDate)}`}
          />
          <Row
            label="Lignes ignorées"
            value={`${formatCount(state.skipped.missingInitialDate)} sans date exploitable`}
          />
          <Row label="Origine" value={state.origin === "uploaded" ? "Fichier importé" : "Fichier livré avec l'application"} />
          <Row
            label="Mise à jour"
            value={state.updatedAt ? new Date(state.updatedAt).toLocaleString("fr-FR") : "—"}
          />
        </dl>
      </section>

      <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow)] sm:p-6">
        <h2 className="text-sm font-semibold text-text">Remplacer la nomenclature</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          Déposez le nouveau fichier <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">.xlsx</code>. Il est
          vérifié avant d&apos;être enregistré : s&apos;il est illisible, l&apos;ancienne version reste en place.
          L&apos;import écrase définitivement la version précédente.
        </p>

        {blocked ? (
          <p className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
            Import désactivé : définissez la variable d&apos;environnement{" "}
            <code className="font-mono">NOMENCLATURE_ADMIN_PASSWORD</code> sur le serveur, puis redéployez.
          </p>
        ) : null}

        {state.storage === "filesystem" ? (
          <p className="mt-3 rounded-xl border border-border bg-surface-muted px-3 py-2 text-[13px] text-text-muted">
            Stockage : disque local. En production, créez un store <strong>Vercel Blob</strong> et ajoutez{" "}
            <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> — sans lui, le disque est en lecture seule et
            l&apos;import échouera proprement, sans abîmer les données en service.
          </p>
        ) : null}

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files[0];
            if (dropped) setFile(dropped);
          }}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <span className="text-sm font-medium text-text">
            {file ? file.name : "Choisir un fichier ou le déposer ici"}
          </span>
          <span className="text-xs text-text-subtle">
            {file
              ? `${(file.size / 1_000_000).toFixed(2)} Mo`
              : `.xlsx, jusqu'à ${Math.floor(state.maxUploadBytes / 1_000_000)} Mo`}
          </span>
        </label>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="password" className="text-[13px] font-medium text-text-muted">
              Mot de passe {state.passwordConfigured ? "" : "(non requis en local)"}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </div>
          <button
            type="submit"
            disabled={!file || status.kind === "sending" || blocked}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status.kind === "sending" ? "Vérification…" : "Mettre à jour"}
          </button>
        </div>

        {status.kind === "error" ? (
          <p className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger" role="alert">
            {status.message}
          </p>
        ) : null}
        {status.kind === "done" ? (
          <p className="mt-3 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-[13px] text-accent" role="status">
            Nomenclature mise à jour : {formatCount(status.state.meta.totalRows)} lignes, jusqu&apos;au{" "}
            {isoToFrench(status.state.meta.maxDate)}.{" "}
            <Link href="/" className="underline underline-offset-2">
              Retourner à l&apos;outil
            </Link>
          </p>
        ) : null}
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-1.5 sm:border-none sm:pb-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text">{value}</dd>
    </div>
  );
}

function readError(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return null;
}
