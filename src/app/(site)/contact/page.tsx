import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ContactForm } from "@/components/site/contact-form";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Contact" };

/**
 * New page (the existing site has no separate Contact page). Built from the existing
 * "Contact us" section and footer details in the same steel styling.
 * The map is the shared footer map, as on every page of the existing site.
 */
export default function ContactPage() {
  const { contact, hours } = siteConfig;
  const { address } = contact;

  return (
    <>
      <SiteHeader theme="bright" active="/contact" />

      <Section theme="bright" padding="none" className="pt-6 pb-section-md md:pt-[4.5vw]">
        <Container className="grid gap-12 md:grid-cols-2 md:gap-[4vw]">
          <div className="space-y-8">
            <h1>Contact us</h1>
            <div className="max-w-[30rem] space-y-4">
              <p>
                You’ve got any questions? Any consult, help, or additional information needed but
                don’t want to talk over a phone?
              </p>
              <p>
                Fill out some info and we will be in touch shortly.
                <br />
                We can’t wait to have a chat with you!
              </p>
            </div>

            <dl className="grid gap-6 sm:grid-cols-[auto_auto] sm:justify-start sm:gap-x-16">
              <div className="space-y-1">
                <dt className="text-body-sm">LOCATION</dt>
                <dd className="text-body-lg">
                  {address.street}
                  <br />
                  {address.suburb}
                  <br />
                  {address.city} {address.postcode}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-body-sm">CONTACT</dt>
                <dd className="text-body-lg">
                  <a href={`mailto:${contact.email}`} className="[overflow-wrap:anywhere] hover:underline">
                    {contact.email}
                  </a>
                  <br />
                  <a href={contact.phoneHref} className="hover:underline">
                    {contact.phoneDisplay}
                  </a>
                </dd>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <dt className="text-body-sm">HOURS</dt>
                <dd className="text-body-lg">
                  Weekdays: {hours.weekdays}
                  <br />
                  Weekends: {hours.weekends}
                </dd>
              </div>
            </dl>

            <Button
              nativeButton={false}
              render={<Link href="/appointments" />}
              variant="brand"
              size="brand-lg"
              className="min-w-[17rem]"
            >
              Book now
            </Button>
          </div>

          <ContactForm />
        </Container>
      </Section>
    </>
  );
}
