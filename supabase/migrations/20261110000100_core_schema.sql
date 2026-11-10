-- =============================================================================
-- Core schema: helper functions, enums, tables, indexes, updated_at triggers.
--
-- Conventions
--   * UUID primary keys (gen_random_uuid()).
--   * All timestamps are timestamptz, stored in UTC; the app displays them in
--     Pacific/Auckland (business_settings.timezone).
--   * Normalised email / phone / registration columns are generated, so
--     duplicate detection never depends on how a value was typed.
--   * Only the personal data needed to run the workshop is stored.
-- =============================================================================

-- Helpers live in a schema that the Data API does not expose.
create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "  Jane@Example.COM " -> "jane@example.com"; empty -> null
create function private.normalize_email(p_email text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(lower(btrim(p_email)), '');
$$;

-- NZ phone numbers: keep digits only and turn the +64 country code into a
-- leading 0, so "(027) 770 - 0486" and "+64 27 770 0486" both become "0277700486".
create function private.normalize_phone(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    case
      when d like '64%' and length(d) > 8 then '0' || substr(d, 3)
      else d
    end,
    ''
  )
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) as digits;
$$;

-- "abc 123" / "ABC-123" -> "ABC123"
create function private.normalize_registration(p_registration text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_registration, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.app_role as enum ('USER', 'ADMIN');

create type public.appointment_status as enum (
  'PENDING',
  'APPROVED',
  'DECLINED',
  'RESCHEDULE_REQUESTED',
  'CANCELLED',
  'COMPLETED'
);

create type public.enquiry_status as enum ('NEW', 'IN_PROGRESS', 'CONVERTED', 'CLOSED');

create type public.request_source as enum ('WEBSITE', 'PHONE', 'EMAIL', 'WALK_IN', 'OTHER');

create type public.task_status as enum ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

create type public.task_priority as enum ('LOW', 'MEDIUM', 'HIGH');

create type public.related_type as enum (
  'CUSTOMER',
  'VEHICLE',
  'APPOINTMENT',
  'ENQUIRY',
  'FOLLOW_UP_TASK'
);

-- -----------------------------------------------------------------------------
-- profiles: one row per Supabase Auth user (admin accounts)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (full_name is null or char_length(full_name) <= 200),
  role public.app_role not null default 'USER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'App profile for each auth user. role = ADMIN grants access to internal records. Role can only be changed with SQL / the service role.';

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 30),
  email_normalized text generated always as (private.normalize_email(email)) stored,
  phone_normalized text generated always as (private.normalize_phone(phone)) stored,
  notes text check (notes is null or char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_contact_required check (email is not null or phone is not null)
);

comment on table public.customers is
  'One profile per customer. Deduplicated on normalised email (unique) and, when no email is known, normalised phone.';

-- One customer per email address.
create unique index customers_email_normalized_key
  on public.customers (email_normalized)
  where email_normalized is not null;

-- Phone is not unique (households may share a number) but is used for matching and search.
create index customers_phone_normalized_idx
  on public.customers (phone_normalized)
  where phone_normalized is not null;

create index customers_created_at_idx on public.customers (created_at desc);

-- -----------------------------------------------------------------------------
-- vehicles
-- -----------------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  make text not null check (char_length(btrim(make)) between 1 and 60),
  model text not null check (char_length(btrim(model)) between 1 and 60),
  year smallint check (year is null or year between 1900 and 2100),
  -- Nullable: unregistered track cars exist. The booking form requires it.
  registration_number text check (registration_number is null or char_length(registration_number) <= 20),
  registration_normalized text generated always as (private.normalize_registration(registration_number)) stored,
  additional_information text check (additional_information is null or char_length(additional_information) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A customer cannot have the same registration twice.
create unique index vehicles_customer_registration_key
  on public.vehicles (customer_id, registration_normalized)
  where registration_normalized is not null;

create index vehicles_customer_id_idx on public.vehicles (customer_id);
create index vehicles_registration_normalized_idx on public.vehicles (registration_normalized);

-- -----------------------------------------------------------------------------
-- services (public catalogue, editable by admins)
-- -----------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- Paragraphs separated by a blank line.
  description text not null default '' check (char_length(description) <= 5000),
  -- Shown exactly as entered, e.g. "From $99".
  price_label text check (price_label is null or char_length(price_label) <= 50),
  image_path text check (image_path is null or char_length(image_path) <= 500),
  image_alt text check (image_alt is null or char_length(image_alt) <= 300),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index services_active_sort_idx on public.services (sort_order) where is_active;

-- -----------------------------------------------------------------------------
-- enquiries
-- -----------------------------------------------------------------------------

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  subject text check (subject is null or char_length(subject) <= 200),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  source public.request_source not null default 'WEBSITE',
  status public.enquiry_status not null default 'NEW',
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index enquiries_customer_id_idx on public.enquiries (customer_id);
create index enquiries_status_created_at_idx on public.enquiries (status, created_at desc);

-- -----------------------------------------------------------------------------
-- appointments (booking requests; only an admin can approve)
-- -----------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  -- Set when an enquiry is converted into an appointment request.
  enquiry_id uuid references public.enquiries (id) on delete set null,
  source public.request_source not null default 'WEBSITE',

  -- What the customer asked for (local Pacific/Auckland date and time).
  preferred_date date not null,
  preferred_time time not null,
  alternative_date date,
  alternative_time time,
  description text not null check (char_length(btrim(description)) between 1 and 5000),
  additional_notes text check (additional_notes is null or char_length(additional_notes) <= 5000),

  status public.appointment_status not null default 'PENDING',

  -- Confirmed slot, set by an admin on approval.
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  -- Alternative slot suggested by an admin (RESCHEDULE_REQUESTED).
  proposed_start timestamptz,
  proposed_end timestamptz,

  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 10000),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint appointments_alternative_pair
    check ((alternative_date is null) = (alternative_time is null)),
  constraint appointments_scheduled_pair
    check ((scheduled_start is null) = (scheduled_end is null)),
  constraint appointments_scheduled_order
    check (scheduled_end is null or scheduled_end > scheduled_start),
  constraint appointments_proposed_pair
    check ((proposed_start is null) = (proposed_end is null)),
  constraint appointments_proposed_order
    check (proposed_end is null or proposed_end > proposed_start),
  -- An approved booking always has a confirmed slot and an approval record.
  constraint appointments_approved_is_complete
    check (status <> 'APPROVED' or (scheduled_start is not null and approved_at is not null)),
  constraint appointments_completed_has_slot
    check (status <> 'COMPLETED' or scheduled_start is not null),
  constraint appointments_reschedule_has_proposal
    check (status <> 'RESCHEDULE_REQUESTED' or proposed_start is not null)
);

comment on table public.appointments is
  'Appointment requests. Every new row is PENDING; a request is not a confirmed booking until an admin approves it.';

-- Duplicate protection: the same customer cannot have two open requests for the
-- same vehicle, service, date and time.
create unique index appointments_open_request_key
  on public.appointments (customer_id, vehicle_id, service_id, preferred_date, preferred_time)
  nulls not distinct
  where status in ('PENDING', 'RESCHEDULE_REQUESTED', 'APPROVED');

-- Conflict checks look up approved slots by time.
create index appointments_approved_slot_idx
  on public.appointments (scheduled_start, scheduled_end)
  where status = 'APPROVED';

create index appointments_customer_id_idx on public.appointments (customer_id);
create index appointments_vehicle_id_idx on public.appointments (vehicle_id);
create index appointments_service_id_idx on public.appointments (service_id);
create index appointments_enquiry_id_idx on public.appointments (enquiry_id);
create index appointments_status_preferred_date_idx on public.appointments (status, preferred_date);
create index appointments_created_at_idx on public.appointments (created_at desc);

-- -----------------------------------------------------------------------------
-- follow_up_tasks
-- -----------------------------------------------------------------------------

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  enquiry_id uuid references public.enquiries (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  due_at timestamptz not null,
  priority public.task_priority not null default 'MEDIUM',
  status public.task_status not null default 'PENDING',
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_up_tasks_completed_at
    check ((status = 'COMPLETED') = (completed_at is not null))
);

-- Overdue / due today / upcoming lists only look at open tasks.
create index follow_up_tasks_open_due_idx
  on public.follow_up_tasks (due_at)
  where status in ('PENDING', 'IN_PROGRESS');
create index follow_up_tasks_customer_id_idx on public.follow_up_tasks (customer_id);
create index follow_up_tasks_enquiry_id_idx on public.follow_up_tasks (enquiry_id);
create index follow_up_tasks_appointment_id_idx on public.follow_up_tasks (appointment_id);

-- Keep completed_at in step with status so the check above always holds.
create function private.sync_task_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'COMPLETED' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger follow_up_tasks_sync_completed_at
  before insert or update of status, completed_at on public.follow_up_tasks
  for each row execute function private.sync_task_completed_at();

-- -----------------------------------------------------------------------------
-- activities (append-only history)
-- -----------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  related_type public.related_type not null,
  related_id uuid not null,
  activity_type text not null check (activity_type ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$' and char_length(activity_type) <= 64),
  description text not null check (char_length(description) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index activities_customer_created_at_idx on public.activities (customer_id, created_at desc);
create index activities_related_idx on public.activities (related_type, related_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Availability configuration (edited by admins)
-- -----------------------------------------------------------------------------

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  -- 0 = Sunday ... 6 = Saturday (same as extract(dow ...))
  day_of_week smallint not null unique check (day_of_week between 0 and 6),
  is_open boolean not null default false,
  -- Null times on an open day mean "hours not confirmed yet": no time check is applied.
  open_time time,
  close_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_hours_time_pair check ((open_time is null) = (close_time is null)),
  constraint business_hours_time_order check (close_time is null or close_time > open_time)
);

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  -- Guarantees a single settings row.
  singleton boolean not null default true unique check (singleton),
  timezone text not null default 'Pacific/Auckland',
  -- Placeholders until the owner confirms them (not stated on the existing site).
  appointment_duration_minutes integer not null default 60
    check (appointment_duration_minutes between 15 and 1440),
  max_concurrent_appointments integer not null default 1
    check (max_concurrent_appointments between 1 and 50),
  enquiry_follow_up_hours integer not null default 24
    check (enquiry_follow_up_hours between 1 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function private.set_updated_at();
create trigger services_set_updated_at before update on public.services
  for each row execute function private.set_updated_at();
create trigger enquiries_set_updated_at before update on public.enquiries
  for each row execute function private.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function private.set_updated_at();
create trigger follow_up_tasks_set_updated_at before update on public.follow_up_tasks
  for each row execute function private.set_updated_at();
create trigger business_hours_set_updated_at before update on public.business_hours
  for each row execute function private.set_updated_at();
create trigger business_settings_set_updated_at before update on public.business_settings
  for each row execute function private.set_updated_at();
