import "server-only";

import { searchFilter } from "@/lib/admin/search";
import { requireAdmin } from "@/lib/auth/dal";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { normalizeEmail, normalizePhone, type CustomerMatch } from "./schema";

/**
 * Admin customer and vehicle queries. Every function checks requireAdmin() and
 * queries as the signed-in admin, so Row Level Security applies on top.
 */

export const CUSTOMER_PAGE_SIZE = 25;

export type CustomerListRow = Database["public"]["Views"]["admin_customers"]["Row"];
export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

export async function listCustomers(options: { query?: string; page?: number }) {
  await requireAdmin("/admin/customers");
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * CUSTOMER_PAGE_SIZE;

  let request = supabase
    .from("admin_customers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + CUSTOMER_PAGE_SIZE - 1);

  if (options.query) {
    const filter = searchFilter(options.query, {
      name: "full_name",
      email: "email_normalized",
      phone: "phone_normalized",
      registration: "registrations",
    });
    if (!filter) return { rows: [] as CustomerListRow[], total: 0, page };
    request = request.or(filter);
  }

  const { data, count, error } = await request;
  if (error) throw new Error(`Could not load customers: ${error.message}`);
  return { rows: data, total: count ?? 0, page };
}

/** Newest customers, for the overview. */
export async function listRecentCustomers(limit = 5) {
  await requireAdmin("/admin");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("admin_customers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load customers: ${error.message}`);
  return data;
}

export async function getCustomer(id: string) {
  await requireAdmin(`/admin/customers/${id}`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load customer: ${error.message}`);
  return data;
}

/** Everything shown on the customer profile. */
export async function getCustomerProfile(id: string) {
  const customer = await getCustomer(id);
  if (!customer) return null;
  const supabase = await createSupabaseServerClient();

  const [vehicles, appointments, enquiries, activities, sharedPhone] = await Promise.all([
    supabase.from("vehicles").select("*").eq("customer_id", id).order("created_at"),
    supabase
      .from("admin_appointments")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("enquiries")
      .select("id, subject, message, source, status, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("activities")
      .select("id, activity_type, description, related_type, related_id, created_at, author:profiles(full_name, email)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    customer.phone_normalized
      ? supabase
          .from("customers")
          .select("id, full_name, email, phone")
          .eq("phone_normalized", customer.phone_normalized)
          .neq("id", id)
          .limit(5)
      : Promise.resolve({ data: [] as CustomerMatch[], error: null }),
  ]);

  for (const result of [vehicles, appointments, enquiries, activities, sharedPhone]) {
    if (result.error) throw new Error(`Could not load the customer profile: ${result.error.message}`);
  }

  return {
    customer,
    vehicles: vehicles.data ?? [],
    appointments: appointments.data ?? [],
    enquiries: enquiries.data ?? [],
    activities: activities.data ?? [],
    sharedPhone: sharedPhone.data ?? [],
  };
}

export type CustomerProfile = NonNullable<Awaited<ReturnType<typeof getCustomerProfile>>>;

export async function getVehicle(customerId: string, vehicleId: string) {
  await requireAdmin(`/admin/customers/${customerId}`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", vehicleId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`Could not load vehicle: ${error.message}`);
  return data;
}

/** The customer's vehicles, for linking an appointment to the right one. */
export async function listCustomerVehicles(customerId: string) {
  await requireAdmin("/admin/appointments");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, make, model, year, registration_number")
    .eq("customer_id", customerId)
    .order("created_at");
  if (error) throw new Error(`Could not load vehicles: ${error.message}`);
  return data;
}

/**
 * Existing customers that clash with an email or phone number.
 * Email is unique per customer; a shared phone is allowed (households) but
 * worth a second look before creating another profile.
 */
export async function findCustomerMatches(input: { email: string; phone: string; excludeId?: string }) {
  await requireAdmin("/admin/customers");
  const supabase = await createSupabaseServerClient();
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);

  const lookup = async (column: "email_normalized" | "phone_normalized", value: string | null) => {
    if (!value) return [] as CustomerMatch[];
    let query = supabase.from("customers").select("id, full_name, email, phone").eq(column, value).limit(5);
    if (input.excludeId) query = query.neq("id", input.excludeId);
    const { data, error } = await query;
    if (error) throw new Error(`Could not check for duplicates: ${error.message}`);
    return data;
  };

  const [byEmail, byPhone] = await Promise.all([lookup("email_normalized", email), lookup("phone_normalized", phone)]);
  return { byEmail, byPhone };
}
