import "server-only";
import { getArtifactStore, sniffImageType } from "@/lib/server/artifact-store";
import { UUID_RE } from "@/lib/server/http";
import { getRepository } from "@/lib/store";
import type { EvidenceArtifact } from "@/lib/types";

export type EvidenceAccess =
  | { ok: true; artifact: EvidenceArtifact; bytes: Uint8Array; contentType: "image/jpeg" | "image/png" }
  | { ok: false; status: 404 | 503; error: string };

/**
 * Authorise and load one evidence artifact. Access requires the artifact to
 * belong to the inspection named in the URL (no cross-inspection access).
 * When user accounts are added, also check inspection.user_id here.
 */
export async function loadEvidence(inspectionId: string, artifactId: string): Promise<EvidenceAccess> {
  const notFound = { ok: false as const, status: 404 as const, error: "Evidence not found." };
  if (!UUID_RE.test(inspectionId) || !UUID_RE.test(artifactId)) return notFound;
  const repo = getRepository();
  if (!(await repo.evidenceSupported())) return { ok: false, status: 503, error: "Evidence storage is not enabled on this deployment." };
  const artifact = await repo.getArtifact(artifactId);
  if (!artifact || artifact.inspection_id !== inspectionId) return notFound;
  const bytes = await getArtifactStore().get(artifact.storage_key);
  if (!bytes) return notFound;
  const contentType = sniffImageType(bytes);
  if (!contentType) return notFound;
  return { ok: true, artifact, bytes, contentType };
}
