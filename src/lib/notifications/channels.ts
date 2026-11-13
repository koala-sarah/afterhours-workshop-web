import "server-only";

import type { Alert } from "./format";

export type SendResult = { ok: true; recipients: string[] } | { ok: false; error: string };

const TIMEOUT_MS = 10_000;

/** Telegram is on when both the bot token and the group's chat id are set. */
export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** The email backup is on when a Resend key and a recipient are set. */
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO);
}

/** Telegram Bot API sendMessage to the operators' group. */
export async function sendTelegram(alert: Alert): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: alert.telegramHtml,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (res.ok && data?.ok) return { ok: true, recipients: ["telegram"] };
    // Telegram's description ("Unauthorized", "chat not found") never contains the token.
    return { ok: false, error: `telegram ${res.status}: ${data?.description ?? "unknown error"}` };
  } catch (error) {
    return { ok: false, error: `telegram: ${errorName(error)}` };
  }
}

/** Resend email to NOTIFY_EMAIL_TO (comma-separated list allowed). */
export async function sendEmail(alert: Alert): Promise<SendResult> {
  const to = process.env.NOTIFY_EMAIL_TO!.split(",").map((s) => s.trim()).filter(Boolean);
  // Until the domain is verified in Resend, its test sender only delivers to the Resend account's own address.
  const from = process.env.NOTIFY_EMAIL_FROM || "Afterhours Workshop <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: alert.subject, text: alert.text, html: alert.html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, recipients: to };
    const data = (await res.json().catch(() => null)) as { message?: string; name?: string } | null;
    return { ok: false, error: `resend ${res.status}: ${data?.name ?? ""} ${data?.message ?? ""}`.trim() };
  } catch (error) {
    return { ok: false, error: `resend: ${errorName(error)}` };
  }
}

function errorName(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
}
