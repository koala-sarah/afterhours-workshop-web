# Afterhours Workshop

Website, appointment request system and admin dashboard for Afterhours Workshop, St Johns, Auckland.

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth, RLS) · Zod · React Hook Form

| Doc | Contents |
|---|---|
| `docs/PROJECT_SPEC.md` | Requirements |
| `docs/SITE_CONTENT.md` | Content verified on the existing website |
| `docs/DESIGN_SYSTEM.md` | Colours, fonts and components reproduced from the existing site |
| `docs/DATABASE.md` | Schema, security model, applying migrations |

## Getting started

Requirements: Node.js 20+ and a Supabase project (Postgres 17).

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run db:push              # apply migrations (see docs/DATABASE.md)
npm run dev                  # http://localhost:3000
```

| Variable | Where to find it | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys (`sb_publishable_…`) | Public (protected by RLS) |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys (`sb_secret_…`) | **Server only**, never commit or expose |
| `DATABASE_URL` | Connect → Session pooler | Local tooling only |

Never commit `.env.local`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run db:push` | Apply new migrations to the linked Supabase project |
| `npm run db:start` / `db:reset` | Local Supabase (Docker) / rebuild local DB with seed |
| `npm run db:new -- <name>` | Create a new migration file |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` |

## Admin accounts

The admin area is at **`/admin`** (sign in at `/login`). There is no public sign-up: admin accounts are created by hand, and access needs **both** a Supabase Auth user **and** the `ADMIN` role on that user's profile.

### 1. Turn off public sign-ups (once per project)

Supabase dashboard → **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**.

The app has no sign-up page, but the Supabase Auth API accepts sign-ups unless this is off. Such accounts would get no access (role `USER`), but there is no reason to allow them.

### 2. Create the user

Supabase dashboard → **Authentication → Users → Add user → Create new user**

- Enter the email and a strong password (12+ characters; a password manager is best).
- Tick **Auto Confirm User**.

A profile row is created automatically with role `USER`. At this point the account **cannot** open the admin area.

### 3. Give the user the ADMIN role

Supabase dashboard → **SQL Editor**:

```sql
update public.profiles
set role = 'ADMIN', full_name = 'Owner Name'   -- full_name is optional
where email = 'owner@example.com';

-- Check
select email, role from public.profiles order by created_at;
```

Roles can only be changed with SQL (or the secret key). The app never lets a user change a role, including their own.

### 4. Sign in

Open `/login` and sign in with that email and password. You land on `/admin`.

### Removing access

```sql
-- Keep the account, remove admin access (takes effect on the next request)
update public.profiles set role = 'USER' where email = 'former.staff@example.com';
```

To delete the account entirely, use **Authentication → Users → … → Delete user**. The profile is removed with it.

### Forgotten password

Supabase dashboard → **Authentication → Users → … → Send password recovery**, or set a new password there. (There is no self-service reset page yet.)

## How access control works

| Layer | What it does |
|---|---|
| `src/proxy.ts` | Runs on `/admin` and `/login` only: refreshes the session cookie, sends signed-out visitors to `/login`. A convenience, not the security boundary. |
| `requireAdmin()` in `src/lib/auth/dal.ts` | Called by every admin page and Server Action. Verifies the session JWT and checks the `ADMIN` role. |
| Row Level Security (Supabase) | The database refuses internal data to anyone who is not an admin, whatever the app does. |

## Booking requests

`/appointments` has the booking request form (spec section 5). A submission is always a **request** (`PENDING`). The visitor sees *"Your appointment request has been received. We will contact you to confirm your appointment."* and only an admin can approve it.

Protection, in order: hidden honeypot field and minimum fill time → Zod validation in the Server Action → database function (validation, customer de-duplication on normalised email/phone, vehicle reuse on normalised registration, past date / opening hours / approved-slot checks, duplicate-request block, per-customer and per-IP limits). The submit functions can only be called from the server.

Other details:

- Login errors don't reveal whether an email exists.
- A non-admin who signs in is signed out immediately.
- `?next=` only redirects within `/admin`.
- Admin responses are sent with `Cache-Control: private, no-store`.
- Supabase Auth rate-limits sign-in attempts.
