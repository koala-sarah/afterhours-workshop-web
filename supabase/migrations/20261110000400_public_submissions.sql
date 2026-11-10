-- =============================================================================
-- Public write path.
--
-- Website visitors (anon) cannot read or write any internal table directly.
-- They can only call these two functions, which validate the input, reuse an
-- existing customer (normalised email, then phone) and insert the request in
-- one transaction. Nothing is returned except the new record's id.
--
-- Errors are raised with SQLSTATE P0001 and a short machine-readable message
-- that the app maps to user-facing text:
--   invalid_name, invalid_email, invalid_phone, invalid_vehicle, invalid_service,
--   invalid_description, invalid_message, invalid_date, invalid_input,
--   past_date, closed_day, outside_hours, slot_unavailable,
--   duplicate_request, too_many_requests
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal helpers
-- -----------------------------------------------------------------------------

-- True when fewer than max_concurrent_appointments APPROVED bookings overlap the slot.
create function private.slot_has_capacity(
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_appointment_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < coalesce(
    (select s.max_concurrent_appointments from public.business_settings s limit 1),
    1
  )
  from public.appointments a
  where a.status = 'APPROVED'
    and (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
    and tstzrange(a.scheduled_start, a.scheduled_end) && tstzrange(p_start, p_end);
$$;

-- Validates a requested local date/time against the clock, opening hours and
-- approved bookings. Availability is provisional: passing this check never
-- confirms anything.
create function private.assert_requested_slot(p_date date, p_time time)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.business_settings;
  v_hours public.business_hours;
  v_start timestamptz;
begin
  select * into v_settings from public.business_settings limit 1;
  v_start := (p_date + p_time) at time zone coalesce(v_settings.timezone, 'Pacific/Auckland');

  if v_start <= now() then
    raise exception 'past_date' using errcode = 'P0001';
  end if;

  select * into v_hours
  from public.business_hours
  where day_of_week = extract(dow from p_date)::smallint;

  if not found or not v_hours.is_open then
    raise exception 'closed_day' using errcode = 'P0001';
  end if;

  -- Hours not configured for this day yet: skip the time-of-day check.
  if v_hours.open_time is not null
     and (p_time < v_hours.open_time or p_time >= v_hours.close_time) then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;

  if not private.slot_has_capacity(
    v_start,
    v_start + make_interval(mins => coalesce(v_settings.appointment_duration_minutes, 60))
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
end;
$$;

-- Returns the existing customer for this email (or, when no email is on file,
-- this phone number), otherwise creates one. Never overwrites a stored name.
create function private.find_or_create_customer(
  p_full_name text,
  p_email text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := private.normalize_email(p_email);
  v_phone text := private.normalize_phone(p_phone);
begin
  if v_email is not null then
    select id into v_id from public.customers where email_normalized = v_email;
    if found then
      -- Fill in a missing phone number, never replace an existing one.
      update public.customers
      set phone = nullif(btrim(p_phone), '')
      where id = v_id and phone is null and v_phone is not null;
      return v_id;
    end if;
  end if;

  if v_phone is not null then
    -- Only match on phone when that customer has no email on file, so two
    -- people sharing a phone number are not merged.
    select id into v_id
    from public.customers
    where phone_normalized = v_phone and email_normalized is null
    order by created_at
    limit 1;
    if found then
      update public.customers
      set email = btrim(p_email)
      where id = v_id and v_email is not null;
      return v_id;
    end if;
  end if;

  insert into public.customers (full_name, email, phone)
  values (btrim(p_full_name), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''))
  -- Two submissions with the same new email at the same moment.
  on conflict (email_normalized) where email_normalized is not null
  do update set updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- Returns the customer's vehicle with this registration, otherwise creates one.
create function private.find_or_create_vehicle(
  p_customer_id uuid,
  p_make text,
  p_model text,
  p_year integer,
  p_registration_number text,
  p_additional_information text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_registration text := private.normalize_registration(p_registration_number);
begin
  if v_registration is not null then
    select id into v_id
    from public.vehicles
    where customer_id = p_customer_id and registration_normalized = v_registration;
    if found then
      -- Only fill gaps; admin-edited details are kept.
      update public.vehicles
      set year = coalesce(year, p_year::smallint),
          additional_information = coalesce(additional_information, nullif(btrim(p_additional_information), ''))
      where id = v_id;
      return v_id;
    end if;
  end if;

  insert into public.vehicles (customer_id, make, model, year, registration_number, additional_information)
  values (
    p_customer_id,
    btrim(p_make),
    btrim(p_model),
    p_year::smallint,
    nullif(btrim(p_registration_number), ''),
    nullif(btrim(p_additional_information), '')
  )
  on conflict (customer_id, registration_normalized) where registration_normalized is not null
  do update set updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- Shared contact validation for both public functions.
create function private.assert_contact(p_full_name text, p_email text, p_phone text, p_phone_required boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(char_length(btrim(p_full_name)), 0) not between 1 and 200 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if private.normalize_email(p_email) is null
     or char_length(p_email) > 254
     or btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if (p_phone_required and private.normalize_phone(p_phone) is null)
     or (p_phone is not null and btrim(p_phone) <> '' and (
          char_length(p_phone) > 30
          or length(private.normalize_phone(p_phone)) not between 7 and 15
        )) then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public functions (callable with the anon key via supabase.rpc)
-- -----------------------------------------------------------------------------

create function public.submit_appointment_request(
  p_full_name text,
  p_email text,
  p_phone text,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_year integer,
  p_registration_number text,
  p_service_id uuid,
  p_description text,
  p_preferred_date date,
  p_preferred_time time,
  p_alternative_date date default null,
  p_alternative_time time default null,
  p_vehicle_information text default null,
  p_additional_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_appointment_id uuid;
begin
  perform private.assert_contact(p_full_name, p_email, p_phone, true);

  if coalesce(char_length(btrim(p_vehicle_make)), 0) = 0
     or coalesce(char_length(btrim(p_vehicle_model)), 0) = 0
     or private.normalize_registration(p_registration_number) is null
     or p_vehicle_year is null then
    raise exception 'invalid_vehicle' using errcode = 'P0001';
  end if;

  if p_service_id is null
     or not exists (select 1 from public.services where id = p_service_id and is_active) then
    raise exception 'invalid_service' using errcode = 'P0001';
  end if;

  if coalesce(char_length(btrim(p_description)), 0) = 0 then
    raise exception 'invalid_description' using errcode = 'P0001';
  end if;

  if p_preferred_date is null or p_preferred_time is null
     or (p_alternative_date is null) <> (p_alternative_time is null) then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;

  perform private.assert_requested_slot(p_preferred_date, p_preferred_time);
  if p_alternative_date is not null then
    perform private.assert_requested_slot(p_alternative_date, p_alternative_time);
  end if;

  v_customer_id := private.find_or_create_customer(p_full_name, p_email, p_phone);

  -- Simple abuse guard: at most 5 new requests per customer per hour.
  if (select count(*) from public.appointments
      where customer_id = v_customer_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;

  v_vehicle_id := private.find_or_create_vehicle(
    v_customer_id, p_vehicle_make, p_vehicle_model, p_vehicle_year,
    p_registration_number, p_vehicle_information
  );

  insert into public.appointments (
    customer_id, vehicle_id, service_id, source,
    preferred_date, preferred_time, alternative_date, alternative_time,
    description, additional_notes
  )
  values (
    v_customer_id, v_vehicle_id, p_service_id, 'WEBSITE',
    p_preferred_date, p_preferred_time, p_alternative_date, p_alternative_time,
    btrim(p_description), nullif(btrim(p_additional_notes), '')
  )
  returning id into v_appointment_id;

  return v_appointment_id;
exception
  when unique_violation then
    raise exception 'duplicate_request' using errcode = 'P0001';
  when check_violation or numeric_value_out_of_range or string_data_right_truncation then
    raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;

comment on function public.submit_appointment_request is
  'Public booking request. Always creates a PENDING appointment; it is never a confirmed booking.';

create function public.submit_enquiry(
  p_full_name text,
  p_email text,
  p_message text,
  p_phone text default null,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_enquiry_id uuid;
begin
  perform private.assert_contact(p_full_name, p_email, p_phone, false);

  if coalesce(char_length(btrim(p_message)), 0) = 0 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;

  v_customer_id := private.find_or_create_customer(p_full_name, p_email, p_phone);

  -- Double submit of the same message: return the existing enquiry.
  select id into v_enquiry_id
  from public.enquiries
  where customer_id = v_customer_id
    and btrim(message) = btrim(p_message)
    and created_at > now() - interval '10 minutes'
  limit 1;
  if found then
    return v_enquiry_id;
  end if;

  if (select count(*) from public.enquiries
      where customer_id = v_customer_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;

  insert into public.enquiries (customer_id, subject, message, source)
  values (v_customer_id, nullif(btrim(p_subject), ''), btrim(p_message), 'WEBSITE')
  returning id into v_enquiry_id;

  return v_enquiry_id;
exception
  when check_violation or numeric_value_out_of_range or string_data_right_truncation then
    raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;

comment on function public.submit_enquiry is
  'Public contact form. Creates or reuses the customer and stores the enquiry.';

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.slot_has_capacity(timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.assert_requested_slot(date, time) from public, anon, authenticated;
revoke all on function private.find_or_create_customer(text, text, text) from public, anon, authenticated;
revoke all on function private.find_or_create_vehicle(uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function private.assert_contact(text, text, text, boolean) from public, anon, authenticated;

revoke all on function public.submit_appointment_request(
  text, text, text, text, text, integer, text, uuid, text, date, time, date, time, text, text
) from public;
grant execute on function public.submit_appointment_request(
  text, text, text, text, text, integer, text, uuid, text, date, time, date, time, text, text
) to anon, authenticated, service_role;

revoke all on function public.submit_enquiry(text, text, text, text, text) from public;
grant execute on function public.submit_enquiry(text, text, text, text, text)
  to anon, authenticated, service_role;
