import { z } from "zod";

import { CONTACT_METHODS, PREFERRED_TIMES, PROBLEM_OPTIONS } from "@/config/intake";

import { phoneSchema, type ContactMethod } from "./request-schema";

const PROBLEMS = PROBLEM_OPTIONS.map((p) => p.label) as [string, ...string[]];
const METHODS = CONTACT_METHODS.map((m) => m.value) as [ContactMethod, ...ContactMethod[]];

/**
 * Request chat answers, one top-level key per step (same shape as the form,
 * docs/DATABASE.md "Answers shape"). Shared by the chat UI and the Server
 * Action; the database checks the contact details again.
 */
export const chatProblemSchema = z.object({
  category: z.enum(PROBLEMS, { error: "Please choose one of the buttons." }),
  text: z.string().trim().max(500, { error: "Please keep this under 500 characters." }).nullable(),
});

export const chatContactSchema = z.object({
  name: z.string().trim().min(1, { error: "Please enter your name." }).max(200),
  phone: phoneSchema,
  email: z.email({ error: "Please enter a valid email address." }).max(254).nullable(),
});

export const chatVehicleSchema = z
  .object({
    registration: z
      .string()
      .trim()
      .max(20, { error: "Please check the registration." })
      .regex(/^[A-Za-z0-9\s-]*[A-Za-z0-9][A-Za-z0-9\s-]*$/, { error: "Letters and numbers only." })
      .transform((v) => v.toUpperCase())
      .nullable(),
    registration_unknown: z.boolean(),
  })
  .refine((v) => v.registration_unknown || v.registration !== null, {
    error: "Please enter the registration, or choose “I’m not sure”.",
    path: ["registration"],
  });

export const chatReachSchema = z.object({
  method: z.enum(METHODS, { error: "Please choose how we should contact you." }),
  times: z.array(z.enum(PREFERRED_TIMES)).max(PREFERRED_TIMES.length),
});

export const CHAT_STEPS = ["problem", "contact", "vehicle", "reach", "times"] as const;
export type ChatStep = (typeof CHAT_STEPS)[number];

/** Keys each step must send (the reach step also re-sends contact when an email is added). */
const REQUIRED: Record<ChatStep, (keyof ChatAnswers)[]> = {
  problem: ["problem"],
  contact: ["contact"],
  vehicle: ["vehicle"],
  reach: ["reach"],
  times: ["reach"],
};

export const chatStepSchema = z
  .object({
    fresh: z.boolean(),
    step: z.enum(CHAT_STEPS),
    answers: z
      .object({
        problem: chatProblemSchema.optional(),
        contact: chatContactSchema.optional(),
        vehicle: chatVehicleSchema.optional(),
        reach: chatReachSchema.optional(),
      })
      .strict(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .superRefine((v, ctx) => {
    for (const key of REQUIRED[v.step]) {
      if (!v.answers[key]) ctx.addIssue({ code: "custom", path: ["answers", key], message: "Missing answer." });
    }
    if (v.fresh && v.step !== "problem") {
      ctx.addIssue({ code: "custom", path: ["fresh"], message: "A chat starts with the problem step." });
    }
    const reach = v.answers.reach;
    if (reach?.method === "EMAIL" && !v.answers.contact?.email && v.step === "reach") {
      ctx.addIssue({ code: "custom", path: ["answers", "contact"], message: "Please enter your email address." });
    }
  });

export type ChatAnswers = {
  problem?: z.output<typeof chatProblemSchema>;
  contact?: z.output<typeof chatContactSchema>;
  vehicle?: z.output<typeof chatVehicleSchema>;
  reach?: z.output<typeof chatReachSchema>;
};
export type ChatStepInput = z.input<typeof chatStepSchema>;

export type ChatStepResult =
  | { status: "ok" }
  | { status: "error"; message: string }
  /** The session is gone (expired, finished, cookie cleared): start a new chat. */
  | { status: "expired" };
