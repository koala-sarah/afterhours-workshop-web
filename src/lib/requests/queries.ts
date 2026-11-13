import "server-only";

import { requireAdmin } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const REQUEST_PAGE_SIZE = 30;

/**
 * Requests from the website (form, chat), newest first, with their alert
 * delivery record. Read as the signed-in admin, so RLS applies.
 */
export async function listRequests(page = 1) {
  await requireAdmin("/admin");
  const supabase = await createSupabaseServerClient();
  const from = (Math.max(1, page) - 1) * REQUEST_PAGE_SIZE;

  const { data, count, error } = await supabase
    .from("inbox_entries")
    .select(
      "id, kind, created_at, completed_at, abandoned_at, last_step, vehicle_registration, registration_unknown, symptom_category, symptom_text, message, contact_name, contact_phone, contact_email, preferred_method, preferred_times, notifications(channel, kind, status, last_error)",
      { count: "exact" },
    )
    .in("kind", ["FORM", "INTAKE", "CONTACT_FORM"])
    .order("created_at", { ascending: false })
    .range(from, from + REQUEST_PAGE_SIZE - 1);

  if (error) throw new Error(`Could not load requests: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

export type RequestRow = Awaited<ReturnType<typeof listRequests>>["rows"][number];
