import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentProfile, safeAdminPath } from "@/lib/auth/dal";
import { siteConfig } from "@/config/site";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

const NOTICES: Record<string, string> = {
  not_admin: "This account doesn’t have access to the admin area.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main data-section="bright" className="flex flex-1 items-center justify-center px-gutter-mobile py-section-md">
      <div className="w-full max-w-[26rem] space-y-8">
        <div className="space-y-3">
          <Link href="/" className="font-heading text-site-title uppercase">
            {siteConfig.name}
          </Link>
          <h1 className="text-h3">Admin sign in</h1>
        </div>
        <Suspense fallback={<LoginForm disabled />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeAdminPath(params.next) : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  // Already signed in as an admin: go straight to the dashboard.
  const profile = await getCurrentProfile();
  if (profile?.role === "ADMIN") {
    redirect(next ?? "/admin");
  }

  const notice = error ? NOTICES[error] : undefined;
  const signedOut = params.signed_out === "1";

  return (
    <>
      {signedOut && !notice && <p aria-live="polite">You have been signed out.</p>}
      <LoginForm next={next} notice={notice} />
    </>
  );
}
