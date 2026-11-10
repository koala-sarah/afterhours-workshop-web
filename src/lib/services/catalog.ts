/**
 * Service packages shown on the public site.
 *
 * Text and prices are copied from the existing website (docs/SITE_CONTENT.md).
 * This is the single read path for services: in Stage 3 `getServices()` will
 * read the `services` table instead, without changing the pages that call it.
 */
export type Service = {
  slug: string;
  name: string;
  /** Price exactly as shown on the existing site (no GST/currency notes there). */
  priceLabel: string;
  /** Paragraphs of description text. */
  description: string[];
  image: { src: string; alt: string };
};

const services: Service[] = [
  {
    slug: "basic",
    name: "Basic Service",
    priceLabel: "From $99",
    description: [
      "Basic check-ups of your car.\nIncluding Engine oil + filter replacement.",
    ],
    image: {
      src: "/images/unsplash-image-iFQpqbLMOFU.webp",
      alt: "Mechanic checking under the bonnet of an SUV in a workshop",
    },
  },
  {
    slug: "advanced",
    name: "Advanced Service",
    priceLabel: "From $149",
    description: [
      "So-called ‘Full services’. Overall inspections of car and additional services.",
    ],
    image: {
      src: "/images/unsplash-image-UZUzvJEvKnI.webp",
      alt: "Mechanic in gloves working on a car engine",
    },
  },
  {
    slug: "track-ready",
    name: "Track-ready Service",
    priceLabel: "$199",
    description: [
      // Typo on the existing site ("enthausiasts") corrected.
      "Our best service package for car enthusiasts’ track-ready service.",
      "Brake pad replacement, brake bleeding, spanner check for all key areas!",
    ],
    image: {
      src: "/images/unsplash-image-3AvQJActhbw.webp",
      alt: "Race car in the pit lane in front of track garages",
    },
  },
];

export async function getServices(): Promise<Service[]> {
  return services;
}
