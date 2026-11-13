# After Hours Workshop — Project Spec

Read only the sections relevant to the current task. Core rules live in `CLAUDE.md`.

> **Direction (2026-11-12).** The website is an **intake desk**: a one-screen request form (main path) and a rule-based request chat that opens from any page (second path). Both save the request and ping the operator on Telegram straight away. Contact buttons everywhere and local-search optimisation. `/admin` is a read-only backup list. This replaces the earlier plans (booking approval dashboard; then chat intake + admin Inbox). Work already built is kept, not deleted; see section 13 for what each build stage became.

## 1. Overview

Rebuild and improve the website for **After Hours Workshop**, an automotive workshop in Auckland, New Zealand.

- Existing site: https://www.afterhoursworkshop.co.nz/
- Goal: customers who find the workshop on Google Search or Google Maps can, from their phone, either contact the operator in one tap or leave a short request, and the operator hears about it immediately.
- The operator is non-technical and works by phone, SMS, WhatsApp and email. They do not use an admin UI for data entry or management.
- Value proposition: **Professional automotive servicing and repairs with an after-hours approach, making it easier for people who cannot visit a mechanic during normal working hours.**
- Tone: trustworthy, modern, clean, automotive-focused. Avoid generic corporate templates.

**Scope:** public website, one-screen request form, rule-based request chat, Telegram notification (email backup optional), contact buttons, local SEO, read-only admin backup list. The data model keeps room for future channels (e.g. missed-call summaries) in the same request list (section 11).

## 2. Technology Stack

- Next.js (App Router), TypeScript (strict), Tailwind CSS, shadcn/ui where appropriate
- Hosting: Vercel (keep portable to other providers)
- Database and auth: Supabase PostgreSQL and Supabase Auth
- Validation: Zod. Forms: React Hook Form
- Bot protection: Cloudflare Turnstile (free)
- Notifications: Telegram Bot API (free) to the operators' group; Resend email as an optional backup
- No paid services. No LLM / AI APIs. No messaging-platform APIs.

## 3. Existing Website Analysis

1. Preserve business identity and important content. Preserve the existing website's visual design (layout, colors, fonts, imagery style, page structure). Reference screenshots are in docs/design-reference/. Do not redesign; improve usability and add the new features in the same visual style.
2. If information is missing or unverifiable, make it configurable or ask. Never invent prices, hours, addresses, phone numbers, social accounts or claims. Verified details are in `docs/SITE_CONTENT.md`.
3. Do not carry over outdated copy, e.g. "Online booking will be available in July 2025".

## 4. Customer-Facing Website

Responsive, mobile-first pages: **Home**, **Services**, **About**, **Contact** (details, map, and the request chat shown open on the page), and **Request** (`/appointments`, section 5). A "Chat with us" corner button on the other public pages opens the same chat (section 5). There is **one form** (`/appointments`) and **one chat**; no separate contact form, so visitors never have to choose between similar forms. The home page explains how it works: send a request (or call / message) → a mechanic checks and contacts you.

### Contact buttons

Shown in the header, the footer, a sticky bottom bar on mobile, and the request finish screen:

| Button | Link | Value (`src/config/site.ts`) |
|---|---|---|
| Call | `tel:` | (027) 770 - 0486 |
| SMS | `sms:` | 021 266 5208 |
| WhatsApp | `https://wa.me/…` | 021 266 5208 |
| Messenger | `https://m.me/…` | not confirmed → hidden |
| Instagram | `https://ig.me/m/…` | afterhours_workshop_nz |
| Email | `mailto:` | info@afterhoursworkshop.co.nz |

A button whose value is missing is hidden, never filled with a guess. These are plain links; no messaging API integration.

## 5. Request Form (`/appointments`)

One screen, as few fields as possible:

1. **Registration number** (required). An "I'm not sure" option is allowed instead.
2. **Problem / work wanted**: one button (list in config, owner-confirmed) plus an optional one-line note.
3. **Name and phone number** (required).
4. **Preferred contact method**: phone, SMS, WhatsApp or email. The email field appears, and is required, only when email is chosen.
5. Optional: **preferred times**: weekday evening / weekend / any time.

Not asked: make, model, year, preferred date (nullable in the database).

- Submitting saves the request first, then notifies (section 10).
- The finish screen says: "Your request has been received. A mechanic will check it and contact you directly." (owner-confirmed English wording) and shows the contact buttons. It never states a price, a diagnosis or a confirmed booking.
- A request is **not** a booking. Bookings are arranged by the operator directly with the customer.

### Abuse protection

- Cloudflare Turnstile, verified on the server.
- Per-client limits (HMAC of the IP; max 5 per 10 minutes and 20 per day).
- Honeypot field, server-side Zod validation.
- Requests from the same normalised phone number group onto the same open record; the same request resubmitted within 10 minutes is not saved twice.

### Request chat

A rule-based chat (fixed steps and buttons from config, no AI). It is shown open on the Contact page and opens from a "Chat with us" corner button on the other pages (a bottom sheet on mobile; hidden on `/appointments`, which has the form). "Chat with us" buttons in the About / Services "Contact us" sections open the same chat. It first offers quick answers built only from verified site data (what each service package includes, from the Services page descriptions; opening hours; address with a map link; phone / SMS / WhatsApp / email). Prices are not shown in the chat. Choosing "Send a request" (or "Request this service") asks the same things as the form, contact details early:

1. Problem / work wanted (buttons + optional one line)
2. Name and phone number
3. Registration number (or "I'm not sure")
4. Preferred contact method (email field only when email is chosen)
5. Preferred times (can be skipped)

- Every step is saved on the server (anonymous session in an httpOnly cookie; only its hash is stored).
- From step 2 the request exists even if the customer leaves. With no progress for 30 minutes it is marked abandoned, the step reached is recorded, and the operator gets one Telegram alert ("abandoned request").
- Every step has an "I'm not sure" or skip option; the contact buttons stay visible.
- Same finish message and rules as the form: never a price, diagnosis or confirmation.
- Sessions are deleted after 30 days.

### General questions

There is no separate contact form. A "Question / something else" problem button (form and chat) lets visitors ask anything; in the chat it asks for the question text.

## 6. Admin (`/admin`)

Protected by Supabase Auth and RLS. **Read-only backup list**; no new admin features.

- A chronological list of received requests (registration, problem, name, phone, preferred method and times, notification status).
- Existing admin pages (appointments, customers, vehicles) stay viewable; their write controls are hidden.
- The operator's day-to-day tool is Telegram, not `/admin`.

## 7. Database Design

Supabase Postgres, version-controlled migrations, UUID keys, UTC timestamps (displayed in `Pacific/Auckland`), RLS on every table. Details in `docs/DATABASE.md`.

- **Requests:** `inbox_items` (one record per person / phone with an open request) and `inbox_entries` (each submission; raw answers plus card fields: registration, problem, contact, preferred method and times). Future-channel fields are ready: `channel` (WEB, PHONE, WHATSAPP, SMS, EMAIL), `summary`, `source_phone`, `external_id`.
- **Customers / vehicles:** linked automatically (one profile per person; a vehicle can be just a registration number, so make and model are nullable).
- **private.intake_sessions:** anonymous chat progress (not exposed by the Data API); a scheduled job marks abandoned chats and deletes old sessions.
- **notifications:** delivery record per request and channel (TELEGRAM, EMAIL): SENT / FAILED / SKIPPED.
- **Kept, not used by the new flow:** enquiries (legacy, copied into requests), follow_up_tasks, appointments and their approval guard, the Inbox admin functions.

## 8. Security

- RLS on all tables. Visitors cannot read anything internal; they submit only through server-only (service-role) functions with throttling.
- Signed-in admins can read; `/admin` performs no writes.
- Secrets (Supabase secret key, Telegram token and chat id, Turnstile secret, Resend key) are server-only environment variables. `.env.example` lists names only.
- Server logs never contain customer personal details: log the request id and the error.

## 9. Design

- Public site: match the existing Squarespace design in docs/design-reference/; extend it consistently to the request form, contact buttons and sticky mobile bar.
- Mobile first: large tap targets, the form fits a phone screen, the sticky bar never covers form controls.
- Prioritise usability and speed over decorative animation.

## 10. Notifications

- After the request is saved, the server sends a **Telegram** message to the operators' group (bot token and chat id from server env), without making the customer wait (`after()`).
- Message: registration (or "not sure"), problem, name, phone in `+64…` format (tappable in Telegram), preferred method and times, and a `wa.me` reply link. A repeat request from the same phone is marked as such. An abandoned chat with contact details is sent once, marked "abandoned" with the step reached.
- Optional **email backup** (Resend) to the configured address, sent as well when configured.
- Every attempt is recorded (SENT / FAILED / SKIPPED). Failures are logged on the server and never affect the saved request. With neither channel configured, requests still work.
- No emails or messages to customers.

## 11. Future-Proofing (do NOT implement now)

Later, missed-call summaries and other channels may land in the same request list (fields are ready). Not now: AI chatbot (the request chat stays rule-based), AI voice, LLM integration, messaging-platform APIs, calendar sync, quotes and invoices, job cards, marketing messages.

## 12. Local Search (SEO)

- Each public page has its own `title` and meta description, written from verified content.
- `LocalBusiness` (`AutoRepair`) JSON-LD with verified data only: name, address, phone, email, URL, weekday hours 17:00–22:00. Weekend hours are omitted until exact times are confirmed; no invented ratings or coordinates.
- `sitemap.xml` and `robots.txt` (exclude `/admin`, `/login`, `/design-system`).
- Fast mobile loading: optimised images and fonts, lazy-loaded map, check with Lighthouse (mobile).
- Owner steps: verify the site in Google Search Console, submit the sitemap, and point the Google Business Profile website/booking link to the new site.

## 13. Workflow

1. **Inspect**, 2. **Plan** (wait for approval), 3. **Build** one stage at a time:
   1. Project setup and design system ✅
   2. Public website pages ✅
   3. Supabase database and migrations ✅
   4. Admin authentication and access control ✅
   5. Appointment request form ✅ (replaced by the request form in 12)
   6. Admin appointment management ✅ (kept, becomes read-only in 15)
   7. Customer and vehicle management ✅ (kept, becomes read-only in 15)
   8. Direction docs (chat intake) ✅ (superseded by 10)
   9. Inbox and intake database ✅ (request tables, chat session saving and the maintenance job are reused)
   10. Direction docs ✅: this spec, `CLAUDE.md`, `docs/INTAKE_COPY.md`, `.env.example`
   11. Database adjustment ✅: nullable vehicle make/model, new answer shape for form and chat, notification channel (TELEGRAM/EMAIL); RLS checks; types
   12. Request form ✅: UI, Zod, Turnstile, server action, finish screen, contact form
   13. Request chat ✅: flow config, chat UI (opens from every page), step saving, Turnstile
   14. Notifications: Telegram, optional email backup, abandoned-chat alerts, delivery record, server logs
   15. Contact buttons and local SEO
   16. Read-only admin: request list, write controls hidden
   17. Testing and deployment
4. **Test** these scenarios:
   - A request is saved and the Telegram message arrives with a working `wa.me` link
   - A wrong / missing Telegram token: the request is still saved and the failure is recorded
   - The same phone submits again: grouped, not duplicated; marked as a repeat
   - Chat: leaving after name and phone still creates the request; one "abandoned" alert after 30 minutes; finishing the chat sends one normal alert
   - Turnstile failure and rate limits block submissions
   - Email field appears only when email is chosen
   - The finish screen never shows a price, diagnosis or confirmation
   - Visitors cannot read any data; non-admins cannot open `/admin`
   - Hidden contact buttons when a value is missing
   - Mobile layout and Lighthouse mobile performance
5. **Deploy:** Vercel; environment variables (section 8, `.env.example`), Supabase migrations, Turnstile domains, Telegram group, Search Console. Never commit secrets or `.env` files.
