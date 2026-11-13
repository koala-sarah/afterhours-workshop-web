import type { Metadata } from "next";

import { siteConfig } from "./site";

/**
 * Search titles and descriptions for the public pages (spec section 12).
 * Written only from verified details (docs/SITE_CONTENT.md, src/config/site.ts):
 * no prices, ratings or claims that aren't on the existing site.
 */
const { contact, hours } = siteConfig;
const where = `${contact.address.suburb}, ${contact.address.city}`;
const open = `Open ${hours.weekdays} on weekdays and ${hours.weekends.toLowerCase()} on weekends`;

export const pageSeo = {
  "/": {
    title: { absolute: `${siteConfig.name} | After-hours car servicing in ${where}` },
    description: `Car servicing, repairs and upgrades after hours in ${where}. ${open}. Send a request, chat with us or call ${contact.phoneDisplay}.`,
  },
  "/services": {
    title: "Services",
    description: `Basic, Advanced and Track-ready car service packages at ${siteConfig.name}, ${where}. ${open}.`,
  },
  "/about": {
    title: "About",
    description: `${siteConfig.name} provides car services outside ordinary business hours: maintenance, repair and upgrades in ${where}.`,
  },
  "/contact": {
    title: "Contact",
    description: `Contact ${siteConfig.name} at ${contact.address.street}, ${where}: call, text, WhatsApp, email or chat with us. ${open}.`,
  },
  "/appointments": {
    title: "Send a request",
    description: `Tell us what your car needs and how to reach you. A mechanic from ${siteConfig.name} in ${where} will check it and contact you directly.`,
  },
} as const satisfies Record<string, { title: Metadata["title"]; description: string }>;

export function pageMetadata(path: keyof typeof pageSeo): Metadata {
  const { title, description } = pageSeo[path];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { url: path, description },
  };
}
