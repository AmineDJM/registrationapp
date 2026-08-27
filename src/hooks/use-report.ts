"use client";

import { useEffect, useState } from "react";
import type { ReportResponse } from "@/lib/nomenclature/api";

type ReportState = {
  report: ReportResponse | null;
  loading: boolean;
  error: string | null;
};

type Outcome = { key: string; report: ReportResponse | null; error: string | null };

const cache = new Map<string, ReportResponse>();

/** Called after the source workbook is replaced: every cached period is stale. */
export function clearReportCache(): void {
  cache.clear();
}

async function fetchReport(start: string, end: string, signal: AbortSignal): Promise<ReportResponse> {
  const response = await fetch(`/api/nomenclature/result?start=${start}&end=${end}`, { signal });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "Le calcul a échoué. Réessayez.";
    throw new Error(message);
  }
  return payload as ReportResponse;
}

/**
 * Loads the report for a period: debounced, abortable, and cached in memory so
 * coming back to an already computed period is instantaneous. While a new period
 * loads, the previous result stays on screen.
 */
export function useReport(start: string, end: string, enabled: boolean): ReportState {
  const key = `${start}|${end}`;
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (!enabled || cache.has(key)) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchReport(start, end, controller.signal)
        .then((report) => {
          cache.set(key, report);
          setOutcome({ key, report, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setOutcome({
            key,
            report: null,
            error: error instanceof Error ? error.message : "Le calcul a échoué. Réessayez.",
          });
        });
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, start, end, enabled]);

  if (!enabled) return { report: null, loading: false, error: null };

  const cached = cache.get(key);
  if (cached) return { report: cached, loading: false, error: null };
  if (outcome?.key === key) return { report: outcome.report, loading: false, error: outcome.error };
  return { report: outcome?.report ?? null, loading: true, error: null };
}
