import "server-only";
import { NextResponse } from "next/server";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function error(message: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status);
}

/** Log the real error server-side; return a generic message to the client. */
export function serverError(err: unknown, context: string) {
  console.error(`[api] ${context}`, err);
  return error("Something went wrong on our side. Please try again.", 500);
}
