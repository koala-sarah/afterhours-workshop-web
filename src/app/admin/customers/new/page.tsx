import type { Metadata } from "next";

import { BackLink } from "@/components/admin/back-link";
import { CustomerForm } from "@/components/admin/customer-form";
import { requireAdmin } from "@/lib/auth/dal";
import { createCustomer } from "@/lib/customers/actions";
import { ADMIN_READ_ONLY } from "@/config/admin";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireAdmin("/admin/customers/new");
  if (ADMIN_READ_ONLY) notFound(); // read-only backup list (spec section 6)
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink href="/admin/customers">All customers</BackLink>
        <h1 className="text-h3">New customer</h1>
        <p className="max-w-xl text-muted-foreground">
          For customers who phone or walk in. Customers who book or enquire on the website are added automatically.
        </p>
      </div>
      <CustomerForm onSubmit={createCustomer} submitLabel="Create customer" cancelHref="/admin/customers" />
    </div>
  );
}
