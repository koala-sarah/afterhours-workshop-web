"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { BookingConfig } from "@/lib/booking/availability";
import { submitBookingRequest } from "@/lib/booking/actions";
import {
  BOOKING_RECEIVED_MESSAGE,
  bookingFormSchema,
  type BookingField,
  type BookingFormInput,
  type BookingFormValues,
} from "@/lib/booking/schema";
import { dayOfWeek, formatTime, slotsForDay, todayInTimezone } from "@/lib/booking/time";

type ServiceOption = { id: string; name: string; priceLabel: string | null };

type BookingFormProps = {
  services: ServiceOption[];
  config: BookingConfig;
  initialServiceId?: string;
};

const EMPTY: BookingFormInput = {
  fullName: "",
  email: "",
  phone: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  registrationNumber: "",
  vehicleInformation: "",
  serviceId: "",
  description: "",
  preferredDate: "",
  preferredTime: "",
  alternativeDate: "",
  alternativeTime: "",
  additionalNotes: "",
  website: "",
  startedAt: 0,
};

/** Spec section 5 booking request form. A submission is a request, never a confirmed booking. */
export function BookingForm({ services, config, initialServiceId }: BookingFormProps) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const doneMessageRef = useRef<HTMLParagraphElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormInput, unknown, BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { ...EMPTY, serviceId: initialServiceId ?? "" },
    shouldFocusError: true,
  });

  // Time the form was opened (spam check: bots submit instantly).
  useEffect(() => {
    setValue("startedAt", Date.now());
  }, [setValue]);

  useEffect(() => {
    if (done) doneMessageRef.current?.focus();
  }, [done]);

  const today = todayInTimezone(config.timezone);
  const [preferredDate, alternativeDate] = useWatch({
    control,
    name: ["preferredDate", "alternativeDate"],
  });

  async function submit(values: BookingFormValues) {
    if (submittingRef.current) return; // double click / double submit guard
    submittingRef.current = true;
    setFormError(null);
    try {
      const result = await submitBookingRequest(values);
      if (result.status === "success") {
        setDone(true);
        return;
      }
      setFormError(result.message);
      const fields = Object.entries(result.fieldErrors ?? {}) as [BookingField, string][];
      fields.forEach(([field, message], i) => setError(field, { message }, { shouldFocus: i === 0 }));
    } catch {
      setFormError("We couldn’t send your request. Please check your connection and try again.");
    } finally {
      submittingRef.current = false;
    }
  }

  if (done) {
    return (
      <div role="status" className="space-y-6 text-left">
        <p ref={doneMessageRef} tabIndex={-1} className="text-body-lg outline-none">
          {BOOKING_RECEIVED_MESSAGE}
        </p>
        <Button
          type="button"
          variant="brand"
          size="brand"
          onClick={() => {
            reset({ ...EMPTY, startedAt: Date.now() });
            setDone(false);
          }}
        >
          Make another request
        </Button>
      </div>
    );
  }

  const err = (field: BookingField) => errors[field]?.message as string | undefined;

  return (
    <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate aria-label="Booking request" className="space-y-10 text-left">
      <p className="text-body-sm text-section-muted">
        This is a booking request. We will contact you to confirm your appointment.
      </p>

      <Group legend="Your details">
        <Field id="fullName" label="Full name" required error={err("fullName")}>
          <Input id="fullName" autoComplete="name" {...aria("fullName", err)} {...register("fullName")} />
        </Field>
        <div className="grid gap-field-gap sm:grid-cols-2 sm:gap-2.5">
          <Field id="email" label="Email" required error={err("email")}>
            <Input id="email" type="email" autoComplete="email" {...aria("email", err)} {...register("email")} />
          </Field>
          <Field id="phone" label="Phone" required error={err("phone")}>
            <Input id="phone" type="tel" autoComplete="tel" {...aria("phone", err)} {...register("phone")} />
          </Field>
        </div>
      </Group>

      <Group legend="Your vehicle">
        <div className="grid gap-field-gap sm:grid-cols-2 sm:gap-2.5">
          <Field id="vehicleMake" label="Make" required error={err("vehicleMake")}>
            <Input id="vehicleMake" placeholder="e.g. Mazda" {...aria("vehicleMake", err)} {...register("vehicleMake")} />
          </Field>
          <Field id="vehicleModel" label="Model" required error={err("vehicleModel")}>
            <Input id="vehicleModel" placeholder="e.g. MX-5" {...aria("vehicleModel", err)} {...register("vehicleModel")} />
          </Field>
          <Field id="vehicleYear" label="Year" required error={err("vehicleYear")}>
            <Input
              id="vehicleYear"
              inputMode="numeric"
              maxLength={4}
              {...aria("vehicleYear", err)}
              {...register("vehicleYear")}
            />
          </Field>
          <Field id="registrationNumber" label="Registration (plate)" required error={err("registrationNumber")}>
            <Input
              id="registrationNumber"
              autoCapitalize="characters"
              className="uppercase"
              {...aria("registrationNumber", err)}
              {...register("registrationNumber")}
            />
          </Field>
        </div>
        <Field id="vehicleInformation" label="Anything else about the vehicle" error={err("vehicleInformation")}>
          <Textarea
            id="vehicleInformation"
            className="min-h-16"
            {...aria("vehicleInformation", err)}
            {...register("vehicleInformation")}
          />
        </Field>
      </Group>

      <Group legend="Service & time">
        <Field id="serviceId" label="Service" required error={err("serviceId")}>
          <NativeSelect id="serviceId" {...aria("serviceId", err)} {...register("serviceId")}>
            <option value="">Choose a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.priceLabel ? ` (${s.priceLabel})` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="description" label="What do you need done?" required error={err("description")}>
          <Textarea
            id="description"
            placeholder="Describe the problem or the work you’d like"
            {...aria("description", err)}
            {...register("description")}
          />
        </Field>

        <SlotPicker
          kind="preferred"
          label="Preferred"
          required
          today={today}
          date={preferredDate}
          config={config}
          dateError={err("preferredDate")}
          timeError={err("preferredTime")}
          dateField={register("preferredDate", {
            onChange: () => clearTimeIfInvalid("preferredDate", "preferredTime"),
          })}
          timeField={register("preferredTime")}
        />
        <SlotPicker
          kind="alternative"
          label="Alternative"
          today={today}
          date={alternativeDate}
          config={config}
          dateError={err("alternativeDate")}
          timeError={err("alternativeTime")}
          dateField={register("alternativeDate", {
            onChange: () => clearTimeIfInvalid("alternativeDate", "alternativeTime"),
          })}
          timeField={register("alternativeTime")}
        />

        <Field id="additionalNotes" label="Additional notes" error={err("additionalNotes")}>
          <Textarea
            id="additionalNotes"
            className="min-h-16"
            {...aria("additionalNotes", err)}
            {...register("additionalNotes")}
          />
        </Field>
      </Group>

      {/* Spam protection: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <input type="hidden" {...register("startedAt")} />

      <div className="space-y-4">
        <div aria-live="assertive">
          {formError && (
            <p role="alert" className="text-section-error">
              {formError}
            </p>
          )}
        </div>
        <Button type="submit" variant="brand" size="brand-lg" disabled={isSubmitting} className="w-full sm:w-auto sm:min-w-[17rem]">
          {isSubmitting ? "Sending…" : "Request booking"}
        </Button>
      </div>
    </form>
  );

  /** When the date changes, drop a time that isn't offered on the new day. */
  function clearTimeIfInvalid(dateField: "preferredDate" | "alternativeDate", timeField: "preferredTime" | "alternativeTime") {
    const date = getValues(dateField);
    const time = getValues(timeField);
    if (!date || !time) return;
    const slots = slotsForDay(config.hours.find((h) => h.dayOfWeek === dayOfWeek(date)), config.appointmentDurationMinutes);
    if (slots && !slots.includes(time)) setValue(timeField, "");
  }
}

function aria(field: BookingField, err: (f: BookingField) => string | undefined) {
  const message = err(field);
  return {
    "aria-invalid": message ? true : undefined,
    "aria-describedby": message ? `${field}-error` : undefined,
  } as const;
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-field-gap">
      <legend className="mb-5 font-heading text-h4 uppercase">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-label-gap">
      <Label htmlFor={id}>
        {label}{" "}
        <span className="font-normal text-section-muted">{required ? "(required)" : "(optional)"}</span>
      </Label>
      {children}
      {hint && !error && <p className="text-body-sm text-section-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-body-sm text-section-error">
          {error}
        </p>
      )}
    </div>
  );
}

function SlotPicker({
  kind,
  label,
  required,
  today,
  date,
  config,
  dateError,
  timeError,
  dateField,
  timeField,
}: {
  kind: "preferred" | "alternative";
  label: string;
  required?: boolean;
  today: string;
  date: string | undefined;
  config: BookingConfig;
  dateError?: string;
  timeError?: string;
  dateField: UseFormRegisterReturn;
  timeField: UseFormRegisterReturn;
}) {
  const dateId = `${kind}Date`;
  const timeId = `${kind}Time`;
  const hours = date ? config.hours.find((h) => h.dayOfWeek === dayOfWeek(date)) : undefined;
  const slots = date ? slotsForDay(hours, config.appointmentDurationMinutes) : [];
  const closed = Boolean(date) && Array.isArray(slots) && slots.length === 0;
  const closedMessage = closed ? "We’re closed on this day. Please choose another date." : undefined;
  const shownDateError = dateError ?? closedMessage;
  const describe = (id: string, msg?: string) => ({
    "aria-invalid": msg ? true : undefined,
    "aria-describedby": msg ? `${id}-error` : undefined,
  });

  return (
    <div className="grid gap-field-gap sm:grid-cols-2 sm:gap-2.5">
      <Field id={dateId} label={`${label} date`} required={required} error={shownDateError}>
        <Input id={dateId} type="date" min={today} {...describe(dateId, shownDateError)} {...dateField} />
      </Field>
      <Field
        id={timeId}
        label={`${label} time`}
        required={required}
        error={timeError}
        hint={
          !date
            ? "Choose a date first."
            : slots === null
              ? "Open all day. Choose a time that suits you."
              : undefined
        }
      >
        {slots === null ? (
          <Input id={timeId} type="time" step={1800} {...describe(timeId, timeError)} {...timeField} />
        ) : (
          <NativeSelect id={timeId} disabled={!date || closed} {...describe(timeId, timeError)} {...timeField}>
            <option value="">{date ? "Choose a time…" : "—"}</option>
            {slots.map((t) => (
              <option key={t} value={t}>
                {formatTime(t)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
    </div>
  );
}
