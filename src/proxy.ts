import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only the admin area and the login page use sessions. The public website
// stays static and never waits on an auth check.
export const config = {
  matcher: ["/admin/:path*", "/login"],
};
