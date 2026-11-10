-- =============================================================================
-- Database security & behaviour checks.
--
-- Runs everything inside one transaction and ROLLS BACK at the end, so it is
-- safe to run against a local database. Do not run it against production.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verify/security_checks.sql
--
-- Any failure raises an exception starting with "FAIL".
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Setup (as the migration owner)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-00000000a001', 'admin@example.com'),
  ('00000000-0000-4000-8000-00000000a002', 'user@example.com');

do $$
begin
  if (select count(*) from public.profiles
      where id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002')) <> 2 then
    raise exception 'FAIL: profiles were not created for new auth users';
  end if;
  if exists (select 1 from public.profiles
             where id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002')
               and role <> 'USER') then
    raise exception 'FAIL: new profiles must default to USER';
  end if;
end $$;

update public.profiles set role = 'ADMIN' where id = '00000000-0000-4000-8000-00000000a001';

-- A weekday at least two days ahead (weekday hours are 17:00-22:00).
select set_config('test.day', (
  select d::date::text
  from generate_series(
    (now() at time zone 'Pacific/Auckland')::date + 2,
    (now() at time zone 'Pacific/Auckland')::date + 10,
    interval '1 day'
  ) as g(d)
  where extract(isodow from d) between 1 and 5
  order by d
  limit 1
), true);
select set_config('test.service', (select id::text from public.services where slug = 'basic'), true);

-- -----------------------------------------------------------------------------
-- 1. Anonymous visitor
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  t text;
  v_id uuid;
  v_id2 uuid;
  v_day date := current_setting('test.day')::date;
  v_service uuid := current_setting('test.service')::uuid;
begin
  -- Cannot read any internal table.
  foreach t in array array['customers', 'vehicles', 'enquiries', 'appointments',
                           'follow_up_tasks', 'activities', 'profiles'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL: anon can read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- Cannot write directly.
  begin
    insert into public.customers (full_name, email) values ('X', 'x@example.com');
    raise exception 'FAIL: anon can insert customers';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.appointments (customer_id, service_id, preferred_date, preferred_time, description)
    values (gen_random_uuid(), v_service, v_day, '18:00', 'x');
    raise exception 'FAIL: anon can insert appointments';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.services set price_label = '$1';
    raise exception 'FAIL: anon can update services';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.business_hours set is_open = false;
    raise exception 'FAIL: anon can update business hours';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate public.appointments;
    raise exception 'FAIL: anon can truncate appointments';
  exception when insufficient_privilege then null;
  end;

  -- Cannot call internal helpers.
  begin
    perform private.find_or_create_customer('X', 'x@example.com', null);
    raise exception 'FAIL: anon can call private helpers';
  exception when insufficient_privilege then null;
  end;

  -- Can read the public catalogue.
  if (select count(*) from public.services) <> 3 then
    raise exception 'FAIL: anon should see 3 active services';
  end if;
  if (select count(*) from public.business_hours) <> 7 then
    raise exception 'FAIL: anon should see 7 business-hours rows';
  end if;

  -- Cannot call the submission functions directly (server only).
  begin
    perform public.submit_enquiry('X', 'x@example.com', 'Hello');
    raise exception 'FAIL: anon can call submit_enquiry directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_appointment_request(
      'X', 'x@example.com', '0211234567', 'Mazda', 'MX-5', 2005, 'ABC123',
      v_service, 'x', v_day, '18:00'
    );
    raise exception 'FAIL: anon can call submit_appointment_request directly';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 1b. Website server (service_role) submitting on behalf of visitors
-- -----------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_id uuid;
  v_id2 uuid;
  i integer;
  v_day date := current_setting('test.day')::date;
  v_service uuid := current_setting('test.service')::uuid;
begin
  -- A booking request.
  v_id := public.submit_appointment_request(
    p_full_name => 'Test Customer',
    p_email => 'Test.Customer@Example.com',
    p_phone => '(027) 770 - 0486',
    p_vehicle_make => 'Mazda',
    p_vehicle_model => 'MX-5',
    p_vehicle_year => 2005,
    p_registration_number => 'abc 123',
    p_service_id => v_service,
    p_description => 'Brake check',
    p_preferred_date => v_day,
    p_preferred_time => '18:00',
    p_client_fingerprint => 'fingerprint-aaaaaaaaaaaaaaaa'
  );
  if v_id is null then raise exception 'FAIL: booking request returned no id'; end if;

  -- The same request again is blocked.
  begin
    perform public.submit_appointment_request(
      'Test Customer', 'test.customer@example.com', '0277700486',
      'Mazda', 'MX-5', 2005, 'ABC-123', v_service, 'Brake check', v_day, '18:00'
    );
    raise exception 'FAIL: duplicate request was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'duplicate_request' then raise exception 'FAIL: expected duplicate_request, got %', sqlerrm; end if;
  end;

  -- Past dates are blocked.
  begin
    perform public.submit_appointment_request(
      'Test Customer', 'test.customer@example.com', '0277700486',
      'Mazda', 'MX-5', 2005, 'ABC123', v_service, 'Brake check', v_day - 30, '18:00'
    );
    raise exception 'FAIL: past date was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'past_date' then raise exception 'FAIL: expected past_date, got %', sqlerrm; end if;
  end;

  -- Outside weekday opening hours is blocked.
  begin
    perform public.submit_appointment_request(
      'Test Customer', 'test.customer@example.com', '0277700486',
      'Mazda', 'MX-5', 2005, 'ABC123', v_service, 'Brake check', v_day, '10:00'
    );
    raise exception 'FAIL: time outside opening hours was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'outside_hours' then raise exception 'FAIL: expected outside_hours, got %', sqlerrm; end if;
  end;

  -- Invalid email is rejected.
  begin
    perform public.submit_enquiry('Someone', 'not-an-email', 'Hello');
    raise exception 'FAIL: invalid email was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_email' then raise exception 'FAIL: expected invalid_email, got %', sqlerrm; end if;
  end;

  -- A second request from the same person (different formatting) is accepted.
  perform public.submit_appointment_request(
    'Test Customer', '  TEST.customer@example.com ', '+64 27 770 0486',
    'Mazda', 'MX-5', 2005, 'ABC-123', v_service, 'Oil change', v_day, '19:00'
  );

  -- Enquiry, and a double submit returns the same enquiry.
  v_id := public.submit_enquiry('Test Customer', 'test.customer@example.com', 'Do you service rotary engines?');
  v_id2 := public.submit_enquiry('Test Customer', 'test.customer@example.com', 'Do you service rotary engines?');
  if v_id <> v_id2 then raise exception 'FAIL: double-submitted enquiry created a second row'; end if;

  -- Per-client throttle: 5 enquiries per 10 minutes from one fingerprint
  -- (different people, so the per-customer limit is not what triggers).
  for i in 1..5 loop
    perform public.submit_enquiry(
      'Spam ' || i, 'spam' || i || '@example.com', 'Message ' || i,
      p_client_fingerprint => 'fingerprint-bbbbbbbbbbbbbbbb'
    );
  end loop;
  begin
    perform public.submit_enquiry('Spam 6', 'spam6@example.com', 'Message 6',
      p_client_fingerprint => 'fingerprint-bbbbbbbbbbbbbbbb');
    raise exception 'FAIL: 6th submission from one client was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'too_many_requests' then raise exception 'FAIL: expected too_many_requests, got %', sqlerrm; end if;
  end;
  -- Another client is not affected.
  perform public.submit_enquiry('Other', 'other.client@example.com', 'Hello',
    p_client_fingerprint => 'fingerprint-cccccccccccccccc');
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 2. Signed-in user who is NOT an admin
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a002"}', true);

do $$
begin
  if (select count(*) from public.customers) <> 0 then raise exception 'FAIL: non-admin can read customers'; end if;
  if (select count(*) from public.appointments) <> 0 then raise exception 'FAIL: non-admin can read appointments'; end if;
  if (select count(*) from public.enquiries) <> 0 then raise exception 'FAIL: non-admin can read enquiries'; end if;
  if (select count(*) from public.activities) <> 0 then raise exception 'FAIL: non-admin can read activities'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: non-admin should only see their own profile'; end if;

  begin
    insert into public.customers (full_name, email) values ('X', 'x@example.com');
    raise exception 'FAIL: non-admin can insert customers';
  exception when insufficient_privilege then null;
  end;

  -- Updates silently match no rows under RLS.
  update public.appointments set admin_notes = 'tampered';
  if found then raise exception 'FAIL: non-admin updated appointments'; end if;
  update public.customers set notes = 'tampered';
  if found then raise exception 'FAIL: non-admin updated customers'; end if;
  update public.services set price_label = '$1';
  if found then raise exception 'FAIL: non-admin updated services'; end if;

  -- Cannot promote themselves.
  begin
    update public.profiles set role = 'ADMIN' where id = '00000000-0000-4000-8000-00000000a002';
    raise exception 'FAIL: user changed their own role';
  exception when insufficient_privilege then null;
  end;

  -- Can change their own display name.
  update public.profiles set full_name = 'Renamed' where id = '00000000-0000-4000-8000-00000000a002';
  if not found then raise exception 'FAIL: user cannot update own name'; end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 3. Admin
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a001"}', true);

do $$
declare
  v_customer uuid;
  v_appt uuid;
  v_task uuid;
  v_start timestamptz;
  v_day date := current_setting('test.day')::date;
begin
  -- Customer reused across submissions (email case/spaces, phone formats).
  if (select count(*) from public.customers where email_normalized = 'test.customer@example.com') <> 1 then
    raise exception 'FAIL: customer was not reused';
  end if;
  select id into v_customer from public.customers where email_normalized = 'test.customer@example.com';

  if (select phone_normalized from public.customers where id = v_customer) <> '0277700486' then
    raise exception 'FAIL: phone not normalised';
  end if;
  if (select count(*) from public.vehicles where customer_id = v_customer) <> 1 then
    raise exception 'FAIL: vehicle was not reused (abc 123 vs ABC-123)';
  end if;
  if (select count(*) from public.appointments where customer_id = v_customer) <> 2 then
    raise exception 'FAIL: expected 2 appointment requests';
  end if;
  if exists (select 1 from public.appointments where customer_id = v_customer and status <> 'PENDING') then
    raise exception 'FAIL: new requests must be PENDING';
  end if;
  if (select count(*) from public.enquiries where customer_id = v_customer) <> 1 then
    raise exception 'FAIL: expected 1 enquiry';
  end if;

  -- Automation: enquiry -> follow-up task, and activity history.
  if (select count(*) from public.follow_up_tasks where customer_id = v_customer and enquiry_id is not null) <> 1 then
    raise exception 'FAIL: enquiry did not create a follow-up task';
  end if;
  if (select count(*) from public.activities where customer_id = v_customer and activity_type = 'appointment.requested') <> 2
     or (select count(*) from public.activities where customer_id = v_customer and activity_type = 'enquiry.received') <> 1
     or (select count(*) from public.activities where customer_id = v_customer and activity_type = 'customer.created') <> 1 then
    raise exception 'FAIL: activity history incomplete';
  end if;

  -- Approval without a confirmed slot is rejected by the schema.
  select id into v_appt from public.appointments where customer_id = v_customer and preferred_time = '18:00';
  begin
    update public.appointments set status = 'APPROVED' where id = v_appt;
    raise exception 'FAIL: approved without a scheduled slot';
  exception when check_violation then null;
  end;

  -- Proper approval.
  v_start := (v_day + time '18:00') at time zone 'Pacific/Auckland';
  update public.appointments
  set status = 'APPROVED',
      scheduled_start = v_start,
      scheduled_end = v_start + interval '60 minutes',
      approved_at = now(),
      approved_by = '00000000-0000-4000-8000-00000000a001'
  where id = v_appt;

  if not exists (
    select 1 from public.activities
    where related_id = v_appt and activity_type = 'appointment.status_changed'
      and created_by = '00000000-0000-4000-8000-00000000a001'
  ) then
    raise exception 'FAIL: approval not recorded in activity history with the admin';
  end if;

  -- Activity history is append-only, even for admins.
  begin
    update public.activities set description = 'edited';
    raise exception 'FAIL: admin can edit activity history';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.activities;
    raise exception 'FAIL: admin can delete activity history';
  exception when insufficient_privilege then null;
  end;

  -- Admins cannot change roles through the API either.
  begin
    update public.profiles set role = 'USER' where id = '00000000-0000-4000-8000-00000000a001';
    raise exception 'FAIL: role changed through the API';
  exception when insufficient_privilege then null;
  end;

  -- Completing a task stamps completed_at automatically.
  select id into v_task from public.follow_up_tasks where customer_id = v_customer limit 1;
  update public.follow_up_tasks set status = 'COMPLETED' where id = v_task;
  if (select completed_at from public.follow_up_tasks where id = v_task) is null then
    raise exception 'FAIL: completed_at not set';
  end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 4. Approved slot is no longer offered to other customers
-- -----------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
begin
  perform public.submit_appointment_request(
    'Other Person', 'other@example.com', '021 111 2222',
    'Toyota', 'Corolla', 2010, 'XYZ789', current_setting('test.service')::uuid,
    'Service', current_setting('test.day')::date, '18:30'
  );
  raise exception 'FAIL: request overlapping an approved booking was accepted';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'slot_unavailable' then raise exception 'FAIL: expected slot_unavailable, got %', sqlerrm; end if;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 5. Appointment management (approve / decline / propose / status / notes)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a001"}', true);

do $$
declare
  v_first uuid;
  v_second uuid;
  v_day date := current_setting('test.day')::date;
  v_admin uuid := '00000000-0000-4000-8000-00000000a001';
begin
  select a.id into v_first from public.appointments a join public.customers c on c.id = a.customer_id
  where c.email_normalized = 'test.customer@example.com' and a.preferred_time = '18:00';
  select a.id into v_second from public.appointments a join public.customers c on c.id = a.customer_id
  where c.email_normalized = 'test.customer@example.com' and a.preferred_time = '19:00';

  -- The list view works for admins.
  if (select count(*) from public.admin_appointments where email_normalized = 'test.customer@example.com') <> 2 then
    raise exception 'FAIL: admin_appointments view should show 2 rows';
  end if;

  -- Approving a slot that overlaps an approved booking is refused (18:00-19:00 is taken).
  begin
    perform public.approve_appointment(v_second, v_day, '18:30');
    raise exception 'FAIL: overlapping approval was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'slot_conflict' then raise exception 'FAIL: expected slot_conflict, got %', sqlerrm; end if;
  end;

  -- Approving a free slot records time, admin and activity (with the note).
  perform public.approve_appointment(v_second, v_day, '19:00', null, 'Confirmed by phone');
  if not exists (select 1 from public.appointments where id = v_second and status = 'APPROVED'
                 and approved_by = v_admin and approved_at is not null
                 and scheduled_end - scheduled_start = interval '60 minutes') then
    raise exception 'FAIL: approval did not record slot / admin / timestamp';
  end if;
  if not exists (select 1 from public.activities where related_id = v_second
                 and activity_type = 'appointment.status_changed' and created_by = v_admin
                 and description like 'Appointment approved for % - Confirmed by phone') then
    raise exception 'FAIL: approval activity missing or without note';
  end if;

  -- The conflict check also applies to a direct UPDATE (no bypass).
  begin
    update public.appointments
    set scheduled_start = scheduled_start - interval '30 minutes',
        scheduled_end = scheduled_end - interval '30 minutes'
    where id = v_second;
    raise exception 'FAIL: direct update into an overlapping slot was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'slot_conflict' then raise exception 'FAIL: expected slot_conflict on update, got %', sqlerrm; end if;
  end;

  -- Internal note.
  perform public.add_appointment_note(v_second, 'Customer will drop off keys');
  if not exists (select 1 from public.activities where related_id = v_second
                 and activity_type = 'appointment.note' and created_by = v_admin) then
    raise exception 'FAIL: note not recorded';
  end if;

  -- Status changes follow the allowed transitions.
  perform public.update_appointment_status(v_first, 'COMPLETED');
  begin
    perform public.update_appointment_status(v_first, 'PENDING');
    raise exception 'FAIL: COMPLETED -> PENDING was allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_transition' then raise exception 'FAIL: expected invalid_transition, got %', sqlerrm; end if;
  end;
  begin
    update public.appointments set status = 'DECLINED' where id = v_first;
    raise exception 'FAIL: direct COMPLETED -> DECLINED was allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_transition' then raise exception 'FAIL: expected invalid_transition, got %', sqlerrm; end if;
  end;

  -- Propose a different time for the approved booking, then cancel it.
  perform public.propose_appointment_time(v_second, v_day, '20:00', null, 'Can you come at 8?');
  if not exists (select 1 from public.appointments where id = v_second
                 and status = 'RESCHEDULE_REQUESTED' and proposed_start is not null) then
    raise exception 'FAIL: proposal not stored';
  end if;
  perform public.update_appointment_status(v_second, 'CANCELLED', 'Customer cancelled');
  if not exists (select 1 from public.activities where related_id = v_second
                 and description = 'Appointment cancelled - Customer cancelled') then
    raise exception 'FAIL: cancellation activity missing';
  end if;
end $$;

reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a002"}', true);

do $$
begin
  if (select count(*) from public.admin_appointments) <> 0 then
    raise exception 'FAIL: non-admin can see admin_appointments';
  end if;
  begin
    perform public.approve_appointment(gen_random_uuid(), current_date + 7, '18:00');
    raise exception 'FAIL: non-admin could call approve_appointment';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'forbidden' then raise exception 'FAIL: expected forbidden, got %', sqlerrm; end if;
  end;
  begin
    perform public.decline_appointment(gen_random_uuid(), 'x');
    raise exception 'FAIL: non-admin could call decline_appointment';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'forbidden' then raise exception 'FAIL: expected forbidden, got %', sqlerrm; end if;
  end;
end $$;

reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform public.approve_appointment(gen_random_uuid(), current_date + 7, '18:00');
    raise exception 'FAIL: anon could call approve_appointment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.admin_appointments limit 1;
    raise exception 'FAIL: anon can read admin_appointments';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

select 'ALL SECURITY CHECKS PASSED' as result;

rollback;
