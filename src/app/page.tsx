import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { siteConfig } from "@/config/site";

// Temporary placeholder. The real Home page is built in Stage 2 (public website pages).
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <Section theme="bright" padding="lg" className="flex-1">
        <Container className="space-y-6">
          <h1>{siteConfig.tagline}</h1>
          <p className="font-heading text-h4 uppercase">{siteConfig.locationTagline}</p>
        </Container>
      </Section>
    </main>
  );
}
