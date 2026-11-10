import { z } from "zod";

const publicEnvSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

/**
 * Public Supabase settings (safe in the browser; access is enforced by RLS).
 * `process.env.NEXT_PUBLIC_*` must be referenced literally so Next.js can inline them.
 */
export function getSupabasePublicEnv() {
  const parsed = publicEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  return parsed.data;
}
