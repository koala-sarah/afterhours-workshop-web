import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/admin/back-link";
import { CustomerForm } from "@/components/admin/customer-form";
import { isUuid } from "@/lib/admin/ids";
import { requireAdmin } from "@/lib/auth/dal";
import { updateCustomer } from "@/lib/customers/actions";
import { getCustomer } from "@/lib/customers/queries";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: PageProps<"/admin/customers/[id]/edit">) {
  const { id } = await params;
  await requireAdmin(`/admin/customers/${id}/edit`);
  if (!isUuid(id)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink href={`/admin/customers/${id}`}>{customer.full_name}</BackLink>
        <h1 className="text-h3">Edit customer</h1>
      </div>
      <CustomerForm
        defaultValues={{
          fullName: customer.full_name,
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          notes: customer.notes ?? "",
        }}
        onSubmit={updateCustomer.bind(null, id)}
        submitLabel="Save changes"
        cancelHref={`/admin/customers/${id}`}
      />
    </div>
  );
}
