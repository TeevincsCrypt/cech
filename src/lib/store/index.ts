import "server-only";
import { config } from "@/lib/server/config";
import { LocalFileRepository } from "./local";
import { SupabaseRepository } from "./supabase";
import type { Repository } from "./types";

let instance: Repository | null = null;

/** Supabase when configured; otherwise a local JSON file for development. */
export function getRepository(): Repository {
  if (instance) return instance;
  const { url, serviceRoleKey } = config.supabase;
  instance =
    url && serviceRoleKey
      ? new SupabaseRepository(url, serviceRoleKey)
      : new LocalFileRepository(config.localDataFile);
  return instance;
}

export type { Repository } from "./types";
