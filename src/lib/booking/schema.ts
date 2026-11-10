import { z } from "zod";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, { error: message }).optional().or(z.literal(""));

const currentYear = new Date().getFullYear();

/**
 * Booking request form (spec section 5). Shared by the client form and the
 * Server Action; the database function validates again on insert.
 */
export const bookingFormSchema = z
  .object({
    // Customer
    fullName: z.string().trim().min(1, { error: "Please enter your full name." }).max(200),
    email: z.email({ error: "Please enter a valid email address." }).max(254),
    phone: z
      .string()
      .trim()
      .min(1, { error: "Please enter your phone number." })
      .max(30, { error: "Please enter a valid phone number." })
      .regex(/^[0-9+()\s-]+$/, { error: "Please enter a valid phone number." })
      .refine((v) => v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15, {
        error: "Please enter a valid phone number.",
      }),

    // Vehicle
    vehicleMake: z.string().trim().min(1, { error: "Please enter the make." }).max(60),
    vehicleModel: z.string().trim().min(1, { error: "Please enter the model." }).max(60),
    vehicleYear: z.coerce
      .number({ error: "Please enter the year." })
      .int({ error: "Please enter the year." })
      .min(1900, { error: "Please enter a valid year." })
      .max(currentYear + 1, { error: "Please enter a valid year." }),
    registrationNumber: z
      .string()
      .trim()
      .min(1, { error: "Please enter the registration (plate) number." })
      .max(20)
      .regex(/^[A-Za-z0-9\s-]+$/, { error: "Letters and numbers only." }),
    vehicleInformation: optionalText(2000, "Please keep this under 2000 characters."),

    // Service
    serviceId: z.uuid({ error: "Please choose a service." }),
    description: z
      .string()
      .trim()
      .min(1, { error: "Please describe the problem or work needed." })
      .max(5000, { error: "Please keep this under 5000 characters." }),
    preferredDate: z.string().regex(DATE, { error: "Please choose a date." }),
    preferredTime: z.string().regex(TIME, { error: "Please choose a time." }),
    alternativeDate: z.string().regex(DATE).optional().or(z.literal("")),
    alternativeTime: z.string().regex(TIME).optional().or(z.literal("")),
    additionalNotes: optionalText(5000, "Please keep this under 5000 characters."),

    // Spam protection (not shown to people)
    website: z.string().optional(), // honeypot
    startedAt: z.coerce.number().int().nonnegative(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.alternativeDate) !== Boolean(v.alternativeTime)) {
      ctx.addIssue({
        code: "custom",
        path: [v.alternativeDate ? "alternativeTime" : "alternativeDate"],
        message: "Please choose both an alternative date and time, or leave both empty.",
      });
    }
    if (
      v.alternativeDate &&
      v.alternativeDate === v.preferredDate &&
      v.alternativeTime === v.preferredTime
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["alternativeTime"],
        message: "The alternative should be different from your preferred time.",
      });
    }
  });

export type BookingFormInput = z.input<typeof bookingFormSchema>;
export type BookingFormValues = z.output<typeof bookingFormSchema>;

export type BookingField = Exclude<keyof BookingFormValues, "website" | "startedAt">;

export type BookingResult =
  | { status: "success" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<BookingField, string>> };

/** Spec section 5: shown after every successful submission. Never says "confirmed". */
export const BOOKING_RECEIVED_MESSAGE =
  "Your appointment request has been received. We will contact you to confirm your appointment.";
