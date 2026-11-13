import "server-only";

import { ADMIN_READ_ONLY } from "@/config/admin";

/** First line of every admin server action that changes data. */
export function assertAdminWritable() {
  if (ADMIN_READ_ONLY) throw new Error("The admin area is read-only.");
}
