import "server-only";

import { searchFilter } from "@/lib/admin/search";
import { requireAdmin } from "@/lib/auth/dal";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { APPOINTMENT_STATUSES, toLocalParts, type AppointmentStatus } from "./format";

/**
 * Admin appointment queries. Every function checks requireAdmin() and queries
 * as the signed-in admin, so Row Level Security applies on top.
 */

export const PAGE_SIZE = 25;

export type AppointmentListRow = Database["public"]["Views"]["admin_appointments"]["Row"];

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === "string" && (APPOINTMENT_STATUSES as string[]).includes(value);
}

export async function listAppointments(options: {
  status?: AppointmentStatus;
  query?: string;
  page?: number;
}) {
  await requireAdmin("/admin/appointments");
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;

  let request = supabase
    .from("admin_appointments")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (options.status) request = request.eq("status", options.status);

  if (options.query) {
    const filter = searchFilter(options.query, {
      name: "customer_name",
      email: "email_normalized",
      phone: "phone_normalized",
      registration: "registration_normalized",
    });
    if (!filter) return { rows: [] as AppointmentListRow[], total: 0, page };
    request = request.or(filter);
  }

  const { data, count, error } = await request;
  if (error) throw new Error(`Could not load appointments: ${error.message}`);
  return { rows: data, total: count ?? 0, page };
}

/** Number of appointments in each status (for the filter tabs and overview). */
export async function countAppointmentsByStatus(): Promise<Record<AppointmentStatus, number>> {
  await requireAdmin("/admin/appointments");
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all(
    APPOINTMENT_STATUSES.map((status) =>
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  );
  return Object.fromEntries(
    APPOINTMENT_STATUSES.map((status, i) => [status, results[i].count ?? 0]),
  ) as Record<AppointmentStatus, number>;
}

/** Approved bookings that start from now on, soonest first. */
export async function listUpcomingApproved(limit = 5) {
  await requireAdmin("/admin");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("admin_appointments")
    .select("*")
    .eq("status", "APPROVED")
    .gte("scheduled_start", new Date().toISOString())
    .order("scheduled_start")
    .limit(limit);
  if (error) throw new Error(`Could not load upcoming appointments: ${error.message}`);
  return data;
}

export async function getAppointmentDetail(id: string) {
  await requireAdmin(`/admin/appointments/${id}`);
  const supabase = await createSupabaseServerClient();

  const { data: appointment, error } = await supabase
    .from("appointments")
    .select(
      `*,
       customer:customers(id, full_name, email, phone, notes, created_at),
       vehicle:vehicles!appointments_vehicle_id_fkey(id, make, model, year, registration_number, additional_information),
       service:services(id, name, price_label),
       approver:profiles(full_name, email)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load appointment: ${error.message}`);
  if (!appointment) return null;

  const [activities, otherRequests] = await Promise.all([
    supabase
      .from("activities")
      .select("id, activity_type, description, created_at, author:profiles(full_name, email)")
      .eq("related_type", "APPOINTMENT")
      .eq("related_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("admin_appointments")
      .select("id, status, created_at, preferred_date, preferred_time, scheduled_start, service_name")
      .eq("customer_id", appointment.customer_id)
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (activities.error) throw new Error(`Could not load history: ${activities.error.message}`);
  if (otherRequests.error) throw new Error(`Could not load customer history: ${otherRequests.error.message}`);

  return { appointment, activities: activities.data, otherRequests: otherRequests.data };
}

export type AppointmentDetail = NonNullable<Awaited<ReturnType<typeof getAppointmentDetail>>>;

/**
 * Approved bookings on the given local dates, so the admin can see the day's
 * schedule before approving. (The database still enforces conflicts.)
 */
export async function listApprovedOnDates(dates: string[], excludeId?: string) {
  await requireAdmin("/admin/appointments");
  const unique = [...new Set(dates.filter(Boolean))];
  if (unique.length === 0) return {} as Record<string, AppointmentListRow[]>;

  const sorted = [...unique].sort();
  // Pad by a day either side; local-date filtering happens below.
  const from = new Date(`${sorted[0]}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${sorted.at(-1)}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("admin_appointments")
    .select("*")
    .eq("status", "APPROVED")
    .gte("scheduled_start", from.toISOString())
    .lt("scheduled_start", to.toISOString())
    .order("scheduled_start");
  if (error) throw new Error(`Could not load the schedule: ${error.message}`);

  const byDate: Record<string, AppointmentListRow[]> = {};
  for (const date of unique) byDate[date] = [];
  for (const row of data) {
    if (!row.scheduled_start || row.id === excludeId) continue;
    const local = toLocalParts(row.scheduled_start).date;
    byDate[local]?.push(row);
  }
  return byDate;
}

/** Booking settings needed by the approve / propose forms. */
export async function getDefaultDuration() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("business_settings")
    .select("appointment_duration_minutes")
    .limit(1)
    .maybeSingle();
  return data?.appointment_duration_minutes ?? 60;
}
