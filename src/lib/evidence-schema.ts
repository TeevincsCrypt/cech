import { z } from "zod";
import { ARTIFACT_KINDS, type ExecutionEvidence } from "@/lib/types";

const iso = z.string().max(40);
const url = z.string().max(500);

export const ArtifactMetaSchema = z.object({
  kind: z.enum(ARTIFACT_KINDS),
  content_type: z.enum(["image/jpeg", "image/png"]),
  bytes: z.number().int().positive().max(4 * 1024 * 1024),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  page_url: url.nullable(),
  captured_at: iso,
});

export const ExecutionEvidenceSchema = z.object({
  mode: z.enum(["cdp", "none"]),
  viewport: z.object({ width: z.number().int().positive().max(20000), height: z.number().int().positive().max(20000), deviceScaleFactor: z.number().positive().max(8) }).nullable(),
  url_before: url.nullable(),
  url_after: url.nullable(),
  console_errors: z.array(z.object({ text: z.string().max(600), url: url.nullable(), at: iso })).max(40),
  failed_requests: z
    .array(z.object({ url, method: z.string().max(12), status: z.number().int().min(0).max(999).nullable(), error: z.string().max(300).nullable(), at: iso }))
    .max(40),
  capture_errors: z.array(z.string().max(400)).max(20),
  started_at: iso.nullable(),
  completed_at: iso.nullable(),
  artifacts: z.array(ArtifactMetaSchema).max(ARTIFACT_KINDS.length),
  kane_evidence_pack: z.object({ sealed: z.boolean(), bytes: z.number().int().nonnegative().nullable() }).nullable(),
});

/** Validate worker-provided evidence. Invalid metadata is discarded (never guessed at). */
export function sanitizeEvidence(input: unknown): ExecutionEvidence | null {
  if (input == null) return null;
  const parsed = ExecutionEvidenceSchema.safeParse(input);
  if (parsed.success) {
    // One artifact per kind.
    const seen = new Set<string>();
    parsed.data.artifacts = parsed.data.artifacts.filter((a) => (seen.has(a.kind) ? false : (seen.add(a.kind), true)));
    return parsed.data as ExecutionEvidence;
  }
  return {
    mode: "none",
    viewport: null,
    url_before: null,
    url_after: null,
    console_errors: [],
    failed_requests: [],
    capture_errors: ["Evidence metadata from the worker failed validation and was discarded."],
    started_at: null,
    completed_at: null,
    artifacts: [],
    kane_evidence_pack: null,
  };
}
