import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, SearchIcon } from "lucide-react";

import { adminInputClass } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/appointments/format";
import { requireAdmin } from "@/lib/auth/dal";
import { CUSTOMER_PAGE_SIZE, listCustomers } from "@/lib/customers/queries";
import { ADMIN_READ_ONLY } from "@/config/admin";

export const metadata: Metadata = { title: "Customers" };

function hrefWith(params: { q?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `/admin/customers?${qs}` : "/admin/customers";
}

export default async function CustomersListPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireAdmin("/admin/customers");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total } = await listCustomers({ query: q || undefined, page });
  const pages = Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-h3">Customers</h1>
          {!ADMIN_READ_ONLY && (
            <Link
              href="/admin/customers/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-body-sm hover:bg-muted"
            >
              <PlusIcon aria-hidden className="size-4" />
              New customer
            </Link>
          )}
        </div>
        <form action="/admin/customers" className="flex w-full max-w-md gap-2" role="search">
          <label htmlFor="q" className="sr-only">
            Search by name, phone, email or registration
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Name, phone, email or plate"
            className={`${adminInputClass} min-w-0 flex-1`}
          />
          <Button type="submit" size="lg" className="h-9">
            <SearchIcon aria-hidden />
            Search
          </Button>
        </form>
      </div>

      {q && (
        <p className="text-body-sm text-muted-foreground">
          {total} result{total === 1 ? "" : "s"} for “{q}”.{" "}
          <Link href="/admin/customers" className="underline">
            Clear search
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {q ? "No customers match your search." : "No customers yet. They’re added automatically from booking requests and enquiries."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[48rem] text-left text-body-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                <th scope="col" className="px-4 py-3 font-semibold">Phone</th>
                <th scope="col" className="px-4 py-3 font-semibold">Vehicles</th>
                <th scope="col" className="px-4 py-3 font-semibold">Requests</th>
                <th scope="col" className="px-4 py-3 font-semibold">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/customers/${row.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {row.full_name}
                    </Link>
                    {row.email && <div className="break-all text-muted-foreground">{row.email}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    {row.vehicle_count ? (
                      <>
                        {row.vehicle_count}
                        {row.registrations && (
                          <div className="font-mono text-muted-foreground">{row.registrations}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.appointment_count ?? 0}
                    {row.open_appointment_count ? (
                      <span className="text-muted-foreground"> · {row.open_appointment_count} open</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(row.created_at)}
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
              <Link href={hrefWith({ q, page: page - 1 })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={hrefWith({ q, page: page + 1 })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
