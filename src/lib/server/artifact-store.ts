import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/server/config";
import { getRepository } from "@/lib/store";
import { SupabaseRepository } from "@/lib/store/supabase";

/**
 * Private storage for evidence screenshots.
 *  - Production (Supabase configured): private bucket `cech-evidence`
 *    (service-role access only; browsers never get a storage URL).
 *  - Development: files under CECH_ARTIFACT_DIR (default .data/artifacts,
 *    /tmp/cech-artifacts on Vercel without Supabase — ephemeral).
 * Images reach browsers only through CECH's authorised API route.
 */

export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
export const ARTIFACT_KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z_]+\.(jpg|png)$/;

export type ImageType = "image/jpeg" | "image/png";

/** Identify an image by its bytes (never trust declared content types). */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

export class ArtifactValidationError extends Error {}

export function validateArtifact(bytes: Uint8Array, key: string, expectedSha256?: string): { contentType: ImageType; sha256: string } {
  if (!ARTIFACT_KEY_RE.test(key) || key.includes("..")) throw new ArtifactValidationError("Invalid artifact key");
  if (bytes.length === 0) throw new ArtifactValidationError("Empty artifact");
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new ArtifactValidationError(`Artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`);
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new ArtifactValidationError("Artifact is not a JPEG or PNG image");
  if (!key.endsWith(contentType === "image/jpeg" ? ".jpg" : ".png")) throw new ArtifactValidationError("Artifact extension does not match its content");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 && expectedSha256 !== sha256) throw new ArtifactValidationError("Artifact checksum mismatch");
  return { contentType, sha256 };
}

export interface ArtifactStore {
  readonly kind: "supabase-storage" | "local-file";
  put(key: string, bytes: Uint8Array, contentType: ImageType): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

class LocalArtifactStore implements ArtifactStore {
  readonly kind = "local-file" as const;
  private root: string;
  constructor(root: string) {
    this.root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), root);
  }
  private file(key: string) {
    if (!ARTIFACT_KEY_RE.test(key) || key.includes("..")) throw new ArtifactValidationError("Invalid artifact key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new ArtifactValidationError("Invalid artifact path");
    return full;
  }
  async put(key: string, bytes: Uint8Array) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, bytes);
  }
  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
}

class SupabaseArtifactStore implements ArtifactStore {
  readonly kind = "supabase-storage" as const;
  constructor(
    private repo: SupabaseRepository,
    private bucket: string,
  ) {}
  async put(key: string, bytes: Uint8Array, contentType: ImageType) {
    const { error } = await this.repo.storage.from(this.bucket).upload(key, bytes, { contentType, upsert: true, cacheControl: "private, max-age=0" });
    if (error) throw new Error(`Evidence upload failed: ${error.message}`);
  }
  async get(key: string) {
    const { data, error } = await this.repo.storage.from(this.bucket).download(key);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
  async remove(key: string) {
    await this.repo.storage.from(this.bucket).remove([key]);
  }
}

let store: ArtifactStore | null = null;
export function getArtifactStore(): ArtifactStore {
  if (store) return store;
  const repo = getRepository();
  store = repo instanceof SupabaseRepository ? new SupabaseArtifactStore(repo, config.evidenceBucket) : new LocalArtifactStore(config.artifactDir);
  return store;
}

/** Test hook. */
export function setArtifactStore(s: ArtifactStore | null) {
  store = s;
}
