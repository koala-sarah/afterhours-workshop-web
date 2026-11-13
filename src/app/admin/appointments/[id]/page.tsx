import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ActivityTimeline } from "@/components/admin/activity-timeline";
import { BackLink } from "@/components/admin/back-link";
import { NoteForm } from "@/components/admin/note-form";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmailText } from "@/components/site/email-text";
import { isUuid } from "@/lib/admin/ids";
import { addAppointmentNote } from "@/lib/appointments/actions";
import {
  STATUS_LABELS,
  formatClock,
  formatDate,
  formatDateTime,
  formatTimeOfDay,
  toLocalParts,
} from "@/lib/appointments/format";
import {
  getAppointmentDetail,
  getDefaultDuration,
  listApprovedOnDates,
  type AppointmentListRow,
} from "@/lib/appointments/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { listCustomerVehicles } from "@/lib/customers/queries";

import { AppointmentActions } from "./appointment-actions";
import { VehicleLinkForm } from "./vehicle-link-form";
import { ADMIN_READ_ONLY } from "@/config/admin";
import { vehicleName } from "@/lib/vehicles/label";

export const metadata: Metadata = { title: "Appointment" };

export default async function AppointmentDetailPage({ params }: PageProps<"/admin/appointments/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/appointments/${id}`);
  if (!isUuid(id)) notFound();

  const detail = await getAppointmentDetail(id);
  if (!detail) notFound();
  const { appointment: a, activities, otherRequests } = detail;

  const hhmm = (t: string) => t.slice(0, 5);
  const slotOptions = [
    { key: "preferred", label: "Preferred", date: a.preferred_date, time: hhmm(a.preferred_time) },
    ...(a.alternative_date && a.alternative_time
      ? [{ key: "alternative", label: "Alternative", date: a.alternative_date, time: hhmm(a.alternative_time) }]
      : []),
    ...(a.proposed_start ? [{ key: "proposed", label: "Proposed", ...toLocalParts(a.proposed_start) }] : []),
  ].map((o) => ({
    ...o,
    label: `${o.label}: ${formatDate(o.date)}, ${formatTimeOfDay(o.time)}`,
  }));

  const [schedule, defaultDuration, customerVehicles] = await Promise.all([
    listApprovedOnDates(slotOptions.map((o) => o.date), a.id),
    getDefaultDuration(),
    listCustomerVehicles(a.customer_id),
  ]);

  return (
    <div className="max-w-6xl space-y-8">
      <div className="space-y-3">
        <BackLink href="/admin/appointments">All appointments</BackLink>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h3">{a.customer?.full_name ?? "Appointment"}</h1>
          <StatusBadge status={a.status} />
        </div>
        <p className="text-body-sm text-muted-foreground">
          Requested {formatDateTime(a.created_at)} · {a.source.toLowerCase().replace("_", " ")}
        </p>
      </div>

      {a.status === "APPROVED" && a.scheduled_start && a.scheduled_end && (
        <p className="rounded-lg bg-olive px-4 py-3 text-paper">
          Confirmed for <strong>{formatDateTime(a.scheduled_start)}</strong> to {formatClock(a.scheduled_end)}
          {a.approved_at && (
            <>
              {" "}· approved {formatDateTime(a.approved_at)}
              {a.approver && ` by ${a.approver.full_name ?? a.approver.email}`}
            </>
          )}
        </p>
      )}
      {a.status === "RESCHEDULE_REQUESTED" && a.proposed_start && (
        <p className="rounded-lg bg-steel px-4 py-3">
          Proposed time: <strong>{formatDateTime(a.proposed_start)}</strong>. Waiting for the customer to agree.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-8">
          <Card title="Request">
            <Row label="Service">
              {a.service?.name}
              {a.service?.price_label && <span className="text-muted-foreground"> · {a.service.price_label}</span>}
            </Row>
            <Row label="Preferred">
              {formatDate(a.preferred_date)}, {formatTimeOfDay(a.preferred_time)}
            </Row>
            {a.alternative_date && a.alternative_time && (
              <Row label="Alternative">
                {formatDate(a.alternative_date)}, {formatTimeOfDay(a.alternative_time)}
              </Row>
            )}
            <Row label="Work needed">
              <span className="whitespace-pre-line">{a.description}</span>
            </Row>
            {a.additional_notes && (
              <Row label="Customer notes">
                <span className="whitespace-pre-line">{a.additional_notes}</span>
              </Row>
            )}
          </Card>

          <div className="grid gap-8 md:grid-cols-2">
            <Card title="Customer">
              <Row label="Name">
                <Link href={`/admin/customers/${a.customer_id}`} className="font-semibold underline underline-offset-4">
                  {a.customer?.full_name}
                </Link>
              </Row>
              {a.customer?.phone && (
                <Row label="Phone">
                  <a href={`tel:${a.customer.phone}`} className="underline-offset-4 hover:underline">
                    {a.customer.phone}
                  </a>
                </Row>
              )}
              {a.customer?.email && (
                <Row label="Email">
                  <a href={`mailto:${a.customer.email}`} className="break-words underline-offset-4 hover:underline">
                    <EmailText email={a.customer.email} />
                  </a>
                </Row>
              )}
              <Row label="Customer since">{a.customer && formatDate(toLocalParts(a.customer.created_at).date)}</Row>
            </Card>
            <Card title="Vehicle">
              {a.vehicle ? (
                <>
                  <Row label="Vehicle">
                    {vehicleName(a.vehicle)}
                  </Row>
                  <Row label="Registration">
                    <span className="font-mono uppercase">{a.vehicle.registration_number ?? "—"}</span>
                  </Row>
                  {a.vehicle.additional_information && (
                    <Row label="Details">
                      <span className="whitespace-pre-line">{a.vehicle.additional_information}</span>
                    </Row>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No vehicle linked.</p>
              )}
              {!ADMIN_READ_ONLY && (
                <VehicleLinkForm
                  appointmentId={a.id}
                  customerId={a.customer_id}
                  currentVehicleId={a.vehicle_id}
                  vehicles={customerVehicles}
                />
              )}
            </Card>
          </div>

          <Card title="History">
            {!ADMIN_READ_ONLY && <NoteForm recordId={a.id} action={addAppointmentNote} />}
            <ActivityTimeline items={activities} />
          </Card>

          {otherRequests.length > 0 && (
            <Card title="Other requests from this customer">
              <ul className="divide-y">
                {otherRequests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/admin/appointments/${r.id}`} className="underline-offset-4 hover:underline">
                      {r.service_name} ·{" "}
                      {r.scheduled_start
                        ? formatDateTime(r.scheduled_start)
                        : r.preferred_date && r.preferred_time
                          ? `${formatDate(r.preferred_date)}, ${formatTimeOfDay(r.preferred_time)}`
                          : ""}
                    </Link>
                    {r.status && <StatusBadge status={r.status} />}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside aria-label="Actions" className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          {ADMIN_READ_ONLY ? (
            <p className="text-body-sm text-muted-foreground">
              Status: {STATUS_LABELS[a.status]}. This admin area is read-only; bookings are arranged with the customer
              directly.
            </p>
          ) : (
          <>
          <h2 className="font-body text-base font-semibold normal-case">Actions</h2>
          <AppointmentActions
            appointmentId={a.id}
            status={a.status}
            slotOptions={slotOptions}
            defaultDuration={defaultDuration}
            schedule={<DaySchedule schedule={schedule} />}
          />
          <p className="text-body-sm text-muted-foreground">
            Status: {STATUS_LABELS[a.status]}. Every change is saved in the history with your name.
          </p>
          </>
          )}
        </aside>
      </div>
    </div>
  );
}

function DaySchedule({ schedule }: { schedule: Record<string, AppointmentListRow[]> }) {
  const days = Object.entries(schedule);
  if (days.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md bg-muted/60 p-3 text-body-sm">
      <p className="font-semibold">Already approved on these days</p>
      {days.map(([date, rows]) => (
        <div key={date}>
          <p>{formatDate(date)}</p>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">Nothing approved yet.</p>
          ) : (
            <ul className="list-disc pl-5">
              {rows.map((r) => (
                <li key={r.id}>
                  {r.scheduled_start && formatClock(r.scheduled_start)}–{r.scheduled_end && formatClock(r.scheduled_end)} ·{" "}
                  <Link href={`/admin/appointments/${r.id}`} className="underline-offset-4 hover:underline">
                    {r.customer_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-body text-base font-semibold normal-case">{title}</h2>
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
