# After Hours Workshop

Website for an automotive workshop in Auckland, NZ. Its job is to be an **intake desk**: catch customers arriving from Google Search and Google Maps and connect them to the operator immediately. Requests come in through a one-screen form (`/appointments`) or a rule-based chat that opens from any page.
Full requirements: `docs/PROJECT_SPEC.md` (read only the sections you need for the current task).

The operator is non-technical and works by phone, SMS, WhatsApp and email. They will not use an admin UI for data entry or management. New requests reach them as a Telegram message.

## Stack
Next.js (App Router), TypeScript (strict), Tailwind, shadcn/ui, Supabase (Postgres, Auth, RLS), Zod, React Hook Form, Cloudflare Turnstile, Telegram Bot API (notifications), Resend (optional email backup). Deploy to Vercel.

## Critical rules
- The request form and the rule-based request chat collect a **request**, not a booking. Never show it as confirmed. The finish screen only says the request was received and a mechanic will check and contact them. Never state a price or a diagnosis.
- The chat saves every step on the server. Once name and phone are given, the request exists even if the customer leaves; an abandoned request with contact details notifies the operator once.
- Save the request in the database first; notify afterwards. Notification failure (Telegram or email) must never lose or block a request: log it on the server and record it. The app must work with no Telegram and no Resend credentials.
- Never expose the Supabase secret key, the Telegram bot token / chat id, the Turnstile secret or any private key in client code. Server-only values never get a `NEXT_PUBLIC_` prefix.
- Protect data with RLS, not just hidden pages. Visitors can only submit through server-only functions; they can never read internal records.
- Validate with Zod on both client and server. Turnstile is verified on the server.
- Never invent business info or customer-facing wording (prices, hours, phone numbers, social accounts, claims). Contact numbers and handles live in `src/config/site.ts`; a button whose value is not confirmed is hidden. Wording to confirm is listed in `docs/INTAKE_COPY.md`.
- `/admin` is a **read-only backup list**. Do not add admin features. Keep existing tables (enquiries, follow_up_tasks, appointments, …); do not drop them.
- The chat is rule-based (fixed steps and buttons from config). Do NOT build or install anything for AI chatbots, AI voice, LLMs, or external messaging APIs (Messenger / Instagram / WhatsApp / SMS integrations). Contact buttons are plain links (tel:, sms:, wa.me, m.me, ig.me, mailto:). No fake AI buttons.

## Conventions
- All DB changes go through version-controlled migrations in `supabase/migrations`. Never edit a migration that has been applied; add a new one.
- Keep a service/repository layer with clear boundaries: intake, notifications, customers, auth.
- Store timestamps in UTC; display in `Pacific/Auckland`.
- Reuse one customer profile per person (match on normalised email/phone). Group open requests by normalised phone.
- Mobile-first and fast on mobile (local search traffic). Every public page has its own title and meta description.
- Handle loading and error states. Prefer simple, maintainable code over clever code.
- Never commit `.env*` files or secrets.
- Public site visuals must match docs/design-reference/ (existing Squarespace design). Define colors, fonts, spacing as Tailwind design tokens and reuse them.

## Workflow
Inspect, then Plan (wait for approval), then Build one numbered stage at a time (spec section 13). Run lint, typecheck, and tests before finishing a stage. Do not start the next stage until asked.
