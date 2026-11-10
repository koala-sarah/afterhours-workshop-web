import type { Metadata } from "next";
import Image from "next/image";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

// The existing page title is "Bookings".
export const metadata: Metadata = { title: "Bookings" };

export default function AppointmentsPage() {
  const { contact } = siteConfig;

  return (
    <>
      <SiteHeader theme="dark" active="/appointments" />

      {/* Existing layout: intro text + photo left, booking area right. */}
      <Section theme="dark" padding="none" className="flex-1 pt-6 pb-section-md md:pt-[5.9vw]">
        <Container className="grid items-start gap-12 md:grid-cols-[34.6vw_minmax(0,1fr)] md:gap-[11vw]">
          <div>
            <h1>Schedule today</h1>
            <div className="mt-8 space-y-4">
              <p>
                Make a booking to secure your slot for car service!
                <br />
                Track-ready package booking is especially required as it will be quickly booked
                out before track days.
              </p>
              <p>Not sure which one to select? Please give us a call to consult :)</p>
            </div>
            <div className="relative mt-[3.6rem] aspect-[1.166] w-full">
              <Image
                src="/images/unsplash-image-BFdHyMPojEA.webp"
                alt="Wall of hand tools and stickers above a wooden workbench"
                fill
                preload
                sizes="(min-width: 768px) 35vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>

          {/*
           * Booking request area. The existing site embedded a (now unavailable) Acuity widget here.
           * The online booking request form replaces this panel in Stage 5.
           */}
          <div className="flex flex-col items-center text-center md:pt-[15vw]">
            <h2 className="text-h3">Book by phone or email</h2>
            <p className="mt-6 max-w-[32rem] text-body-lg">
              To book a service, give us a call or email us with your car and the service you
              need.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button
                nativeButton={false}
                render={<a href={contact.phoneHref} />}
                variant="brand"
                size="brand"
              >
                Call {contact.phoneDisplay}
              </Button>
              <Button
                nativeButton={false}
                render={<a href={`mailto:${contact.email}`} />}
                variant="brand"
                size="brand"
              >
                Email us
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
