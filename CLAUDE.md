# After Hours Workshop

Website, appointment request system, and admin dashboard for an automotive workshop in Auckland, NZ.
Full requirements: `docs/PROJECT_SPEC.md` (read only the sections you need for the current task).

## Stack
Next.js (App Router), TypeScript (strict), Tailwind, shadcn/ui, Supabase (Postgres, Auth, RLS), Zod, React Hook Form, Resend. Deploy to Vercel.

## Critical rules
- A booking request is NOT a confirmed appointment. Every new booking is `PENDING`. Only an admin can approve. Never show an unapproved booking as confirmed.
- Approval must check for conflicting approved bookings, record timestamp and admin, and log to activities.
- Never expose the Supabase service role key or any private key in client code. Privileged actions run server-side only.
- Protect data with RLS, not just hidden pages. Public users can only submit bookings and enquiries; they can never read internal records.
- Validate with Zod on both client and server.
- Email failure must never lose or reverse a booking. The app must work with no Resend credentials.
- Never invent business info (prices, hours, address, phone, claims). Make it configurable or ask.
- Phase 1 only: do NOT build or install anything for AI chatbot/voice, calendar sync, quotes/invoices, or job cards. No fake AI buttons.

## Conventions
- All DB changes go through version-controlled migrations in `supabase/migrations`.
- Keep a service/repository layer with clear boundaries: customers, appointments, enquiries, follow-ups, notifications, auth.
- Store timestamps in UTC; display in `Pacific/Auckland`.
- Reuse one customer profile per person (match on normalised email/phone).
- Handle loading and error states. Prefer simple, maintainable code over clever code.
- Never commit `.env*` files or secrets.
- Public site visuals must match docs/design-reference/ (existing Squarespace design). Define colors, fonts, spacing as Tailwind design tokens and reuse them.

## Workflow
Inspect, then Plan (wait for approval), then Build one numbered stage at a time (spec section 12). Run lint, typecheck, and tests before finishing a stage. Do not start the next stage until asked.