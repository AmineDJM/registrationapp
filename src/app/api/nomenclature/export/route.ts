import { buildExportFileName, buildWorkbookBuffer } from "@/lib/nomenclature/export";
import { getDataset } from "@/lib/nomenclature/load";
import { buildReport } from "@/lib/nomenclature/report";
import { toErrorResponse } from "../http";

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
    const buffer = await buildWorkbookBuffer(report, new Date());

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${buildExportFileName(report)}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
