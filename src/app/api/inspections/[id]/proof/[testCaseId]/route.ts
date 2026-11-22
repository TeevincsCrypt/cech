import type { NextRequest } from "next/server";
import { error, serverError, UUID_RE } from "@/lib/server/http";
import { getReport } from "@/lib/server/inspection-service";
import { buildProof, proofToJson, proofToMarkdown, proofToPdf } from "@/lib/server/proof-report";

export const maxDuration = 30;

/** Download the Proof of Fix report for one verified (or since regressed) fix. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/inspections/[id]/proof/[testCaseId]">) {
  const { id, testCaseId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(testCaseId)) return error("Not found.", 404);
  const format = req.nextUrl.searchParams.get("format") ?? "pdf";
  if (!["pdf", "md", "json"].includes(format)) return error("format must be pdf, md or json.", 400);
  try {
    const report = await getReport(id);
    if (!report) return error("Inspection not found.", 404);
    const proof = buildProof(report, testCaseId);
    if (!proof) return error("This test has no verified fix: it needs a genuine failure followed by an equivalent passing retest.", 409);
    const name = `cech-proof-of-fix-${proof.reference}.${format}`;
    const headers = { "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" };
    if (format === "json") return new Response(JSON.stringify(proofToJson(proof), null, 2), { headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
    if (format === "md") return new Response(proofToMarkdown(proof), { headers: { ...headers, "content-type": "text/markdown; charset=utf-8" } });
    const pdf = await proofToPdf(proof);
    return new Response(Buffer.from(pdf), { headers: { ...headers, "content-type": "application/pdf" } });
  } catch (err) {
    return serverError(err, "proof report");
  }
}
