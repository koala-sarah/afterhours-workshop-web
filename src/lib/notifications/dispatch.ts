import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { emailConfigured, sendEmail, sendTelegram, telegramConfigured, type SendResult } from "./channels";
import { buildAlert, type AlertData } from "./format";

type Counts = { sent: number; failed: number; skipped: number };

/**
 * Sends due operator alerts (spec section 10).
 *
 * `claim_notifications` hands out each due row once (and schedules a retry
 * with back-off, up to 5 attempts); every result is recorded with
 * `finish_notification`. A channel without credentials is recorded as
 * SKIPPED. Nothing here can affect the saved request. Logs carry ids and
 * errors only, never customer details.
 */
export async function dispatchDueNotifications(limit = 10): Promise<Counts> {
  const counts: Counts = { sent: 0, failed: 0, skipped: 0 };
  const supabase = createSupabaseServiceClient();

  const { data: due, error } = await supabase.rpc("claim_notifications", { p_limit: limit });
  if (error) {
    console.error("claim_notifications failed", { code: error.code, message: error.message });
    return counts;
  }

  for (const n of due ?? []) {
    const configured = n.channel === "TELEGRAM" ? telegramConfigured() : emailConfigured();
    let result: SendResult | "skipped";

    if (!configured) {
      result = "skipped";
    } else {
      const data = await loadAlertData(supabase, n.entry_id, n.kind as AlertData["kind"]);
      if (!data) {
        result = { ok: false, error: "request not found" };
      } else {
        const alert = buildAlert(data);
        result = n.channel === "TELEGRAM" ? await sendTelegram(alert) : await sendEmail(alert);
      }
    }

    const finish =
      result === "skipped"
        ? { p_status: "SKIPPED" as const, p_error: `${n.channel.toLowerCase()} not configured` }
        : result.ok
          ? { p_status: "SENT" as const, p_recipients: result.recipients }
          : { p_status: "FAILED" as const, p_error: result.error };

    if (result === "skipped") counts.skipped++;
    else if (result.ok) counts.sent++;
    else {
      counts.failed++;
      console.error("notification failed", {
        notificationId: n.id,
        entryId: n.entry_id,
        channel: n.channel,
        attempt: n.attempts,
        error: result.error,
      });
    }

    const { error: finishError } = await supabase.rpc("finish_notification", { p_id: n.id, ...finish });
    if (finishError) {
      console.error("finish_notification failed", { notificationId: n.id, code: finishError.code, message: finishError.message });
    }
  }

  if (counts.sent + counts.failed + counts.skipped > 0) console.info("notifications dispatched", counts);
  return counts;
}

/** Same as dispatchDueNotifications, but never throws (for after()). */
export async function dispatchSafely() {
  try {
    await dispatchDueNotifications();
  } catch (error) {
    console.error("notification dispatch crashed", { error: error instanceof Error ? error.message : "unknown" });
  }
}

async function loadAlertData(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  entryId: string,
  kind: AlertData["kind"],
): Promise<AlertData | null> {
  const { data: e } = await supabase
    .from("inbox_entries")
    .select(
      "id, kind, created_at, item_id, vehicle_registration, registration_unknown, symptom_category, symptom_text, message, contact_name, contact_phone, contact_email, preferred_method, preferred_times, last_step, inbox_items(phone_normalized, email_normalized)",
    )
    .eq("id", entryId)
    .maybeSingle();
  if (!e) return null;

  // Repeat customer: an earlier request from the same phone (or email when there is no phone).
  const item = e.inbox_items as { phone_normalized: string | null; email_normalized: string | null } | null;
  let repeat = false;
  const match = item?.phone_normalized
    ? { column: "phone_normalized" as const, value: item.phone_normalized }
    : item?.email_normalized
      ? { column: "email_normalized" as const, value: item.email_normalized }
      : null;
  if (match) {
    const { count } = await supabase
      .from("inbox_entries")
      .select("id, inbox_items!inner(id)", { count: "exact", head: true })
      .eq(`inbox_items.${match.column}`, match.value)
      .lt("created_at", e.created_at)
      .neq("id", e.id)
      .in("kind", ["INTAKE", "FORM", "CONTACT_FORM"]);
    repeat = (count ?? 0) > 0;
  }

  return {
    kind,
    entryKind: e.kind,
    createdAt: e.created_at,
    repeat,
    registration: e.vehicle_registration,
    registrationUnknown: e.registration_unknown,
    problem: e.symptom_category,
    note: e.symptom_text,
    message: e.message,
    name: e.contact_name,
    phone: e.contact_phone,
    email: e.contact_email,
    method: e.preferred_method,
    times: e.preferred_times ?? [],
    lastStep: e.last_step,
  };
}
