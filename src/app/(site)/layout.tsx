import { BusinessJsonLd } from "@/components/site/business-json-ld";
import { ChatLauncher } from "@/components/site/chat-launcher";
import { MobileContactBar } from "@/components/site/mobile-contact-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { getChatServices } from "@/lib/services/catalog";

/** Public website: each page renders its own themed header; the footer is shared. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const services = await getChatServices();
  return (
    <>
      <BusinessJsonLd />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      {/* Space for the phone contact bar, so it never covers the footer or a form's last button. */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] bg-ink md:hidden" />
      <MobileContactBar />
      <ChatLauncher services={services} />
    </>
  );
}
