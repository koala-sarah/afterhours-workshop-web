import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Server-only client using SUPABASE_SECRET_KEY (service_role).
 *
 * Bypasses RLS. Used only for (1) the server-only submission functions
 * (request form, chat), so spam checks cannot be skipped, and (2) the
 * notification sender, which reads one request to build the operator alert.
 * Never use it to read data for a page, and never import it from client code
 * (`server-only` enforces that).
 */
export function createSupabaseServiceClient() {
  const { url } = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set (see .env.example).");
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
