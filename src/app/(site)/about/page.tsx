import type { Metadata } from "next";
import Image from "next/image";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ContactSection } from "@/components/site/contact-section";
import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  const { specialisedAreas, mechanicInfo } = siteConfig.about;

  return (
    <>
      <SiteHeader theme="light" active="/about" />

      {/* Who we are: text left, photo right (existing layout). */}
      <Section theme="light" padding="none" className="pt-6 pb-section-sm md:pt-[4.5vw] md:pb-[5.6vw]">
        <Container className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_41.7vw] md:gap-[6vw]">
          <div>
            <h1>Who we are</h1>
            <div className="mt-8 max-w-[41rem] space-y-4">
              <p>
                All my mates always wanted to have an afterhours serviced workshop,
                <br className="hidden md:inline" /> so that we all can save another day off!
              </p>
              <p>
                And here we are to provide workshop services outside of ‘ordinary’ business
                hours.
                <br className="hidden md:inline" /> Not only our business hour is extraordinary,
                so is our service.
              </p>
              <p>
                From car maintenance, repair, to fancy upgrade, we are confident to offer best
                services while keeping the price tag reasonable and competitive in this tough
                industry.
              </p>
              {/* Placeholders on the existing site; shown only once the owner provides the text. */}
              {specialisedAreas && <p>{specialisedAreas}</p>}
              {mechanicInfo && <p>{mechanicInfo}</p>}
            </div>
          </div>
          <div className="relative aspect-[1.096] w-full md:-mt-[1.4vw]">
            <Image
              src="/images/unsplash-image-UZUzvJEvKnI.webp"
              alt="Mechanic in gloves working on a car engine"
              fill
              preload
              sizes="(min-width: 768px) 42vw, 100vw"
              className="object-cover"
            />
          </div>
        </Container>
      </Section>

      <ContactSection
        intro={
          <>
            <p>
              You’ve got any questions? Any consult, help, or additional information needed but
              don’t want to talk over a phone?
            </p>
            <p>
              Fill out some info and we will be in touch shortly.
              <br />
              We can’t wait to have a chat with you!
            </p>
          </>
        }
      />
    </>
  );
}
