import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

/** People take longer than this to fill in a form; most bots don't. */
export const MIN_FORM_FILL_MS = 3000;

/** A form submitted with the hidden honeypot filled, or impossibly fast, is a bot. */
export function looksLikeBot({ honeypot, startedAt }: { honeypot?: string; startedAt: number }) {
  if (honeypot && honeypot.trim() !== "") return { bot: true as const, reason: "honeypot" as const };
  const elapsed = Date.now() - startedAt;
  if (!Number.isFinite(elapsed) || elapsed < MIN_FORM_FILL_MS) {
    return { bot: true as const, reason: "too_fast" as const };
  }
  return { bot: false as const };
}

/**
 * Stable, non-reversible id for the visitor's IP address, used only for rate
 * limiting in the database. HMAC with a server secret so the raw IP is never
 * stored and the value can't be reversed with a lookup table.
 * Returns null when no IP is available (e.g. local development).
 */
export async function clientFingerprint(): Promise<string | null> {
  const ip = await clientIp();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!ip || !secret) return null;
  return createHmac("sha256", secret).update(`submission-ip:${ip}`).digest("hex");
}

/** The visitor's IP address from the hosting proxy headers (null locally). Never stored or logged. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
}
