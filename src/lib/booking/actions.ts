"use server";

import { z } from "zod";

import { siteConfig } from "@/config/site";
import { clientFingerprint, looksLikeBot } from "@/lib/security/spam";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  bookingFormSchema,
  type BookingField,
  type BookingResult,
} from "./schema";

const CALL_US = `Please call us on ${siteConfig.contact.phoneDisplay} or email ${siteConfig.contact.email}.`;

/** Database error codes (see docs/DATABASE.md) -> what the visitor sees. */
const DB_ERRORS: Record<string, { message: string; field?: BookingField }> = {
  invalid_name: { field: "fullName", message: "Please enter your full name." },
  invalid_email: { field: "email", message: "Please enter a valid email address." },
  invalid_phone: { field: "phone", message: "Please enter a valid phone number." },
  invalid_vehicle: { field: "registrationNumber", message: "Please check your vehicle details." },
  invalid_service: { field: "serviceId", message: "Please choose a service." },
  invalid_description: { field: "description", message: "Please describe the problem or work needed." },
  invalid_date: { field: "preferredDate", message: "Please choose a date and time." },
  past_date: { field: "preferredDate", message: "Please choose a date and time in the future." },
  closed_day: { field: "preferredDate", message: "We’re closed on that day. Please choose another date." },
  outside_hours: { field: "preferredTime", message: "Please choose a time within our opening hours." },
  slot_unavailable: {
    field: "preferredTime",
    message: "That time is already booked. Please choose another time.",
  },
  duplicate_request: {
    message: "We already have this request for that date and time. We will contact you to confirm it.",
  },
  too_many_requests: { message: `We’ve received several requests from you already. ${CALL_US}` },
  invalid_input: { message: "Please check your details and try again." },
};

/**
 * Booking request from the public website.
 *
 * Order of checks: bot heuristics -> Zod -> database function (validation,
 * customer de-duplication, duplicate/slot checks, per-client throttling).
 * The result is always a PENDING request, never a confirmed appointment.
 */
export async function submitBookingRequest(input: unknown): Promise<BookingResult> {
  const raw = (input ?? {}) as Record<string, unknown>;

  // 1. Spam heuristics. A filled honeypot gets a normal-looking success so bots
  //    learn nothing; nothing is stored.
  const bot = looksLikeBot({
    honeypot: typeof raw.website === "string" ? raw.website : undefined,
    startedAt: Number(raw.startedAt),
  });
  if (bot.bot && bot.reason === "honeypot") return { status: "success" };
  if (bot.bot) {
    return { status: "error", message: "Please check your details, then press Request booking again." };
  }

  // 2. Server-side validation (never trust the client).
  const parsed = bookingFormSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Partial<Record<string, string[]>>;
    const fieldErrors: Partial<Record<BookingField, string>> = {};
    for (const [key, messages] of Object.entries(flat)) {
      if (messages?.[0]) fieldErrors[key as BookingField] = messages[0];
    }
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;

  // 3. Database: server-only function, throttled per client fingerprint.
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.rpc("submit_appointment_request", {
    p_full_name: v.fullName,
    p_email: v.email,
    p_phone: v.phone,
    p_vehicle_make: v.vehicleMake,
    p_vehicle_model: v.vehicleModel,
    p_vehicle_year: v.vehicleYear,
    p_registration_number: v.registrationNumber,
    p_service_id: v.serviceId,
    p_description: v.description,
    p_preferred_date: v.preferredDate,
    p_preferred_time: v.preferredTime,
    p_alternative_date: v.alternativeDate || undefined,
    p_alternative_time: v.alternativeTime || undefined,
    p_vehicle_information: v.vehicleInformation || undefined,
    p_additional_notes: v.additionalNotes || undefined,
    p_client_fingerprint: (await clientFingerprint()) ?? undefined,
  });

  if (error) {
    const known = error.code === "P0001" ? DB_ERRORS[error.message] : undefined;
    if (known) {
      const fieldErrors: Partial<Record<BookingField, string>> = {};
      if (known.field) fieldErrors[known.field] = known.message;
      // The database checks both slots and can't say which one failed.
      const slotError = ["past_date", "closed_day", "outside_hours", "slot_unavailable"].includes(error.message);
      if (slotError && v.alternativeDate) {
        const message = `${known.message} (This applies to your preferred or alternative time.)`;
        if (known.field) fieldErrors[known.field] = message;
        fieldErrors[known.field === "preferredDate" ? "alternativeDate" : "alternativeTime"] = message;
      }
      return { status: "error", message: known.message, fieldErrors };
    }
    console.error("submit_appointment_request failed", { code: error.code, message: error.message });
    return { status: "error", message: `Sorry, something went wrong on our side. ${CALL_US}` };
  }

  return { status: "success" };
}
