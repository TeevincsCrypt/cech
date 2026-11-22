import type { NextRequest } from "next/server";
import { loadEvidence } from "@/lib/server/evidence-access";
import { error, serverError } from "@/lib/server/http";

/** Serve a private evidence screenshot. Never exposes storage URLs or paths. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/inspections/[id]/evidence/[artifactId]">) {
  const { id, artifactId } = await ctx.params;
  try {
    const res = await loadEvidence(id, artifactId);
    if (!res.ok) return error(res.error, res.status);
    const ext = res.contentType === "image/png" ? "png" : "jpg";
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new Response(Buffer.from(res.bytes), {
      headers: {
        "content-type": res.contentType,
        "content-length": String(res.bytes.length),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="cech-evidence-${res.artifact.kind}-${res.artifact.test_result_id.slice(0, 8)}.${ext}"`,
      },
    });
  } catch (err) {
    return serverError(err, "evidence");
  }
}
