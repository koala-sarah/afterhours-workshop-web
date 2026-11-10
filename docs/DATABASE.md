# Database

Supabase Postgres 17. Everything is defined in version-controlled migrations in `supabase/migrations/`; never change the schema by hand in the dashboard.

| Migration | Contents |
|---|---|
| `…0100_core_schema.sql` | Helper functions, enums, all tables, indexes, `updated_at` triggers |
| `…0200_auth_and_roles.sql` | Profile created for each auth user, `private.is_admin()` |
| `…0300_row_level_security.sql` | RLS on every table, privileges, policies |
| `…0400_public_submissions.sql` | `submit_appointment_request`, `submit_enquiry` (the only public write path) |
| `…0500_activity_and_follow_ups.sql` | Activity history and enquiry → follow-up automation |
| `…0600_reference_data.sql` | Services, business hours, settings (needed in production) |
| `…0700_server_only_submissions.sql` | Submit functions callable by the server only; per-client throttling |
| `…0800_appointment_management.sql` | `admin_appointments` view, approval guard trigger, admin appointment functions |
| `…0900_customer_vehicle_management.sql` | `admin_customers` view, appointment vehicle must belong to its customer, activity history for customer / vehicle edits, `set_appointment_vehicle` |

`supabase/seed.sql` adds one sample enquiry for **local development only**.

## Tables

| Table | Purpose |
|---|---|
| `profiles` | One per Supabase Auth user. `role` is `USER` (no access) or `ADMIN`. |
| `customers` | One per person. Unique on normalised email; phone normalised for matching (`(027) 770-0486` = `+64 27 770 0486`). |
| `vehicles` | Many per customer. Unique per customer on normalised registration (`abc 123` = `ABC-123`). |
| `services` | Public catalogue shown on the website. |
| `enquiries` | Contact form messages. Status `NEW`, `IN_PROGRESS`, `CONVERTED`, `CLOSED`. |
| `appointments` | Booking requests. Status `PENDING`, `APPROVED`, `DECLINED`, `RESCHEDULE_REQUESTED`, `CANCELLED`, `COMPLETED`. |
| `follow_up_tasks` | Admin to-dos. Status `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`; priority `LOW`, `MEDIUM`, `HIGH`. |
| `activities` | Append-only history per customer and record. |
| `business_hours` | Opening hours per weekday (0 = Sunday). |
| `business_settings` | Single row: timezone, appointment length, bookings at the same time, enquiry follow-up delay. |

Rules enforced by the database (not just the app):

- Every new appointment is `PENDING`. `APPROVED` requires `scheduled_start`/`scheduled_end` and `approved_at`; `RESCHEDULE_REQUESTED` requires a proposed slot.
- A customer cannot have two open requests (`PENDING`, `RESCHEDULE_REQUESTED`, `APPROVED`) for the same vehicle, service, date and time.
- `completed_at` on follow-up tasks is set and cleared automatically from `status`.
- Timestamps are `timestamptz` (UTC). Requested dates and times are local Pacific/Auckland values, converted using `business_settings.timezone`.

## Security model

| Who | Can do |
|---|---|
| Website visitor (`anon`) | Read active services, business hours, booking settings. **Nothing else**: no direct read or write on any internal table, and no direct calls to the submit functions. |
| Signed-in user with role `USER` | Read their own profile and change their own name. No internal records. |
| Signed-in `ADMIN` | Read and manage all internal records. Activity history is append-only. Cannot change roles through the API. |
| `service_role` / secret key | Bypasses RLS. Server only, never in the browser. The Next.js server uses it **only** to call `submit_appointment_request` / `submit_enquiry` after its own spam checks. |

- RLS is enabled on all 10 tables, and access is decided by policies, not by hidden pages.
- `TRUNCATE` (which ignores RLS) is revoked, and default privileges are changed so **future tables and functions start with no anon access**.
- Helper functions live in the `private` schema, which the Data API does not expose.

### Public submission functions

Callable only by `service_role`, i.e. from the website's Server Actions, so the app's spam checks (honeypot, minimum fill time, Zod validation) cannot be skipped by calling the API directly.

Both run in one transaction and return only the new record's id. They validate input, reuse an existing customer (same normalised email; or same phone when that customer has no email on file), and log activity. `submit_enquiry` also creates a follow-up task.

`submit_appointment_request` also checks:

- the date/time is in the future
- the day is open and the time is within opening hours (skipped when the day's times are not configured)
- fewer than `max_concurrent_appointments` **approved** bookings overlap the slot

Passing these checks never confirms anything: the request stays `PENDING` until an admin approves it.

Errors are raised with SQLSTATE `P0001` and one of these messages, which the app maps to friendly text:

Throttling: max 5 submissions per 10 minutes and 20 per day per client per form, keyed on `p_client_fingerprint` (an HMAC of the visitor's IP computed by the server; the raw IP is never stored). Entries older than a day are deleted automatically.

`invalid_name`, `invalid_email`, `invalid_phone`, `invalid_vehicle`, `invalid_service`, `invalid_description`, `invalid_message`, `invalid_date`, `invalid_input`, `past_date`, `closed_day`, `outside_hours`, `slot_unavailable`, `duplicate_request`, `too_many_requests` (more than 5 requests per customer per hour, or the per-client throttle above)

## Admin appointment management

Admin-only functions (`SECURITY INVOKER`, so RLS still applies; each checks `is_admin()` first and locks the row):

| Function | Does |
|---|---|
| `approve_appointment(id, date, time, duration?, note?)` | `PENDING`/`RESCHEDULE_REQUESTED` → `APPROVED` with a confirmed slot (local Pacific/Auckland date + time) |
| `decline_appointment(id, reason?)` | → `DECLINED` |
| `propose_appointment_time(id, date, time, duration?, message?)` | → `RESCHEDULE_REQUESTED` with a proposed slot (must be free) |
| `update_appointment_status(id, CANCELLED / COMPLETED / PENDING, reason?)` | Cancel, mark completed, reopen |
| `add_appointment_note(id, note)` | Internal note, stored in the activity history with the author |

A `BEFORE UPDATE` trigger on `appointments` applies to **every** update path (these functions or a direct `UPDATE`):

- **Allowed transitions only:**
  - `PENDING` → approved, declined, new time proposed, cancelled
  - `RESCHEDULE_REQUESTED` → approved, declined, cancelled, pending
  - `APPROVED` → completed, cancelled, new time proposed
  - `DECLINED` / `CANCELLED` → pending
  - `COMPLETED` is final.
- **Conflict check on approval:** fewer than `max_concurrent_appointments` approved bookings may overlap the slot. Approvals are serialised with an advisory lock, so two admins can't double-book.
- **Approval record:** `approved_at` and `approved_by` (the signed-in admin) are set automatically.

Every status change is written to `activities` with a readable description (e.g. "Appointment approved for Mon 16 Nov 2026, 18:00 - Confirmed by phone"), the admin's reason and the slot.

Extra error codes: `slot_conflict`, `invalid_transition`, `invalid_duration`, `not_found`, `forbidden`, `invalid_note`.

## Admin customer and vehicle management

Admins edit `customers` and `vehicles` directly through RLS (admin-only policies). The database adds:

| Rule | How |
| --- | --- |
| One profile per email | Unique index on `email_normalized` (existing). The app also checks first and links to the existing profile. |
| Shared phone numbers | Allowed (households). Creating a customer whose phone is already on file asks the admin to confirm it's a different person; the profile shows "Same phone number as". |
| One plate per customer | Unique `(customer_id, registration_normalized)` (existing). |
| Vehicle stays with its customer | Authenticated users can only update `make`, `model`, `year`, `registration_number`, `additional_information` (column grants). A car sold to another customer is added again under the new owner. |
| Appointment vehicle belongs to the same customer | Composite foreign key `appointments (vehicle_id, customer_id) → vehicles (id, customer_id)`. Applies to every update path. |
| Activity history | Triggers log `customer.updated` (changed field names only, no old values), `vehicle.added`, `vehicle.updated`, `appointment.vehicle_changed`. Internal customer notes are `customer.note` activities (append-only). |

`admin_customers` (view, `security_invoker`) adds vehicle count, plates (for search), appointment counts and the last request time to each customer.

`set_appointment_vehicle(appointment_id, vehicle_id)` links an appointment to another of the same customer's vehicles. Error codes: `vehicle_mismatch` (vehicle belongs to someone else), `duplicate_request` (same open request already exists for that vehicle), `not_found`, `forbidden`.

Because `appointments` now has two foreign keys to `vehicles`, PostgREST embeds must name one: `vehicles!appointments_vehicle_id_fkey(...)`.

## Applying the migrations

### A. Hosted Supabase project (staging / production)

1. Create a project at [supabase.com](https://supabase.com) in a region close to New Zealand (e.g. Sydney) with **Postgres 17**.
2. Log in and link this repo to the project (the project ref is in the dashboard URL):
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
3. Preview, then apply:
   ```bash
   npx supabase db push --dry-run   # lists the migrations that will run
   npm run db:push                   # applies them in order
   ```
   `db push` records what has run in `supabase_migrations.schema_migrations`, so running it again only applies new files. It does **not** run `seed.sql`.

   Without `login`/`link`, you can push straight to the connection string. Use the **session pooler** (port 5432), not the transaction pooler (6543), for schema changes:
   ```bash
   npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"
   ```
4. Copy the keys into `.env.local` (see `.env.example`): Project URL, publishable key and secret key.

### B. Local Supabase (needs Docker Desktop)

```bash
npm run db:start   # starts Postgres, Auth, Studio (http://127.0.0.1:54323)
npm run db:reset   # recreates the DB: all migrations + seed.sql
```

### C. Without the CLI

In the dashboard SQL editor, run each file in `supabase/migrations/` **in filename order**, once. Prefer A: the CLI tracks what has already run.

### Create the first admin

1. In the dashboard: **Authentication → Users → Add user** (email + password). A `USER` profile is created automatically.
2. In the SQL editor:
   ```sql
   update public.profiles set role = 'ADMIN' where email = 'owner@example.com';
   ```

Roles can only be changed with SQL (or the secret key), never through the app's API.

### Verify the security rules

Run against a **local** database (the script rolls back, but still don't point it at production):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verify/security_checks.sql
```

It checks, as each role, that visitors cannot read or change anything, that non-admins see nothing, that customers are reused, that duplicates, past dates and out-of-hours requests are blocked, that approval needs a slot and is logged, and that approved slots are not offered again. Any failure prints a message starting with `FAIL`.

## Adding a migration later

```bash
npm run db:new -- <short_name>   # creates supabase/migrations/<timestamp>_<short_name>.sql
```

For every new table: `enable row level security`, add explicit policies, and only `grant` to `anon` if visitors genuinely need it (new tables start with no anon access). Add checks to `supabase/verify/security_checks.sql`.

## Values to confirm with the owner

Stored as placeholders until the owner confirms them (editable in the admin area later):

| Setting | Current value | Why |
|---|---|---|
| Weekend opening times | Open, times **not set** (no time check) | Site says only "all day" |
| `appointment_duration_minutes` | 60 | Not stated |
| `max_concurrent_appointments` | 1 | Number of bays/mechanics not stated |
| `enquiry_follow_up_hours` | 24 | Not stated |
| Public holidays | Not modelled | Not stated |
