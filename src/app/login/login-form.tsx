"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "@/lib/auth/actions";

/** `disabled`: placeholder shown while the page streams in (it doesn't know `?next=` yet). */
export function LoginForm({ next, notice, disabled }: { next?: string; notice?: string; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  const error = state.error ?? notice;

  return (
    <form action={formAction} noValidate className="space-y-field-gap" aria-label="Admin sign in" aria-busy={disabled || undefined}>
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset disabled={disabled} className="space-y-field-gap">
        <div className="space-y-label-gap">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={state.email}
            aria-invalid={!!state.fieldErrors?.email}
            aria-describedby={state.fieldErrors?.email ? "login-email-error" : undefined}
          />
          {state.fieldErrors?.email && (
            <p id="login-email-error" role="alert" className="text-body-sm text-destructive">
              {state.fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-label-gap">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={!!state.fieldErrors?.password}
            aria-describedby={state.fieldErrors?.password ? "login-password-error" : undefined}
          />
          {state.fieldErrors?.password && (
            <p id="login-password-error" role="alert" className="text-body-sm text-destructive">
              {state.fieldErrors.password}
            </p>
          )}
        </div>

        <div aria-live="polite">
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>

        <Button type="submit" variant="brand" size="brand" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </fieldset>
    </form>
  );
}
