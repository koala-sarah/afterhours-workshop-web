import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * Service packages shown on the public site and in the booking form.
 * Read from the `services` table (active rows only, enforced by RLS) and cached;
 * admin edits will call updateTag("services") to refresh it.
 */
export type Service = {
  id: string;
  slug: string;
  name: string;
  /** Price exactly as stored, e.g. "From $99". */
  priceLabel: string | null;
  /** Paragraphs of description text. */
  description: string[];
  image: { src: string; alt: string } | null;
};

export async function getServices(): Promise<Service[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("services");

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, slug, name, description, price_label, image_path, image_alt, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    throw new Error(`Could not load services: ${error.message}`);
  }

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceLabel: row.price_label,
    description: row.description
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    image: row.image_path ? { src: row.image_path, alt: row.image_alt ?? "" } : null,
  }));
}
