import { AtSign, Camera, Mail, MessageCircle, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import { cn } from "cn";

import { siteConfig } from "@/config/site";

type ContactLink = { key: string; label: string; href: string; icon: LucideIcon; external?: boolean };

/**
 * One-tap contact links (spec section 4). Plain links, no messaging APIs.
 * A channel whose value isn't confirmed in src/config/site.ts is left out.
 */
export function contactLinks(): ContactLink[] {
  const c = siteConfig.contact;
  const links: (ContactLink | null)[] = [
    { key: "call", label: "Call", href: c.phoneHref, icon: Phone },
    c.sms ? { key: "sms", label: "Text", href: c.sms.href, icon: MessageSquare } : null,
    c.whatsapp ? { key: "whatsapp", label: "WhatsApp", href: c.whatsapp.href, icon: MessageCircle, external: true } : null,
    c.messengerUsername
      ? { key: "messenger", label: "Messenger", href: `https://m.me/${c.messengerUsername}`, icon: AtSign, external: true }
      : null,
    c.instagramUsername
      ? { key: "instagram", label: "Instagram", href: `https://ig.me/m/${c.instagramUsername}`, icon: Camera, external: true }
      : null,
    { key: "email", label: "Email", href: `mailto:${c.email}`, icon: Mail },
  ];
  return links.filter((l): l is ContactLink => l !== null);
}

/** Row of pill buttons in the surrounding section's colours. */
export function ContactButtons({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-2.5", className)}>
      {contactLinks().map(({ key, label, href, icon: Icon, external }) => (
        <li key={key}>
          <a
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-current/60 px-4 py-2 font-body text-base font-semibold transition-colors hover:bg-current/10 focus-visible:ring-3 focus-visible:ring-current/30 focus-visible:outline-none"
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}
