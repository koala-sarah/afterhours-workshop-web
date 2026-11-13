"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { ChatPanel, type ChatService } from "@/components/site/chat-panel";
import { OPEN_CHAT_EVENT } from "@/components/site/open-chat-button";
import { chatCopy as copy } from "@/config/intake";

/**
 * "Chat with us" corner button on every public page. Opens the request chat
 * full screen on phones and as a corner panel on larger screens. The chat
 * stays mounted while closed, so answers survive closing and page changes.
 *
 * Not shown where the chat or the request form is already on the page.
 */
export function ChatLauncher({ services }: { services: ChatService[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hidden = pathname === "/contact" || pathname.startsWith("/appointments");

  // "Chat with us" buttons elsewhere on the page open this chat.
  useEffect(() => {
    function onOpen() {
      setStarted(true);
      setOpen(true);
    }
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);

  // Full screen on phones: keep the page behind from scrolling while the chat is open.
  useEffect(() => {
    if (!open || hidden || !window.matchMedia("(max-width: 639px)").matches) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open, hidden]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    // The corner button is rendered again on the next frame; return focus to it.
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  if (hidden) return null;

  return (
    <>
      {!open && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setStarted(true);
            setOpen(true);
          }}
          aria-haspopup="dialog"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 py-3 font-body text-base font-semibold text-paper shadow-lg hover:opacity-90 focus-visible:ring-3 focus-visible:ring-steel focus-visible:outline-none"
        >
          <MessageCircle aria-hidden className="size-5" />
          {copy.launcher}
        </button>
      )}
      {started && (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={titleId}
          hidden={!open}
          data-section="bright"
          className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden shadow-2xl sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[min(40rem,85dvh)] sm:w-[24rem] sm:rounded-2xl"
        >
          <ChatPanel variant="floating" services={services} titleId={titleId} onClose={close} />
        </div>
      )}
    </>
  );
}
