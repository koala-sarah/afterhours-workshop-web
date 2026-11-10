import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { cn } from "cn";

import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import {
  APPOINTMENT_STATUSES,
  STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatTimeOfDay,
  type AppointmentStatus,
} from "@/lib/appointments/format";
import {
  PAGE_SIZE,
  countAppointmentsByStatus,
  isAppointmentStatus,
  listAppointments,
} from "@/lib/appointments/queries";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Appointments" };

function hrefWith(params: { status?: string; q?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `/admin/appointments?${qs}` : "/admin/appointments";
}

export default async function AppointmentsListPage({ searchParams }: PageProps<"/admin/appointments">) {
  await requireAdmin("/admin/appointments");
  const params = await searchParams;
  const status = isAppointmentStatus(params.status) ? params.status : undefined;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ rows, total }, counts] = await Promise.all([
    listAppointments({ status, query: q || undefined, page }),
    countAppointmentsByStatus(),
  ]);
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs: { key?: AppointmentStatus; label: string; count: number }[] = [
    { label: "All", count: allCount },
    ...APPOINTMENT_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], count: counts[s] })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-h3">Appointments</h1>
        <form action="/admin/appointments" className="flex w-full max-w-md gap-2" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="q" className="sr-only">
            Search by name, phone, email or registration
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Name, phone, email or plate"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-body-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          <Button type="submit" size="lg" className="h-9">
            <SearchIcon aria-hidden />
            Search
          </Button>
        </form>
      </div>

      <nav aria-label="Filter by status" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-1 px-1">
          {tabs.map((tab) => {
            const active = tab.key === status;
            return (
              <li key={tab.label}>
                <Link
                  href={hrefWith({ status: tab.key, q })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-body-sm whitespace-nowrap hover:bg-muted",
                    active && "bg-ink text-paper hover:bg-ink",
                  )}
                >
                  {tab.label}
                  <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-paper/20" : "bg-muted")}>
                    {tab.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {q && (
        <p className="text-body-sm text-muted-foreground">
          {total} result{total === 1 ? "" : "s"} for “{q}”.{" "}
          <Link href={hrefWith({ status })} className="underline">
            Clear search
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No appointment requests {status ? `with status “${STATUS_LABELS[status]}”` : "yet"}
          {q ? " match your search" : ""}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[52rem] text-left text-body-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                <th scope="col" className="px-4 py-3 font-semibold">Vehicle</th>
                <th scope="col" className="px-4 py-3 font-semibold">Service</th>
                <th scope="col" className="px-4 py-3 font-semibold">Requested time</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/appointments/${row.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {row.customer_name}
                    </Link>
                    <div className="text-muted-foreground">{row.customer_phone ?? row.customer_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {row.vehicle_make} {row.vehicle_model}
                    {row.vehicle_year ? ` (${row.vehicle_year})` : ""}
                    <div className="font-mono text-muted-foreground uppercase">{row.registration_number}</div>
                  </td>
                  <td className="px-4 py-3">{row.service_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.status === "APPROVED" && row.scheduled_start ? (
                      <>
                        <span className="font-semibold">{formatDateTime(row.scheduled_start)}</span>
                        <div className="text-muted-foreground">Confirmed slot</div>
                      </>
                    ) : (
                      row.preferred_date &&
                      row.preferred_time && (
                        <>
                          {formatDate(row.preferred_date)}, {formatTimeOfDay(row.preferred_time)}
                          {row.alternative_date && <div className="text-muted-foreground">+ alternative</div>}
                        </>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3">{row.status && <StatusBadge status={row.status} />}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {row.created_at && formatDateTime(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-body-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={hrefWith({ status, q, page: page - 1 })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={hrefWith({ status, q, page: page + 1 })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
