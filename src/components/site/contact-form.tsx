"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { siteConfig } from "@/config/site";
import { submitContactForm } from "@/lib/enquiries/actions";
import {
  contactFormSchema,
  type ContactFormResult,
  type ContactFormValues,
} from "@/lib/enquiries/contact-schema";

function RequiredHint() {
  return <span className="font-normal text-section-muted">(required)</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-body-sm text-destructive">
      {message}
    </p>
  );
}

/** Contact form in the existing site's layout (Name / Email / Message / Submit). */
export function ContactForm() {
  const [result, setResult] = useState<ContactFormResult | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phone: "", message: "", company: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setResult(null);
    const res = await submitContactForm(values);
    if (res.status === "invalid") {
      for (const [field, msgs] of Object.entries(res.fieldErrors)) {
        if (msgs?.[0]) setError(field as keyof ContactFormValues, { message: msgs[0] });
      }
      return;
    }
    if (res.status === "success") reset();
    setResult(res);
  });

  const describedBy = (field: keyof ContactFormValues) =>
    errors[field] ? `contact-${field}-error` : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-field-gap" aria-label="Contact form">
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
          Email <RequiredHint />
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
        <label htmlFor="contact-company">Company</label>
        <input id="contact-company" tabIndex={-1} autoComplete="off" {...register("company")} />
      </div>

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

      <Button type="submit" variant="brand" size="brand" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Submit"}
      </Button>

      <div aria-live="polite">
        {result?.status === "success" && (
          <p>Thanks! We’ve received your message and will be in touch shortly.</p>
        )}
        {result?.status === "unavailable" && (
          <p>
            Online messages aren’t available yet. Please email{" "}
            <a className="underline" href={`mailto:${siteConfig.contact.email}`}>
              {siteConfig.contact.email}
            </a>{" "}
            or call{" "}
            <a className="underline" href={siteConfig.contact.phoneHref}>
              {siteConfig.contact.phoneDisplay}
            </a>
            .
          </p>
        )}
      </div>
    </form>
  );
}
