import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ActivityTimeline } from "@/components/admin/activity-timeline";
import { BackLink } from "@/components/admin/back-link";
import { NoteForm } from "@/components/admin/note-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmailText } from "@/components/site/email-text";
import { isUuid } from "@/lib/admin/ids";
import { formatDate, formatDateTime, formatTimeOfDay, toLocalParts } from "@/lib/appointments/format";
import { requireAdmin } from "@/lib/auth/dal";
import { addCustomerNote } from "@/lib/customers/actions";
import { getCustomerProfile } from "@/lib/customers/queries";
import { ADMIN_READ_ONLY } from "@/config/admin";
import { vehicleName } from "@/lib/vehicles/label";

export const metadata: Metadata = { title: "Customer" };

const ENQUIRY_STATUS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  CONVERTED: "Converted",
  CLOSED: "Closed",
};

const pillLink = "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-body-sm hover:bg-muted";

export default async function CustomerProfilePage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/customers/${id}`);
  if (!isUuid(id)) notFound();

  const profile = await getCustomerProfile(id);
  if (!profile) notFound();
  const { customer: c, vehicles, appointments, enquiries, activities, sharedPhone } = profile;

  const appointmentsByVehicle = new Map<string, number>();
  for (const a of appointments) {
    if (a.vehicle_id) appointmentsByVehicle.set(a.vehicle_id, (appointmentsByVehicle.get(a.vehicle_id) ?? 0) + 1);
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div className="space-y-3">
        <BackLink href="/admin/customers">All customers</BackLink>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h3">{c.full_name}</h1>
          {!ADMIN_READ_ONLY && (
            <Link href={`/admin/customers/${c.id}/edit`} className={pillLink}>
              <PencilIcon aria-hidden className="size-4" />
              Edit details
            </Link>
          )}
        </div>
        <p className="text-body-sm text-muted-foreground">
          Customer since {formatDate(toLocalParts(c.created_at).date)}
        </p>
      </div>

      {c.notes && (
        <p className="rounded-lg bg-butter px-4 py-3 whitespace-pre-line">
          <span className="font-semibold">Profile notes: </span>
          {c.notes}
        </p>
      )}

      {sharedPhone.length > 0 && (
        <div className="rounded-lg bg-steel px-4 py-3 text-body-sm">
          <p className="font-semibold">Same phone number as:</p>
          <ul className="list-disc pl-5">
            {sharedPhone.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/customers/${m.id}`} className="underline underline-offset-4">
                  {m.full_name}
                </Link>
                {m.email && <span className="text-muted-foreground"> · {m.email}</span>}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Check whether these are the same person (for example, a household sharing a number).
          </p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-10">
          <Section title="Contact">
            <Row label="Phone">
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="underline-offset-4 hover:underline">
                  {c.phone}
                </a>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Email">
              {c.email ? (
                <a href={`mailto:${c.email}`} className="break-words underline-offset-4 hover:underline">
                  <EmailText email={c.email} />
                </a>
              ) : (
                "—"
              )}
            </Row>
          </Section>

          <Section
            id="vehicles"
            title={`Vehicles (${vehicles.length})`}
            action={
              ADMIN_READ_ONLY ? undefined : (
                <Link href={`/admin/customers/${c.id}/vehicles/new`} className={pillLink}>
                  <PlusIcon aria-hidden className="size-4" />
                  Add vehicle
                </Link>
              )
            }
          >
            {vehicles.length === 0 ? (
              <p className="text-muted-foreground">No vehicles yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {vehicles.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="font-semibold">
                        {vehicleName(v)}
                      </p>
                      <p className="font-mono text-body-sm uppercase">{v.registration_number ?? "No registration"}</p>
                      {v.additional_information && (
                        <p className="text-body-sm whitespace-pre-line text-muted-foreground">{v.additional_information}</p>
                      )}
                      <p className="text-body-sm text-muted-foreground">
                        {appointmentsByVehicle.get(v.id) ?? 0} appointment request
                        {appointmentsByVehicle.get(v.id) === 1 ? "" : "s"}
                      </p>
                    </div>
                    {!ADMIN_READ_ONLY && (
                      <Link
                        href={`/admin/customers/${c.id}/vehicles/${v.id}/edit`}
                        className="text-body-sm underline underline-offset-4"
                        aria-label={`Edit ${vehicleName(v)}`}
                      >
                        Edit
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Appointment history (${appointments.length})`}>
            {appointments.length === 0 ? (
              <p className="text-muted-foreground">No appointment requests.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[36rem] text-left text-body-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-semibold">Time</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Service</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Vehicle</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {appointments.map((a) => (
                      <tr key={a.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Link href={`/admin/appointments/${a.id}`} className="underline-offset-4 hover:underline">
                            {a.status === "APPROVED" || a.status === "COMPLETED"
                              ? a.scheduled_start && formatDateTime(a.scheduled_start)
                              : a.preferred_date &&
                                a.preferred_time &&
                                `${formatDate(a.preferred_date)}, ${formatTimeOfDay(a.preferred_time)}`}
                          </Link>
                          {a.status !== "APPROVED" && a.status !== "COMPLETED" && (
                            <div className="text-muted-foreground">Requested time</div>
                          )}
                        </td>
                        <td className="px-4 py-2">{a.service_name}</td>
                        <td className="px-4 py-2">
                          {a.vehicle_id ? (
                            <>
                              {a.vehicle_make} {a.vehicle_model}
                              <div className="font-mono text-muted-foreground uppercase">{a.registration_number}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Not linked</span>
                          )}
                        </td>
                        <td className="px-4 py-2">{a.status && <StatusBadge status={a.status} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={`Enquiries (${enquiries.length})`}>
            {enquiries.length === 0 ? (
              <p className="text-muted-foreground">No enquiries.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {enquiries.map((e) => (
                  <li key={e.id} className="space-y-1 px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{e.subject || "Enquiry"}</p>
                      <span className="text-body-sm text-muted-foreground">
                        {ENQUIRY_STATUS[e.status] ?? e.status} · {formatDateTime(e.created_at)}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-body-sm whitespace-pre-line">{e.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside aria-label="Notes and activity" className="space-y-4">
          <h2 className="font-body text-base font-semibold normal-case">Notes and activity</h2>
          {!ADMIN_READ_ONLY && <NoteForm recordId={c.id} action={addCustomerNote} />}
          <ActivityTimeline items={activities} showRelated />
        </aside>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-body text-base font-semibold normal-case">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <span className="text-body-sm text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
