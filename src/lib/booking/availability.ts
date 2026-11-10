import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { createSupabasePublicClient } from "@/lib/supabase/public";

/** Opening hours for one weekday (0 = Sunday). Null times = open, hours not confirmed. */
export type DayHours = {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null; // "HH:MM"
  closeTime: string | null; // "HH:MM"
};

export type BookingConfig = {
  timezone: string;
  appointmentDurationMinutes: number;
  hours: DayHours[];
};

/** Public booking settings used to build the form. The database re-checks everything on submit. */
export async function getBookingConfig(): Promise<BookingConfig> {
  "use cache";
  cacheLife("hours");
  cacheTag("booking-config");

  const supabase = createSupabasePublicClient();
  const [hoursResult, settingsResult] = await Promise.all([
    supabase.from("business_hours").select("day_of_week, is_open, open_time, close_time").order("day_of_week"),
    supabase.from("business_settings").select("timezone, appointment_duration_minutes").limit(1).maybeSingle(),
  ]);

  if (hoursResult.error) throw new Error(`Could not load opening hours: ${hoursResult.error.message}`);
  if (settingsResult.error) throw new Error(`Could not load booking settings: ${settingsResult.error.message}`);

  return {
    timezone: settingsResult.data?.timezone ?? "Pacific/Auckland",
    appointmentDurationMinutes: settingsResult.data?.appointment_duration_minutes ?? 60,
    hours: hoursResult.data.map((row) => ({
      dayOfWeek: row.day_of_week,
      isOpen: row.is_open,
      openTime: row.open_time?.slice(0, 5) ?? null,
      closeTime: row.close_time?.slice(0, 5) ?? null,
    })),
  };
}
