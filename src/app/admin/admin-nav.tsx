"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClockIcon, InboxIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";

// Read-only backup list (spec section 6). Requests first: that is what the operator checks.
const items = [
  { href: "/admin", label: "Requests", icon: InboxIcon },
  { href: "/admin/appointments", label: "Appointments", icon: CalendarClockIcon },
  { href: "/admin/customers", label: "Customers", icon: UsersIcon },
] as const;

/** Nav links; `pathname` is null while the current URL isn't known yet (Suspense fallback). */
export function AdminNavList({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Admin">
      <ul className="flex gap-1 md:flex-col">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname !== null && (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-body-sm hover:bg-sidebar-accent",
                  active && "bg-sidebar-accent",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Reads the URL, so the layout renders it inside <Suspense> with AdminNavList as the fallback. */
export function AdminNav() {
  return <AdminNavList pathname={usePathname()} />;
}
