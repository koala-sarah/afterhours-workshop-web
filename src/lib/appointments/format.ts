import type { Database } from "@/lib/supabase/database.types";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "PENDING",
  "RESCHEDULE_REQUESTED",
  "APPROVED",
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
  RESCHEDULE_REQUESTED: "New time proposed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export const TIMEZONE = "Pacific/Auckland";

/** "2026-11-12" -> "Thu 12 Nov 2026" (a calendar date, no timezone shift). */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "18:30:00" -> "6:30 pm" */
export function formatTimeOfDay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}

/** Timestamp -> "Thu 12 Nov 2026, 6:30 pm" in Pacific/Auckland. */
export function formatDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
  }).format(new Date(timestamp));
}

/** Timestamp -> "6:30 pm" in Pacific/Auckland. */
export function formatClock(timestamp: string): string {
  return new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: TIMEZONE }).format(
    new Date(timestamp),
  );
}

/** Timestamp -> { date: "YYYY-MM-DD", time: "HH:MM" } in Pacific/Auckland (for form defaults). */
export function toLocalParts(timestamp: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
