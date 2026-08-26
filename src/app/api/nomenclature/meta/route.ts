import { getDataset } from "@/lib/nomenclature/load";
import { serializeMeta } from "@/lib/nomenclature/api";
import { toErrorResponse } from "../http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(serializeMeta(await getDataset()));
  } catch (error) {
    return toErrorResponse(error);
  }
}
