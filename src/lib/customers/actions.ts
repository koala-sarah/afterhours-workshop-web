"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { AdminActionState } from "@/lib/appointments/actions";
import { requireAdmin } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { findCustomerMatches } from "./queries";
import {
  customerFormSchema,
  vehicleFormSchema,
  type CustomerField,
  type FormResult,
  type VehicleField,
} from "./schema";

const uuid = z.uuid();
const GENERIC_ERROR = "Something went wrong. Please try again.";

type DbError = { code?: string; message: string } | null;

function firstFieldErrors<F extends string>(error: z.ZodError): Partial<Record<F, string>> {
  const fieldErrors: Partial<Record<F, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as F | undefined;
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function isUniqueViolation(error: DbError, constraint: string) {
  return error?.code === "23505" && error.message.includes(constraint);
}

const EMAIL_TAKEN = "Another customer already has this email address. Open their profile instead.";

// -----------------------------------------------------------------------------
// Customers
// -----------------------------------------------------------------------------

export async function createCustomer(input: unknown): Promise<FormResult<CustomerField>> {
  await requireAdmin("/admin/customers/new");
  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors: firstFieldErrors(parsed.error) };
  }
  const v = parsed.data;

  // One profile per customer: never create a second profile for an email,
  // and ask before creating one for a phone number that's already on file.
  const { byEmail, byPhone } = await findCustomerMatches({ email: v.email, phone: v.phone });
  if (byEmail.length > 0) {
    return { status: "error", message: EMAIL_TAKEN, fieldErrors: { email: EMAIL_TAKEN }, matches: byEmail };
  }
  if (byPhone.length > 0 && !v.confirmSharedPhone) {
    return {
      status: "confirm",
      message:
        "A customer with this phone number already exists. If it’s the same person, open their profile instead. Create a new profile only if this is a different person (for example, a shared household number).",
      matches: byPhone,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      full_name: v.fullName,
      email: v.email || null,
      phone: v.phone || null,
      notes: v.notes || null,
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error, "customers_email_normalized_key")) {
      return { status: "error", message: EMAIL_TAKEN, fieldErrors: { email: EMAIL_TAKEN } };
    }
    console.error("create customer failed", { code: error.code, message: error.message });
    return { status: "error", message: GENERIC_ERROR };
  }
  return { status: "success", redirectTo: `/admin/customers/${data.id}` };
}

export async function updateCustomer(id: string, input: unknown): Promise<FormResult<CustomerField>> {
  if (!uuid.safeParse(id).success) return { status: "error", message: "This customer no longer exists." };
  await requireAdmin(`/admin/customers/${id}/edit`);
  const parsed = customerFormSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors: firstFieldErrors(parsed.error) };
  }
  const v = parsed.data;

  const { byEmail } = await findCustomerMatches({ email: v.email, phone: "", excludeId: id });
  if (byEmail.length > 0) {
    return { status: "error", message: EMAIL_TAKEN, fieldErrors: { email: EMAIL_TAKEN }, matches: byEmail };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .update({
      full_name: v.fullName,
      email: v.email || null,
      phone: v.phone || null,
      notes: v.notes || null,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    if (isUniqueViolation(error, "customers_email_normalized_key")) {
      return { status: "error", message: EMAIL_TAKEN, fieldErrors: { email: EMAIL_TAKEN } };
    }
    console.error("update customer failed", { code: error.code, message: error.message });
    return { status: "error", message: GENERIC_ERROR };
  }
  if (!data?.length) return { status: "error", message: "This customer no longer exists." };
  return { status: "success", redirectTo: `/admin/customers/${id}` };
}

const noteSchema = z.object({
  id: uuid,
  note: z.string().trim().min(1, { error: "Write a note first." }).max(2000, { error: "Notes must be under 2000 characters." }),
});

/** Internal note on the customer's history (admins only, never shown to customers). */
export async function addCustomerNote(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin("/admin/customers");
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the note." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("activities").insert({
    customer_id: parsed.data.id,
    related_type: "CUSTOMER",
    related_id: parsed.data.id,
    activity_type: "customer.note",
    description: parsed.data.note,
    created_by: admin.id,
  });
  if (error) {
    console.error("add customer note failed", { code: error.code, message: error.message });
    return { status: "error", message: error.code === "23503" ? "This customer no longer exists." : GENERIC_ERROR };
  }
  refresh();
  return { status: "success", message: "Note added." };
}

// -----------------------------------------------------------------------------
// Vehicles
// -----------------------------------------------------------------------------

const PLATE_TAKEN = "This customer already has a vehicle with this registration.";

const LINK_ERRORS: Record<string, string> = {
  vehicle_mismatch: "That vehicle belongs to a different customer.",
  duplicate_request: "This customer already has an open request for that vehicle, service and time.",
  not_found: "That appointment no longer exists.",
  forbidden: "You don’t have permission to do that.",
};

/**
 * Add a vehicle (vehicleId null) or edit one. With `linkAppointmentId`, a new
 * vehicle is also linked to that appointment (same customer only).
 */
export async function saveVehicle(
  customerId: string,
  vehicleId: string | null,
  linkAppointmentId: string | null,
  input: unknown,
): Promise<FormResult<VehicleField>> {
  if (!uuid.safeParse(customerId).success || (vehicleId && !uuid.safeParse(vehicleId).success)) {
    return { status: "error", message: "This vehicle no longer exists." };
  }
  const linkTo = linkAppointmentId && uuid.safeParse(linkAppointmentId).success ? linkAppointmentId : undefined;
  await requireAdmin(`/admin/customers/${customerId}`);

  const parsed = vehicleFormSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors: firstFieldErrors(parsed.error) };
  }
  const v = parsed.data;
  const values = {
    make: v.make,
    model: v.model,
    year: v.year ? Number(v.year) : null,
    registration_number: v.registrationNumber ? v.registrationNumber.toUpperCase() : null,
    additional_information: v.additionalInformation || null,
  };

  const supabase = await createSupabaseServerClient();
  let savedId = vehicleId;
  let error: DbError;
  if (vehicleId) {
    // customer_id can't be changed (the database only allows these columns).
    const result = await supabase
      .from("vehicles")
      .update(values)
      .eq("id", vehicleId)
      .eq("customer_id", customerId)
      .select("id");
    error = result.error;
    if (!error && !result.data?.length) return { status: "error", message: "This vehicle no longer exists." };
  } else {
    const result = await supabase
      .from("vehicles")
      .insert({ ...values, customer_id: customerId })
      .select("id")
      .single();
    error = result.error;
    savedId = result.data?.id ?? null;
  }

  if (error) {
    if (isUniqueViolation(error, "vehicles_customer_registration_key")) {
      return { status: "error", message: PLATE_TAKEN, fieldErrors: { registrationNumber: PLATE_TAKEN } };
    }
    if (error.code === "23503") return { status: "error", message: "This customer no longer exists." };
    console.error("save vehicle failed", { code: error.code, message: error.message });
    return { status: "error", message: GENERIC_ERROR };
  }

  if (linkTo && savedId && !vehicleId) {
    const { error: linkError } = await supabase.rpc("set_appointment_vehicle", {
      p_appointment_id: linkTo,
      p_vehicle_id: savedId,
    });
    if (linkError) {
      const known = linkError.code === "P0001" ? LINK_ERRORS[linkError.message] : undefined;
      if (!known) console.error("link vehicle failed", { code: linkError.code, message: linkError.message });
      return {
        status: "error",
        message: `The vehicle was added, but it couldn’t be linked to the appointment. ${known ?? GENERIC_ERROR}`,
      };
    }
    return { status: "success", redirectTo: `/admin/appointments/${linkTo}` };
  }

  return { status: "success", redirectTo: `/admin/customers/${customerId}#vehicles` };
}
