"use client";

import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chatCopy as copy } from "@/config/intake";

/** Event the corner chat (ChatLauncher) listens for, so a page has only one chat. */
export const OPEN_CHAT_EVENT = "ahw:open-chat";

export function OpenChatButton() {
  return (
    <Button
      type="button"
      variant="brand"
      size="brand"
      onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))}
    >
      <MessageCircle aria-hidden />
      {copy.launcher}
    </Button>
  );
}
