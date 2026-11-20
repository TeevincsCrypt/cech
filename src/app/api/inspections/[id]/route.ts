import type { NextRequest } from "next/server";
import { error, json, serverError, UUID_RE } from "@/lib/server/http";
import { getReport } from "@/lib/server/inspection-service";

export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inspections/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return error("Inspection not found.", 404);
  try {
    // sync=true pulls from the worker if callbacks were missed.
    const report = await getReport(id, { sync: true });
    return report ? json(report) : error("Inspection not found.", 404);
  } catch (err) {
    return serverError(err, "get inspection");
  }
}
