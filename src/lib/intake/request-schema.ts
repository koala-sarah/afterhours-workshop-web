import { z } from "zod";

import { CONTACT_METHODS, PREFERRED_TIMES, PROBLEM_OPTIONS } from "@/config/intake";

const PROBLEMS = PROBLEM_OPTIONS.map((p) => p.label) as [string, ...string[]];
const METHODS = CONTACT_METHODS.map((m) => m.value) as [ContactMethod, ...ContactMethod[]];

export type ContactMethod = (typeof CONTACT_METHODS)[number]["value"];

/** Same rule as the database (7–15 digits, at most 30 characters). */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, { error: "Please enter your phone number." })
  .max(30, { error: "Please enter a valid phone number." })
  .regex(/^[0-9+()\s-]+$/, { error: "Please enter a valid phone number." })
  .refine((v) => {
    const digits = v.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }, { error: "Please enter a valid phone number." });

/** Spam fields shared by the public forms (never shown to people). */
export const antiSpamFields = {
  website: z.string().optional(), // honeypot
  startedAt: z.coerce.number().int().nonnegative(),
  turnstileToken: z.string().max(4096).optional(),
};

/**
 * One-screen request form (spec section 5). Shared by the client form and the
 * Server Action; the database function `submit_inbox_form` checks again.
 */
export const requestFormSchema = z
  .object({
    registration: z
      .string()
      .trim()
      .max(20, { error: "Please check the registration." })
      .regex(/^[A-Za-z0-9\s-]*$/, { error: "Letters and numbers only." }),
    registrationUnknown: z.boolean(),
    problem: z.enum(PROBLEMS, { error: "Please choose what you need." }),
    note: z.string().trim().max(200, { error: "Please keep this to one line (200 characters)." }),
    name: z.string().trim().min(1, { error: "Please enter your name." }).max(200),
    phone: phoneSchema,
    method: z.enum(METHODS, { error: "Please choose how we should contact you." }),
    email: z.string().trim().max(254),
    times: z.array(z.enum(PREFERRED_TIMES)).max(PREFERRED_TIMES.length),
    ...antiSpamFields,
  })
  .superRefine((v, ctx) => {
    if (!v.registrationUnknown && !/[A-Za-z0-9]/.test(v.registration)) {
      ctx.addIssue({
        code: "custom",
        path: ["registration"],
        message: "Please enter the registration, or tick “I’m not sure”.",
      });
    }
    if (v.method === "EMAIL" && !z.email().safeParse(v.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Please enter a valid email address." });
    }
  });

export type RequestFormInput = z.input<typeof requestFormSchema>;
export type RequestFormValues = z.output<typeof requestFormSchema>;
export type RequestField = Exclude<keyof RequestFormValues, "website" | "startedAt" | "turnstileToken">;

export type SubmitResult<F extends string> =
  | { status: "success" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<F, string>> };

/** Answers saved by the database (docs/DATABASE.md "Answers shape"). */
export function toRequestAnswers(v: RequestFormValues) {
  const registration = v.registrationUnknown ? null : v.registration.toUpperCase();
  return {
    problem: { category: v.problem, text: v.note || null },
    contact: { name: v.name, phone: v.phone, email: v.method === "EMAIL" ? v.email : null },
    vehicle: { registration, registration_unknown: v.registrationUnknown },
    reach: { method: v.method, times: [...v.times] },
  };
}
