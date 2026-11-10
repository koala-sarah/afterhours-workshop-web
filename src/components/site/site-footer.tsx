import { Container } from "@/components/layout/container";
import { siteConfig } from "@/config/site";

/** Black footer used on every page of the existing site: title, map, location, contact. */
export function SiteFooter() {
  const { contact } = siteConfig;
  const { address } = contact;

  return (
    <footer data-section="black" className="py-section-sm text-center">
      <Container className="space-y-8">
        <p className="font-heading text-h2 uppercase">{siteConfig.name}</p>
        <div className="grid items-center gap-10 md:grid-cols-3 md:items-start md:px-[3.9vw]">
          <div className="mx-auto aspect-[1.45] w-full max-w-[385px] overflow-hidden bg-paper/10 md:mx-0">
            <iframe
              title={`Map showing ${address.street}, ${address.suburb}`}
              src={contact.mapEmbedUrl}
              className="size-full border-0 grayscale"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="space-y-4 md:pt-[3.4vw]">
            <h2 className="font-body text-body-sm font-semibold">LOCATION</h2>
            <address className="text-body-lg not-italic">
              {address.street}
              <br />
              {address.suburb}
              <br />
              {address.city} {address.postcode}
            </address>
          </div>
          <div className="space-y-4 md:pt-[3.4vw]">
            <h2 className="font-body text-body-sm font-semibold">CONTACT</h2>
            <p className="text-body-lg">
              <a href={`mailto:${contact.email}`} className="[overflow-wrap:anywhere] hover:underline">
                {contact.email}
              </a>
              <br />
              <a href={contact.phoneHref} className="hover:underline">
                {contact.phoneDisplay}
              </a>
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
