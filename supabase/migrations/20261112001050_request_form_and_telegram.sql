-- =============================================================================
-- Request form, chat and Telegram (Build 11).
--
-- The intake desk now has two ways in, both saving to the Inbox tables:
--   * a one-screen request form (submit_inbox_form, kind FORM)
--   * a rule-based request chat (intake_start / intake_save_step)
-- Neither asks for make, model, year or a date.
--
-- Changes
--   * vehicles.make / model are optional: a vehicle can be just a
--     registration number (but never completely empty)
--   * new answer shape: problem {category, text}, contact {name, phone,
--     email}, vehicle {registration, registration_unknown}, reach {method,
--     times}; the earlier keys (symptom, vehicle make/model/year) are still read
--   * inbox_entries.registration_unknown ("I'm not sure" on the registration)
--   * form and chat require a phone number; the form also requires a
--     registration (or "not sure") and a contact method, and an email when
--     email is the chosen method
--   * notifications are recorded per channel (TELEGRAM, EMAIL): one row of
--     each per request
--
-- New error codes: invalid_registration, invalid_method
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vehicles: registration-only vehicles
-- -----------------------------------------------------------------------------
alter table public.vehicles alter column make drop not null;
alter table public.vehicles alter column model drop not null;
alter table public.vehicles add constraint vehicles_identifiable
  check (make is not null or model is not null or registration_number is not null);

-- Null-safe label for the activity history ("Toyota Corolla (ABC123)",
-- "Vehicle (ABC123)").
create or replace function private.vehicle_label(p_vehicle public.vehicles)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(concat_ws(' ', btrim(p_vehicle.make), btrim(p_vehicle.model)), ''), 'Vehicle')
    || coalesce(' (' || p_vehicle.registration_normalized || ')', '');
$$;

-- -----------------------------------------------------------------------------
-- Entries
-- -----------------------------------------------------------------------------
alter table public.inbox_entries
  add column registration_unknown boolean not null default false;

comment on column public.inbox_entries.symptom_category is
  'Problem / work wanted: the button the customer chose (answers.problem.category).';
comment on column public.inbox_entries.symptom_text is
  'Problem / work wanted: the optional one-line note (answers.problem.text).';
comment on column public.inbox_entries.registration_unknown is
  'The customer chose "I''m not sure" for the registration number.';

-- Recreate the view so it includes the new column.
drop view public.admin_inbox;
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
  e.registration_unknown,
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
  'Requests with their latest entry. security_invoker = true, so only admins see rows.';

revoke all on public.admin_inbox from public, anon, authenticated;
grant select on public.admin_inbox to authenticated;

-- Copies the answer fields shown in the list / alert into their columns.
create or replace function private.apply_entry_answers(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
  v_year text;
  v_method text;
  v_registration text;
begin
  select answers into a from public.inbox_entries where id = p_entry_id;
  v_year := private.jtext(a, '{vehicle,year}');
  v_method := upper(private.jtext(a, '{reach,method}'));
  v_registration := left(private.jtext(a, '{vehicle,registration}'), 20);

  update public.inbox_entries
  set symptom_category = left(coalesce(private.jtext(a, '{problem,category}'), private.jtext(a, '{symptom,category}')), 60),
      symptom_text = left(coalesce(private.jtext(a, '{problem,text}'), private.jtext(a, '{symptom,text}')), 500),
      drivable = case when upper(private.jtext(a, '{drivable}')) in ('YES', 'NO', 'UNSURE')
                      then upper(private.jtext(a, '{drivable}')) end,
      vehicle_make = left(private.jtext(a, '{vehicle,make}'), 60),
      vehicle_model = left(private.jtext(a, '{vehicle,model}'), 60),
      vehicle_year = case when v_year ~ '^[0-9]{4}$' and v_year::integer between 1900 and 2100
                          then v_year::smallint end,
      vehicle_registration = v_registration,
      registration_unknown = v_registration is null
                             and coalesce(private.jtext(a, '{vehicle,registration_unknown}'), 'false') = 'true',
      preferred_method = case when v_method in ('PHONE', 'WHATSAPP', 'SMS', 'EMAIL')
                              then v_method::public.contact_method end,
      preferred_times = coalesce((
        select array_agg(left(btrim(t), 80) order by ord)
        from jsonb_array_elements_text(
          case when jsonb_typeof(a #> '{reach,times}') = 'array' then a #> '{reach,times}' else '[]'::jsonb end
        ) with ordinality as x(t, ord)
        where btrim(t) <> '' and ord <= 12
      ), '{}'),
      message = coalesce(left(private.jtext(a, '{message}'), 5000), message)
  where id = p_entry_id;
end;
$$;

-- Links a finished (or abandoned) entry to a customer profile and vehicle.
-- A registration number alone is enough for a vehicle.
create or replace function private.finalize_inbox_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.inbox_entries;
  v_customer uuid;
  v_vehicle uuid;
begin
  select * into e from public.inbox_entries where id = p_entry_id;
  if not found or e.contact_name is null or (e.contact_phone is null and e.contact_email is null) then
    return;
  end if;

  v_customer := private.find_or_create_customer(e.contact_name, e.contact_email, e.contact_phone);

  update public.inbox_items
  set customer_id = coalesce(customer_id, v_customer)
  where id = e.item_id;

  if e.vehicle_id is not null then
    return;
  end if;

  if private.normalize_registration(e.vehicle_registration) is not null then
    v_vehicle := private.find_or_create_vehicle(
      v_customer, e.vehicle_make, e.vehicle_model, e.vehicle_year, e.vehicle_registration, null
    );
  elsif e.vehicle_make is not null and e.vehicle_model is not null then
    -- No plate: reuse the customer's unregistered vehicle of the same make/model.
    select id into v_vehicle from public.vehicles
    where customer_id = v_customer
      and registration_normalized is null
      and lower(make) = lower(e.vehicle_make)
      and lower(model) = lower(e.vehicle_model)
      and (year is null or e.vehicle_year is null or year = e.vehicle_year)
    order by created_at limit 1;
    if v_vehicle is null then
      insert into public.vehicles (customer_id, make, model, year)
      values (v_customer, e.vehicle_make, e.vehicle_model, e.vehicle_year)
      returning id into v_vehicle;
    end if;
  end if;

  if v_vehicle is not null then
    update public.inbox_entries set vehicle_id = v_vehicle where id = p_entry_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Chat: a phone number is required at the contact step
-- -----------------------------------------------------------------------------
create or replace function public.intake_save_step(
  p_token_hash text,
  p_step text,
  p_answers jsonb,
  p_complete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.intake_sessions;
  v_answers jsonb;
  v_retention integer;
  v_entry uuid;
  v_created boolean := false;
  v_name text;
  v_phone text;
  v_email text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or p_step is null or char_length(p_step) not between 1 and 40 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select * into s from private.intake_sessions where token_hash = p_token_hash for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if s.completed_at is not null then
    raise exception 'session_completed' using errcode = 'P0001';
  end if;
  select intake_retention_days into v_retention from public.business_settings limit 1;
  if s.created_at < now() - make_interval(days => coalesce(v_retention, 30)) then
    raise exception 'session_expired' using errcode = 'P0001';
  end if;
  if s.save_count >= 100 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;

  -- Each step owns its top-level key, so a shallow merge is enough.
  v_answers := s.answers || p_answers;

  update private.intake_sessions
  set answers = v_answers,
      current_step = p_step,
      save_count = save_count + 1
  where id = s.id;

  v_entry := s.entry_id;

  if private.answers_have_contact(v_answers) then
    v_name := private.jtext(v_answers, '{contact,name}');
    v_phone := private.jtext(v_answers, '{contact,phone}');
    v_email := private.jtext(v_answers, '{contact,email}');
    if v_phone is null then
      raise exception 'invalid_phone' using errcode = 'P0001';
    end if;
    perform private.assert_inbox_contact(v_name, v_email, v_phone);

    if v_entry is null then
      insert into public.inbox_entries (
        item_id, channel, kind, answers, flow_version,
        contact_name, contact_phone, contact_email, last_step
      )
      values (
        private.find_or_create_open_item(v_name, v_phone, v_email),
        'WEB', 'INTAKE', v_answers, s.flow_version,
        v_name, v_phone, v_email, p_step
      )
      returning id into v_entry;
      v_created := true;
      update private.intake_sessions set entry_id = v_entry where id = s.id;
    else
      update public.inbox_entries
      set answers = v_answers, last_step = p_step
      where id = v_entry;
      perform private.update_entry_contact(v_entry, v_name, v_phone, v_email);
    end if;
    perform private.apply_entry_answers(v_entry);
  elsif v_entry is not null then
    update public.inbox_entries set answers = v_answers, last_step = p_step where id = v_entry;
    perform private.apply_entry_answers(v_entry);
  end if;

  if p_complete then
    if v_entry is null then
      raise exception 'contact_required' using errcode = 'P0001';
    end if;
    update public.inbox_entries
    set completed_at = now(), abandoned_at = null, last_step = p_step
    where id = v_entry;
    update private.intake_sessions set completed_at = now() where id = s.id;
    perform private.finalize_inbox_entry(v_entry);
  end if;

  return jsonb_build_object(
    'entry_created', v_created,
    'has_contact', v_entry is not null,
    'completed', coalesce(p_complete, false)
  );
exception
  when check_violation or numeric_value_out_of_range or string_data_right_truncation
       or invalid_text_representation then
    raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- Form: the one-screen request form's required fields
-- -----------------------------------------------------------------------------
create or replace function public.submit_inbox_form(
  p_kind public.inbox_entry_kind,
  p_answers jsonb,
  p_flow_version text default null,
  p_client_fingerprint text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := private.jtext(p_answers, '{contact,name}');
  v_phone text := private.jtext(p_answers, '{contact,phone}');
  v_email text := private.jtext(p_answers, '{contact,email}');
  v_message text := private.jtext(p_answers, '{message}');
  v_registration text := private.jtext(p_answers, '{vehicle,registration}');
  v_method text := upper(private.jtext(p_answers, '{reach,method}'));
  v_item uuid;
  v_entry uuid;
begin
  if p_kind is null or p_kind not in ('FORM', 'CONTACT_FORM') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  perform private.check_submission_throttle('inbox_form', p_client_fingerprint);
  perform private.assert_inbox_contact(v_name, v_email, v_phone);

  if p_kind = 'FORM' then
    if v_phone is null then
      raise exception 'invalid_phone' using errcode = 'P0001';
    end if;
    if (v_registration is null or private.normalize_registration(v_registration) is null
        or char_length(v_registration) > 20)
       and coalesce(private.jtext(p_answers, '{vehicle,registration_unknown}'), 'false') <> 'true' then
      raise exception 'invalid_registration' using errcode = 'P0001';
    end if;
    if v_method is null or v_method not in ('PHONE', 'WHATSAPP', 'SMS', 'EMAIL') then
      raise exception 'invalid_method' using errcode = 'P0001';
    end if;
    if v_method = 'EMAIL' and v_email is null then
      raise exception 'invalid_email' using errcode = 'P0001';
    end if;
  end if;

  if p_kind = 'CONTACT_FORM' and coalesce(char_length(v_message), 0) not between 1 and 5000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;

  -- Double submit of the same request: return the existing entry.
  select e.id into v_entry
  from public.inbox_entries e
  join public.inbox_items i on i.id = e.item_id
  where e.kind = p_kind
    and e.answers = p_answers
    and e.created_at > now() - interval '10 minutes'
    and (i.phone_normalized = private.normalize_phone(v_phone)
         or i.email_normalized = private.normalize_email(v_email))
  limit 1;
  if found then
    return v_entry;
  end if;

  v_item := private.find_or_create_open_item(v_name, v_phone, v_email);

  insert into public.inbox_entries (
    item_id, channel, kind, answers, flow_version,
    contact_name, contact_phone, contact_email, last_step, completed_at
  )
  values (
    v_item, 'WEB', p_kind, p_answers, nullif(btrim(p_flow_version), ''),
    v_name, v_phone, v_email, 'submitted', now()
  )
  returning id into v_entry;

  perform private.apply_entry_answers(v_entry);
  perform private.finalize_inbox_entry(v_entry);
  return v_entry;
exception
  when check_violation or numeric_value_out_of_range or string_data_right_truncation
       or invalid_text_representation then
    raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifications: one row per request and channel
-- -----------------------------------------------------------------------------
create type public.notification_channel as enum ('TELEGRAM', 'EMAIL');

alter table public.notifications
  add column channel public.notification_channel not null default 'TELEGRAM';
alter table public.notifications alter column channel drop default;
alter table public.notifications drop constraint notifications_entry_id_key;
alter table public.notifications
  add constraint notifications_entry_channel_key unique (entry_id, channel);

comment on table public.notifications is
  'Operator alerts: one row per request and channel (TELEGRAM, EMAIL). An unconfigured channel is recorded as SKIPPED. Failures never affect the request.';

create or replace function private.queue_inbox_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if new.kind not in ('INTAKE', 'FORM', 'CONTACT_FORM') then
    return new;
  end if;

  if new.completed_at is not null
     and (tg_op = 'INSERT' or old.completed_at is null) then
    v_kind := 'NEW_REQUEST';
  elsif new.abandoned_at is not null
     and (tg_op = 'INSERT' or old.abandoned_at is null)
     and new.completed_at is null then
    v_kind := 'ABANDONED_REQUEST';
  else
    return new;
  end if;

  insert into public.notifications (kind, item_id, entry_id, channel)
  select v_kind, new.item_id, new.id, c
  from unnest(enum_range(null::public.notification_channel)) as c
  on conflict (entry_id, channel) do nothing;
  return new;
end;
$$;
