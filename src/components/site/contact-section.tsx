import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";

import { ContactForm } from "./contact-form";

/** "Contact us" band from the existing About and Services pages (steel background, text left, form right). */
export function ContactSection({
  intro,
  narrow = false,
}: {
  intro: ReactNode;
  /** Services page: narrower text column, so the heading wraps onto two lines as on the existing site. */
  narrow?: boolean;
}) {
  return (
    <Section theme="bright" padding="none" id="contact" className="py-section-sm md:pt-[8.2vw] md:pb-[4.6vw]">
      <Container className="grid gap-10 md:grid-cols-[minmax(0,1fr)_41.7vw] md:gap-[4vw]">
        <div className={narrow ? "max-w-[28rem] space-y-6" : "space-y-6"}>
          <h2 className="text-h1">Contact us</h2>
          <div className="max-w-[30rem] space-y-4">{intro}</div>
        </div>
        <ContactForm />
      </Container>
    </Section>
  );
}
