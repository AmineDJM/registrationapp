import { serializeReport } from "@/lib/nomenclature/api";
import { getDataset } from "@/lib/nomenclature/load";
import { buildReport } from "@/lib/nomenclature/report";
import { jsonResponse, toErrorResponse } from "../http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const dataset = await getDataset();
    const report = buildReport(dataset, params.get("start"), params.get("end"), {
      query: params.get("q"),
      laboratory: params.get("lab"),
      dci: params.get("dci"),
    });
    return await jsonResponse(request, serializeReport(report), {
      "Cache-Control": "private, max-age=60",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
