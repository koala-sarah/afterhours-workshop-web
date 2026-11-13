"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { after } from "next/server";

import { CHAT_FLOW_VERSION } from "@/config/intake";
import { siteConfig } from "@/config/site";
import { dispatchSafely } from "@/lib/notifications/dispatch";
import { clientFingerprint, clientIp } from "@/lib/security/spam";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

import { chatStepSchema, type ChatStepResult } from "./chat-schema";

/** Anonymous chat session. Only the SHA-256 of the token is stored in the database. */
const COOKIE = "ahw_chat";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // sessions are kept 30 days

const CALL_US = `Please call us on ${siteConfig.contact.phoneDisplay} or email ${siteConfig.contact.email}.`;

const DB_ERRORS: Record<string, string> = {
  invalid_name: "Please enter your name.",
  invalid_phone: "Please enter a valid phone number.",
  invalid_email: "Please enter a valid email address.",
  contact_required: "Please enter your name and phone number first.",
  invalid_input: "Please check your answer and try again.",
  too_many_requests: `We’ve received several requests from you already. ${CALL_US}`,
};
const SESSION_ERRORS = new Set(["session_not_found", "session_completed", "session_expired"]);

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Saves one step of the request chat.
 *
 * The first step (`fresh`) passes Turnstile and starts a new session (new
 * httpOnly cookie). Every later step merges its answers into that session.
 * From the contact step on, the request exists in the database even if the
 * visitor leaves; the last step finishes it and queues the operator alert.
 */
export async function saveChatStep(input: unknown): Promise<ChatStepResult> {
  const parsed = chatStepSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your answer." };
  }
  const { fresh, step, answers, turnstileToken } = parsed.data;
  const complete = step === "times";

  const supabase = createSupabaseServiceClient();
  const jar = await cookies();
  let token = jar.get(COOKIE)?.value;

  if (fresh) {
    const check = await verifyTurnstile(turnstileToken, await clientIp(), "chat");
    if (!check.ok) {
      return {
        status: "error",
        message:
          check.reason === "unreachable"
            ? `We couldn’t check that you’re not a robot. Please try again. ${CALL_US}`
            : "Please complete the check that you’re not a robot, then try again.",
      };
    }
    token = randomBytes(32).toString("hex");
    const { error } = await supabase.rpc("intake_start", {
      p_token_hash: hash(token),
      p_client_fingerprint: (await clientFingerprint()) ?? undefined,
      p_flow_version: CHAT_FLOW_VERSION,
    });
    if (error) return dbError("intake_start", error);
    jar.set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  if (!token || !/^[0-9a-f]{64}$/.test(token)) return { status: "expired" };

  const { error } = await supabase.rpc("intake_save_step", {
    p_token_hash: hash(token),
    p_step: step,
    p_answers: answers as Json,
    p_complete: complete,
  });
  if (error) {
    if (error.code === "P0001" && SESSION_ERRORS.has(error.message)) {
      jar.delete(COOKIE);
      return { status: "expired" };
    }
    return dbError("intake_save_step", error);
  }

  if (complete) {
    jar.delete(COOKIE);
    after(dispatchSafely); // operator alert, sent after the response
  }
  return { status: "ok" };
}

function dbError(fn: string, error: { code?: string; message: string }): ChatStepResult {
  const known = error.code === "P0001" ? DB_ERRORS[error.message] : undefined;
  if (known) return { status: "error", message: known };
  // No personal details in logs: function and database error only.
  console.error(`${fn} failed`, { code: error.code, message: error.message });
  return { status: "error", message: `Sorry, something went wrong on our side. ${CALL_US}` };
}
