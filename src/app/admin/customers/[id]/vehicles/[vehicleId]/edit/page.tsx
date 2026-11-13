import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/admin/back-link";
import { VehicleForm } from "@/components/admin/vehicle-form";
import { isUuid } from "@/lib/admin/ids";
import { requireAdmin } from "@/lib/auth/dal";
import { saveVehicle } from "@/lib/customers/actions";
import { getCustomer, getVehicle } from "@/lib/customers/queries";

export const metadata: Metadata = { title: "Edit vehicle" };

export default async function EditVehiclePage({ params }: PageProps<"/admin/customers/[id]/vehicles/[vehicleId]/edit">) {
  const { id, vehicleId } = await params;
  await requireAdmin(`/admin/customers/${id}/vehicles/${vehicleId}/edit`);
  if (!isUuid(id) || !isUuid(vehicleId)) notFound();
  const [customer, vehicle] = await Promise.all([getCustomer(id), getVehicle(id, vehicleId)]);
  if (!customer || !vehicle) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink href={`/admin/customers/${id}#vehicles`}>{customer.full_name}</BackLink>
        <h1 className="text-h3">Edit vehicle</h1>
      </div>
      <VehicleForm
        defaultValues={{
          make: vehicle.make ?? "",
          model: vehicle.model ?? "",
          year: vehicle.year ? String(vehicle.year) : "",
          registrationNumber: vehicle.registration_number ?? "",
          additionalInformation: vehicle.additional_information ?? "",
        }}
        onSubmit={saveVehicle.bind(null, id, vehicleId, null)}
        submitLabel="Save changes"
        cancelHref={`/admin/customers/${id}#vehicles`}
      />
    </div>
  );
}
