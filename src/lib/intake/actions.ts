"use server";

import { after } from "next/server";
import { z } from "zod";

import { REQUEST_FORM_VERSION } from "@/config/intake";
import { siteConfig } from "@/config/site";
import { dispatchSafely } from "@/lib/notifications/dispatch";
import { clientFingerprint, clientIp, looksLikeBot } from "@/lib/security/spam";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

import {
  requestFormSchema,
  toRequestAnswers,
  type RequestField,
  type SubmitResult,
} from "./request-schema";

const CALL_US = `Please call us on ${siteConfig.contact.phoneDisplay} or email ${siteConfig.contact.email}.`;
const SERVER_ERROR = `Sorry, something went wrong on our side. ${CALL_US}`;

type Known<F extends string> = { message: string; field?: F };

/** Database error codes (docs/DATABASE.md) -> what the visitor sees. */
const COMMON_ERRORS = {
  too_many_requests: { message: `We’ve received several messages from you already. ${CALL_US}` },
  invalid_input: { message: "Please check your details and try again." },
} as const;

const REQUEST_ERRORS: Record<string, Known<RequestField>> = {
  ...COMMON_ERRORS,
  invalid_name: { field: "name", message: "Please enter your name." },
  invalid_phone: { field: "phone", message: "Please enter a valid phone number." },
  invalid_email: { field: "email", message: "Please enter a valid email address." },
  invalid_registration: { field: "registration", message: "Please enter the registration, or tick “I’m not sure”." },
  invalid_method: { field: "method", message: "Please choose how we should contact you." },
};

/**
 * One-screen request form (/appointments).
 *
 * Order: bot heuristics -> Turnstile -> Zod -> database function (validation
 * again, grouping by phone, double-submit check, per-client throttling).
 * The database queues the operator alerts in the same transaction; they are
 * sent after the response (after()) and can never lose the request.
 */
export async function submitRequest(input: unknown): Promise<SubmitResult<RequestField>> {
  return submit(input, {
    schema: requestFormSchema,
    kind: "FORM",
    action: "request",
    toAnswers: toRequestAnswers,
    flowVersion: REQUEST_FORM_VERSION,
    errors: REQUEST_ERRORS,
  });
}

type SpamFields = { website?: string; startedAt: number; turnstileToken?: string };

async function submit<S extends z.ZodType<SpamFields>, F extends string>(
  input: unknown,
  opts: {
    schema: S;
    kind: "FORM";
    action: string;
    toAnswers: (v: z.output<S>) => object;
    flowVersion: string;
    errors: Record<string, Known<F>>;
  },
): Promise<SubmitResult<F>> {
  const raw = (input ?? {}) as Record<string, unknown>;

  // 1. Spam heuristics. A filled honeypot gets a normal-looking success; nothing is stored.
  const bot = looksLikeBot({
    honeypot: typeof raw.website === "string" ? raw.website : undefined,
    startedAt: Number(raw.startedAt),
  });
  if (bot.bot && bot.reason === "honeypot") return { status: "success" };
  if (bot.bot) return { status: "error", message: "Please check your details, then send again." };

  // 2. Turnstile (skipped only while TURNSTILE_SECRET_KEY is not set).
  const turnstile = await verifyTurnstile(
    typeof raw.turnstileToken === "string" ? raw.turnstileToken : undefined,
    await clientIp(),
    opts.action,
  );
  if (!turnstile.ok) {
    return {
      status: "error",
      message:
        turnstile.reason === "unreachable"
          ? `We couldn’t check that you’re not a robot. Please try again. ${CALL_US}`
          : "Please complete the check that you’re not a robot, then send again.",
    };
  }

  // 3. Server-side validation (never trust the client).
  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const fieldErrors: Partial<Record<F, string>> = {};
    for (const [key, messages] of Object.entries(flat)) {
      if (messages?.[0]) fieldErrors[key as F] = messages[0];
    }
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }

  // 4. Save: server-only database function, throttled per client fingerprint.
  const supabase = createSupabaseServiceClient();
  const { data: entryId, error } = await supabase.rpc("submit_inbox_form", {
    p_kind: opts.kind,
    p_answers: opts.toAnswers(parsed.data) as Json,
    p_flow_version: opts.flowVersion,
    p_client_fingerprint: (await clientFingerprint()) ?? undefined,
  });

  if (error) {
    const known = error.code === "P0001" ? opts.errors[error.message] : undefined;
    if (known) {
      const fieldErrors: Partial<Record<F, string>> = {};
      if (known.field) fieldErrors[known.field] = known.message;
      return { status: "error", message: known.message, fieldErrors };
    }
    // No personal details in logs: kind and database error only.
    console.error("submit_inbox_form failed", { kind: opts.kind, code: error.code, message: error.message });
    return { status: "error", message: SERVER_ERROR };
  }

  console.info("request saved", { kind: opts.kind, entryId });
  // Alert the operator after the response is sent; the visitor never waits and a failure can't undo the save.
  after(dispatchSafely);
  return { status: "success" };
}
