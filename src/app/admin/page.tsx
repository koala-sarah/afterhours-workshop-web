import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";

import { CONTACT_METHODS } from "@/config/intake";
import { formatDateTime } from "@/lib/appointments/format";
import { STEP_LABELS, toInternationalPhone } from "@/lib/notifications/format";
import { listRequests, REQUEST_PAGE_SIZE, type RequestRow } from "@/lib/requests/queries";

export const metadata: Metadata = { title: "Requests" };

const SOURCE: Record<string, string> = { FORM: "Request form", INTAKE: "Chat", CONTACT_FORM: "Contact form" };

/**
 * Read-only backup list of website requests (spec section 6). The operator
 * works from the Telegram alerts; this is for checking anything missed.
 */
export default async function AdminRequestsPage({ searchParams }: PageProps<"/admin">) {
  const params = await searchParams;
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : 1) || 1);
  const { rows, total } = await listRequests(page);
  const pages = Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-h3">Requests</h1>
        <p className="text-muted-foreground">
          Everything sent from the website, newest first ({total}). New requests also arrive in Telegram. This list is
          read-only.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-body-sm">
          {page > 1 ? <Link href={`/admin?page=${page - 1}`} className="underline underline-offset-4">Newer</Link> : <span />}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`/admin?page=${page + 1}`} className="underline underline-offset-4">Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

function RequestCard({ r }: { r: RequestRow }) {
  const phone = toInternationalPhone(r.contact_phone);
  const method = CONTACT_METHODS.find((m) => m.value === r.preferred_method)?.label;
  const state = r.completed_at
    ? null
    : r.abandoned_at
      ? `Unfinished chat · stopped at ${STEP_LABELS[r.last_step ?? ""] ?? r.last_step ?? "?"}`
      : "Chat in progress";
  const rego = r.vehicle_registration ?? (r.registration_unknown ? "Not sure" : null);

  return (
    <li className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {r.contact_name ?? "No name"}
          {rego && <span className="ml-2 font-mono text-body-sm uppercase">{rego}</span>}
        </p>
        <p className="text-body-sm text-muted-foreground">
          {SOURCE[r.kind] ?? r.kind} · {formatDateTime(r.created_at)}
        </p>
      </div>

      {state && <p className="w-fit rounded-md bg-butter px-2 py-0.5 text-body-sm">{state}</p>}

      <dl className="grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-[8rem_1fr]">
        {(r.symptom_category || r.symptom_text) && (
          <Item label="Needs">{[r.symptom_category, r.symptom_text].filter(Boolean).join(" — ")}</Item>
        )}
        {r.message && <Item label="Message">{r.message}</Item>}
        {r.contact_phone && (
          <Item label="Phone">
            <a href={phone ? `tel:${phone}` : undefined} className="underline underline-offset-4">
              {phone ?? r.contact_phone}
            </a>
            {phone && (
              <a href={`https://wa.me/${phone.slice(1)}`} target="_blank" rel="noopener noreferrer" className="ml-3 underline underline-offset-4">
                WhatsApp
              </a>
            )}
          </Item>
        )}
        {r.contact_email && (
          <Item label="Email">
            <a href={`mailto:${r.contact_email}`} className="underline underline-offset-4">
              {r.contact_email}
            </a>
          </Item>
        )}
        {(method || (r.preferred_times?.length ?? 0) > 0) && (
          <Item label="Contact by">{[method, r.preferred_times?.join(", ")].filter(Boolean).join(" · ")}</Item>
        )}
        <Item label="Alerts">
          <Alerts notifications={r.notifications} />
        </Item>
      </dl>
    </li>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </>
  );
}

const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-steel/40",
  FAILED: "bg-destructive/15 text-destructive",
  SKIPPED: "bg-muted text-muted-foreground",
  PENDING: "bg-butter",
};

function Alerts({ notifications }: { notifications: RequestRow["notifications"] }) {
  if (!notifications.length) return <span className="text-muted-foreground">None yet</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {notifications.map((n) => (
        <span
          key={`${n.kind}-${n.channel}`}
          title={n.last_error ?? undefined}
          className={cn("rounded-md px-2 py-0.5", STATUS_STYLE[n.status])}
        >
          {n.kind === "ABANDONED_REQUEST" ? "Unfinished · " : ""}
          {n.channel === "TELEGRAM" ? "Telegram" : "Email"}: {n.status.toLowerCase()}
        </span>
      ))}
    </span>
  );
}
