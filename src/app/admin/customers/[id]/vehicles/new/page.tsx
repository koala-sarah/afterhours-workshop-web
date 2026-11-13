import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/admin/back-link";
import { VehicleForm } from "@/components/admin/vehicle-form";
import { isUuid } from "@/lib/admin/ids";
import { requireAdmin } from "@/lib/auth/dal";
import { saveVehicle } from "@/lib/customers/actions";
import { getCustomer } from "@/lib/customers/queries";
import { ADMIN_READ_ONLY } from "@/config/admin";

export const metadata: Metadata = { title: "Add vehicle" };

export default async function NewVehiclePage({ params, searchParams }: PageProps<"/admin/customers/[id]/vehicles/new">) {
  const { id } = await params;
  await requireAdmin(`/admin/customers/${id}/vehicles/new`);
  if (ADMIN_READ_ONLY) notFound(); // read-only backup list (spec section 6)
  if (!isUuid(id)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();

  // Opened from an appointment: link the new vehicle to it after saving.
  const { appointment } = await searchParams;
  const appointmentId = isUuid(appointment) ? appointment : undefined;
  const backHref = appointmentId ? `/admin/appointments/${appointmentId}` : `/admin/customers/${id}#vehicles`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink href={backHref}>{appointmentId ? "Back to the appointment" : customer.full_name}</BackLink>
        <h1 className="text-h3">Add vehicle</h1>
        <p className="text-muted-foreground">
          For {customer.full_name}.{appointmentId && " The new vehicle will be linked to the appointment."}
        </p>
      </div>
      <VehicleForm
        onSubmit={saveVehicle.bind(null, id, null, appointmentId ?? null)}
        submitLabel={appointmentId ? "Add and link vehicle" : "Add vehicle"}
        cancelHref={backHref}
      />
    </div>
  );
}
