-- =============================================================================
-- Inbox and chat intake (Build 9), part 2: tables, view, RLS.
--
--   inbox_items      one card in the admin Inbox (one person / phone number
--                    with an open conversation)
--   inbox_entries    everything that lands on a card: a chat intake, a form,
--                    a contact message, and later WhatsApp / SMS messages and
--                    call summaries
--   private.intake_sessions
--                    anonymous chat progress, saved at every step. Private
--                    schema: not exposed by the Data API, no policies, only
--                    the server-side intake functions touch it.
--
-- Access: anon has no access at all. Admins can read the Inbox; every change
-- goes through the admin functions (later migration), so there are no
-- insert / update / delete grants for signed-in users.
--
-- Also:
--   * appointments.service_id becomes optional (bookings approved from the
--     Inbox have no service picked) and appointments gain inbox_item_id
--   * follow_up_tasks gain an optional inbox_item_id (kept for future reminders)
--   * enquiries become legacy: existing rows are copied into the Inbox and the
--     "new enquiry -> follow-up task" automation is switched off
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
alter table public.business_settings
  add column intake_abandon_minutes integer not null default 30
    check (intake_abandon_minutes between 5 and 1440),
  add column intake_retention_days integer not null default 30
    check (intake_retention_days between 1 and 365);

comment on column public.business_settings.intake_abandon_minutes is
  'A chat intake with no progress for this long is marked abandoned (and the operator is notified once).';
comment on column public.business_settings.intake_retention_days is
  'Intake sessions are deleted after this many days. Sessions that never reached contact details leave nothing behind.';

-- -----------------------------------------------------------------------------
-- inbox_items
-- -----------------------------------------------------------------------------
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  -- Linked once the request is finished (or abandoned with contact details).
  -- Nullable so future unknown callers can still have a card.
  customer_id uuid references public.customers (id) on delete set null,

  -- Contact snapshot (latest entry wins). Used for grouping and the card.
  contact_name text check (contact_name is null or char_length(btrim(contact_name)) between 1 and 200),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  phone_normalized text generated always as (private.normalize_phone(contact_phone)) stored,
  email_normalized text generated always as (private.normalize_email(contact_email)) stored,

  status public.inbox_status not null default 'NEW',
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid references public.profiles (id) on delete set null,
  -- Sort key: newest activity first.
  last_entry_at timestamptz not null default now(),

  -- Booking created from this card ("Approve booking").
  appointment_id uuid references public.appointments (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inbox_items_contact_required check (contact_phone is not null or contact_email is not null)
);

comment on table public.inbox_items is
  'Admin Inbox card. Statuses: NEW (nobody has contacted them), NEEDS_REPLY, DONE. Open cards are grouped by normalised phone.';

create index inbox_items_last_entry_idx on public.inbox_items (last_entry_at desc);
create index inbox_items_status_last_entry_idx on public.inbox_items (status, last_entry_at desc);
create index inbox_items_open_phone_idx on public.inbox_items (phone_normalized)
  where status <> 'DONE' and phone_normalized is not null;
create index inbox_items_open_email_idx on public.inbox_items (email_normalized)
  where status <> 'DONE' and email_normalized is not null;
create index inbox_items_customer_id_idx on public.inbox_items (customer_id);
create index inbox_items_appointment_id_idx on public.inbox_items (appointment_id);

-- -----------------------------------------------------------------------------
-- inbox_entries
-- -----------------------------------------------------------------------------
create table public.inbox_entries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inbox_items (id) on delete cascade,
  channel public.inbox_channel not null default 'WEB',
  kind public.inbox_entry_kind not null,

  -- Future channels: a short summary (e.g. of a missed call), the number the
  -- message came from, and the provider's id (stops the same message being
  -- stored twice).
  summary text check (summary is null or char_length(summary) <= 5000),
  source_phone text check (source_phone is null or char_length(source_phone) <= 30),
  external_id text check (external_id is null or char_length(external_id) between 1 and 200),

  -- Raw answers as given (shape documented in docs/DATABASE.md) and the
  -- version of the question flow they were answered with.
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and char_length(answers::text) <= 20000),
  flow_version text check (flow_version is null or char_length(flow_version) between 1 and 40),

  -- Contact given in this entry.
  contact_name text check (contact_name is null or char_length(btrim(contact_name)) between 1 and 200),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),

  -- Extracted from answers for the Inbox card.
  symptom_category text check (symptom_category is null or char_length(symptom_category) between 1 and 60),
  symptom_text text check (symptom_text is null or char_length(symptom_text) <= 500),
  drivable text check (drivable is null or drivable in ('YES', 'NO', 'UNSURE')),
  vehicle_make text check (vehicle_make is null or char_length(vehicle_make) <= 60),
  vehicle_model text check (vehicle_model is null or char_length(vehicle_model) <= 60),
  vehicle_year smallint check (vehicle_year is null or vehicle_year between 1900 and 2100),
  vehicle_registration text check (vehicle_registration is null or char_length(vehicle_registration) <= 20),
  preferred_method public.contact_method,
  preferred_times text[] not null default '{}'
    check (cardinality(preferred_times) <= 12),
  -- Free-text message (contact form, future WhatsApp / SMS / email).
  message text check (message is null or char_length(message) <= 5000),

  -- Linked when the request is finished (or abandoned with contact details).
  vehicle_id uuid references public.vehicles (id) on delete set null,

  -- Progress: the step reached, finished / abandoned time.
  last_step text check (last_step is null or char_length(last_step) <= 40),
  completed_at timestamptz,
  abandoned_at timestamptz,

  legacy_enquiry_id uuid unique references public.enquiries (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inbox_entries is
  'One submission, message or call on an Inbox card. channel / summary / source_phone / external_id are ready for WhatsApp, SMS and call summaries.';

create unique index inbox_entries_channel_external_id_key
  on public.inbox_entries (channel, external_id)
  where external_id is not null;
create index inbox_entries_item_created_idx on public.inbox_entries (item_id, created_at desc);
create index inbox_entries_open_intake_idx on public.inbox_entries (updated_at)
  where kind = 'INTAKE' and completed_at is null and abandoned_at is null;
create index inbox_entries_vehicle_id_idx on public.inbox_entries (vehicle_id);

-- -----------------------------------------------------------------------------
-- private.intake_sessions (anonymous chat progress)
-- -----------------------------------------------------------------------------
create table private.intake_sessions (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 of the random token in the visitor's httpOnly cookie. The token
  -- itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- HMAC of the visitor's IP (same as the other public forms).
  fingerprint text check (fingerprint is null or char_length(fingerprint) between 16 and 128),
  flow_version text check (flow_version is null or char_length(flow_version) between 1 and 40),
  current_step text check (current_step is null or char_length(current_step) <= 40),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and char_length(answers::text) <= 20000),
  save_count integer not null default 0,
  -- Set once contact details are given.
  entry_id uuid references public.inbox_entries (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index intake_sessions_created_at_idx on private.intake_sessions (created_at);
create index intake_sessions_entry_id_idx on private.intake_sessions (entry_id);

alter table private.intake_sessions enable row level security;
revoke all on private.intake_sessions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Existing tables
-- -----------------------------------------------------------------------------

-- Bookings approved from the Inbox have no service picked.
alter table public.appointments alter column service_id drop not null;
alter table public.appointments
  add column inbox_item_id uuid references public.inbox_items (id) on delete set null;
create index appointments_inbox_item_id_idx on public.appointments (inbox_item_id);

-- Same columns as before; services is now a LEFT join.
create or replace view public.admin_appointments
with (security_invoker = true)
as
select
  a.id,
  a.status,
  a.created_at,
  a.preferred_date,
  a.preferred_time,
  a.alternative_date,
  a.alternative_time,
  a.scheduled_start,
  a.scheduled_end,
  a.proposed_start,
  a.proposed_end,
  a.source,
  a.customer_id,
  c.full_name as customer_name,
  c.email as customer_email,
  c.phone as customer_phone,
  c.email_normalized,
  c.phone_normalized,
  a.vehicle_id,
  v.make as vehicle_make,
  v.model as vehicle_model,
  v.year as vehicle_year,
  v.registration_number,
  v.registration_normalized,
  a.service_id,
  s.name as service_name
from public.appointments a
join public.customers c on c.id = a.customer_id
left join public.services s on s.id = a.service_id
left join public.vehicles v on v.id = a.vehicle_id;

-- Follow-up tasks: no UI in Phase 1, kept for future reminders on a card.
alter table public.follow_up_tasks
  add column inbox_item_id uuid references public.inbox_items (id) on delete cascade;
create index follow_up_tasks_inbox_item_id_idx on public.follow_up_tasks (inbox_item_id);

comment on table public.follow_up_tasks is
  'Dormant in Phase 1: the Inbox NEEDS_REPLY status replaces follow-up tasks. Kept for future reminders (inbox_item_id).';
comment on table public.enquiries is
  'Legacy. Replaced by the Inbox (inbox_items / inbox_entries); rows were copied there with legacy_enquiry_id. No new rows are created by the app.';

-- New enquiries no longer create a follow-up task (the Inbox replaces it).
create or replace function private.on_enquiry_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_activity(
    new.customer_id, 'ENQUIRY', new.id, 'enquiry.received',
    'Enquiry received',
    jsonb_build_object('source', new.source)
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- updated_at, status bookkeeping and history
-- -----------------------------------------------------------------------------
create trigger inbox_items_set_updated_at before update on public.inbox_items
  for each row execute function private.set_updated_at();
create trigger inbox_entries_set_updated_at before update on public.inbox_entries
  for each row execute function private.set_updated_at();
create trigger intake_sessions_set_updated_at before update on private.intake_sessions
  for each row execute function private.set_updated_at();

create function private.inbox_status_label(p_status public.inbox_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'NEW' then 'New'
    when 'NEEDS_REPLY' then 'Needs reply'
    when 'DONE' then 'Done'
  end;
$$;

create function private.on_inbox_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := (select id from public.profiles where id = (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger inbox_items_status_bookkeeping
  before update of status on public.inbox_items
  for each row execute function private.on_inbox_status_change();

create function private.log_inbox_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_activity(
    new.customer_id, 'INBOX_ITEM', new.id, 'inbox.status_changed',
    'Status changed from ' || private.inbox_status_label(old.status)
      || ' to ' || private.inbox_status_label(new.status),
    jsonb_build_object('from', old.status, 'to', new.status)
  );
  return new;
end;
$$;

create trigger inbox_items_log_status_change
  after update of status on public.inbox_items
  for each row
  when (old.status is distinct from new.status)
  execute function private.log_inbox_status_change();

-- -----------------------------------------------------------------------------
-- Inbox view: one row per card with its latest entry (RLS applies)
-- -----------------------------------------------------------------------------
create view public.admin_inbox
with (security_invoker = true)
as
select
  i.id,
  i.status,
  i.status_changed_at,
  i.last_entry_at,
  i.created_at,
  i.customer_id,
  c.full_name as customer_name,
  i.contact_name,
  i.contact_phone,
  i.contact_email,
  i.phone_normalized,
  i.email_normalized,
  i.appointment_id,
  counts.entry_count,
  e.id as entry_id,
  e.channel,
  e.kind,
  e.summary,
  e.symptom_category,
  e.symptom_text,
  e.drivable,
  e.vehicle_make,
  e.vehicle_model,
  e.vehicle_year,
  e.vehicle_registration,
  e.preferred_method,
  e.preferred_times,
  e.message,
  e.last_step,
  e.completed_at,
  e.abandoned_at,
  e.created_at as entry_created_at
from public.inbox_items i
left join public.customers c on c.id = i.customer_id
cross join lateral (
  select count(*)::integer as entry_count from public.inbox_entries x where x.item_id = i.id
) counts
left join lateral (
  select * from public.inbox_entries x
  where x.item_id = i.id
  order by x.created_at desc
  limit 1
) e on true;

comment on view public.admin_inbox is
  'Inbox cards with their latest entry. security_invoker = true, so only admins see rows.';

-- -----------------------------------------------------------------------------
-- RLS and privileges
-- -----------------------------------------------------------------------------
alter table public.inbox_items enable row level security;
alter table public.inbox_entries enable row level security;

revoke all on public.inbox_items, public.inbox_entries, public.admin_inbox from public, anon, authenticated;
grant select on public.inbox_items, public.inbox_entries, public.admin_inbox to authenticated;
grant all on public.inbox_items, public.inbox_entries to service_role;

create policy "Admins can read inbox items"
  on public.inbox_items for select to authenticated
  using ((select private.is_admin()));
create policy "Admins can read inbox entries"
  on public.inbox_entries for select to authenticated
  using ((select private.is_admin()));

revoke all on function private.inbox_status_label(public.inbox_status) from public, anon, authenticated;
revoke all on function private.on_inbox_status_change() from public, anon, authenticated;
revoke all on function private.log_inbox_status_change() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Copy existing enquiries into the Inbox (one card each)
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_item uuid;
begin
  for r in
    select e.*, c.full_name, c.email, c.phone
    from public.enquiries e
    join public.customers c on c.id = e.customer_id
    where not exists (select 1 from public.inbox_entries x where x.legacy_enquiry_id = e.id)
    order by e.created_at
  loop
    insert into public.inbox_items (
      customer_id, contact_name, contact_phone, contact_email, status, status_changed_at,
      last_entry_at, created_at
    )
    values (
      r.customer_id, r.full_name, r.phone, r.email,
      case when r.status in ('CONVERTED', 'CLOSED') then 'DONE' else 'NEW' end::public.inbox_status,
      r.updated_at, r.created_at, r.created_at
    )
    returning id into v_item;

    insert into public.inbox_entries (
      item_id, channel, kind, contact_name, contact_phone, contact_email,
      message, summary, completed_at, legacy_enquiry_id, created_at
    )
    values (
      v_item,
      case r.source when 'PHONE' then 'PHONE' when 'EMAIL' then 'EMAIL' else 'WEB' end::public.inbox_channel,
      'LEGACY', r.full_name, r.phone, r.email,
      r.message, r.subject, r.created_at, r.id, r.created_at
    );
  end loop;
end $$;
