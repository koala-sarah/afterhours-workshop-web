-- =============================================================================
-- Inbox and chat intake (Build 9), part 3: public write path.
--
-- Server-only (service_role) functions, called from Next.js Server Actions
-- after Zod validation and Cloudflare Turnstile verification:
--
--   intake_start(token_hash, fingerprint, flow_version)
--       Creates the anonymous chat session (throttled per client).
--   intake_save_step(token_hash, step, answers, complete)
--       Saves one step. As soon as contact details are present an Inbox
--       entry exists, so an abandoned chat still reaches the operator.
--   submit_inbox_form(kind, answers, flow_version, fingerprint)
--       One-shot: the secondary request form and the contact form.
--
-- Answers are a JSON object; each step writes its own top-level key:
--   symptom  {category, text}        contact {name, phone, email}
--   vehicle  {make, model, year, registration}
--   details  [..]                    drivable "YES" | "NO" | "UNSURE"
--   reach    {method, times[]}       message  "..." (contact form)
-- Values the customer was not sure about are null.
--
-- Errors (SQLSTATE P0001): invalid_name, invalid_email, invalid_phone,
-- invalid_message, invalid_input, invalid_kind, contact_required,
-- session_not_found, session_completed, session_expired, too_many_requests
-- =============================================================================

alter table private.submission_throttle drop constraint submission_throttle_bucket_check;
alter table private.submission_throttle add constraint submission_throttle_bucket_check
  check (bucket in ('appointment', 'enquiry', 'intake', 'inbox_form'));

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Trimmed text at a JSON path; empty -> null.
create function private.jtext(p_json jsonb, p_path text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_json #>> p_path), '');
$$;

-- Contact for an Inbox entry: a name and a phone number or email address
-- (the chat asks for a phone; the contact form may only have an email).
create function private.assert_inbox_contact(p_name text, p_email text, p_phone text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(char_length(btrim(p_name)), 0) not between 1 and 200 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_email is not null and (
       char_length(p_email) > 254
       or btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if p_phone is not null and (
       char_length(p_phone) > 30
       or coalesce(length(private.normalize_phone(p_phone)), 0) not between 7 and 15) then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if p_phone is null and p_email is null then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
end;
$$;

-- True when the answers contain a name and a phone or email.
create function private.answers_have_contact(p_answers jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.jtext(p_answers, '{contact,name}') is not null
     and (private.jtext(p_answers, '{contact,phone}') is not null
          or private.jtext(p_answers, '{contact,email}') is not null);
$$;

-- Copies the answer fields the Inbox card shows into their columns.
create function private.apply_entry_answers(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
  v_year text;
  v_method text;
begin
  select answers into a from public.inbox_entries where id = p_entry_id;
  v_year := private.jtext(a, '{vehicle,year}');
  v_method := upper(private.jtext(a, '{reach,method}'));

  update public.inbox_entries
  set symptom_category = left(private.jtext(a, '{symptom,category}'), 60),
      symptom_text = left(private.jtext(a, '{symptom,text}'), 500),
      drivable = case when upper(private.jtext(a, '{drivable}')) in ('YES', 'NO', 'UNSURE')
                      then upper(private.jtext(a, '{drivable}')) end,
      vehicle_make = left(private.jtext(a, '{vehicle,make}'), 60),
      vehicle_model = left(private.jtext(a, '{vehicle,model}'), 60),
      vehicle_year = case when v_year ~ '^[0-9]{4}$' and v_year::integer between 1900 and 2100
                          then v_year::smallint end,
      vehicle_registration = left(private.jtext(a, '{vehicle,registration}'), 20),
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

-- The open card (NEW or NEEDS_REPLY) for this phone number (or, without a
-- phone, this email), otherwise a new card. A new entry on an existing card
-- brings it back to NEW and to the top of the Inbox.
create function private.find_or_create_open_item(p_name text, p_phone text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := private.normalize_phone(p_phone);
  v_email text := private.normalize_email(p_email);
  v_id uuid;
begin
  -- Two requests from the same number at the same moment share one card.
  perform pg_advisory_xact_lock(hashtext('inbox:' || coalesce(v_phone, v_email, '')));

  if v_phone is not null then
    select id into v_id from public.inbox_items
    where phone_normalized = v_phone and status <> 'DONE'
    order by last_entry_at desc limit 1;
  else
    select id into v_id from public.inbox_items
    where email_normalized = v_email and phone_normalized is null and status <> 'DONE'
    order by last_entry_at desc limit 1;
  end if;

  if v_id is not null then
    update public.inbox_items
    set contact_name = btrim(p_name),
        contact_phone = coalesce(nullif(btrim(p_phone), ''), contact_phone),
        contact_email = coalesce(nullif(btrim(p_email), ''), contact_email),
        last_entry_at = now(),
        status = 'NEW'
    where id = v_id;
    return v_id;
  end if;

  insert into public.inbox_items (contact_name, contact_phone, contact_email)
  values (btrim(p_name), nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Contact details changed on an existing entry (the customer went back and
-- fixed a typo). Keep the card's snapshot current, or move the entry to the
-- right card when the phone number now belongs to another open card.
create function private.update_entry_contact(p_entry_id uuid, p_name text, p_phone text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.inbox_entries;
  v_item public.inbox_items;
  v_others integer;
  v_target uuid;
  v_phone text := private.normalize_phone(p_phone);
  v_email text := private.normalize_email(p_email);
begin
  select * into v_entry from public.inbox_entries where id = p_entry_id;
  select * into v_item from public.inbox_items where id = v_entry.item_id for update;

  update public.inbox_entries
  set contact_name = btrim(p_name),
      contact_phone = nullif(btrim(p_phone), ''),
      contact_email = nullif(btrim(p_email), '')
  where id = p_entry_id;

  if v_phone is not distinct from v_item.phone_normalized
     and (v_phone is not null or v_email is not distinct from v_item.email_normalized) then
    update public.inbox_items
    set contact_name = btrim(p_name),
        contact_email = coalesce(nullif(btrim(p_email), ''), contact_email)
    where id = v_item.id;
    return;
  end if;

  select count(*) into v_others from public.inbox_entries where item_id = v_item.id and id <> p_entry_id;

  -- A card of its own that nobody has acted on: just correct it in place,
  -- unless another open card already has the new number.
  if v_others = 0 and v_item.status = 'NEW' and v_item.appointment_id is null then
    if v_phone is not null then
      select id into v_target from public.inbox_items
      where phone_normalized = v_phone and status <> 'DONE' and id <> v_item.id
      order by last_entry_at desc limit 1;
    end if;
    if v_target is null then
      update public.inbox_items
      set contact_name = btrim(p_name),
          contact_phone = nullif(btrim(p_phone), ''),
          contact_email = nullif(btrim(p_email), '')
      where id = v_item.id;
      return;
    end if;
    update public.inbox_entries set item_id = v_target where id = p_entry_id;
    update public.inbox_items set last_entry_at = now(), status = 'NEW' where id = v_target;
    delete from public.inbox_items where id = v_item.id;
    return;
  end if;

  v_target := private.find_or_create_open_item(p_name, p_phone, p_email);
  update public.inbox_entries set item_id = v_target where id = p_entry_id;
end;
$$;

-- Links a finished (or abandoned) entry to a customer profile and vehicle,
-- reusing existing ones (same matching rules as the other public forms).
create function private.finalize_inbox_entry(p_entry_id uuid)
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

  if e.vehicle_id is null and e.vehicle_make is not null and e.vehicle_model is not null then
    if private.normalize_registration(e.vehicle_registration) is not null then
      v_vehicle := private.find_or_create_vehicle(
        v_customer, e.vehicle_make, e.vehicle_model, e.vehicle_year, e.vehicle_registration, null
      );
    else
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
    update public.inbox_entries set vehicle_id = v_vehicle where id = p_entry_id;
  end if;
end;
$$;

-- History: a new entry on a card.
create function private.on_inbox_entry_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_activity(
    (select customer_id from public.inbox_items where id = new.item_id),
    'INBOX_ITEM', new.item_id, 'inbox.entry_received',
    case new.kind
      when 'INTAKE' then 'Request started in the website chat'
      when 'FORM' then 'Request received from the website form'
      when 'CONTACT_FORM' then 'Message received from the contact form'
      when 'MESSAGE' then 'Message received'
      when 'CALL' then 'Phone call'
      when 'LEGACY' then 'Enquiry (copied from the old enquiries list)'
    end,
    jsonb_build_object('entry_id', new.id, 'kind', new.kind, 'channel', new.channel)
  );
  return new;
end;
$$;

create trigger inbox_entries_log_created
  after insert on public.inbox_entries
  for each row execute function private.on_inbox_entry_created();

-- -----------------------------------------------------------------------------
-- Public (server-only) functions
-- -----------------------------------------------------------------------------

create function public.intake_start(
  p_token_hash text,
  p_client_fingerprint text default null,
  p_flow_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  -- Starting again with the same cookie is a no-op.
  if exists (select 1 from private.intake_sessions where token_hash = p_token_hash) then
    return;
  end if;

  perform private.check_submission_throttle('intake', p_client_fingerprint);

  insert into private.intake_sessions (token_hash, fingerprint, flow_version)
  values (p_token_hash, p_client_fingerprint, nullif(btrim(p_flow_version), ''))
  on conflict (token_hash) do nothing;
exception
  when check_violation or string_data_right_truncation then
    raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;

comment on function public.intake_start is
  'Starts an anonymous chat intake session (server only). The cookie token is stored as a SHA-256 hash.';

create function public.intake_save_step(
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

comment on function public.intake_save_step is
  'Saves one chat intake step (server only). Creates the Inbox entry once contact details are present; never confirms a booking.';

create function public.submit_inbox_form(
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
  if p_kind = 'CONTACT_FORM' and coalesce(char_length(v_message), 0) not between 1 and 5000 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;

  -- Double submit of the same message: return the existing entry.
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

comment on function public.submit_inbox_form is
  'Secondary request form and contact form (server only). Creates a finished Inbox entry; never confirms a booking.';

-- -----------------------------------------------------------------------------
-- Privileges: server (service_role) only
-- -----------------------------------------------------------------------------
revoke all on function private.jtext(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.assert_inbox_contact(text, text, text) from public, anon, authenticated;
revoke all on function private.answers_have_contact(jsonb) from public, anon, authenticated;
revoke all on function private.apply_entry_answers(uuid) from public, anon, authenticated;
revoke all on function private.find_or_create_open_item(text, text, text) from public, anon, authenticated;
revoke all on function private.update_entry_contact(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.finalize_inbox_entry(uuid) from public, anon, authenticated;
revoke all on function private.on_inbox_entry_created() from public, anon, authenticated;

revoke all on function public.intake_start(text, text, text) from public, anon, authenticated;
grant execute on function public.intake_start(text, text, text) to service_role;
revoke all on function public.intake_save_step(text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.intake_save_step(text, text, jsonb, boolean) to service_role;
revoke all on function public.submit_inbox_form(public.inbox_entry_kind, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.submit_inbox_form(public.inbox_entry_kind, jsonb, text, text) to service_role;
