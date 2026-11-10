import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const admin = await requireAdmin("/admin");

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-h3">Overview</h1>
      <p>
        Signed in as <strong>{admin.fullName ?? admin.email}</strong>.
      </p>
      <p className="text-muted-foreground">
        Appointment requests, customers, enquiries and follow-up tasks will appear here as they
        are built.
      </p>
    </div>
  );
}
