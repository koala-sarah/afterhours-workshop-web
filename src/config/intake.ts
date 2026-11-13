/**
 * Request form and request chat: choices and wording.
 *
 * PLACEHOLDERS: every customer-facing text marked ⬜ in docs/INTAKE_COPY.md is
 * not confirmed by the owner yet. Replace it here (and mark it ✅ there) once
 * the owner sends the wording. Do not invent new claims, prices or promises.
 *
 * This file has no imports so it can be shared by client, server and tests.
 */

/** Saved with every request so a later change to the questions can be told apart. */
export const REQUEST_FORM_VERSION = "form-1";

/**
 * Problem / work buttons. Candidates taken from the existing site (INTAKE_COPY.md
 * section 2, not yet confirmed as buttons). The label is what gets saved and
 * what the operator reads. `serviceSlug` preselects the button when a service
 * card links to /appointments?service=<slug>.
 */
export const PROBLEM_OPTIONS = [
  { label: "Basic Service", serviceSlug: "basic" },
  { label: "Advanced Service", serviceSlug: "advanced" },
  { label: "Track-ready Service", serviceSlug: "track-ready" },
  { label: "Repair" },
  { label: "Upgrade" },
  { label: "Not sure" },
] as const satisfies readonly { label: string; serviceSlug?: string }[];

/** Preferred contact method. `value` matches the database enum contact_method. */
export const CONTACT_METHODS = [
  { value: "PHONE", label: "Phone call" },
  { value: "SMS", label: "Text (SMS)" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
] as const;

/** Preferred times (from the brief; INTAKE_COPY.md section 3, not yet confirmed). */
export const PREFERRED_TIMES = ["Weekday evening", "Weekend", "Any time"] as const;

export const requestFormCopy = {
  // ⬜ placeholder (INTAKE_COPY.md 1)
  heading: "Send a request",
  intro: "Tell us what your car needs and how to reach you. A mechanic will check it and contact you directly.",
  callInstead: "Prefer to talk? Call or message us:",
  registrationLabel: "Registration (plate)",
  registrationUnsure: "I’m not sure",
  problemLabel: "What do you need?",
  noteLabel: "Anything else (one line)",
  notePlaceholder: "e.g. noise when braking",
  nameLabel: "Name",
  phoneLabel: "Phone",
  methodLabel: "How should we contact you?",
  emailLabel: "Email",
  timesLabel: "When suits you?",
  submit: "Send request",
  submitting: "Sending…",
  privacy: "We only use these details to contact you about this request.",
  // From the brief (INTAKE_COPY.md 4). Never a price, diagnosis or confirmed booking.
  received: "Your request has been received. A mechanic will check it and contact you directly.",
  another: "Send another request",
} as const;
