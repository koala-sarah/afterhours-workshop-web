"use client";

import { usePathname } from "next/navigation";
import { Mail, MessageCircle, MessageSquare, MessagesSquare, Phone, type LucideIcon } from "lucide-react";

import { OPEN_CHAT_EVENT } from "@/components/site/open-chat-button";
import { chatCopy } from "@/config/intake";
import { siteConfig } from "@/config/site";

/** Height of the bar (without the iPhone home-indicator area); the layout reserves the same space. */
export const MOBILE_BAR_HEIGHT = "4rem";

type Item = { key: string; label: string; icon: LucideIcon; href?: string; external?: boolean; onClick?: () => void };

/**
 * Sticky contact bar on phones (spec section 4): one tap to call, text,
 * WhatsApp or open the chat. Plain links; channels without a confirmed value
 * are left out. Where the chat is already on the page (Contact) or the form
 * is (Request), the last slot is Email instead of Chat.
 */
export function MobileContactBar() {
  const pathname = usePathname();
  const { contact } = siteConfig;
  const chatOnPage = pathname === "/contact" || pathname.startsWith("/appointments");

  const items: Item[] = [
    { key: "call", label: "Call", icon: Phone, href: contact.phoneHref },
    ...(contact.sms ? [{ key: "sms", label: "Text", icon: MessageSquare, href: contact.sms.href }] : []),
    ...(contact.whatsapp
      ? [{ key: "whatsapp", label: "WhatsApp", icon: MessageCircle, href: contact.whatsapp.href, external: true }]
      : []),
    chatOnPage
      ? { key: "email", label: "Email", icon: Mail, href: `mailto:${contact.email}` }
      : {
          key: "chat",
          label: "Chat",
          icon: MessagesSquare,
          onClick: () => window.dispatchEvent(new Event(OPEN_CHAT_EVENT)),
        },
  ];

  return (
    <nav
      aria-label="Contact us"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-paper/15 bg-ink pb-[env(safe-area-inset-bottom)] text-paper md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, height: MOBILE_BAR_HEIGHT }}>
        {items.map(({ key, label, icon: Icon, href, external, onClick }) => {
          const className =
            "flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-semibold active:bg-paper/15 focus-visible:bg-paper/15 focus-visible:outline-none";
          const content = (
            <>
              <Icon aria-hidden className="size-5" />
              {label}
            </>
          );
          return (
            <li key={key}>
              {href ? (
                <a href={href} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  {content}
                </a>
              ) : (
                <button type="button" onClick={onClick} aria-label={chatCopy.launcher} className={className}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
