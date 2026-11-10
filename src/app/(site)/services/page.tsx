import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ContactSection } from "@/components/site/contact-section";
import { ServiceGrid } from "@/components/site/service-grid";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { getServices } from "@/lib/services/catalog";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const services = await getServices();

  return (
    <>
      <SiteHeader theme="light" active="/services" />

      <Section theme="light" padding="none" className="pt-8 pb-section-md md:pt-[8.5vw]">
        <Container>
          <h1 className="mb-[3.2rem]">Our services</h1>
          <ServiceGrid services={services} />
          <div className="mt-[3.2rem] flex justify-center">
            <Button
              nativeButton={false}
              render={<Link href="/appointments" />}
              variant="brand"
              size="brand-lg"
              className="min-w-[20.6rem]"
            >
              Book now
            </Button>
          </div>
        </Container>
      </Section>

      <ContactSection
        narrow
        intro={
          <p>
            Interested in working together? Fill out some info and we will be in touch shortly.
            We can’t wait to hear from you!
          </p>
        }
      />
    </>
  );
}
