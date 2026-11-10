import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:underline">
      <ArrowLeftIcon aria-hidden className="size-4" /> {children}
    </Link>
  );
}
