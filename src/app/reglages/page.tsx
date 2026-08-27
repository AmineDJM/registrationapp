import Link from "next/link";
import { BuildStamp } from "@/components/build-stamp";
import { SourceManager, type SourceState } from "@/components/source-manager";
import { serializeMeta } from "@/lib/nomenclature/api";
import { getSourceState } from "@/lib/nomenclature/load";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Réglages · Nomenclature pharmaceutique",
};

/** Kept in step with the API route, which enforces the same ceiling. */
const MAX_UPLOAD_BYTES = 4_000_000;

async function loadState(): Promise<SourceState | null> {
  try {
    const { descriptor, dataset } = await getSourceState();
    return {
      storage: descriptor.mode,
      origin: descriptor.origin,
      updatedAt: descriptor.updatedAt?.toISOString() ?? null,
      bytes: descriptor.bytes,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      passwordRequired: process.env.NODE_ENV === "production",
      passwordConfigured: Boolean(process.env.NOMENCLATURE_ADMIN_PASSWORD?.trim()),
      meta: serializeMeta(dataset),
      skipped: dataset.skipped,
    };
  } catch (error) {
    console.error("[nomenclature] état de la source indisponible", error);
    return null;
  }
}

export default async function ReglagesPage() {
  const state = await loadState();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
      <header className="mb-8">
        <Link href="/" className="text-[13px] text-text-muted transition-colors hover:text-text">
          ← Retour à l&apos;outil
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text">Réglages</h1>
        <p className="mt-2 text-sm text-text-muted">
          Mettez à jour le fichier de nomenclature utilisé par l&apos;application.
        </p>
      </header>

      {state ? (
        <SourceManager initial={state} />
      ) : (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Le fichier de nomenclature est introuvable ou illisible sur le serveur.
        </p>
      )}

      <BuildStamp />
    </main>
  );
}
