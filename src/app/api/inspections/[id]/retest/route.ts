import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { error, json, serverError, UUID_RE } from "@/lib/server/http";
import { createRetest, planAndDispatchRetest, RetestError } from "@/lib/server/inspection-service";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 60;

const Body = z.object({ scope: z.enum(["failed", "all"]) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/inspections/[id]/retest">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return error("Inspection not found.", 404);
  const limited = rateLimit(`retest:${clientIp(req)}`, 10, 60_000);
  if (!limited.ok) return error(`Too many retests. Try again in ${limited.retryAfter}s.`, 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("scope must be 'failed' or 'all'.", 400);

  try {
    const run = await createRetest(id, parsed.data.scope);
    after(() => planAndDispatchRetest(run.id));
    return json({ runId: run.id }, 201);
  } catch (err) {
    if (err instanceof RetestError) return error(err.message, 409);
    return serverError(err, "retest");
  }
}
