"use server";

import { z } from "zod";

import { contactFormSchema, type ContactFormResult } from "./contact-schema";

/**
 * Contact form submission.
 *
 * Validation is real. Storing the enquiry (customer match, enquiry row,
 * follow-up task) is Stage 8 (Enquiry management). Until then this reports
 * "unavailable" so the form never claims a message was received.
 */
export async function submitContactForm(input: unknown): Promise<ContactFormResult> {
  const parsed = contactFormSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  // TODO(Stage 8): create/reuse customer, insert enquiry, create follow-up task.
  return { status: "unavailable" };
}
