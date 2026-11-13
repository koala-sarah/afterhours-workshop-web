"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { TurnstileWidget, type TurnstileHandle } from "@/components/site/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContactMessage } from "@/lib/intake/actions";
import {
  contactFormSchema,
  type ContactField,
  type ContactFormInput,
  type ContactFormValues,
} from "@/lib/intake/contact-schema";

function RequiredHint() {
  return <span className="font-normal text-section-muted">(required)</span>;
}

function OrPhoneHint() {
  return <span className="font-normal text-section-muted">(or phone)</span>;
}

const EMPTY: ContactFormInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  message: "",
  website: "",
  startedAt: 0,
  turnstileToken: "",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-body-sm text-section-error">
      {message}
    </p>
  );
}

/** Contact form in the existing site's layout (Name / Email / Message / Submit). */
export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormInput, unknown, ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: EMPTY,
  });

  // Time the form was opened (bots submit instantly).
  useEffect(() => {
    setValue("startedAt", Date.now());
  }, [setValue]);

  async function send(values: ContactFormValues) {
    setSent(false);
    setFormError(null);
    try {
      const res = await submitContactMessage(values);
      if (res.status === "success") {
        reset({ ...EMPTY, startedAt: Date.now() });
        setSent(true);
        return;
      }
      setFormError(res.message);
      for (const [field, message] of Object.entries(res.fieldErrors ?? {})) {
        if (message) setError(field as ContactField, { message });
      }
    } catch {
      setFormError("We couldn’t send your message. Please check your connection and try again.");
    } finally {
      turnstileRef.current?.reset(); // tokens are single use
    }
  }

  const describedBy = (field: ContactField) => (errors[field] ? `contact-${field}-error` : undefined);

  return (
    <form onSubmit={(event) => void handleSubmit(send)(event)} noValidate className="space-y-field-gap" aria-label="Contact form">
      <fieldset className="space-y-label-gap">
        <legend className="mb-label-gap">Name</legend>
        <div className="grid gap-field-gap sm:grid-cols-2 sm:gap-2.5">
          <div className="space-y-label-gap">
            <Label htmlFor="contact-firstName">
              First Name <RequiredHint />
            </Label>
            <Input
              id="contact-firstName"
              autoComplete="given-name"
              aria-invalid={!!errors.firstName}
              aria-describedby={describedBy("firstName")}
              {...register("firstName")}
            />
            <FieldError id="contact-firstName-error" message={errors.firstName?.message} />
          </div>
          <div className="space-y-label-gap">
            <Label htmlFor="contact-lastName">
              Last Name <RequiredHint />
            </Label>
            <Input
              id="contact-lastName"
              autoComplete="family-name"
              aria-invalid={!!errors.lastName}
              aria-describedby={describedBy("lastName")}
              {...register("lastName")}
            />
            <FieldError id="contact-lastName-error" message={errors.lastName?.message} />
          </div>
        </div>
      </fieldset>

      <div className="space-y-label-gap">
        <Label htmlFor="contact-email">
          Email <OrPhoneHint />
        </Label>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={describedBy("email")}
          {...register("email")}
        />
        <FieldError id="contact-email-error" message={errors.email?.message} />
      </div>

      <div className="space-y-label-gap">
        <Label htmlFor="contact-phone">Phone</Label>
        <Input
          id="contact-phone"
          type="tel"
          autoComplete="tel"
          aria-invalid={!!errors.phone}
          aria-describedby={describedBy("phone")}
          {...register("phone")}
        />
        <FieldError id="contact-phone-error" message={errors.phone?.message} />
      </div>

      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input id="contact-website" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <input type="hidden" {...register("startedAt")} />

      <div className="space-y-label-gap">
        <Label htmlFor="contact-message">
          Message <RequiredHint />
        </Label>
        <Textarea
          id="contact-message"
          aria-invalid={!!errors.message}
          aria-describedby={describedBy("message")}
          {...register("message")}
        />
        <FieldError id="contact-message-error" message={errors.message?.message} />
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        action="contact"
        theme="light"
        onToken={(token) => setValue("turnstileToken", token)}
      />

      <Button type="submit" variant="brand" size="brand" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Submit"}
      </Button>

      <div aria-live="polite">
        {sent && <p>Thanks! We’ve received your message and will be in touch shortly.</p>}
        {formError && (
          <p role="alert" className="text-section-error">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
