"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { safeAdminPath } from "./dal";

const loginSchema = z.object({
  email: z.email({ error: "Please enter a valid email address." }).max(254),
  password: z.string().min(1, { error: "Please enter your password." }).max(200),
  next: z.string().max(500).optional(),
});

export type LoginState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
  email?: string;
};

const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const email = String(formData.get("email") ?? "");

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    return {
      email,
      fieldErrors: { email: fieldErrors.email?.[0], password: fieldErrors.password?.[0] },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Supabase Auth rate-limits sign-in attempts.
    if (error?.status === 429) {
      return { email, error: "Too many sign-in attempts. Please wait a few minutes and try again." };
    }
    // Same message for unknown email and wrong password.
    return { email, error: GENERIC_LOGIN_ERROR };
  }

  // Only ADMIN accounts may use the admin area. Read through RLS (own row).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.role !== "ADMIN") {
    await supabase.auth.signOut();
    return { email, error: "This account doesn’t have access to the admin area." };
  }

  redirect(safeAdminPath(parsed.data.next));
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login?signed_out=1");
}
