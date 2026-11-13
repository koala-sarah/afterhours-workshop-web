import type { MetadataRoute } from "next";

import { pageSeo } from "@/config/seo";
import { siteConfig } from "@/config/site";

/** Public pages only (admin, login and the design system are excluded). */
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.keys(pageSeo).map((path) => ({
    url: `${siteConfig.url}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : path === "/appointments" ? 0.9 : 0.7,
  }));
}
