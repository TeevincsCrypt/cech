import { connection } from "next/server";
import { integrationStatus } from "@/lib/server/config";
import { json } from "@/lib/server/http";
import { getWorkerHealth } from "@/lib/server/worker-client";

/** Integration status for the Settings page. Never returns secret values. */
export async function GET() {
  await connection(); // evaluate at request time, never at build time
  const integrations = integrationStatus();
  const worker = integrations.worker ? await getWorkerHealth() : null;
  return json({ ok: true, integrations, worker });
}
