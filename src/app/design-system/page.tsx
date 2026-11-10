import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { Section, type SectionTheme } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Internal style guide used to compare tokens against docs/design-reference/.
// Not linked from the public site and excluded from search engines.
export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const palette = [
  { name: "steel", token: "bg-steel", hex: "#C2C8CC", note: "accent: bright sections" },
  { name: "butter", token: "bg-butter", hex: "#F9EEA5", note: "lightAccent: light sections" },
  { name: "olive", token: "bg-olive", hex: "#3D4435", note: "darkAccent: dark sections, headings on butter" },
  { name: "ink", token: "bg-ink", hex: "#000000", note: "black: text, buttons, footer" },
  { name: "paper", token: "bg-paper", hex: "#FFFFFF", note: "white: text on dark" },
] as const;

const themes: { theme: SectionTheme; usage: string }[] = [
  { theme: "bright", usage: "Home hero, Contact us" },
  { theme: "light", usage: "Our services, Who we are" },
  { theme: "dark", usage: "Appointments page" },
  { theme: "dark-bold", usage: "Home: Schedule today" },
  { theme: "black", usage: "Footer" },
];

function RequiredHint() {
  return <span className="font-normal text-section-muted">(required)</span>;
}

export default function DesignSystemPage() {
  return (
    <main className="flex-1">
      <Section theme="bright" padding="sm">
        <Container className="space-y-2">
          <p className="font-heading text-site-title uppercase">Afterhours Workshop</p>
          <h1>Design system</h1>
          <p className="text-body-lg">
            Tokens reproduced from the existing Squarespace site.
          </p>
        </Container>
      </Section>

      {/* Palette */}
      <Section theme="light" padding="sm">
        <Container className="space-y-6">
          <h2>Palette</h2>
          <div className="grid grid-cols-2 gap-card-gap md:grid-cols-5">
            {palette.map((c) => (
              <div key={c.name} className="space-y-2">
                <div className={`${c.token} aspect-square border border-ink/10`} />
                <p className="font-heading uppercase">{c.name}</p>
                <p className="text-body-sm">
                  {c.hex}
                  <br />
                  {c.note}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* Section themes, typography and buttons */}
      {themes.map(({ theme, usage }) => (
        <Section key={theme} theme={theme} padding="sm">
          <Container className="grid gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <p className="text-body-sm text-section-muted">
                data-section=&quot;{theme}&quot; · {usage}
              </p>
              <h2>Schedule today</h2>
              <h4 className="underline underline-offset-4">Basic service</h4>
              <p>From $99</p>
              <p className="text-body-lg">
                Open from 5 PM to 10 PM on weekdays and all day on weekends.
              </p>
              <p className="text-body-sm">Small body text (0.9rem)</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 md:justify-end">
              <Button variant="brand" size="brand">
                Learn more
              </Button>
              <Button variant="brand" size="brand" className="min-w-60">
                Book now
              </Button>
            </div>
          </Container>
        </Section>
      ))}

      {/* Heading scale */}
      <Section theme="light" padding="sm">
        <Container className="space-y-4">
          <h1>H1 Our services</h1>
          <h2>H2 Contact us</h2>
          <h3>H3 Who we are</h3>
          <h4>H4 Track-ready service</h4>
          <p>Body: Space Grotesk 600, 16px, line-height 1.5.</p>
        </Container>
      </Section>

      {/* Form fields (visual only; real forms arrive in later stages) */}
      <Section theme="bright" padding="md">
        <Container className="grid gap-10 md:grid-cols-2">
          <h2>Contact us</h2>
          <form className="space-y-field-gap" aria-label="Form style preview">
            <fieldset className="space-y-label-gap">
              <legend className="mb-label-gap text-body-sm">Name</legend>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-label-gap">
                  <Label htmlFor="ds-first">
                    First Name <RequiredHint />
                  </Label>
                  <Input id="ds-first" />
                </div>
                <div className="space-y-label-gap">
                  <Label htmlFor="ds-last">
                    Last Name <RequiredHint />
                  </Label>
                  <Input id="ds-last" />
                </div>
              </div>
            </fieldset>
            <div className="space-y-label-gap">
              <Label htmlFor="ds-email">
                Email <RequiredHint />
              </Label>
              <Input id="ds-email" type="email" />
            </div>
            <Label className="uppercase">
              <Checkbox /> Example checkbox
            </Label>
            <div className="space-y-label-gap">
              <Label htmlFor="ds-message">
                Message <RequiredHint />
              </Label>
              <Textarea id="ds-message" />
            </div>
            <Button type="button" variant="brand" size="brand">
              Submit
            </Button>
          </form>
        </Container>
      </Section>

      {/* Service card pattern */}
      <Section theme="light" padding="md">
        <Container className="space-y-8">
          <h2>Our services</h2>
          <div className="grid gap-card-gap md:grid-cols-3">
            {["Basic service", "Advanced service", "Track-ready service"].map((title) => (
              <article key={title} className="space-y-3">
                {/* Image slot: square corners, no shadow */}
                <div className="aspect-[4/3.9] bg-olive/30" aria-hidden />
                <h4 className="pt-5 underline underline-offset-4">{title}</h4>
                <p className="text-body-sm">Card description text.</p>
              </article>
            ))}
          </div>
        </Container>
      </Section>
    </main>
  );
}
