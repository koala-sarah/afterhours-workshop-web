# After Hours Workshop

Website, chat-style request intake and admin Inbox for an automotive workshop in Auckland, NZ.
Full requirements: `docs/PROJECT_SPEC.md` (read only the sections you need for the current task).

The operator is non-technical and works by phone, WhatsApp, SMS and email. The website is an intake desk: it collects a request and hands it to a mechanic. The admin area is an Inbox to reply from, not a data-entry tool.

## Stack
Next.js (App Router), TypeScript (strict), Tailwind, shadcn/ui, Supabase (Postgres, Auth, RLS), Zod, React Hook Form, Resend, Cloudflare Turnstile. Deploy to Vercel.

## Critical rules
- A request is NOT a confirmed appointment. Only an admin can approve a booking (the "Approve booking" action in the Inbox). Never show an unapproved booking as confirmed.
- The intake chat never states a price, a diagnosis or a booking confirmation. It only says a mechanic will check and contact the customer.
- Approval must check for conflicting approved bookings, record timestamp and admin, and log to activities.
- Save intake progress on the server at every step. Once contact details are given, the request must reach the Inbox even if the customer leaves; record the step they stopped at.
- Never expose the Supabase secret/service role key, the Turnstile secret or any private key in client code. Privileged actions run server-side only.
- Protect data with RLS, not just hidden pages. Public users can only submit requests (through server-only functions); they can never read internal records.
- Validate with Zod on both client and server.
- Notification failure must never lose or block a request. The app must work with no Resend credentials.
- Never invent business info or customer-facing wording (prices, hours, phone numbers, symptom categories, safety warnings, claims). Intake questions and guidance live in config; leave text empty/placeholder until the owner confirms it (`docs/INTAKE_COPY.md`).
- Rule-based chat intake is allowed. Do NOT build or install anything for LLMs/AI APIs, AI voice, calendar sync, quotes/invoices or job cards. No fake AI buttons.

## Conventions
- All DB changes go through version-controlled migrations in `supabase/migrations`.
- Keep a service/repository layer with clear boundaries: intake, inbox, customers, appointments, notifications, auth.
- Store timestamps in UTC; display in `Pacific/Auckland`.
- Reuse one customer profile per person (match on normalised email/phone). Group open Inbox items by normalised phone.
- Mobile-first for both the intake chat and the Inbox. Call / WhatsApp / SMS buttons always visible on intake screens.
- Handle loading and error states. Prefer simple, maintainable code over clever code.
- Never commit `.env*` files or secrets.
- Public site visuals must match docs/design-reference/ (existing Squarespace design). Define colors, fonts, spacing as Tailwind design tokens and reuse them.

## Workflow
Inspect, then Plan (wait for approval), then Build one numbered stage at a time (spec section 12). Run lint, typecheck, and tests before finishing a stage. Do not start the next stage until asked.
