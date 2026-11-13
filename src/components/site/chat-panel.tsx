"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Wrench, X } from "lucide-react";
import { cn } from "cn";

import { ContactButtons } from "@/components/site/contact-buttons";
import { TurnstileWidget, turnstileEnabled, type TurnstileHandle } from "@/components/site/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTACT_METHODS, PREFERRED_TIMES, PROBLEM_OPTIONS, chatCopy as copy } from "@/config/intake";
import { siteConfig } from "@/config/site";
import { saveChatStep } from "@/lib/intake/chat-actions";
import {
  chatContactSchema,
  chatProblemSchema,
  chatVehicleSchema,
  type ChatAnswers,
  type ChatStep,
} from "@/lib/intake/chat-schema";
import type { ContactMethod } from "@/lib/intake/request-schema";

/** Service package as shown on the Services page (from the services table). */
export type ChatService = { slug: string; name: string; description: string[] };

type UiStep =
  | "menu"
  | "serviceInfo"
  | "serviceChosen"
  | "problem"
  | "note"
  | "contact"
  | "registration"
  | "method"
  | "email"
  | "times"
  | "done"
  | "expired";
type Extra = "contact" | "map";
type Message = { id: number; from: "bot" | "me"; text: string; extra?: Extra };
type PreferredTime = (typeof PREFERRED_TIMES)[number];

const isQuestion = (category?: string) =>
  PROBLEM_OPTIONS.some((p) => p.label === category && "question" in p && p.question);

const { contact, hours } = siteConfig;
const address = `${contact.address.street}, ${contact.address.suburb}, ${contact.address.city} ${contact.address.postcode}`;
const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** Quick answers, built only from verified site details (src/config/site.ts). */
const ANSWERS = {
  // Same sentence as the existing site's home page.
  hours: `We’re open from ${hours.weekdays} on weekdays and ${hours.weekends.toLowerCase()} on weekends.`,
  location: `We’re at ${address}.`,
  contact: [
    `Call ${contact.phoneDisplay}`,
    `Text or WhatsApp ${contact.whatsapp.display}`,
    `Email ${contact.email}`,
  ].join("\n"),
};

const START: Message[] = [{ id: 1, from: "bot", text: copy.greeting }];

/**
 * Rule-based request chat (spec section 5 "Request chat"): fixed steps and
 * buttons, no AI. Quick answers (services, hours, location, contact) come
 * from verified site data. Every request step is saved on the server; from
 * the contact step the request exists even if the visitor leaves.
 */
export function ChatPanel({
  variant,
  services,
  onClose,
  titleId,
}: {
  variant: "embedded" | "floating";
  services: ChatService[];
  onClose?: () => void;
  titleId?: string;
}) {
  const [step, setStep] = useState<UiStep>("menu");
  const [answers, setAnswers] = useState<ChatAnswers>({});
  const [log, setLog] = useState<Message[]>(START);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [chosenService, setChosenService] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(2);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [log, step, error]);

  function say(...messages: Omit<Message, "id">[]) {
    setLog((prev) => [...prev, ...messages.map((m) => ({ ...m, id: nextId.current++ }))]);
  }

  /** Puts the visitor's answer before the question that was just asked. */
  function insertAnswer(text: string) {
    setLog((l) => [...l.slice(0, -1), { id: nextId.current++, from: "me", text }, l.at(-1)!]);
  }

  function restart() {
    setAnswers({});
    setError(null);
    setChosenService(null);
    setStep("menu");
    nextId.current = 2;
    setLog(START);
  }

  const serviceFor = (category: string) => {
    const option = PROBLEM_OPTIONS.find((p) => p.label === category);
    const slug = option && "serviceSlug" in option ? option.serviceSlug : undefined;
    return services.find((s) => s.slug === slug);
  };
  const describe = (s: ChatService) => `${s.name}: ${s.description.join("\n")}`;

  // ---- quick answers ----
  function chooseMenu(key: keyof typeof copy.menu) {
    setError(null);
    say({ from: "me", text: copy.menu[key] });
    switch (key) {
      case "request":
        say({ from: "bot", text: copy.askProblem });
        return setStep("problem");
      case "services":
        say({ from: "bot", text: copy.whichService });
        return setStep("serviceInfo");
      case "hours":
        say({ from: "bot", text: ANSWERS.hours }, { from: "bot", text: copy.anythingElse });
        return setStep("menu");
      case "location":
        say({ from: "bot", text: ANSWERS.location, extra: "map" }, { from: "bot", text: copy.anythingElse });
        return setStep("menu");
      case "contact":
        say({ from: "bot", text: ANSWERS.contact, extra: "contact" }, { from: "bot", text: copy.anythingElse });
        return setStep("menu");
    }
  }

  function showService(s: ChatService) {
    say({ from: "me", text: s.name }, { from: "bot", text: describe(s) });
    setChosenService(s.slug);
    setStep("serviceChosen");
  }

  function requestChosenService() {
    const option = PROBLEM_OPTIONS.find((p) => "serviceSlug" in p && p.serviceSlug === chosenService);
    if (!option) return;
    say({ from: "me", text: copy.requestThis }, { from: "bot", text: copy.askNote });
    setAnswers({ problem: { category: option.label, text: null } });
    setStep("note");
  }

  function backToMenu() {
    say({ from: "me", text: copy.otherQuestions }, { from: "bot", text: copy.anythingElse });
    setStep("menu");
  }

  // ---- request steps ----
  /** Saves one step; on success moves on with the next question. */
  async function save(serverStep: ChatStep, payload: ChatAnswers, next: UiStep, question?: string) {
    if (saving) return false;
    const fresh = serverStep === "problem";
    if (fresh && turnstileEnabled && !turnstileToken) {
      setError(copy.checkFirst);
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveChatStep({ fresh, step: serverStep, answers: payload, turnstileToken });
      if (result.status === "expired") {
        setStep("expired");
        say({ from: "bot", text: copy.expired });
        return false;
      }
      if (result.status === "error") {
        setError(result.message);
        return false;
      }
      setStep(next);
      if (question) say({ from: "bot", text: question });
      return true;
    } catch {
      setError("We couldn’t save your answer. Please check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
      if (fresh) turnstileRef.current?.reset();
    }
  }

  function chooseProblem(category: string) {
    setError(null);
    setAnswers({ problem: { category, text: null } });
    const service = serviceFor(category);
    say({ from: "me", text: category });
    if (service) say({ from: "bot", text: describe(service) });
    say({ from: "bot", text: isQuestion(category) ? copy.askQuestion : copy.askNote });
    setStep("note");
  }

  async function sendNote(text: string | null) {
    const problem = { category: answers.problem!.category, text: text?.trim() || null };
    const check = chatProblemSchema.safeParse(problem);
    if (!check.success) return setError(check.error.issues[0].message);
    if (isQuestion(problem.category) && !problem.text) return setError(copy.askQuestion);
    const ok = await save("problem", { problem }, "contact", copy.askContact);
    if (ok) {
      setAnswers((a) => ({ ...a, problem }));
      insertAnswer(problem.text ?? copy.skip);
    }
  }

  async function sendContact(name: string, phone: string) {
    const check = chatContactSchema.safeParse({ name, phone, email: answers.contact?.email ?? null });
    if (!check.success) return setError(check.error.issues[0].message);
    const ok = await save("contact", { contact: check.data }, "registration", copy.askRegistration);
    if (ok) {
      setAnswers((a) => ({ ...a, contact: check.data }));
      insertAnswer(`${check.data.name}, ${check.data.phone}`);
    }
  }

  async function sendRegistration(registration: string | null) {
    const check = chatVehicleSchema.safeParse({ registration, registration_unknown: registration === null });
    if (!check.success) return setError(check.error.issues[0].message);
    const ok = await save("vehicle", { vehicle: check.data }, "method", copy.askMethod);
    if (ok) {
      setAnswers((a) => ({ ...a, vehicle: check.data }));
      insertAnswer(check.data.registration ?? copy.notSure);
    }
  }

  async function chooseMethod(method: ContactMethod) {
    const label = CONTACT_METHODS.find((m) => m.value === method)!.label;
    if (method === "EMAIL") {
      setError(null);
      setAnswers((a) => ({ ...a, reach: { method, times: [] } }));
      say({ from: "me", text: label }, { from: "bot", text: copy.askEmail });
      setStep("email");
      return;
    }
    const reach = { method, times: [] };
    const ok = await save("reach", { reach }, "times", copy.askTimes);
    if (ok) {
      setAnswers((a) => ({ ...a, reach }));
      insertAnswer(label);
    }
  }

  async function sendEmail(email: string) {
    const check = chatContactSchema.safeParse({ ...answers.contact!, email: email.trim() });
    if (!check.success) return setError(check.error.issues[0].message);
    const ok = await save("reach", { contact: check.data, reach: answers.reach! }, "times", copy.askTimes);
    if (ok) {
      setAnswers((a) => ({ ...a, contact: check.data }));
      insertAnswer(check.data.email!);
    }
  }

  async function sendTimes(times: PreferredTime[]) {
    const reach = { method: answers.reach!.method, times };
    const ok = await save("times", { reach }, "done", copy.received);
    if (ok) {
      insertAnswer(times.length ? times.join(", ") : copy.skip);
      say({ from: "bot", text: copy.contactAnytime, extra: "contact" });
    }
  }

  // ---- quick-reply chips shown under the last message ----
  let chips: ReactNode = null;
  switch (step) {
    case "menu":
      chips = (Object.keys(copy.menu) as (keyof typeof copy.menu)[]).map((key) => (
        <Chip key={key} onClick={() => chooseMenu(key)} primary={key === "request"}>
          {copy.menu[key]}
        </Chip>
      ));
      break;
    case "serviceInfo":
      chips = services.map((s) => (
        <Chip key={s.slug} onClick={() => showService(s)}>
          {s.name}
        </Chip>
      ));
      break;
    case "serviceChosen":
      chips = (
        <>
          <Chip primary onClick={requestChosenService}>
            {copy.requestThis}
          </Chip>
          <Chip onClick={backToMenu}>{copy.otherQuestions}</Chip>
        </>
      );
      break;
    case "problem":
      chips = PROBLEM_OPTIONS.map((p) => (
        <Chip key={p.label} onClick={() => chooseProblem(p.label)}>
          {p.label}
        </Chip>
      ));
      break;
    case "method":
      chips = CONTACT_METHODS.map((m) => (
        <Chip key={m.value} disabled={saving} onClick={() => void chooseMethod(m.value)}>
          {m.label}
        </Chip>
      ));
      break;
  }

  const preSession = ["menu", "serviceInfo", "serviceChosen", "problem", "note"].includes(step);
  const floating = variant === "floating";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-chat-surface text-left text-ink",
        floating ? "h-full" : "h-[34rem] max-h-[80dvh] rounded-2xl shadow-lg ring-1 ring-ink/10",
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 bg-ink px-4 py-3 text-paper">
        <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-steel text-ink">
          <Wrench className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} tabIndex={-1} className="font-body text-base leading-tight font-semibold text-paper outline-none">
            {copy.title}
          </h2>
          <p className="truncate text-body-sm text-paper/70">{copy.subtitle}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-paper/15 focus-visible:ring-3 focus-visible:ring-steel focus-visible:outline-none"
          >
            <X aria-hidden className="size-6" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={logRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        <div role="log" aria-live="polite" className="space-y-2.5">
          {log.map((m, i) => (
            <Bubble key={m.id} message={m} showAvatar={m.from === "bot" && log[i - 1]?.from !== "bot"} />
          ))}
        </div>
        {chips && <div className="mt-3 flex flex-wrap justify-end gap-2 pl-10">{chips}</div>}
        {saving && <p className="mt-3 pl-10 text-body-sm text-ink/60">{copy.saving}</p>}
      </div>

      {/* Composer */}
      <div className="shrink-0 space-y-3 border-t border-ink/10 bg-paper px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && (
          <p role="alert" className="text-body-sm text-section-error">
            {error}
          </p>
        )}
        <Composer
          step={step}
          saving={saving}
          answers={answers}
          onNote={sendNote}
          onContact={sendContact}
          onRegistration={sendRegistration}
          onEmail={sendEmail}
          onTimes={sendTimes}
          onRestart={restart}
        />
        {preSession && <TurnstileWidget ref={turnstileRef} action="chat" theme="light" onToken={setTurnstileToken} />}
      </div>
    </div>
  );
}

function Bubble({ message, showAvatar }: { message: Message; showAvatar: boolean }) {
  const bot = message.from === "bot";
  return (
    <div className={cn("flex items-end gap-2", !bot && "justify-end")}>
      {bot && (
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper",
            !showAvatar && "invisible",
          )}
        >
          <Wrench className="size-4" />
        </span>
      )}
      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-3.5 py-2.5 text-base leading-snug whitespace-pre-line shadow-sm",
          bot ? "rounded-bl-md bg-paper text-ink" : "rounded-br-md bg-ink text-paper",
        )}
      >
        <span className="sr-only">{bot ? "Workshop: " : "You: "}</span>
        {message.text}
        {message.extra === "map" && (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block font-semibold underline underline-offset-4">
            {copy.openMap}
          </a>
        )}
        {message.extra === "contact" && <ContactButtons className="mt-3 gap-2 [&_a]:min-h-10 [&_a]:px-3 [&_a]:text-sm" />}
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
  primary,
  pressed,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-left font-body text-[0.95rem] leading-tight font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ink/30 focus-visible:outline-none disabled:opacity-50",
        primary || pressed ? "border-ink bg-ink text-paper hover:opacity-90" : "border-ink/30 bg-paper text-ink hover:border-ink",
      )}
    >
      {children}
    </button>
  );
}

function Composer(props: {
  step: UiStep;
  saving: boolean;
  answers: ChatAnswers;
  onNote: (text: string | null) => void;
  onContact: (name: string, phone: string) => void;
  onRegistration: (registration: string | null) => void;
  onEmail: (email: string) => void;
  onTimes: (times: PreferredTime[]) => void;
  onRestart: () => void;
}) {
  const { step, saving } = props;
  const [times, setTimes] = useState<PreferredTime[]>([]);

  switch (step) {
    case "note": {
      const question = isQuestion(props.answers.problem?.category);
      return (
        <TextComposer
          key="note"
          label={question ? copy.askQuestion : copy.askNote}
          maxLength={500}
          saving={saving}
          required={question}
          onSend={props.onNote}
          onSkip={question ? undefined : () => props.onNote(null)}
        />
      );
    }
    case "contact":
      return <ContactComposer saving={saving} onSend={props.onContact} />;
    case "registration":
      return (
        <TextComposer
          key="registration"
          label={copy.askRegistration}
          maxLength={20}
          saving={saving}
          required
          uppercase
          onSend={props.onRegistration}
          onSkip={() => props.onRegistration(null)}
          skipLabel={copy.notSure}
        />
      );
    case "email":
      return (
        <TextComposer key="email" label={copy.askEmail} type="email" maxLength={254} saving={saving} required onSend={props.onEmail} />
      );
    case "times":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PREFERRED_TIMES.map((t) => (
              <Chip
                key={t}
                pressed={times.includes(t)}
                onClick={() => setTimes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
              >
                {t}
              </Chip>
            ))}
          </div>
          <Button type="button" variant="brand" size="brand" disabled={saving} className="w-full" onClick={() => props.onTimes(times)}>
            {saving ? copy.saving : times.length ? copy.done : copy.skip}
          </Button>
        </div>
      );
    case "done":
    case "expired":
      return (
        <Button type="button" variant="brand" size="brand" className="w-full" onClick={props.onRestart}>
          {copy.restart}
        </Button>
      );
    default:
      // Button steps: the answers are the chips above.
      return <p className="py-1 text-center text-body-sm text-ink/60">{copy.chooseAbove}</p>;
  }
}

/** One-line message box with a send button, like a chat app. */
function TextComposer({
  label,
  type = "text",
  maxLength,
  saving,
  required,
  uppercase,
  onSend,
  onSkip,
  skipLabel = copy.skip,
}: {
  label: string;
  type?: "text" | "email";
  maxLength: number;
  saving: boolean;
  required?: boolean;
  uppercase?: boolean;
  onSend: (value: string) => void;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  const [value, setValue] = useState("");
  const focusRef = useFocusOnMount();
  const empty = !value.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (empty) return required ? undefined : onSkip?.();
    onSend(value.trim());
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label={label}
          placeholder={type === "email" ? "you@example.com" : copy.typeHere}
          type={type}
          value={value}
          maxLength={maxLength}
          ref={focusRef}
          autoComplete={type === "email" ? "email" : "off"}
          autoCapitalize={uppercase ? "characters" : undefined}
          enterKeyHint="send"
          className={cn("min-h-11 border-ink/30 bg-paper", uppercase && "uppercase")}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" variant="brand" size="brand" disabled={saving || empty} className="shrink-0 px-5 py-3">
          {saving ? "…" : copy.send}
        </Button>
      </div>
      {onSkip && (
        <button
          type="button"
          disabled={saving}
          onClick={onSkip}
          className="min-h-10 w-full rounded-full border border-ink/30 px-4 text-sm font-semibold hover:border-ink disabled:opacity-50"
        >
          {skipLabel}
        </button>
      )}
    </form>
  );
}

function ContactComposer({ saving, onSend }: { saving: boolean; onSend: (name: string, phone: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const focusRef = useFocusOnMount();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend(name.trim(), phone.trim());
      }}
      className="space-y-2"
    >
      <Input
        aria-label="Name"
        placeholder="Name"
        autoComplete="name"
        ref={focusRef}
        value={name}
        maxLength={200}
        className="min-h-11 border-ink/30 bg-paper"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Input
          aria-label="Phone"
          placeholder="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="send"
          value={phone}
          maxLength={30}
          className="min-h-11 border-ink/30 bg-paper"
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button
          type="submit"
          variant="brand"
          size="brand"
          disabled={saving || !name.trim() || !phone.trim()}
          className="shrink-0 px-5 py-3"
        >
          {saving ? "…" : copy.send}
        </Button>
      </div>
      <p className="text-xs text-ink/60">{copy.privacy}</p>
    </form>
  );
}

/**
 * Focuses the new input without scrolling: on phones `autoFocus` scrolls the
 * page and pushes the full-screen chat's header out of view.
 */
function useFocusOnMount() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
