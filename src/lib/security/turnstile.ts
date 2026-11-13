import "server-only";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: "missing_token" | "rejected" | "unreachable" };

let warnedMissingSecret = false;

/**
 * Verifies a Cloudflare Turnstile token on the server.
 *
 * With no TURNSTILE_SECRET_KEY (local development, or before the keys are set)
 * verification is skipped and the other protections still apply: honeypot,
 * minimum fill time, per-client throttling in the database, Zod.
 */
export async function verifyTurnstile(token: string | undefined, ip: string | null, action: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("Turnstile is not configured (TURNSTILE_SECRET_KEY); verification skipped.");
    }
    return { ok: true, skipped: true } satisfies TurnstileResult;
  }
  if (!token) return { ok: false, reason: "missing_token" } satisfies TurnstileResult;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean; action?: string; "error-codes"?: string[] };
    if (data.success && (!data.action || data.action === action)) {
      return { ok: true, skipped: false } satisfies TurnstileResult;
    }
    console.warn("Turnstile rejected a submission", { action, errors: data["error-codes"] ?? [] });
    return { ok: false, reason: "rejected" } satisfies TurnstileResult;
  } catch (error) {
    console.error("Turnstile verification failed", { action, error: String(error) });
    return { ok: false, reason: "unreachable" } satisfies TurnstileResult;
  }
}
