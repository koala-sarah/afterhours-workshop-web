# Operator alerts: setup

New requests reach the operators as a **Telegram** message, with an optional **email** backup (Resend). Requests are always saved first; with nothing configured, alerts are recorded as `SKIPPED` and the site keeps working.

All values below go in `.env.local` (local) and in the Vercel project settings (production). Never commit them or paste them into chat.

## 1. Telegram

1. In Telegram, open **@BotFather** → `/newbot` → choose a name and a username. Copy the **token** → `TELEGRAM_BOT_TOKEN`.
2. Create a group for the operators and add the bot to it. Send any message in the group (e.g. "hi").
3. Find the group's chat id: open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and look for `"chat":{"id":-100…` — that number (with the minus sign) → `TELEGRAM_CHAT_ID`.
   If the list is empty, send another message in the group and reload.
4. Restart the dev server. The next request appears in the group.

Each alert shows: rego (or "Not sure"), what they need, name, phone in `+64…` form (tap to call), email, preferred contact method and times, where it came from and when (NZ time), and a **Reply on WhatsApp** link. "Repeat customer" marks a phone number that has sent a request before. An unfinished chat (no progress for 30 minutes after name and phone) sends one "Unfinished chat" alert with the step reached.

## 2. Email backup (optional)

1. Create a free account at resend.com and an API key → `RESEND_API_KEY`.
2. `NOTIFY_EMAIL_TO` = where alerts go (comma-separated allowed). Testing: the address you signed up to Resend with. Production: `info@afterhoursworkshop.co.nz`.
3. Until the domain `afterhoursworkshop.co.nz` is verified in Resend, leave `NOTIFY_EMAIL_FROM` empty: the test sender `onboarding@resend.dev` is used, and **Resend only delivers it to your own Resend account address**. After verifying the domain, set e.g. `NOTIFY_EMAIL_FROM=Afterhours Workshop <alerts@afterhoursworkshop.co.nz>`.

## 3. Retries and unfinished-chat alerts (production)

Alerts are sent straight after a request is saved. Failed alerts are retried (5, 10, 20, 40 minutes; 5 attempts), and unfinished-chat alerts are sent, by a scheduled call from Supabase to the site:

1. Generate a secret: `openssl rand -hex 32` → `NOTIFY_DISPATCH_SECRET` in Vercel.
2. In the Supabase SQL editor (once, after the site is deployed):
   ```sql
   select vault.create_secret('https://<your-domain>/api/notifications/dispatch', 'notify_dispatch_url');
   select vault.create_secret('<the same secret>', 'notify_dispatch_secret');
   ```
3. Check: `select * from cron.job;` lists `inbox-maintenance` and `notification-dispatch`.

Locally you can trigger it by hand:
```bash
curl -X POST -H "Authorization: Bearer $NOTIFY_DISPATCH_SECRET" http://localhost:3000/api/notifications/dispatch
```

## Delivery record

Every attempt is stored in `notifications` (admins can read it): `SENT`, `FAILED` (with the error, retried), or `SKIPPED` (channel not configured). Server logs contain the request id and the error only, never customer details.
