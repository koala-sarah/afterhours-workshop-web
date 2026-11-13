"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertAdminWritable } from "@/lib/admin/read-only";

export type AdminActionState = { status: "idle" | "success" | "error"; message?: string };

const ERRORS: Record<string, string> = {
  slot_conflict:
    "That time overlaps an approved booking (bookings at the same time are limited by the booking settings). Choose another time.",
  invalid_transition: "That change isn’t possible from the appointment’s current status. The page has been refreshed.",
  past_date: "That date and time has already passed.",
  invalid_date: "Please choose a date and time.",
  invalid_duration: "Duration must be between 15 minutes and 24 hours.",
  duplicate_request: "This customer already has an open request for the same vehicle, service and time.",
  not_found: "This appointment no longer exists.",
  forbidden: "You don’t have permission to do that.",
  invalid_note: "Notes must be between 1 and 2000 characters.",
  vehicle_mismatch: "That vehicle belongs to a different customer.",
};

const id = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Please choose a date." });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Please choose a time." });
const duration = z.coerce.number().int().min(15).max(1440);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

const schemas = {
  approve: z.object({ id, date, time, duration, note: optionalText(500) }),
  decline: z.object({ id, reason: optionalText(500) }),
  propose: z.object({ id, date, time, duration, message: optionalText(500) }),
  status: z.object({
    id,
    status: z.enum(["CANCELLED", "COMPLETED", "PENDING"]),
    reason: optionalText(500),
  }),
  note: z.object({ id, note: z.string().trim().min(1, { error: "Write a note first." }).max(2000) }),
  vehicle: z.object({ id, vehicleId: z.uuid({ error: "Choose a vehicle." }) }),
};

type Kind = keyof typeof schemas;

const SUCCESS: Record<Kind, string> = {
  approve: "Appointment approved.",
  decline: "Request declined.",
  propose: "New time proposed. Let the customer know, then approve once they agree.",
  status: "Status updated.",
  note: "Note added.",
  vehicle: "Vehicle updated.",
};

async function run<K extends Kind>(
  kind: K,
  formData: FormData,
  call: (
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
    input: z.output<(typeof schemas)[K]>,
  ) => PromiseLike<{ error: { code?: string; message: string } | null }>,
): Promise<AdminActionState> {
  // Re-check on every action: never trust that the page was rendered for an admin.
  await requireAdmin("/admin/appointments");

  const parsed = schemas[kind].safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await call(supabase, parsed.data as z.output<(typeof schemas)[K]>);
  if (error) {
    const known = error.code === "P0001" ? ERRORS[error.message] : undefined;
    if (!known) console.error(`appointment ${kind} failed`, { code: error.code, message: error.message });
    refresh();
    return { status: "error", message: known ?? "Something went wrong. Please try again." };
  }

  refresh();
  return { status: "success", message: SUCCESS[kind] };
}

export async function approveAppointment(_: AdminActionState, formData: FormData) {
  assertAdminWritable();
  return run("approve", formData, (supabase, v) =>
    supabase.rpc("approve_appointment", {
      p_appointment_id: v.id,
      p_date: v.date,
      p_time: v.time,
      p_duration_minutes: v.duration,
      p_note: v.note,
    }),
  );
}

export async function declineAppointment(_: AdminActionState, formData: FormData) {
  assertAdminWritable();
  return run("decline", formData, (supabase, v) =>
    supabase.rpc("decline_appointment", { p_appointment_id: v.id, p_reason: v.reason }),
  );
}

export async function proposeAppointmentTime(_: AdminActionState, formData: FormData) {
  assertAdminWritable();
  return run("propose", formData, (supabase, v) =>
    supabase.rpc("propose_appointment_time", {
      p_appointment_id: v.id,
      p_date: v.date,
      p_time: v.time,
      p_duration_minutes: v.duration,
      p_message: v.message,
    }),
  );
}

export async function updateAppointmentStatus(_: AdminActionState, formData: FormData) {
  assertAdminWritable();
  return run("status", formData, (supabase, v) =>
    supabase.rpc("update_appointment_status", {
      p_appointment_id: v.id,
      p_status: v.status,
      p_reason: v.reason,
    }),
  );
}

export async function addAppointmentNote(_: AdminActionState, formData: FormData) {
  assertAdminWritable();
  return run("note", formData, (supabase, v) =>
    supabase.rpc("add_appointment_note", { p_appointment_id: v.id, p_note: v.note }),
  );
}

/** Link the appointment to another of the same customer's vehicles. */
export async function setAppointmentVehicle(_: AdminActionState, formData: FormData) {
  assertAdminWritable();
  return run("vehicle", formData, (supabase, v) =>
    supabase.rpc("set_appointment_vehicle", { p_appointment_id: v.id, p_vehicle_id: v.vehicleId }),
  );
}
