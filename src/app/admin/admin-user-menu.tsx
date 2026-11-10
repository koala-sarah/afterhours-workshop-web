import { LogOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { getCurrentProfile } from "@/lib/auth/dal";

/** Signed-in admin + sign out. Reads the session, so it renders behind Suspense. */
export async function AdminUserMenu() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  return (
    <div className="space-y-3 border-t border-sidebar-border pt-4">
      <p className="text-body-sm break-words">
        <span className="block text-sidebar-foreground/70">Signed in as</span>
        {profile.fullName ?? profile.email}
      </p>
      <form action={signOut}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOutIcon aria-hidden />
          Sign out
        </Button>
      </form>
    </div>
  );
}
