import { z } from "zod";

import { antiSpamFields, phoneSchema, type SubmitResult } from "./request-schema";

/**
 * Contact page form (existing layout: name, email, phone, message).
 * Needs an email or a phone number so the operator can reply.
 */
export const contactFormSchema = z
  .object({
    firstName: z.string().trim().min(1, { error: "Please enter your first name." }).max(100),
    lastName: z.string().trim().min(1, { error: "Please enter your last name." }).max(100),
    email: z.union([z.literal(""), z.email({ error: "Please enter a valid email address." }).max(254)]),
    phone: z.union([z.literal(""), phoneSchema]),
    message: z
      .string()
      .trim()
      .min(1, { error: "Please enter a message." })
      .max(2000, { error: "Please keep your message under 2000 characters." }),
    ...antiSpamFields,
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Please enter your email or phone number." });
    }
  });

export type ContactFormInput = z.input<typeof contactFormSchema>;
export type ContactFormValues = z.output<typeof contactFormSchema>;
export type ContactField = "firstName" | "lastName" | "email" | "phone" | "message";
export type ContactFormResult = SubmitResult<ContactField>;

export function toContactAnswers(v: ContactFormValues) {
  return {
    contact: {
      name: `${v.firstName} ${v.lastName}`,
      phone: v.phone || null,
      email: v.email || null,
    },
    message: v.message,
  };
}
