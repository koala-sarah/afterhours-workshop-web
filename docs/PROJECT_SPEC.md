# After Hours Workshop — Phase 1 Project Spec

Read only the sections relevant to the current task. Core rules live in `CLAUDE.md`.

> **Direction change (2026-11-11).** After Builds 1–7, the project moved from "booking form + full admin dashboard" to "**chat-style intake desk + admin Inbox**". The operator is non-technical, works by phone, WhatsApp, SMS and email, and will not use an admin UI that needs data entry or status management. Customers dislike long forms. Sections 1, 4–8, 10–12 reflect the new direction. Work already built (appointments, customers, vehicles) is kept as secondary tooling.

## 1. Overview

Rebuild and improve the website for **After Hours Workshop**, an automotive workshop in Auckland, New Zealand.

- Existing site: https://www.afterhoursworkshop.co.nz/
- Goal: a modern, professional workshop website that works as an **intake desk** (a short, step-based chat collects the customer's problem and contact details), and a protected admin **Inbox** where the operator sees each request as one card and replies by phone, WhatsApp, SMS or email in one tap.
- Value proposition: **Professional automotive servicing and repairs with an after-hours approach, making it easier for people who cannot visit a mechanic during normal working hours.**
- Tone: trustworthy, modern, clean, automotive-focused. Avoid generic corporate templates.

**Phase 1 scope:** website, rule-based chat intake, admin Inbox, booking approval, operator email notifications. The architecture must let WhatsApp, SMS and missed-call summaries land in the same Inbox later without rebuilding the core (see section 11).

## 2. Technology Stack

- Next.js (App Router), TypeScript (strict), Tailwind CSS, shadcn/ui where appropriate
- Hosting: Vercel (keep portable to other providers)
- Database and auth: Supabase PostgreSQL and Supabase Auth (scheduled jobs: Supabase `pg_cron`)
- Validation: Zod. Forms: React Hook Form
- Data access: Supabase client behind a clean service/repository layer
- Email: Resend (operator notifications only; must work without credentials)
- Bot protection: Cloudflare Turnstile (free)
- Use current stable, compatible versions. No paid services. No LLM or AI APIs.

## 3. Existing Website Analysis

Before coding:

1. Inspect the existing website: pages, content, navigation, images, services, branding, contact info, business details.
2. Preserve business identity and important content. Preserve the existing website's visual design (layout, colors, fonts, imagery style, page structure). Reference screenshots are in docs/design-reference/. Do not redesign. Only improve usability and add the new intake in the same visual style.
3. If information is missing or unverifiable, make it configurable or ask. Never invent prices, hours, addresses, phone numbers, or claims. Verified contact numbers are listed in `docs/SITE_CONTENT.md` section 3.

## 4. Customer-Facing Website

Responsive, mobile-first pages:

- **Home:** strong hero, explanation of the After Hours concept, main services, why choose us, how getting help works (tell us the problem → a mechanic checks and contacts you), call-to-action, contact info.
- **Services:** services from the existing site, each with a description and a link to the intake. Must be manageable from the database or admin settings in the future.
- **About:** workshop introduction, story, experience and expertise, motorsport/performance-car background where supported by existing content.
- **Contact:** contact details from the existing site, location and map, contact form (creates an Inbox item), link to the intake.
- **Get help / Book (`/appointments`):** the chat intake (section 5), the most important feature.

Call, WhatsApp and SMS buttons use the numbers in `src/config/site.ts`. A button whose number is not configured is hidden.

## 5. Request Intake

### 5.1 Chat intake (no account required)

A rule-based, step-based conversation. No free-form AI. At most six steps; contact details come early so an abandoned session still leaves a request.

1. **Symptom:** category buttons, or one line of free text. Keywords in the text pre-select a category, which the customer confirms.
2. **Contact:** name and phone (email optional; required if email is the preferred method in step 6). Shows the privacy note (answers are saved as you go).
3. **Vehicle:** make, year, model; registration optional.
4. **Symptom details:** buttons that depend on the category. Danger symptoms show the configured safety guidance.
5. **Drivable?** Yes / No / Not sure.
6. **How to reach you:** preferred method (phone, WhatsApp, SMS, email) and available time windows.

Rules:
- Every step has an **"I'm not sure"** option. The customer can go back.
- Call / WhatsApp / SMS buttons are always visible (sticky on mobile).
- The chat **never** states a price, a diagnosis or a booking confirmation. The finish screen only says a mechanic will check and contact them.
- The question flow, options, keywords, per-symptom guidance, danger warnings, time windows and prefilled WhatsApp text live in a config file (`src/config/intake-flow.ts`, validated with Zod), not in component code. Each saved request stores the flow version it was answered with.
- All customer-facing wording stays empty or placeholder until the owner confirms it. The list to fill is `docs/INTAKE_COPY.md`. Steps or warnings without confirmed text are hidden, not invented; a check fails the build if a required safety text is missing while its option is enabled.

### 5.2 Progress saving and abandonment

- Starting the chat creates an anonymous server-side session (httpOnly cookie token; only its hash is stored).
- Every step is saved on the server.
- As soon as contact details are given, an Inbox item exists, even if the customer never finishes.
- A session with no activity for **30 minutes** counts as abandoned; the Inbox card shows the step where the customer stopped.
- Sessions that never reached contact details are deleted after **30 days**.

### 5.3 Secondary form

The original booking form stays as a secondary option ("Prefer a form?") for accessibility and as a fallback. It asks the same questions as the chat (no date/time picking) and creates the same kind of Inbox item.

### 5.4 Abuse protection

- Cloudflare Turnstile on intake start, the secondary form and the contact form, verified server-side.
- Per-IP limits (existing fingerprint throttle), server-side Zod validation, honeypot.
- Repeat requests from the same normalised phone number attach to the existing open Inbox item instead of creating a new one.

### 5.5 What a request is not

A request is **not** a confirmed appointment. Only an administrator can create and approve a booking (section 6). Never display an unapproved appointment as confirmed.

## 6. Admin (`/admin`)

Protected area. Supabase Auth plus role-based access control. Do not rely on hiding pages: enforce access with RLS. Two admin accounts. Mobile-first.

### 6.1 Inbox (the admin home page)

- All requests in one chronological list, newest activity first.
- Statuses: **NEW** (nobody has contacted them), **NEEDS_REPLY** (contacted or waiting on them), **DONE**.
- One summary card per request: vehicle, symptom, drivable, contact, preferred method and time windows, abandoned step (if any), channel, link to the customer's earlier requests.
- One-tap buttons: call (`tel:`), WhatsApp (`wa.me` with prefilled text), SMS (`sms:`), email, **Approve booking**.
- Tapping a contact button moves NEW → NEEDS_REPLY and logs it. "Done" is one tap. Approving a booking marks the card DONE.
- Same-phone requests group onto one open card; a new entry brings it back to NEW and to the top.

### 6.2 Approve booking

From an Inbox card: choose date, time and duration, then approve. In one transaction this creates the appointment, links customer/vehicle, approves it, marks the card DONE and logs the activity.

**On approval:**
1. Check for conflicting approved appointments (existing database guard).
2. Save approval timestamp and admin identity.
3. Record the action in activity history.

The operator tells the customer personally (phone/WhatsApp/SMS). The approval sheet offers a prefilled WhatsApp message (owner-confirmed text only).

### 6.3 Secondary tools (kept from Builds 6–7, out of the main navigation)

- **Bookings:** approved/upcoming appointments; cancel or mark complete. The older decline/propose-time flow stays in code but is not part of the Inbox workflow.
- **Customers and vehicles:** read-mostly profiles reached from Inbox cards; edit details, add vehicles, link a booking to the right vehicle. One profile per customer (normalised email/phone).

### 6.4 Replaced features

- **Enquiries** (old Build 8) are replaced by the Inbox. The `enquiries` table is kept read-only as legacy data; existing rows are copied into the Inbox with their original id.
- **Follow-up tasks** (old Build 9) are replaced by the NEEDS_REPLY status. The `follow_up_tasks` table is kept, gains an optional link to an Inbox item for future reminders, and has no UI in Phase 1. The automatic "enquiry → follow-up task" trigger is disabled because enquiries are no longer created.

No automatic marketing messages.

## 7. Database Design

Relational PostgreSQL in Supabase. UUID primary keys. Version-controlled migrations. Foreign keys, indexes, constraints and timestamps. Store timestamps in UTC and display in `Pacific/Auckland`. Prevent duplicate customers where reasonably possible. Do not store unnecessary personal information. Details of what exists live in `docs/DATABASE.md`.

Existing (Builds 3–7): profiles, customers, vehicles, services, enquiries (legacy), appointments, follow_up_tasks (dormant), activities, business_hours, business_settings.

New (Build 9):

- **Enums:** `inbox_channel` (WEB, PHONE, WHATSAPP, SMS, EMAIL), `inbox_status` (NEW, NEEDS_REPLY, DONE), `contact_method` (PHONE, WHATSAPP, SMS, EMAIL).
- **inbox_items** (one card): customer_id (nullable, so future unknown callers fit), contact name/phone/phone_normalized/email snapshot, preferred_method, preferred_times, status, status_changed_at/by, last_entry_at, appointment_id, timestamps.
- **inbox_entries** (each submission, message or call on a card): item_id, channel, kind (INTAKE, FORM, CONTACT_FORM, MESSAGE, CALL), summary, source_phone, external_id (unique per channel), answers (jsonb), flow_version, symptom_category, drivable, vehicle snapshot + vehicle_id, last_step, completed_at, legacy_enquiry_id.
- **intake_sessions:** token_hash, fingerprint, current_step, answers, entry_id, turnstile_verified_at, expires_at. No direct access for anyone but server functions.
- **notifications:** kind, item, recipient, status (PENDING, SENT, FAILED, SKIPPED), attempts, last_error, sent_at.
- **Changes:** `appointments.service_id` becomes optional and gains `inbox_item_id`; `activities.related_type` gains `INBOX_ITEM`; `follow_up_tasks` gains optional `inbox_item_id`.

## 8. Security

- Supabase RLS on all tables; admin-only access to internal records.
- Public visitors can only **submit** through server-only (service-role) functions with throttling. Anonymous users have no table access. They must never read customer records, admin notes or other requests.
- Inbox tables: admins read; changes only through admin functions; no direct insert/delete.
- Turnstile verification server-side; the secret key never reaches the client.
- Server-side Zod validation on all inputs; safe error handling.
- Data retention: intake sessions without contact details are deleted after 30 days.

## 9. Design

Works well on desktop, tablet, and mobile; intake and Inbox are designed for phones first.

- Public site: match the existing Squarespace design shown in docs/design-reference/. Keep the same look and feel, then extend it consistently to new pages (chat intake, etc.).
- Admin: Inbox cards with large tap targets; secondary pages keep the sidebar, tables, filters, status badges and detail pages already built.
- Prioritise usability over decorative animation.

## 10. Notifications (Resend)

- **One event:** a new request → email to the operator address(es) in `ADMIN_NOTIFY_EMAILS` (currently `info@afterhoursworkshop.co.nz`).
- Completed intake: notify immediately. Abandoned with contact details: notify once, when it is marked abandoned. At most one notification per new request.
- Queue the notification after the request is saved; send after the response (`after()`); retry failures from a scheduled job.
- Notification failure never loses or blocks a request. With no Resend credentials, notifications are recorded as SKIPPED and the app works normally.
- No customer emails in Phase 1 (approved/declined/rescheduled emails are dropped). The operator contacts customers directly.
- Sending from the workshop domain needs Resend domain verification (DNS).

## 11. Future-Proofing (do NOT implement in Phase 1)

Planned later: WhatsApp and SMS messages, and AI summaries of missed calls, landing in the same Inbox (fields `channel`, `summary`, `source_phone`, `external_id` are ready); AI voice receptionist; automated blog generation; Google Calendar sync; advanced CRM; job cards; quotes and invoices; maintenance reminders; inspection reports.

Rule-based chat intake is allowed. Do not install LLM/AI SDKs, configure voice providers, or add fake or placeholder AI buttons. Keep clear module boundaries for: intake, inbox, customers, appointments, notifications, authentication.

## 12. Workflow

1. **Inspect:** repository and existing website; identify reusable code, assets, content.
2. **Plan:** propose architecture, DB schema, environment variables, implementation phases, and trade-offs. Wait for approval before major decisions.
3. **Build** in this order:
   1. Project setup and design system ✅
   2. Public website pages ✅
   3. Supabase database and migrations ✅
   4. Admin authentication and access control ✅
   5. Appointment request form ✅ (becomes the secondary form in Build 10)
   6. Admin appointment management ✅
   7. Customer and vehicle management ✅
   8. Direction-change docs: this spec, `CLAUDE.md`, `docs/INTAKE_COPY.md`
   9. Inbox and intake database: migrations (inbox tables, intake functions, admin Inbox functions, notification queue, scheduled jobs), RLS, security checks, regenerated types
   10. Chat intake: flow config, chat UI, step saving, Turnstile, contact buttons, secondary form, contact form → Inbox
   11. Admin Inbox: Inbox home, cards, one-tap buttons, statuses, approve-booking sheet, navigation rework
   12. Operator email notifications: Resend, notification queue, retry and abandonment jobs
   13. Testing and deployment
4. **Test** these scenarios:
   - New customer completes the chat; an Inbox card appears and the operator is emailed
   - Customer leaves after giving contact details; the card appears with the abandoned step
   - Same phone submits again; it groups onto the open card and the customer record is reused
   - The chat never shows a price, diagnosis or confirmation
   - Admin can log in, contact from a card (status moves to NEEDS_REPLY) and mark it done
   - Admin can approve a booking from a card; conflicting bookings are refused
   - A visitor cannot read any request or customer data; a non-admin cannot reach the admin area
   - Turnstile failure and rate limits block submissions
   - Notification failure (or no Resend key) does not affect saving
   - Intake and Inbox work on a phone
5. **Deploy:** prepare for Vercel and provide: required environment variables (including Turnstile keys and `ADMIN_NOTIFY_EMAILS`), Supabase setup, migration instructions, admin account setup, Vercel deployment steps, README. Never commit secrets or `.env` files.
