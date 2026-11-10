import { SiteFooter } from "@/components/site/site-footer";

/** Public website: each page renders its own themed header; the footer is shared. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </>
  );
}
