import { z } from "zod";

/** Shared by the client form and the server action. */
export const contactFormSchema = z.object({
  firstName: z.string().trim().min(1, { error: "Please enter your first name." }).max(100),
  lastName: z.string().trim().min(1, { error: "Please enter your last name." }).max(100),
  email: z.email({ error: "Please enter a valid email address." }).max(254),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\s-]*$/, { error: "Please enter a valid phone number." })
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(1, { error: "Please enter a message." })
    .max(2000, { error: "Please keep your message under 2000 characters." }),
  /** Honeypot: real users never see or fill this field. */
  company: z.string().max(0).optional().or(z.literal("")),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export type ContactFormResult =
  | { status: "success" }
  | { status: "unavailable" }
  | { status: "invalid"; fieldErrors: Partial<Record<keyof ContactFormValues, string[]>> };
