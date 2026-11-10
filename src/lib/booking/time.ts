import type { DayHours } from "./availability";

/** Today's date ("YYYY-MM-DD") in the workshop's timezone. */
export function todayInTimezone(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" date. Calendar maths only, so timezone-free. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Start times that fit inside the day's opening hours (every 30 minutes, ending
 * by closing time). Null when the day is open but hours aren't configured yet:
 * the form then lets the customer type a time.
 */
export function slotsForDay(hours: DayHours | undefined, durationMinutes: number): string[] | null {
  if (!hours?.isOpen) return [];
  if (!hours.openTime || !hours.closeTime) return null;
  const slots: string[] = [];
  const last = toMinutes(hours.closeTime) - durationMinutes;
  for (let t = toMinutes(hours.openTime); t <= last; t += 30) slots.push(toTime(t));
  return slots;
}

/** "17:30" -> "5:30 PM" */
export function formatTime(time: string): string {
  const minutes = toMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
