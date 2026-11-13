import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ContactButtons } from "@/components/site/contact-buttons";
import { RequestForm } from "@/components/site/request-form";
import { SiteHeader } from "@/components/site/site-header";
import { PROBLEM_OPTIONS, requestFormCopy as copy } from "@/config/intake";
import { pageMetadata } from "@/config/seo";

export const metadata: Metadata = pageMetadata("/appointments");

export default function AppointmentsPage({ searchParams }: PageProps<"/appointments">) {
  return (
    <>
      <SiteHeader theme="dark" active="/appointments" />

      {/* Existing layout: intro text + photo left, form right. */}
      <Section theme="dark" padding="none" className="flex-1 pt-6 pb-section-md md:pt-[5.9vw]">
        <Container className="grid items-start gap-12 md:grid-cols-[34.6vw_minmax(0,1fr)] md:gap-[6vw]">
          <div className="md:sticky md:top-8">
            <h1>{copy.heading}</h1>
            <div className="mt-8 space-y-4">
              <p>{copy.intro}</p>
              <p>{copy.callInstead}</p>
              <ContactButtons />
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

          <div>
            <Suspense fallback={<RequestForm />}>
              <RequestFormWithService searchParams={searchParams} />
            </Suspense>
          </div>
        </Container>
      </Section>
    </>
  );
}

/** Service cards link to /appointments?service=<slug>: preselect that button. */
async function RequestFormWithService({ searchParams }: Pick<PageProps<"/appointments">, "searchParams">) {
  const params = await searchParams;
  const slug = typeof params.service === "string" ? params.service : undefined;
  const initialProblem = PROBLEM_OPTIONS.find((p) => "serviceSlug" in p && p.serviceSlug === slug)?.label;
  return <RequestForm initialProblem={initialProblem} />;
}
