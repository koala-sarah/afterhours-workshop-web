/**
 * Business details shown on the public site.
 *
 * Every value here is copied from the existing website
 * (see docs/SITE_CONTENT.md). Do not add values that are not verified there.
 * Missing information (e.g. exact weekend hours) is intentionally left out.
 */
export const siteConfig = {
  name: "Afterhours Workshop",
  tagline: "Your one & only, local, After-hours workshop.",
  locationTagline: "@ St Johns, Auckland",
  contact: {
    email: "info@afterhoursworkshop.co.nz",
    phoneDisplay: "(027) 770 - 0486",
    phoneHref: "tel:+64277700486",
    address: {
      street: "80 Morrin Road",
      suburb: "St Johns",
      city: "Auckland",
      postcode: "1072",
    },
  },
  hours: {
    weekdays: "5 PM to 10 PM",
    weekends: "All day",
  },
  nav: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Services", href: "/services" },
    { label: "Appointments", href: "/appointments" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
