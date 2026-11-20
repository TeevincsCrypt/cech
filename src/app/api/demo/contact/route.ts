import type { NextRequest } from "next/server";
import { z } from "zod";
import { error, json } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

/**
 * Contact endpoint for the built-in demo website. Messages are validated and
 * acknowledged but not stored or emailed (it's a demo).
 */
const Body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(200),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const limited = rateLimit(`demo-contact:${clientIp(req)}`, 30, 60_000);
  if (!limited.ok) return error("Too many messages.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Please fill in your name, a valid email and a message.", 400);
  return json({ ok: true, reference: `MSG-${Date.now().toString(36).toUpperCase()}` });
}
