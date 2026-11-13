"use client";

import { useActionState } from "react";
import Link from "next/link";

import { adminInputClass } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { setAppointmentVehicle, type AdminActionState } from "@/lib/appointments/actions";

type VehicleOption = { id: string; make: string | null; model: string | null; year: number | null; registration_number: string | null };

/** Link the appointment to the right one of the customer's vehicles. */
export function VehicleLinkForm({
  appointmentId,
  customerId,
  currentVehicleId,
  vehicles,
}: {
  appointmentId: string;
  customerId: string;
  currentVehicleId: string | null;
  vehicles: VehicleOption[];
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(setAppointmentVehicle, {
    status: "idle",
  });
  const others = vehicles.filter((v) => v.id !== currentVehicleId);
  const addHref = `/admin/customers/${customerId}/vehicles/new?appointment=${appointmentId}`;

  return (
    <div className="space-y-2 border-t pt-3">
      {others.length > 0 ? (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="id" value={appointmentId} />
          <label htmlFor="link-vehicle" className="block text-body-sm font-semibold">
            {currentVehicleId ? "Wrong vehicle? Link another of this customer’s vehicles" : "Link one of this customer’s vehicles"}
          </label>
          <div className="flex flex-wrap gap-2">
            <select id="link-vehicle" name="vehicleId" required defaultValue="" className={`${adminInputClass} w-auto min-w-0 flex-1`}>
              <option value="" disabled>
                Choose a vehicle
              </option>
              {others.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model}
                  {v.year ? ` (${v.year})` : ""}
                  {v.registration_number ? ` · ${v.registration_number.toUpperCase()}` : ""}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? "Saving…" : "Link vehicle"}
            </Button>
          </div>
        </form>
      ) : null}
      {state.status !== "idle" && (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-body-sm text-destructive" : "text-body-sm"}>
          {state.message}
        </p>
      )}
      <Link href={addHref} className="inline-block text-body-sm underline underline-offset-4">
        Add a new vehicle for this customer and link it
      </Link>
    </div>
  );
}
