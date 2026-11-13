import { ChatLauncher } from "@/components/site/chat-launcher";
import { SiteFooter } from "@/components/site/site-footer";
import { getChatServices } from "@/lib/services/catalog";

/** Public website: each page renders its own themed header; the footer is shared. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const services = await getChatServices();
  return (
    <>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      <ChatLauncher services={services} />
    </>
  );
}
