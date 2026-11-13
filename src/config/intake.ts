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
export const CHAT_FLOW_VERSION = "chat-1";

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
  // Replaces the old contact form: general questions go through the chat / form.
  { label: "Question / something else", question: true },
] as const satisfies readonly { label: string; serviceSlug?: string; question?: boolean }[];

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

/** Request chat (spec section 5 "Request chat"). ⬜ placeholders (INTAKE_COPY.md 1b). */
export const chatCopy = {
  launcher: "Chat with us",
  title: "Chat with us",
  close: "Close chat",
  subtitle: "Afterhours Workshop",
  greeting: "Hi! How can we help?",
  anythingElse: "Anything else?",
  // Quick answers: built only from verified details (src/config/site.ts and the
  // services table). The labels are placeholders.
  menu: {
    request: "Send a request",
    services: "What’s in each service?",
    hours: "Opening hours",
    location: "Where are you?",
    contact: "Phone & contact",
  },
  whichService: "Which service?",
  requestThis: "Request this service",
  otherQuestions: "Other questions",
  openMap: "Open in Google Maps",
  askProblem: "What do you need?",
  askNote: "Anything else we should know? (one line, optional)",
  askQuestion: "What would you like to ask?",
  askContact: "Who should we contact? Your name and phone number, please.",
  privacy: "Your answers are saved as you go, so we can get back to you even if you leave the chat.",
  askRegistration: "What’s the registration (plate)?",
  askMethod: "How should we contact you?",
  askEmail: "What’s your email address?",
  askTimes: "When suits you? (optional)",
  notSure: "I’m not sure",
  skip: "Skip",
  send: "Send",
  typeHere: "Type here…",
  chooseAbove: "Choose an option above",
  done: "Done",
  saving: "Saving…",
  checkFirst: "Please complete the check below first.",
  expired: "This chat has expired. Please start a new one.",
  received: requestFormCopy.received,
  contactAnytime: "You can also call or message us:",
  restart: "Start a new request",
} as const;

/**
 * Home page "How it works" (INTAKE_COPY.md section 5, ⬜ placeholder). Replaces
 * the old booking explanation: a request is not a booking; the mechanic
 * contacts the customer and arranges everything directly.
 */
export const howItWorks = {
  heading: "How it works",
  steps: ["Send a request, chat, or call us.", "A mechanic checks it and contacts you.", "We arrange a time with you."],
  cta: "Send a request",
} as const;

/** Short prompts that replace template / booking wording (INTAKE_COPY.md 5b, ⬜ placeholders). */
export const sitePrompts = {
  // "Contact us" band on About and Services (there is no form there any more).
  contact: "Questions? Call, message or chat with us. We’ll get back to you.",
  // Home "Schedule today" band (replaces "Book your slot for car services…").
  schedule: "Not sure what you need? Send a request or give us a call.",
} as const;
