import { timingSafeEqual } from "node:crypto";

import { dispatchDueNotifications } from "@/lib/notifications/dispatch";

/**
 * Sends due operator alerts (retries and abandoned-chat alerts). Called every
 * 5 minutes by the database (pg_cron + pg_net, migration 1060) when something
 * is due. Protected by NOTIFY_DISPATCH_SECRET: `Authorization: Bearer <secret>`.
 */
export async function POST(request: Request) {
  const secret = process.env.NOTIFY_DISPATCH_SECRET;
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });

  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const counts = await dispatchDueNotifications(25);
  return Response.json(counts);
}
