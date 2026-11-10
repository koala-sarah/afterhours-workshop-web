import { z } from "zod";

/**
 * Admin customer and vehicle forms (spec section 6). Shared by the client forms
 * and the Server Actions; the database checks again (constraints, unique
 * email per customer, unique plate per customer).
 */

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, { error: message }).optional().or(z.literal(""));

const phone = z
  .string()
  .trim()
  .max(30, { error: "Please enter a valid phone number." })
  .refine(
    (v) => v === "" || (/^[0-9+()\s-]+$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15),
    { error: "Please enter a valid phone number." },
  );

export const customerFormSchema = z
  .object({
    fullName: z.string().trim().min(1, { error: "Please enter the customer’s name." }).max(200),
    email: z
      .string()
      .trim()
      .max(254)
      .refine((v) => v === "" || z.email().safeParse(v).success, { error: "Please enter a valid email address." }),
    phone,
    notes: optionalText(2000, "Please keep profile notes under 2000 characters."),
    /** Set after the admin confirms a customer sharing this phone number is a different person. */
    confirmSharedPhone: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Enter an email address or a phone number." });
    }
  });

export type CustomerFormInput = z.input<typeof customerFormSchema>;
export type CustomerFormValues = z.output<typeof customerFormSchema>;
export type CustomerField = "fullName" | "email" | "phone" | "notes";

const currentYear = new Date().getFullYear();

export const vehicleFormSchema = z.object({
  make: z.string().trim().min(1, { error: "Please enter the make." }).max(60),
  model: z.string().trim().min(1, { error: "Please enter the model." }).max(60),
  year: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= currentYear + 1), {
      error: "Please enter a valid year.",
    }),
  // Optional: unregistered track cars exist.
  registrationNumber: z
    .string()
    .trim()
    .max(20, { error: "Registration is too long." })
    .regex(/^[A-Za-z0-9\s-]*$/, { error: "Letters and numbers only." }),
  additionalInformation: optionalText(2000, "Please keep this under 2000 characters."),
});

export type VehicleFormInput = z.input<typeof vehicleFormSchema>;
export type VehicleFormValues = z.output<typeof vehicleFormSchema>;
export type VehicleField = keyof VehicleFormValues;

export type CustomerMatch = { id: string; full_name: string; email: string | null; phone: string | null };

export type FormResult<Field extends string> =
  | { status: "success"; redirectTo: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<Field, string>>;
      /** Existing customers that clash with what was entered (shown with links). */
      matches?: CustomerMatch[];
    }
  /** Another customer has this phone number; ask before creating a second profile. */
  | { status: "confirm"; message: string; matches: CustomerMatch[] };

/** Same rules as the database (private.normalize_*). */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase() || null;
}

export function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("64") && digits.length > 8) digits = `0${digits.slice(2)}`;
  return digits || null;
}

export function normalizeRegistration(registration: string) {
  return registration.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
}
