"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import {
  vehicleFormSchema,
  type FormResult,
  type VehicleField,
  type VehicleFormInput,
  type VehicleFormValues,
} from "@/lib/customers/schema";

import { AdminField, adminInputClass, adminTextareaClass, errorId } from "./fields";

type Submit = (values: VehicleFormValues) => Promise<FormResult<VehicleField>>;

/** Add or edit a vehicle. `onSubmit` is saveVehicle bound to the customer / vehicle. */
export function VehicleForm({
  defaultValues,
  onSubmit,
  submitLabel,
  cancelHref,
}: {
  defaultValues?: Partial<VehicleFormInput>;
  onSubmit: Submit;
  submitLabel: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VehicleFormInput, unknown, VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: { make: "", model: "", year: "", registrationNumber: "", additionalInformation: "", ...defaultValues },
  });

  async function submit(values: VehicleFormValues) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFormError(null);
    try {
      const result = await onSubmit(values);
      if (result.status === "success") {
        router.push(result.redirectTo);
        return;
      }
      setFormError(result.message);
      if (result.status === "error") {
        const fields = Object.entries(result.fieldErrors ?? {}) as [VehicleField, string][];
        fields.forEach(([field, message], i) => setError(field, { message }, { shouldFocus: i === 0 }));
      }
    } catch {
      setFormError("Couldn’t save. Please check your connection and try again.");
    } finally {
      submittingRef.current = false;
    }
  }

  const field = (name: VehicleField) => ({
    id: `vehicle-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? errorId(`vehicle-${name}`) : undefined,
    ...register(name),
  });

  return (
    <form onSubmit={(e) => void handleSubmit(submit)(e)} noValidate className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField id="vehicle-make" label="Make" required error={errors.make?.message}>
          <input autoComplete="off" className={adminInputClass} {...field("make")} />
        </AdminField>
        <AdminField id="vehicle-model" label="Model" required error={errors.model?.message}>
          <input autoComplete="off" className={adminInputClass} {...field("model")} />
        </AdminField>
        <AdminField id="vehicle-year" label="Year" error={errors.year?.message}>
          <input inputMode="numeric" maxLength={4} autoComplete="off" className={adminInputClass} {...field("year")} />
        </AdminField>
        <AdminField
          id="vehicle-registrationNumber"
          label="Registration (plate)"
          error={errors.registrationNumber?.message}
        >
          <input autoComplete="off" className={`${adminInputClass} uppercase`} {...field("registrationNumber")} />
        </AdminField>
      </div>
      <AdminField
        id="vehicle-additionalInformation"
        label="Other details"
        hint="Modifications, engine, VIN, anything useful for the job."
        error={errors.additionalInformation?.message}
      >
        <textarea rows={3} maxLength={2000} className={adminTextareaClass} {...field("additionalInformation")} />
      </AdminField>

      {formError && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        <Link href={cancelHref} className="text-body-sm underline-offset-4 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
