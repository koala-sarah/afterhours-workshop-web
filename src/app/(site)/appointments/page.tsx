import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { BookingForm } from "@/components/site/booking-form";
import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config/site";
import { getBookingConfig } from "@/lib/booking/availability";
import { getServices } from "@/lib/services/catalog";

// The existing page title is "Bookings".
export const metadata: Metadata = { title: "Bookings" };

export default function AppointmentsPage({ searchParams }: PageProps<"/appointments">) {
  const { contact } = siteConfig;

  return (
    <>
      <SiteHeader theme="dark" active="/appointments" />

      {/* Existing layout: intro text + photo left, booking area right. */}
      <Section theme="dark" padding="none" className="flex-1 pt-6 pb-section-md md:pt-[5.9vw]">
        <Container className="grid items-start gap-12 md:grid-cols-[34.6vw_minmax(0,1fr)] md:gap-[6vw]">
          <div className="md:sticky md:top-8">
            <h1>Schedule today</h1>
            <div className="mt-8 space-y-4">
              <p>
                Make a booking to secure your slot for car service!
                <br />
                Track-ready package booking is especially required as it will be quickly booked
                out before track days.
              </p>
              <p>
                Not sure which one to select? Please give us a call to consult :){" "}
                <a href={contact.phoneHref} className="whitespace-nowrap underline underline-offset-4">
                  {contact.phoneDisplay}
                </a>
              </p>
            </div>
            <div className="relative mt-[3.6rem] hidden aspect-[1.166] w-full md:block">
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

          {/* Booking request form (replaces the Acuity widget on the existing site). */}
          <div>
            <h2 className="mb-8 text-h3">Request a booking</h2>
            <Suspense fallback={<p className="text-section-muted">Loading the booking form…</p>}>
              <BookingFormLoader searchParams={searchParams} />
            </Suspense>
          </div>
        </Container>
      </Section>
    </>
  );
}

async function BookingFormLoader({ searchParams }: Pick<PageProps<"/appointments">, "searchParams">) {
  const [services, config, params] = await Promise.all([getServices(), getBookingConfig(), searchParams]);
  // Service cards link to /appointments?service=<slug>.
  const slug = typeof params.service === "string" ? params.service : undefined;
  const initialServiceId = services.find((s) => s.slug === slug)?.id;

  return (
    <BookingForm
      services={services.map(({ id, name, priceLabel }) => ({ id, name, priceLabel }))}
      config={config}
      initialServiceId={initialServiceId}
    />
  );
}
