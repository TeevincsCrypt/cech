import type { NextRequest } from "next/server";
import { z } from "zod";
import { EXECUTION_STATUSES } from "@/lib/types";
import { error, json, serverError } from "@/lib/server/http";
import { handleWorkerEvent } from "@/lib/server/inspection-service";
import { isAuthorizedWorker, type WorkerTestOutcome } from "@/lib/server/worker-client";

// Result ingestion includes a Groq analysis call before acknowledging.
export const maxDuration = 60;

const Step = z.object({ step: z.number(), status: z.string().max(40), remark: z.string().max(600) });
const Test = z.object({
  testCaseId: z.string().max(64),
  objective: z.string().max(1200),
  status: z.enum(EXECUTION_STATUSES),
  errorKind: z.string().max(40).nullable(),
  steps: z.array(Step).max(200),
  stdout: z.string().max(450_000).nullable(),
  stderr: z.string().max(130_000).nullable(),
  exitCode: z.number().nullable(),
  durationMs: z.number().nullable(),
  summary: z.string().max(4000).nullable(),
  reason: z.string().max(4000).nullable(),
  testUrl: z.string().max(2048).nullable(),
  evidenceReference: z.string().max(2048).nullable(),
  cliVersion: z.string().max(40).nullable(),
  startedAt: z.string().max(40).nullable(),
  completedAt: z.string().max(40).nullable(),
  // Proof of Fix evidence; validated strictly later by sanitizeEvidence().
  evidence: z.unknown().optional(),
});
const Body = z.object({
  type: z.enum(["test_started", "test_progress", "test_completed", "job_completed"]),
  jobId: z.string().max(64),
  test: Test.nullable(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorizedWorker(req)) return error("Unauthorized", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid worker event.", 400);
  try {
    const result = await handleWorkerEvent({
      type: parsed.data.type,
      jobId: parsed.data.jobId,
      test: parsed.data.test as WorkerTestOutcome | null,
    });
    return result.ok ? json({ ok: true }) : error(result.error ?? "Rejected", 404);
  } catch (err) {
    return serverError(err, "worker callback");
  }
}
