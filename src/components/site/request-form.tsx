"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";

import { ContactButtons } from "@/components/site/contact-buttons";
import { TurnstileWidget, type TurnstileHandle } from "@/components/site/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTACT_METHODS, PREFERRED_TIMES, PROBLEM_OPTIONS, requestFormCopy as copy } from "@/config/intake";
import { submitRequest } from "@/lib/intake/actions";
import {
  requestFormSchema,
  type RequestField,
  type RequestFormInput,
  type RequestFormValues,
} from "@/lib/intake/request-schema";

const EMPTY: RequestFormInput = {
  registration: "",
  registrationUnknown: false,
  problem: "",
  note: "",
  name: "",
  phone: "",
  method: "PHONE",
  email: "",
  times: [],
  website: "",
  startedAt: 0,
  turnstileToken: "",
};

/**
 * One-screen request form (spec section 5). A submission is a request, never
 * a booking: the finish screen only says it was received.
 */
export function RequestForm({ initialProblem }: { initialProblem?: string }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RequestFormInput, unknown, RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: { ...EMPTY, problem: initialProblem ?? "" },
    shouldFocusError: true,
  });

  const [method, registrationUnknown] = useWatch({ control, name: ["method", "registrationUnknown"] });

  // Time the form was opened (bots submit instantly).
  useEffect(() => {
    setValue("startedAt", Date.now());
  }, [setValue]);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function submit(values: RequestFormValues) {
    if (submittingRef.current) return; // double tap guard
    submittingRef.current = true;
    setFormError(null);
    try {
      const result = await submitRequest(values);
      if (result.status === "success") {
        setDone(true);
        return;
      }
      setFormError(result.message);
      const fields = Object.entries(result.fieldErrors ?? {}) as [RequestField, string][];
      fields.forEach(([field, message], i) => setError(field, { message }, { shouldFocus: i === 0 }));
    } catch {
      setFormError("We couldn’t send your request. Please check your connection and try again.");
    } finally {
      submittingRef.current = false;
      turnstileRef.current?.reset(); // tokens are single use
    }
  }

  if (done) {
    return (
      <div role="status" className="space-y-8 text-left">
        <p ref={doneRef} tabIndex={-1} className="text-body-lg outline-none">
          {copy.received}
        </p>
        <div className="space-y-4">
          <p className="text-body-sm text-section-muted">{copy.callInstead}</p>
          <ContactButtons />
        </div>
        <Button
          type="button"
          variant="brand"
          size="brand"
          onClick={() => {
            reset({ ...EMPTY, startedAt: Date.now() });
            setDone(false);
          }}
        >
          {copy.another}
        </Button>
      </div>
    );
  }

  const err = (field: RequestField) => errors[field]?.message as string | undefined;
  const aria = (field: RequestField) => ({
    "aria-invalid": err(field) ? true : undefined,
    "aria-describedby": err(field) ? `${field}-error` : undefined,
  });

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      aria-label="Request"
      className="space-y-8 text-left"
    >
      {/* Registration */}
      <Field id="registration" label={copy.registrationLabel} required error={err("registration")}>
        <Input
          id="registration"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          disabled={registrationUnknown}
          className="uppercase"
          {...aria("registration")}
          {...register("registration")}
        />
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-current"
            {...register("registrationUnknown", {
              onChange: (e: { target: HTMLInputElement }) => {
                if (e.target.checked) setValue("registration", "", { shouldValidate: false });
              },
            })}
          />
          {copy.registrationUnsure}
        </label>
      </Field>

      {/* Problem */}
      <ChoiceGroup id="problem" legend={copy.problemLabel} required error={err("problem")}>
        {PROBLEM_OPTIONS.map((p) => (
          <Choice key={p.label} type="radio" value={p.label} {...register("problem")}>
            {p.label}
          </Choice>
        ))}
      </ChoiceGroup>
      <Field id="note" label={copy.noteLabel} error={err("note")}>
        <Input id="note" maxLength={200} placeholder={copy.notePlaceholder} {...aria("note")} {...register("note")} />
      </Field>

      {/* Contact */}
      <div className="grid gap-field-gap sm:grid-cols-2 sm:gap-2.5">
        <Field id="name" label={copy.nameLabel} required error={err("name")}>
          <Input id="name" autoComplete="name" {...aria("name")} {...register("name")} />
        </Field>
        <Field id="phone" label={copy.phoneLabel} required error={err("phone")}>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" {...aria("phone")} {...register("phone")} />
        </Field>
      </div>

      <ChoiceGroup id="method" legend={copy.methodLabel} required error={err("method")}>
        {CONTACT_METHODS.map((m) => (
          <Choice key={m.value} type="radio" value={m.value} {...register("method")}>
            {m.label}
          </Choice>
        ))}
      </ChoiceGroup>
      {method === "EMAIL" && (
        <Field id="email" label={copy.emailLabel} required error={err("email")}>
          <Input id="email" type="email" autoComplete="email" {...aria("email")} {...register("email")} />
        </Field>
      )}

      {/* Times (optional) */}
      <ChoiceGroup id="times" legend={copy.timesLabel} error={err("times")}>
        {PREFERRED_TIMES.map((t) => (
          <Choice key={t} type="checkbox" value={t} {...register("times")}>
            {t}
          </Choice>
        ))}
      </ChoiceGroup>

      {/* Spam protection: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <input type="hidden" {...register("startedAt")} />
      <TurnstileWidget
        ref={turnstileRef}
        action="request"
        theme="dark"
        onToken={(token) => setValue("turnstileToken", token)}
      />

      <div className="space-y-4">
        <div aria-live="assertive">
          {formError && (
            <p role="alert" className="text-section-error">
              {formError}
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="brand"
          size="brand-lg"
          disabled={isSubmitting}
          className="w-full sm:w-auto sm:min-w-[17rem]"
        >
          {isSubmitting ? copy.submitting : copy.submit}
        </Button>
        <p className="text-body-sm text-section-muted">{copy.privacy}</p>
      </div>
    </form>
  );
}

function RequiredHint({ required }: { required?: boolean }) {
  return <span className="font-normal text-section-muted">{required ? "(required)" : "(optional)"}</span>;
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-label-gap">
      <Label htmlFor={id}>
        {label} <RequiredHint required={required} />
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-body-sm text-section-error">
          {error}
        </p>
      )}
    </div>
  );
}

function ChoiceGroup({
  id,
  legend,
  required,
  error,
  children,
}: {
  id: string;
  legend: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined} className="space-y-label-gap">
      <legend className="mb-label-gap font-body text-body-sm leading-none font-semibold">
        {legend} <RequiredHint required={required} />
      </legend>
      <div className="flex flex-wrap gap-2.5">{children}</div>
      {error && (
        <p id={`${id}-error`} className="text-body-sm text-section-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Pill-shaped radio / checkbox; the native input stays for keyboard and screen readers. */
function Choice({
  type,
  children,
  className,
  ...input
}: ComponentProps<"input"> & { type: "radio" | "checkbox" }) {
  return (
    <label
      className={cn(
        "relative inline-flex min-h-11 cursor-pointer items-center rounded-full border border-current/60 px-4 py-2 font-body text-base transition-colors select-none hover:bg-current/10",
        "has-checked:border-section-button has-checked:bg-section-button has-checked:text-section-button-foreground",
        "has-focus-visible:ring-3 has-focus-visible:ring-current/30",
        className,
      )}
    >
      <input type={type} className="sr-only" {...input} />
      {children}
    </label>
  );
}
