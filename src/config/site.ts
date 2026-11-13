/**
 * Business details shown on the public site.
 *
 * Every value here is copied from the existing website
 * (see docs/SITE_CONTENT.md). Do not add values that are not verified there.
 * Unverified information is `null` and is not rendered until the owner confirms it.
 */
export const siteConfig = {
  name: "Afterhours Workshop",
  tagline: "Your one & only, local, After-hours workshop.",
  locationTagline: "@ St Johns, Auckland",
  contact: {
    email: "info@afterhoursworkshop.co.nz",
    phoneDisplay: "(027) 770 - 0486",
    phoneHref: "tel:+64277700486",
    /** SMS and WhatsApp number confirmed by the owner (2026-11-11, docs/INTAKE_COPY.md). */
    sms: { display: "021 266 5208", href: "sms:+64212665208" },
    whatsapp: { display: "021 266 5208", href: "https://wa.me/64212665208" },
    /** Facebook page username for m.me/<username>. Not confirmed: the button is hidden. */
    messengerUsername: null as string | null,
    /** Instagram username for ig.me/m/<username>. Not confirmed: the button is hidden. */
    instagramUsername: null as string | null,
    address: {
      street: "80 Morrin Road",
      suburb: "St Johns",
      city: "Auckland",
      postcode: "1072",
    },
    /** Keyless Google Maps embed for the workshop address (the existing site's footer shows a map). */
    mapEmbedUrl:
      "https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s80+Morrin+Road,+St+Johns,+Auckland+1072!6i12",
  },
  hours: {
    weekdays: "5 PM to 10 PM",
    weekends: "All day",
    /** Not stated on the existing site. */
    weekendTimes: null,
    publicHolidays: null,
  },
  about: {
    /** "[Specialised areas]" placeholder on the existing site. */
    specialisedAreas: null as string | null,
    /** "[Mechanic's info]" placeholder on the existing site. */
    mechanicInfo: null as string | null,
  },
  nav: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Services", href: "/services" },
    { label: "Appointments", href: "/appointments" },
    { label: "Contact", href: "/contact" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
export type NavHref = (typeof siteConfig.nav)[number]["href"];
