# After Hours Workshop — Phase 1 Project Spec

Read only the sections relevant to the current task. Core rules live in `CLAUDE.md`.

## 1. Overview

Rebuild and improve the website for **After Hours Workshop**, an automotive workshop in Auckland, New Zealand.

- Existing site: https://www.afterhoursworkshop.co.nz/
- Goal: a modern, professional workshop website, a working appointment request system, and a protected internal Admin Dashboard.
- Value proposition: **Professional automotive servicing and repairs with an after-hours approach, making it easier for people who cannot visit a mechanic during normal working hours.**
- Tone: trustworthy, modern, clean, automotive-focused. Avoid generic corporate templates.

**Phase 1 scope:** website, customer management, appointment workflow, admin tools. The architecture must allow future features to be added without rebuilding the core (see section 11).

## 2. Technology Stack

- Next.js (App Router), TypeScript (strict), Tailwind CSS, shadcn/ui where appropriate
- Hosting: Vercel (keep portable to other providers)
- Database and auth: Supabase PostgreSQL and Supabase Auth
- Validation: Zod. Forms: React Hook Form
- Data access: Supabase client behind a clean service/repository layer
- Email: Resend (prepare the integration; must work without credentials)
- Use current stable, compatible versions. No unnecessary paid services.

## 3. Existing Website Analysis

Before coding:

1. Inspect the existing website: pages, content, navigation, images, services, branding, contact info, business details.
2. Preserve business identity and important content. Improve design and usability without removing important information.
3. If information is missing or unverifiable, make it configurable or ask. Never invent prices, hours, addresses, phone numbers, or claims.

## 4. Customer-Facing Website

Responsive pages:

- **Home:** strong hero, explanation of the After Hours concept, main services, why choose us, how booking works, call-to-action, contact info.
- **Services:** services from the existing site, each with a description and a link to the booking form. Must be manageable from the database or admin settings in the future.
- **About:** workshop introduction, story, experience and expertise, motorsport/performance-car background where supported by existing content.
- **Contact:** contact details from the existing site, location and map, contact form (creates an enquiry), link to booking.
- **Book an Appointment:** the most important feature (section 5).

## 5. Appointment Request System

### Booking form (no account required)

- **Customer:** full name, email, phone
- **Vehicle:** make, model, year, registration number, additional info (optional)
- **Service:** service category, description of problem/work, preferred date, preferred time, alternative date/time (optional), additional notes

Validate all required fields with clear messages. Prevent duplicate submissions.

### Statuses

`PENDING` (initial for every new booking), `APPROVED`, `DECLINED`, `RESCHEDULE_REQUESTED`, `CANCELLED`, `COMPLETED`

### Critical rule

A booking submission is **not** a confirmed appointment. Show this message after submission:

> "Your appointment request has been received. We will contact you to confirm your appointment."

Only an administrator can approve. Never display an unapproved appointment as confirmed.

### Availability

- Admins configure available business days, hours, and weekend availability.
- Block past dates.
- Block obvious duplicate requests.
- Check existing approved bookings before accepting a requested time.
- Availability is provisional until admin approval. Never auto-confirm based on calendar availability.

## 6. Admin Dashboard (`/admin`)

Protected area. Supabase Auth plus role-based access control. Do not rely on hiding pages: enforce access with RLS.

### Overview
Cards and tables for: new enquiries, pending requests, approved appointments, upcoming appointments, follow-ups due (overdue shown prominently), recently added customers.

### Appointment management
- View all requests; filter by status; search by name, phone, email, or registration
- View details and history; add internal notes
- Approve, decline, suggest a different date/time, change status

**On approval:**
1. Check for conflicting approved appointments.
2. Update status.
3. Save approval timestamp and admin identity.
4. Prepare the customer confirmation email.
5. Record the action in activity history.

Approval must work even if email is not configured.

### Customer management
- View, search, and edit customers; view profile, vehicles, appointment history, communication and activity history; add internal notes
- One profile per customer even with multiple requests. Avoid duplicates from repeated enquiries (match on normalised email and/or phone).

### Vehicle management
Customers may own multiple vehicles. Admins can add and edit vehicles, view all vehicles for a customer, and link appointments to the correct vehicle.

### Enquiries
Store website enquiries. Admins can view, update status, assign a follow-up date, add internal notes, and convert an enquiry into an appointment request.

### Follow-up tasks
Fields: customer, related enquiry or appointment, title, description, due date, priority, status, created date, completed date.

Statuses: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`

Admins can: create tasks manually, set due dates, mark complete, filter overdue, view due today, view upcoming.

Automation rules (keep simple and reliable):
1. New enquiry creates a follow-up reminder for the admin.
2. After a quote or appointment-related response, admin can schedule a follow-up.
3. Overdue follow-ups appear prominently on the dashboard.

No automatic marketing messages.

## 7. Database Design

Relational PostgreSQL in Supabase. UUID primary keys. Version-controlled migrations and SQL schema files. Appropriate foreign keys, indexes, constraints, and timestamps. Store timestamps consistently (UTC) and display in `Pacific/Auckland`. Prevent duplicate customers where reasonably possible. Do not store unnecessary personal information.

Suggested tables:

- **profiles:** id, email, full_name, role, created_at, updated_at
- **customers:** id, full_name, email, phone, notes, created_at, updated_at
- **vehicles:** id, customer_id, make, model, year, registration_number, additional_information, created_at, updated_at
- **services:** id, name, description, is_active, created_at, updated_at
- **enquiries:** id, customer_id, subject, message, source, status, created_at, updated_at
- **appointments:** id, customer_id, vehicle_id, service_id, preferred_date, preferred_time, alternative_date, alternative_time, description, status, admin_notes, approved_at, created_at, updated_at (plus approving admin)
- **follow_up_tasks:** id, customer_id, enquiry_id, appointment_id, title, description, due_at, priority, status, completed_at, created_at, updated_at
- **activities:** id, customer_id, related_type, related_id, activity_type, description, created_by, created_at

## 8. Security

- Supabase RLS on all tables; admin-only access to internal records
- Server-side validation and Zod on all forms
- Privileged actions only on the server; no service role key or private keys in client code
- Protection against unauthorised booking modification
- Rate limiting or abuse protection on public forms
- Input sanitisation where appropriate; safe error handling
- Public visitors can only **submit** appointment requests and enquiries. They must never read customer records, admin notes, or other customers' bookings.

## 9. Design

Works well on desktop, tablet, and mobile.

- Public site: modern automotive workshop, clean typography, strong hierarchy, high-quality imagery, clear navigation, strong booking CTA, professional but approachable.
- Admin: sidebar navigation, overview cards, data tables, search and filters, status badges, detail pages, responsive layouts.
- Prioritise usability over decorative animation.

## 10. Email (Resend)

Events:
1. New appointment request: notify admin
2. Appointment approved: notify customer
3. Appointment declined: notify customer
4. Reschedule proposed: notify customer

Rules:
- Configurable templates
- Send only after the DB transaction succeeds
- Email failure must never lose or reverse the booking
- Record delivery status where practical
- System must fully function with no email credentials

## 11. Future-Proofing (do NOT implement in Phase 1)

Planned later: AI chatbot, AI voice receptionist, phone call handling, automated blog generation, Google Calendar sync, advanced CRM, job cards, quotes and invoices, maintenance reminders, inspection reports.

Do not install AI SDKs, configure voice providers, or add fake or placeholder AI buttons. Keep clear module boundaries for: customers, appointments, enquiries, follow-ups, notifications, authentication.

## 12. Workflow

1. **Inspect:** repository and existing website; identify reusable code, assets, content.
2. **Plan:** propose architecture, DB schema, environment variables, implementation phases, and trade-offs. Wait for approval before major decisions.
3. **Build** in this order:
   1. Project setup and design system
   2. Public website pages
   3. Supabase database and migrations
   4. Admin authentication and access control
   5. Appointment request form
   6. Admin appointment management
   7. Customer and vehicle management
   8. Enquiry management
   9. Follow-up task management
   10. Email notifications
   11. Testing and deployment
4. **Test** these scenarios:
   - New customer submits a request
   - Existing customer submits another; customer record is reused
   - Admin can log in
   - Admin can approve a booking
   - Admin cannot approve conflicting bookings
   - A customer cannot access another customer's information
   - A customer cannot access the admin dashboard
   - Admin can create and complete follow-up tasks
   - Email failure does not break the booking workflow
   - Mobile booking form works correctly
5. **Deploy:** prepare for Vercel and provide: required environment variables, Supabase setup, migration instructions, admin account setup, Vercel deployment steps, README. Never commit secrets or `.env` files.