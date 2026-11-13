import { CONTACT_METHODS } from "@/config/intake";

/** The request details an alert shows (copied from inbox_entries). */
export type AlertData = {
  kind: "NEW_REQUEST" | "ABANDONED_REQUEST";
  entryKind: string; // INTAKE (chat) | FORM | CONTACT_FORM | …
  createdAt: string;
  repeat: boolean;
  registration: string | null;
  registrationUnknown: boolean;
  problem: string | null;
  note: string | null;
  message: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  method: string | null;
  times: string[];
  lastStep: string | null;
};

export type Alert = { subject: string; telegramHtml: string; text: string; html: string };

/** Chat steps (chat-schema CHAT_STEPS) as the operator reads them. */
const STEP_LABELS: Record<string, string> = {
  problem: "what they need",
  contact: "name & phone",
  vehicle: "registration",
  reach: "contact method",
  times: "preferred times",
};

const SOURCE: Record<string, string> = {
  INTAKE: "Chat",
  FORM: "Request form",
  CONTACT_FORM: "Contact form",
};

/**
 * NZ number in international form for tap-to-call and wa.me links:
 * "021 555 0101" -> "+64215550101". Numbers already starting with + keep their
 * country code. Returns null when there aren't enough digits.
 */
export function toInternationalPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (phone.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("64") && digits.length > 9) return `+${digits}`;
  if (digits.startsWith("0")) return `+64${digits.slice(1)}`;
  return `+64${digits}`;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Operator alert for one request: Telegram (HTML), and plain text / HTML for
 * the email backup. Customer text is always escaped.
 */
export function buildAlert(d: AlertData): Alert {
  const abandoned = d.kind === "ABANDONED_REQUEST";
  const intl = toInternationalPhone(d.phone);
  const waLink = intl ? `https://wa.me/${intl.slice(1)}` : null;
  const method = CONTACT_METHODS.find((m) => m.value === d.method)?.label ?? null;

  const title = abandoned
    ? `⏸ Unfinished chat${d.lastStep ? ` (stopped at: ${STEP_LABELS[d.lastStep] ?? d.lastStep})` : ""}`
    : `🆕 New request${d.repeat ? " · repeat customer" : ""}`;

  const rego = d.registration ?? (d.registrationUnknown ? "Not sure" : null);
  const problem = [d.problem, d.note].filter(Boolean).join(" — ") || null;

  // [label, value, isPhone]
  const rows: [string, string | null][] = [
    ["Rego", rego],
    ["Needs", problem],
    ["Message", d.message],
    ["Name", d.name],
    ["Phone", intl ?? d.phone],
    ["Email", d.email],
    ["Contact by", method],
    ["Times", d.times.length ? d.times.join(", ") : null],
    ["From", `${SOURCE[d.entryKind] ?? d.entryKind} · ${formatTime(d.createdAt)}`],
  ];
  const shown = rows.filter((r): r is [string, string] => Boolean(r[1]));

  const telegramHtml = [
    `<b>${escapeHtml(title)}</b>`,
    "",
    ...shown.map(([label, value]) => `<b>${label}:</b> ${escapeHtml(value)}`),
    ...(waLink ? ["", `<a href="${waLink}">Reply on WhatsApp</a>`] : []),
  ].join("\n");

  const text = [title, "", ...shown.map(([l, v]) => `${l}: ${v}`), ...(waLink ? ["", `Reply on WhatsApp: ${waLink}`] : [])].join(
    "\n",
  );

  const html = [
    `<h2 style="font-family:sans-serif">${escapeHtml(title)}</h2>`,
    `<table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">`,
    ...shown.map(([label, value]) => {
      const v = escapeHtml(value);
      const cell = label === "Phone" && intl ? `<a href="tel:${intl}">${v}</a>` : label === "Email" ? `<a href="mailto:${v}">${v}</a>` : v;
      return `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${label}</td><td style="padding:4px 0;white-space:pre-line">${cell}</td></tr>`;
    }),
    `</table>`,
    ...(waLink ? [`<p style="font-family:sans-serif"><a href="${waLink}">Reply on WhatsApp</a></p>`] : []),
  ].join("\n");

  const subject = abandoned
    ? `Unfinished chat: ${d.name ?? "unknown"}${rego ? ` (${rego})` : ""}`
    : `New request: ${d.problem ?? "message"}${rego ? ` · ${rego}` : ""} · ${d.name ?? ""}`.trim();

  return { subject, telegramHtml, text, html };
}
