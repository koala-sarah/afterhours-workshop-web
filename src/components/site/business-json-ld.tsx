import { siteConfig } from "@/config/site";

/**
 * LocalBusiness (AutoRepair) structured data for Google (spec section 12).
 * Verified details only: name, address, phone, email, URL, weekday hours.
 * Weekend hours are left out until exact times are confirmed ("all day" isn't
 * a time); no ratings, coordinates or price range.
 */
export function BusinessJsonLd() {
  const { contact, url, name } = siteConfig;
  const data = {
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    "@id": `${url}/#business`,
    name,
    url,
    telephone: contact.phoneHref.replace(/^tel:/, ""),
    email: contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: contact.address.street,
      addressLocality: `${contact.address.suburb}, ${contact.address.city}`,
      postalCode: contact.address.postcode,
      addressCountry: "NZ",
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "17:00",
        closes: "22:00",
      },
    ],
    ...(contact.instagramUsername ? { sameAs: [`https://www.instagram.com/${contact.instagramUsername}`] } : {}),
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output, with "<" escaped so the data can't close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
