import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ServiceGrid } from "@/components/site/service-grid";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { howItWorks } from "@/config/intake";
import { siteConfig } from "@/config/site";
import { getServices } from "@/lib/services/catalog";
import { pageMetadata } from "@/config/seo";

export const metadata: Metadata = pageMetadata("/");

export default async function HomePage() {
  const services = await getServices();

  return (
    <>
      <SiteHeader theme="bright" active="/" />

      {/* Hero: same layout as the existing site (text left, tall photo right). */}
      <Section theme="bright" padding="none" className="pt-6 pb-[3.9vw] md:pt-[6.8vw]">
        <Container className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_45.6vw] md:gap-[4vw]">
          <div className="md:-mt-[0.6vw]">
            <h1>
              Your
              <br />
              one &amp; only, local,
              <br />
              After-hours workshop.
            </h1>
            <p className="mt-6 font-heading text-h3 uppercase md:mt-[2.3rem]">{siteConfig.locationTagline}</p>

            <div className="mt-10 max-w-[29rem] space-y-4 md:mt-[4.2rem]">
              <p>
                Welcome to Afterhours Workshop, your top spot for car services.
              </p>
              <p className="text-body-lg leading-[1.45]">
                Open from 5 PM to 10 PM on weekdays
                <br />
                and all day on weekends.
              </p>
              <p>
                From general maintenance &amp; repair, to upgrade your car, we provide top
                quality service by qualified professional mechanic.
              </p>
            </div>

            <Button
              nativeButton={false}
              render={<Link href="/about" />}
              variant="brand"
              size="brand-lg"
              className="mt-10 min-w-[17rem] md:mt-[8.6rem]"
            >
              Learn more
            </Button>
          </div>

          <div className="relative aspect-[0.667] w-full">
            <Image
              src="/images/unsplash-image-BFdHyMPojEA.webp"
              alt="Wall of hand tools and stickers above a wooden workbench"
              fill
              preload
              sizes="(min-width: 768px) 46vw, 100vw"
              className="object-cover"
            />
          </div>
        </Container>
      </Section>

      {/* Our services */}
      <Section theme="light" padding="md">
        <Container>
          <h2 className="mb-[3.2rem] text-h1">Our services</h2>
          <ServiceGrid services={services} />
        </Container>
      </Section>

      {/* Why us (verified claims only) + how a request works. */}
      <Section theme="bright" padding="md">
        <Container className="grid gap-12 md:grid-cols-2 md:gap-[8vw]">
          <div className="space-y-6">
            <h2>Why choose us</h2>
            <ul className="space-y-4 text-body-lg">
              <li>Open after hours: 5 PM to 10 PM on weekdays and all day on weekends.</li>
              <li>Your local workshop in St Johns, Auckland.</li>
              <li>From general maintenance &amp; repair to upgrades for your car.</li>
              <li>Qualified professional mechanic, with prices kept reasonable and competitive.</li>
            </ul>
          </div>
          <div className="space-y-6">
            <h2>{howItWorks.heading}</h2>
            <ol className="space-y-4 text-body-lg">
              {howItWorks.steps.map((step, n) => (
                <li key={step}>
                  <span className="font-heading">{n + 1}.</span> {step}
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </Section>

      {/* Schedule today */}
      <Section theme="dark-bold" padding="sm">
        <Container className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_30vw] md:gap-[8vw] md:px-[3.9vw]">
          <div className="space-y-8">
            <h2>Schedule today</h2>
            <p className="text-body-lg text-paper">
              Book your slot for car services, if you are not sure what to choose, give us a
              call or email us!
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4 text-section-muted">
              <Button
                nativeButton={false}
                render={<Link href="/appointments" />}
                variant="brand"
                size="brand-lg"
                className="min-w-[17rem]"
              >
                {howItWorks.cta}
              </Button>
              <a href={siteConfig.contact.phoneHref} className="hover:underline">
                {siteConfig.contact.phoneDisplay}
              </a>
            </div>
          </div>
          <div className="relative aspect-[0.807] w-full">
            <Image
              src="/images/unsplash-image-c7VByynfcvg.webp"
              alt="Motorsport mechanics working on a rally car in the service park"
              fill
              sizes="(min-width: 768px) 34vw, 100vw"
              className="object-cover"
            />
          </div>
        </Container>
      </Section>
    </>
  );
}
