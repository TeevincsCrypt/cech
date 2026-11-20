import "server-only";
import { connection } from "next/server";
import { getRepository } from "@/lib/store";

/** Read the demo mode at request time (never prerendered or cached). */
export async function getDemoMode(): Promise<"healthy" | "broken"> {
  await connection();
  try {
    return (await getRepository().getDemoSettings()).mode;
  } catch {
    return "healthy";
  }
}
