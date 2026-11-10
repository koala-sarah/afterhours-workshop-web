"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import {
  customerFormSchema,
  type CustomerField,
  type CustomerFormInput,
  type CustomerFormValues,
  type CustomerMatch,
  type FormResult,
} from "@/lib/customers/schema";

import { AdminField, adminInputClass, adminTextareaClass, errorId } from "./fields";

type Submit = (values: CustomerFormValues) => Promise<FormResult<CustomerField>>;

/** Create or edit a customer. `onSubmit` is a Server Action (createCustomer or updateCustomer bound to an id). */
export function CustomerForm({
  defaultValues,
  onSubmit,
  submitLabel,
  cancelHref,
}: {
  defaultValues?: Partial<CustomerFormInput>;
  onSubmit: Submit;
  submitLabel: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormInput, unknown, CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { fullName: "", email: "", phone: "", notes: "", ...defaultValues },
  });

  async function submit(values: CustomerFormValues, confirmSharedPhone = false) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFormError(null);
    try {
      const result = await onSubmit({ ...values, confirmSharedPhone });
      if (result.status === "success") {
        router.push(result.redirectTo);
        return;
      }
      setFormError(result.message);
      setMatches(result.matches ?? []);
      setNeedsConfirm(result.status === "confirm");
      if (result.status === "error") {
        const fields = Object.entries(result.fieldErrors ?? {}) as [CustomerField, string][];
        fields.forEach(([field, message], i) => setError(field, { message }, { shouldFocus: i === 0 }));
      }
    } catch {
      setFormError("Couldn’t save. Please check your connection and try again.");
    } finally {
      submittingRef.current = false;
    }
  }

  const field = (name: CustomerField) => ({
    id: `customer-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? errorId(`customer-${name}`) : undefined,
    // A different phone number needs its own duplicate check.
    ...register(name, name === "phone" ? { onChange: () => setNeedsConfirm(false) } : undefined),
  });

  return (
    <form onSubmit={(e) => void handleSubmit((v) => submit(v))(e)} noValidate className="max-w-xl space-y-4">
      <AdminField id="customer-fullName" label="Full name" required error={errors.fullName?.message}>
        <input autoComplete="off" className={adminInputClass} {...field("fullName")} />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField id="customer-email" label="Email" error={errors.email?.message}>
          <input type="email" autoComplete="off" className={adminInputClass} {...field("email")} />
        </AdminField>
        <AdminField id="customer-phone" label="Phone" error={errors.phone?.message}>
          <input type="tel" autoComplete="off" className={adminInputClass} {...field("phone")} />
        </AdminField>
      </div>
      <p className="text-body-sm text-muted-foreground">An email address or a phone number is required.</p>
      <AdminField
        id="customer-notes"
        label="Profile notes"
        hint="Shown at the top of the profile, e.g. “Prefers text messages”. Only admins see this."
        error={errors.notes?.message}
      >
        <textarea rows={3} maxLength={2000} className={adminTextareaClass} {...field("notes")} />
      </AdminField>

      {formError && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-body-sm"
        >
          <p className="text-destructive">{formError}</p>
          {matches.length > 0 && (
            <ul className="list-disc pl-5">
              {matches.map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/customers/${m.id}`} className="font-semibold underline underline-offset-4">
                    {m.full_name}
                  </Link>{" "}
                  <span className="text-muted-foreground">{[m.email, m.phone].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {needsConfirm ? (
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleSubmit((v) => submit(v, true))()}
          >
            {isSubmitting ? "Saving…" : "Create anyway (different person)"}
          </Button>
        ) : (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : submitLabel}
          </Button>
        )}
        <Link href={cancelHref} className="text-body-sm underline-offset-4 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
