import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { assertPublicUrl } from "@/lib/security/url-safety";
import { config } from "@/lib/server/config";
import { error, json, serverError } from "@/lib/server/http";
import { createInspection, planAndDispatch } from "@/lib/server/inspection-service";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { listInspectionSummaries } from "@/lib/server/read-models";
import { TEST_CATEGORIES } from "@/lib/types";

export const maxDuration = 60;

const Body = z.object({
  url: z.string().trim().min(1).max(2048),
  categories: z.array(z.enum(TEST_CATEGORIES)).min(1).max(TEST_CATEGORIES.length),
  instructions: z
    .string()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim() || null : null)),
});

export async function POST(req: NextRequest) {
  const limited = rateLimit(`inspect:${clientIp(req)}`, 6, 60_000);
  if (!limited.ok) return error(`Too many inspections. Try again in ${limited.retryAfter}s.`, 429);

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return error("Invalid JSON body.", 400);
  }
  if (!parsed.success) return error("Invalid request: choose at least one testing category and a URL.", 400);

  const safe = await assertPublicUrl(parsed.data.url, { allowlist: config.ssrfAllowlist });
  if (!safe.ok) return error(safe.reason, 422, { field: "url" });

  try {
    const inspection = await createInspection({
      url: safe.normalized,
      categories: [...new Set(parsed.data.categories)],
      instructions: parsed.data.instructions,
    });
    // Planning (site probe + Groq) and dispatch run after the response is sent.
    after(() => planAndDispatch(inspection.id));
    return json({ id: inspection.id }, 201);
  } catch (err) {
    return serverError(err, "create inspection");
  }
}

export async function GET() {
  try {
    return json({ inspections: await listInspectionSummaries(100) });
  } catch (err) {
    return serverError(err, "list inspections");
  }
}
