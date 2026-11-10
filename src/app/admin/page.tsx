import type { Metadata } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/admin/status-badge";
import { formatDateTime } from "@/lib/appointments/format";
import { countAppointmentsByStatus, listUpcomingApproved } from "@/lib/appointments/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { listRecentCustomers } from "@/lib/customers/queries";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const admin = await requireAdmin("/admin");
  const [counts, upcoming, recentCustomers] = await Promise.all([
    countAppointmentsByStatus(),
    listUpcomingApproved(5),
    listRecentCustomers(5),
  ]);

  const cards = [
    { label: "Pending requests", value: counts.PENDING, href: "/admin/appointments?status=PENDING", highlight: counts.PENDING > 0 },
    { label: "New time proposed", value: counts.RESCHEDULE_REQUESTED, href: "/admin/appointments?status=RESCHEDULE_REQUESTED" },
    { label: "Approved", value: counts.APPROVED, href: "/admin/appointments?status=APPROVED" },
  ];

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-h3">Overview</h1>
        <p className="text-muted-foreground">Signed in as {admin.fullName ?? admin.email}.</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <li key={card.label}>
            <Link
              href={card.href}
              className={`block rounded-lg border p-4 hover:bg-muted/50 ${card.highlight ? "border-ink bg-butter hover:bg-butter/80" : ""}`}
            >
              <span className="block text-body-sm text-muted-foreground">{card.label}</span>
              <span className="block font-heading text-h3">{card.value}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-body text-base font-semibold normal-case">Upcoming approved appointments</h2>
          <Link href="/admin/appointments?status=APPROVED" className="text-body-sm underline-offset-4 hover:underline">
            View all
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            No upcoming approved appointments.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {upcoming.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Link href={`/admin/appointments/${row.id}`} className="underline-offset-4 hover:underline">
                  <span className="font-semibold">{row.scheduled_start && formatDateTime(row.scheduled_start)}</span> ·{" "}
                  {row.customer_name} · {row.service_name}
                </Link>
                {row.status && <StatusBadge status={row.status} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-body text-base font-semibold normal-case">Recently added customers</h2>
          <Link href="/admin/customers" className="text-body-sm underline-offset-4 hover:underline">
            View all
          </Link>
        </div>
        {recentCustomers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No customers yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {recentCustomers.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Link href={`/admin/customers/${row.id}`} className="font-semibold underline-offset-4 hover:underline">
                  {row.full_name}
                </Link>
                <span className="text-body-sm text-muted-foreground">
                  {row.appointment_count ?? 0} request{row.appointment_count === 1 ? "" : "s"} · added{" "}
                  {formatDateTime(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-body-sm text-muted-foreground">
        Enquiries and follow-up tasks will appear here as they are built.
      </p>
    </div>
  );
}
