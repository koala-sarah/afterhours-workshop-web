import Image from "next/image";
import Link from "next/link";

import type { Service } from "@/lib/services/catalog";

/**
 * Three-column service cards from the existing site: photo, underlined title,
 * price, description. Each title links to the booking page with the service preselected.
 */
export function ServiceGrid({ services }: { services: Service[] }) {
  return (
    <div className="grid gap-x-card-gap gap-y-12 md:grid-cols-3">
      {services.map((service) => (
        <article key={service.slug}>
          <div className="relative aspect-[1.035] overflow-hidden">
            <Image
              src={service.image.src}
              alt={service.image.alt}
              fill
              sizes="(min-width: 768px) 30vw, 100vw"
              className="object-cover"
            />
          </div>
          <h3 className="mt-[3.2rem] text-h4 text-section-subheading">
            <Link
              href={`/appointments?service=${service.slug}`}
              className="underline decoration-2 underline-offset-[5px] hover:opacity-70"
            >
              {service.name}
            </Link>
          </h3>
          <p className="mt-3">{service.priceLabel}</p>
          <div className="mt-4 space-y-4">
            {service.description.map((paragraph) => (
              <p key={paragraph} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
