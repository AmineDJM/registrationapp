import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { DateRangeError } from "@/lib/nomenclature/filter";

const gzipAsync = promisify(gzip);

/** Maps business errors to 400 and anything unexpected to 500, without leaking internals. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof DateRangeError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error("[nomenclature]", error);
  return Response.json(
    { error: "Le fichier de nomenclature n'a pas pu être analysé." },
    { status: 500 },
  );
}

/**
 * JSON response, gzipped when the client accepts it: the full history weighs
 * ~620 kB raw against ~55 kB compressed, which matters on mobile connections.
 */
export async function jsonResponse(
  request: Request,
  data: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const body = JSON.stringify(data);
  const baseHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Accept-Encoding",
    ...headers,
  };

  if (!request.headers.get("accept-encoding")?.includes("gzip")) {
    return new Response(body, { headers: baseHeaders });
  }

  const compressed = await gzipAsync(body);
  return new Response(new Uint8Array(compressed), {
    headers: {
      ...baseHeaders,
      "Content-Encoding": "gzip",
      "Content-Length": String(compressed.byteLength),
    },
  });
}
