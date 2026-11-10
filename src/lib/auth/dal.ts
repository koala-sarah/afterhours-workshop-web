import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AppRole = Database["public"]["Enums"]["app_role"];

export type CurrentProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: AppRole;
};

/**
 * The signed-in user's profile, or null when signed out.
 *
 * getClaims() verifies the session JWT (it does not just trust the cookie).
 * The profile is read through RLS, which only returns the user's own row.
 * Memoised per request with React cache().
 */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  // Session checks must only run for a real request, never while prerendering
  // (the Supabase client reads the clock while loading the session).
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
  };
});

export type AdminUser = CurrentProfile & { role: "ADMIN" };

/**
 * Gate for every admin page, Server Action and Route Handler.
 * Signed out -> /login; signed in without the ADMIN role -> /login with an error.
 * RLS still applies to every query afterwards.
 */
export async function requireAdmin(returnTo = "/admin"): Promise<AdminUser> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  if (profile.role !== "ADMIN") {
    redirect("/login?error=not_admin");
  }
  return { ...profile, role: "ADMIN" };
}

/** Only allow redirects back into the admin area (prevents open redirects). */
export function safeAdminPath(next: string | null | undefined): string {
  if (next && /^\/admin(?:[/?#]|$)/.test(next)) return next;
  return "/admin";
}
