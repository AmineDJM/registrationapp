import { BuildStamp } from "@/components/build-stamp";
import { NomenclatureTool } from "@/components/nomenclature-tool";
import { serializeMeta } from "@/lib/nomenclature/api";
import type { MetaResponse } from "@/lib/nomenclature/api";
import { getDataset } from "@/lib/nomenclature/load";

export const dynamic = "force-dynamic";

async function loadMeta(): Promise<MetaResponse | null> {
  try {
    return serializeMeta(await getDataset());
  } catch (error) {
    console.error("[nomenclature] chargement impossible", error);
    return null;
  }
}

export default async function Home() {
  const meta = await loadMeta();

  if (!meta) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-20">
        <h1 className="text-xl font-semibold text-text">Nomenclature pharmaceutique</h1>
        <p className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Le fichier de nomenclature est introuvable ou illisible. Vérifiez que
          <code className="mx-1 rounded bg-surface-muted px-1 py-0.5 text-xs">data/nomenclature.xlsx</code>
          est présent sur le serveur.
        </p>
      </main>
    );
  }

  return (
    <>
      <NomenclatureTool meta={meta} />
      <BuildStamp />
    </>
  );
}
