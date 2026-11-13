import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requestFormCopy, sitePrompts } from "@/config/intake";

import { ContactButtons } from "./contact-buttons";
import { OpenChatButton } from "./open-chat-button";

/** "Contact us" band from the existing About and Services pages (steel background, text left, contact options right). */
export function ContactSection({
  narrow = false,
}: {
  /** Services page: narrower text column, so the heading wraps onto two lines as on the existing site. */
  narrow?: boolean;
}) {
  return (
    <Section theme="bright" padding="none" id="contact" className="py-section-sm md:pt-[8.2vw] md:pb-[4.6vw]">
      <Container className="grid gap-10 md:grid-cols-[minmax(0,1fr)_41.7vw] md:gap-[4vw]">
        <div className={narrow ? "max-w-[28rem] space-y-6" : "space-y-6"}>
          <h2 className="text-h1">Contact us</h2>
          <p className="max-w-[30rem]">{sitePrompts.contact}</p>
        </div>
        {/* One way to leave a message: the corner chat or the request form (no separate contact form). */}
        <div className="space-y-6 md:pt-4">
          <ContactButtons />
          <div className="flex flex-wrap gap-2.5">
            <OpenChatButton />
            <Button nativeButton={false} render={<Link href="/appointments" />} variant="brand" size="brand">
              {requestFormCopy.heading}
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  );
}
