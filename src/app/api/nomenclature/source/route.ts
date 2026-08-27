import { createHash } from "node:crypto";
import { serializeMeta } from "@/lib/nomenclature/api";
import {
  InvalidSourceError,
  getSourceState,
  primeDatasetCache,
  validateSourceBuffer,
} from "@/lib/nomenclature/load";
import { StorageWriteError, writeSource } from "@/lib/nomenclature/storage";
import { toErrorResponse } from "../http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel caps a serverless request body at 4.5 MB; stay clear of the edge. */
const MAX_UPLOAD_BYTES = 4_000_000;

export async function GET(): Promise<Response> {
  try {
    const { descriptor, dataset } = await getSourceState();
    return Response.json({
      storage: descriptor.mode,
      origin: descriptor.origin,
      updatedAt: descriptor.updatedAt?.toISOString() ?? null,
      bytes: descriptor.bytes,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      passwordRequired: isPasswordRequired(),
      passwordConfigured: getPassword() !== null,
      meta: serializeMeta(dataset),
      skipped: dataset.skipped,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (isPasswordRequired() && getPassword() === null) {
      return Response.json(
        {
          error:
            "Mise à jour désactivée : définissez la variable d'environnement NOMENCLATURE_ADMIN_PASSWORD " +
            "sur le serveur, puis redéployez.",
        },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const password = form.get("password");
    if (!isAuthorized(typeof password === "string" ? password : "")) {
      return Response.json({ error: "Mot de passe incorrect." }, { status: 401 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `Le fichier dépasse ${Math.floor(MAX_UPLOAD_BYTES / 1_000_000)} Mo.` },
        { status: 413 },
      );
    }

    // Parse and check the workbook first: nothing is overwritten unless it is usable.
    const buffer = Buffer.from(await file.arrayBuffer());
    const dataset = await validateSourceBuffer(buffer, MAX_UPLOAD_BYTES);

    const descriptor = await writeSource(buffer);
    primeDatasetCache(dataset, descriptor);

    return Response.json({
      storage: descriptor.mode,
      origin: descriptor.origin,
      updatedAt: descriptor.updatedAt?.toISOString() ?? null,
      bytes: descriptor.bytes,
      meta: serializeMeta(dataset),
      skipped: dataset.skipped,
    });
  } catch (error) {
    if (error instanceof InvalidSourceError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof StorageWriteError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    return toErrorResponse(error);
  }
}

function getPassword(): string | null {
  const password = process.env.NOMENCLATURE_ADMIN_PASSWORD?.trim();
  return password ? password : null;
}

/** Development runs without a password; anything deployed must have one. */
function isPasswordRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

function isAuthorized(candidate: string): boolean {
  const expected = getPassword();
  if (expected === null) return !isPasswordRequired();
  return digest(candidate).equals(digest(expected));
}

/** Hashing first keeps the comparison constant-time whatever the lengths. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
