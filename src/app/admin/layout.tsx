import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";

import { siteConfig } from "@/config/site";

import { AdminNav, AdminNavList } from "./admin-nav";
import { AdminUserMenu } from "./admin-user-menu";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s | Admin | ${siteConfig.name}` },
  robots: { index: false, follow: false },
};

/**
 * Admin shell. The layout itself reads no session data, so it renders instantly;
 * everything that depends on the signed-in user streams in behind Suspense.
 * Access is enforced by requireAdmin() in each page/action and by RLS, not here:
 * layouts are not re-rendered on every navigation.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-6 bg-sidebar px-5 py-5 text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-64 md:shrink-0 md:py-8">
        <div className="flex items-center justify-between gap-4 md:block">
          <Link href="/admin" className="font-heading text-base leading-tight uppercase">
            {siteConfig.name}
            <span className="block font-body text-body-sm font-semibold normal-case text-sidebar-primary">
              Admin
            </span>
          </Link>
        </div>
        <Suspense fallback={<AdminNavList pathname={null} />}>
          <AdminNav />
        </Suspense>
        <div className="mt-auto">
          <Suspense fallback={<div className="h-16" aria-hidden />}>
            <AdminUserMenu />
          </Suspense>
        </div>
      </aside>

      <main className="flex-1 bg-background px-5 py-8 md:px-10">
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}
