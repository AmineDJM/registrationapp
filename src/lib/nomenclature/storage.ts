import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where the live workbook is kept. Blob as soon as a store is configured, disk otherwise. */
export type StorageMode = "blob" | "filesystem";

export type SourceDescriptor = {
  mode: StorageMode;
  /** `bundled` is the copy committed with the code; `uploaded` is what the user sent. */
  origin: "bundled" | "uploaded";
  /** Changes whenever the underlying file changes — the memory cache keys on it. */
  version: string;
  updatedAt: Date | null;
  bytes: number;
};

/** Raised when the workbook cannot be persisted; the message is meant for the user. */
export class StorageWriteError extends Error {}

const BLOB_PATHNAME = "nomenclature/nomenclature.xlsx";
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function getStorageMode(): StorageMode {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "filesystem";
}

/**
 * Written inline so Next's file tracing resolves it and ships only this file with the
 * server bundle, instead of falling back to tracing the whole project.
 */
export function getBundledFilePath(): string {
  return path.join(process.cwd(), "data", "nomenclature.xlsx");
}

type BlobEntry = { url: string; size: number; uploadedAt: Date };

async function findBlob(): Promise<BlobEntry | null> {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  const found = blobs.find((blob) => blob.pathname === BLOB_PATHNAME);
  return found ? { url: found.url, size: found.size, uploadedAt: found.uploadedAt } : null;
}

async function describeBundled(mode: StorageMode): Promise<SourceDescriptor> {
  const stats = await stat(path.join(process.cwd(), "data", "nomenclature.xlsx"));
  return {
    mode,
    origin: "bundled",
    version: `bundled:${stats.mtimeMs}:${stats.size}`,
    updatedAt: stats.mtime,
    bytes: stats.size,
  };
}

/** Identifies the current source without downloading it. */
export async function describeSource(): Promise<SourceDescriptor> {
  const mode = getStorageMode();
  if (mode === "blob") {
    const blob = await findBlob();
    if (blob) {
      return {
        mode,
        origin: "uploaded",
        version: `blob:${blob.uploadedAt.toISOString()}:${blob.size}`,
        updatedAt: blob.uploadedAt,
        bytes: blob.size,
      };
    }
  }
  return describeBundled(mode);
}

export async function readSource(descriptor: SourceDescriptor): Promise<Buffer> {
  if (descriptor.origin === "uploaded") {
    const blob = await findBlob();
    if (blob) {
      const response = await fetch(blob.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Téléchargement du fichier impossible (HTTP ${response.status}).`);
      return Buffer.from(await response.arrayBuffer());
    }
  }
  return readFile(path.join(process.cwd(), "data", "nomenclature.xlsx"));
}

/**
 * Replaces the live workbook. The previous version is overwritten, never kept around.
 * Callers must have validated the buffer first.
 */
export async function writeSource(buffer: Buffer): Promise<SourceDescriptor> {
  const mode = getStorageMode();

  if (mode === "blob") {
    const { put } = await import("@vercel/blob");
    const result = await put(BLOB_PATHNAME, buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: XLSX_CONTENT_TYPE,
      cacheControlMaxAge: 0,
    });
    return {
      mode,
      origin: "uploaded",
      version: `blob:${new Date().toISOString()}:${buffer.byteLength}:${result.pathname}`,
      updatedAt: new Date(),
      bytes: buffer.byteLength,
    };
  }

  try {
    await writeFile(path.join(process.cwd(), "data", "nomenclature.xlsx"), buffer);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
      throw new StorageWriteError(
        "Le disque du serveur est en lecture seule. Créez un store Vercel Blob et ajoutez la variable " +
          "d'environnement BLOB_READ_WRITE_TOKEN pour activer la mise à jour en ligne.",
      );
    }
    throw error;
  }
  return describeBundled(mode);
}
