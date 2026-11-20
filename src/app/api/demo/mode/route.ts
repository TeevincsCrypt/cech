import type { NextRequest } from "next/server";
import { z } from "zod";
import { error, json, serverError } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { getRepository } from "@/lib/store";

export async function GET() {
  try {
    return json(await getRepository().getDemoSettings());
  } catch (err) {
    return serverError(err, "demo mode get");
  }
}

const Body = z.object({ mode: z.enum(["healthy", "broken"]) });

export async function POST(req: NextRequest) {
  const limited = rateLimit(`demo:${clientIp(req)}`, 30, 60_000);
  if (!limited.ok) return error("Too many requests.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("mode must be 'healthy' or 'broken'.", 400);
  try {
    return json(await getRepository().setDemoMode(parsed.data.mode));
  } catch (err) {
    return serverError(err, "demo mode set");
  }
}
