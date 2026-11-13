"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MenuIcon, XIcon } from "lucide-react";

import { Container } from "@/components/layout/container";
import { ContactButtons } from "@/components/site/contact-buttons";
import type { SectionTheme } from "@/components/layout/section";
import { siteConfig, type NavHref } from "@/config/site";

/** Full-screen menu for small screens (the existing site uses an "Open Menu / Close Menu" overlay). */
export function MobileNav({ theme, active }: { theme: SectionTheme; active?: NavHref }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
        className="-mr-2 p-2"
      >
        <MenuIcon aria-hidden className="size-7" />
        <span className="sr-only">Open Menu</span>
      </button>

      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          data-section={theme}
          className="fixed inset-0 z-50 flex flex-col"
        >
          <Container className="flex items-center justify-between py-header-y">
            <span className="py-3 font-heading text-site-title leading-none uppercase">
              {siteConfig.name}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="-mr-2 p-2">
              <XIcon aria-hidden className="size-7" />
              <span className="sr-only">Close Menu</span>
            </button>
          </Container>
          <nav aria-label="Main" className="flex flex-1 items-center justify-center">
            <ul className="space-y-6 text-center text-h4">
              {siteConfig.nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={item.href === active ? "page" : undefined}
                    className={item.href === active ? "underline underline-offset-8" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Container className="pb-[max(2rem,env(safe-area-inset-bottom))]">
            <ContactButtons className="justify-center" />
          </Container>
        </div>
      )}
    </div>
  );
}
