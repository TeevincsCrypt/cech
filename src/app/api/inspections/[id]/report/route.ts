import type { NextRequest } from "next/server";
import { reportToMarkdown } from "@/lib/report-markdown";
import { error, serverError, UUID_RE } from "@/lib/server/http";
import { getReport } from "@/lib/server/inspection-service";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/inspections/[id]/report">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return error("Inspection not found.", 404);
  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "md";
  try {
    const report = await getReport(id);
    if (!report) return error("Inspection not found.", 404);
    const host = new URL(report.inspection.website_url).hostname.replace(/[^a-z0-9.-]/gi, "");
    const filename = `cech-report-${host}-${id.slice(0, 8)}.${format}`;
    const body = format === "json" ? JSON.stringify(report, null, 2) : reportToMarkdown(report);
    return new Response(body, {
      headers: {
        "content-type": format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return serverError(err, "download report");
  }
}
