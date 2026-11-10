-- =============================================================================
-- Server-only public submissions + per-client throttling.
--
-- Before: anon could call submit_appointment_request / submit_enquiry directly
-- with the publishable key, skipping the app's spam checks (honeypot, timing).
-- Now: only service_role (the Next.js server, using SUPABASE_SECRET_KEY in
-- Server Actions) can call them, and the server passes a hashed client
-- fingerprint (HMAC of the IP address; the raw IP is never stored) so the
-- database can throttle repeat submissions.
--
-- Function bodies are otherwise unchanged from 20261110000400.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Throttle log (private schema: not exposed by the Data API)
-- -----------------------------------------------------------------------------
create table private.submission_throttle (
  id bigint generated always as identity primary key,
  bucket text not null check (bucket in ('appointment', 'enquiry')),
  fingerprint text not null check (char_length(fingerprint) between 16 and 128),
  created_at timestamptz not null default now()
);

create index submission_throttle_lookup_idx
  on private.submission_throttle (bucket, fingerprint, created_at desc);
create index submission_throttle_created_at_idx
  on private.submission_throttle (created_at);

alter table private.submission_throttle enable row level security;
revoke all on private.submission_throttle from public, anon, authenticated;

-- Max 5 submissions per 10 minutes and 20 per day for one client and form.
create function private.check_submission_throttle(p_bucket text, p_fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_fingerprint is null then
    return;
  end if;

  -- Housekeeping: entries older than a day are no longer needed.
  delete from private.submission_throttle where created_at < now() - interval '1 day';

  if (select count(*) from private.submission_throttle
      where bucket = p_bucket and fingerprint = p_fingerprint
        and created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from private.submission_throttle
         where bucket = p_bucket and fingerprint = p_fingerprint) >= 20 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;

  insert into private.submission_throttle (bucket, fingerprint) values (p_bucket, p_fingerprint);
end;
$$;

revoke all on function private.check_submission_throttle(text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Replace the public functions (new trailing parameter p_client_fingerprint)
-- -----------------------------------------------------------------------------
drop function public.submit_appointment_request(
  text, text, text, text, text, integer, text, uuid, text, date, time, date, time, text, text
);
drop function public.submit_enquiry(text, text, text, text, text);

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
  p_additional_notes text default null,
  p_client_fingerprint text default null
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
  perform private.check_submission_throttle('appointment', p_client_fingerprint);
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

  -- At most 5 new requests per customer per hour.
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
  'Booking request from the website (server only). Always creates a PENDING appointment; it is never a confirmed booking.';

create function public.submit_enquiry(
  p_full_name text,
  p_email text,
  p_message text,
  p_phone text default null,
  p_subject text default null,
  p_client_fingerprint text default null
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
  perform private.check_submission_throttle('enquiry', p_client_fingerprint);
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
  'Contact form from the website (server only). Creates or reuses the customer and stores the enquiry.';

-- -----------------------------------------------------------------------------
-- Privileges: server (service_role) only
-- -----------------------------------------------------------------------------
revoke all on function public.submit_appointment_request(
  text, text, text, text, text, integer, text, uuid, text, date, time, date, time, text, text, text
) from public, anon, authenticated;
grant execute on function public.submit_appointment_request(
  text, text, text, text, text, integer, text, uuid, text, date, time, date, time, text, text, text
) to service_role;

revoke all on function public.submit_enquiry(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_enquiry(text, text, text, text, text, text) to service_role;
