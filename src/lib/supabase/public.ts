import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Anonymous client with no cookies or session, for public reference data
 * (services, opening hours). Safe inside `"use cache"` functions because it
 * never reads the request. RLS limits it to what any visitor may see.
 */
export function createSupabasePublicClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
