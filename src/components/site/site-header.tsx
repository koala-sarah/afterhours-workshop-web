import Link from "next/link";
import { cn } from "cn";

import { Container } from "@/components/layout/container";
import type { SectionTheme } from "@/components/layout/section";
import { siteConfig, type NavHref } from "@/config/site";

import { MobileNav } from "./mobile-nav";

type SiteHeaderProps = {
  /** Same theme as the page's first section: the header sits on that colour, as on the existing site. */
  theme: SectionTheme;
  active?: NavHref;
};

export function SiteHeader({ theme, active }: SiteHeaderProps) {
  return (
    <header data-section={theme} className="py-header-y">
      <Container className="flex items-center justify-between gap-6 py-3 md:py-0">
        <Link
          href="/"
          className="font-heading text-site-title leading-none uppercase"
        >
          {siteConfig.name}
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-[1.6vw]">
            {siteConfig.nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.href === active ? "page" : undefined}
                  className={cn(
                    "underline-offset-[6px] hover:underline",
                    item.href === active && "underline",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <MobileNav theme={theme} active={active} />
      </Container>
    </header>
  );
}
