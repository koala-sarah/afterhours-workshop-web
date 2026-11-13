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

  -- Enquiries are legacy: they no longer create follow-up tasks (the Inbox
  -- replaces them). Activity history is still written.
  if exists (select 1 from public.follow_up_tasks where customer_id = v_customer) then
    raise exception 'FAIL: enquiry still creates a follow-up task';
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

  -- Completing a task stamps completed_at automatically (table kept for later).
  insert into public.follow_up_tasks (customer_id, title, due_at)
  values (v_customer, 'Check back', now() + interval '1 day')
  returning id into v_task;
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

-- -----------------------------------------------------------------------------
-- 6. Customer and vehicle management
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a001"}', true);

do $$
declare
  v_admin uuid := '00000000-0000-4000-8000-00000000a001';
  v_customer uuid;
  v_other uuid;
  v_appt uuid;
  v_new_vehicle uuid;
  v_other_vehicle uuid;
begin
  select id into v_customer from public.customers where email_normalized = 'test.customer@example.com';
  select a.id into v_appt from public.appointments a
  where a.customer_id = v_customer and a.preferred_time = '18:00';

  -- The list view shows vehicles and appointment counts, searchable by plate.
  if not exists (select 1 from public.admin_customers where id = v_customer
                 and vehicle_count = 1 and appointment_count = 2 and registrations like '%ABC123%') then
    raise exception 'FAIL: admin_customers view row is wrong';
  end if;

  -- Editing a customer is recorded (field names only).
  update public.customers set phone = '021 555 0000' where id = v_customer;
  if not exists (select 1 from public.activities where customer_id = v_customer
                 and activity_type = 'customer.updated' and created_by = v_admin
                 and description = 'Customer details updated: phone') then
    raise exception 'FAIL: customer edit not recorded in activity history';
  end if;

  -- Adding and editing a vehicle is recorded.
  insert into public.vehicles (customer_id, make, model, year, registration_number)
  values (v_customer, 'Mazda', 'MX-5', 1994, 'xyz 789')
  returning id into v_new_vehicle;
  update public.vehicles set model = 'MX-5 Miata' where id = v_new_vehicle;
  if (select count(*) from public.activities where related_id = v_new_vehicle and created_by = v_admin
      and activity_type in ('vehicle.added', 'vehicle.updated')) <> 2 then
    raise exception 'FAIL: vehicle add / edit not recorded';
  end if;

  -- The same customer can't have the same plate twice.
  begin
    insert into public.vehicles (customer_id, make, model, registration_number)
    values (v_customer, 'Mazda', 'MX-5', 'XYZ-789');
    raise exception 'FAIL: duplicate registration for one customer was accepted';
  exception when unique_violation then null;
  end;

  -- A vehicle can't be moved to another customer.
  insert into public.customers (full_name, email) values ('Other Customer', 'other.customer@example.com')
  returning id into v_other;
  insert into public.vehicles (customer_id, make, model, registration_number)
  values (v_other, 'Honda', 'Civic', 'OTH1')
  returning id into v_other_vehicle;
  begin
    update public.vehicles set customer_id = v_other where id = v_new_vehicle;
    raise exception 'FAIL: vehicle moved to another customer';
  exception when insufficient_privilege then null;
  end;

  -- Two customers can't share an email address.
  begin
    update public.customers set email = ' Test.Customer@Example.com ' where id = v_other;
    raise exception 'FAIL: duplicate customer email was accepted';
  exception when unique_violation then null;
  end;

  -- An appointment can only be linked to its own customer's vehicle.
  begin
    perform public.set_appointment_vehicle(v_appt, v_other_vehicle);
    raise exception 'FAIL: linked appointment to another customer''s vehicle';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'vehicle_mismatch' then raise exception 'FAIL: expected vehicle_mismatch, got %', sqlerrm; end if;
  end;
  begin
    update public.appointments set vehicle_id = v_other_vehicle where id = v_appt;
    raise exception 'FAIL: direct update linked another customer''s vehicle';
  exception when foreign_key_violation then null;
  end;

  perform public.set_appointment_vehicle(v_appt, v_new_vehicle);
  if not exists (select 1 from public.appointments where id = v_appt and vehicle_id = v_new_vehicle) then
    raise exception 'FAIL: appointment vehicle not changed';
  end if;
  if not exists (select 1 from public.activities where related_id = v_appt and created_by = v_admin
                 and activity_type = 'appointment.vehicle_changed'
                 and description = 'Vehicle changed to Mazda MX-5 Miata (XYZ789)') then
    raise exception 'FAIL: vehicle change not recorded';
  end if;

  -- Internal customer note.
  insert into public.activities (customer_id, related_type, related_id, activity_type, description, created_by)
  values (v_customer, 'CUSTOMER', v_customer, 'customer.note', 'Prefers text messages', v_admin);
end $$;

reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a002"}', true);

do $$
begin
  if (select count(*) from public.admin_customers) <> 0 then
    raise exception 'FAIL: non-admin can see admin_customers';
  end if;
  begin
    perform public.set_appointment_vehicle(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL: non-admin could call set_appointment_vehicle';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'forbidden' then raise exception 'FAIL: expected forbidden, got %', sqlerrm; end if;
  end;
  update public.vehicles set model = 'hacked';
  if found then raise exception 'FAIL: non-admin updated vehicles'; end if;
end $$;

reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.admin_customers limit 1;
    raise exception 'FAIL: anon can read admin_customers';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_appointment_vehicle(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL: anon could call set_appointment_vehicle';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- -----------------------------------------------------------------------------
-- 7. Inbox and chat intake
-- -----------------------------------------------------------------------------

-- 7a. Anonymous visitor: no access to the Inbox or the intake path.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  t text;
begin
  foreach t in array array['inbox_items', 'inbox_entries', 'admin_inbox', 'notifications'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL: anon can read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform 1 from private.intake_sessions limit 1;
    raise exception 'FAIL: anon can read intake sessions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.intake_start(repeat('a', 64));
    raise exception 'FAIL: anon can call intake_start directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.intake_save_step(repeat('a', 64), 'contact', '{}'::jsonb);
    raise exception 'FAIL: anon can call intake_save_step directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_inbox_form('CONTACT_FORM', '{}'::jsonb);
    raise exception 'FAIL: anon can call submit_inbox_form directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_notifications(1);
    raise exception 'FAIL: anon can claim notifications';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.run_intake_maintenance();
    raise exception 'FAIL: anon can run maintenance';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_inbox_status(gen_random_uuid(), 'DONE');
    raise exception 'FAIL: anon can call set_inbox_status';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.approve_from_inbox(gen_random_uuid(), current_date + 2, '19:00');
    raise exception 'FAIL: anon can call approve_from_inbox';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- 7b. Website server: chat intake, saved at every step.
-- Nobody, not even service_role, can read intake sessions directly; only the
-- intake functions use them. Granted here for the assertions only (rolled back).
grant select on private.intake_sessions to service_role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  h1 text := repeat('1', 64);
  h2 text := repeat('2', 64);
  h3 text := repeat('3', 64);
  h4 text := repeat('4', 64);
  v_result jsonb;
  v_entry public.inbox_entries;
  v_item uuid;
  v_id uuid;
  v_id2 uuid;
  i integer;
begin
  perform public.intake_start(h1, 'fp-intake-0000000001', 'v1');
  perform public.intake_start(h1, 'fp-intake-0000000001', 'v1'); -- same cookie: no-op
  if (select count(*) from private.intake_sessions where token_hash = h1) <> 1 then
    raise exception 'FAIL: intake session not created once';
  end if;

  begin
    perform public.intake_start('not-a-hash');
    raise exception 'FAIL: bad token accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_input' then raise exception 'FAIL: expected invalid_input, got %', sqlerrm; end if;
  end;

  -- Step 1 (no contact yet): saved on the session only.
  v_result := public.intake_save_step(h1, 'symptom', '{"symptom":{"category":"brakes","text":"grinding noise"}}');
  if (v_result ->> 'has_contact')::boolean then
    raise exception 'FAIL: entry created before contact details';
  end if;
  if (select answers #>> '{symptom,category}' from private.intake_sessions where token_hash = h1) <> 'brakes' then
    raise exception 'FAIL: step 1 not saved';
  end if;

  -- Invalid contact is refused.
  begin
    perform public.intake_save_step(h1, 'contact', '{"contact":{"name":"Kiri Tane","phone":"12"}}');
    raise exception 'FAIL: invalid phone accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_phone' then raise exception 'FAIL: expected invalid_phone, got %', sqlerrm; end if;
  end;

  -- Step 2 (contact): the Inbox entry exists from now on.
  v_result := public.intake_save_step(h1, 'contact', '{"contact":{"name":"Kiri Tane","phone":"021 555 1234","email":null}}');
  if not (v_result ->> 'entry_created')::boolean then
    raise exception 'FAIL: entry not created at the contact step';
  end if;
  select e.* into v_entry from public.inbox_entries e
  join private.intake_sessions s on s.entry_id = e.id where s.token_hash = h1;
  if v_entry.kind <> 'INTAKE' or v_entry.channel <> 'WEB' or v_entry.symptom_category <> 'brakes'
     or v_entry.contact_phone <> '021 555 1234' or v_entry.flow_version <> 'v1' then
    raise exception 'FAIL: entry fields wrong after contact step';
  end if;
  if (select status from public.inbox_items where id = v_entry.item_id) <> 'NEW' then
    raise exception 'FAIL: new card is not NEW';
  end if;
  if exists (select 1 from public.notifications where entry_id = v_entry.id) then
    raise exception 'FAIL: notification queued before the request finished';
  end if;

  perform public.intake_save_step(h1, 'vehicle',
    '{"vehicle":{"make":"Toyota","model":"Corolla","year":"2012","registration":"kir 123"}}');
  perform public.intake_save_step(h1, 'details', '{"details":["when braking"]}');
  perform public.intake_save_step(h1, 'drivable', '{"drivable":"NO"}');
  v_result := public.intake_save_step(h1, 'reach',
    '{"reach":{"method":"WHATSAPP","times":["Weekday evening","Saturday"]}}', true);

  select * into v_entry from public.inbox_entries where id = v_entry.id;
  if v_entry.vehicle_make <> 'Toyota' or v_entry.vehicle_year <> 2012 or v_entry.drivable <> 'NO'
     or v_entry.preferred_method <> 'WHATSAPP' or v_entry.preferred_times <> array['Weekday evening', 'Saturday']
     or v_entry.last_step <> 'reach' or v_entry.completed_at is null then
    raise exception 'FAIL: answers not copied to the entry: %', row_to_json(v_entry);
  end if;
  -- Finished: linked to a customer and vehicle, one notification queued.
  if (select customer_id from public.inbox_items where id = v_entry.item_id) is null
     or v_entry.vehicle_id is null then
    raise exception 'FAIL: finished request not linked to customer / vehicle';
  end if;
  -- One alert per channel (Telegram, email).
  if (select count(*) from public.notifications where entry_id = v_entry.id and kind = 'NEW_REQUEST') <> 2 then
    raise exception 'FAIL: finished request did not queue one notification';
  end if;

  begin
    perform public.intake_save_step(h1, 'reach', '{}');
    raise exception 'FAIL: saved after completion';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'session_completed' then raise exception 'FAIL: expected session_completed, got %', sqlerrm; end if;
  end;
  begin
    perform public.intake_save_step(repeat('9', 64), 'symptom', '{}');
    raise exception 'FAIL: unknown session accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'session_not_found' then raise exception 'FAIL: expected session_not_found, got %', sqlerrm; end if;
  end;

  -- Finishing without contact details is refused.
  perform public.intake_start(h2, 'fp-intake-0000000002', 'v1');
  begin
    perform public.intake_save_step(h2, 'symptom', '{"symptom":{"category":null}}', true);
    raise exception 'FAIL: finished without contact details';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'contact_required' then raise exception 'FAIL: expected contact_required, got %', sqlerrm; end if;
  end;

  -- Same phone (different format) while the card is open: same card, back to NEW.
  v_item := v_entry.item_id;
  update public.inbox_items set status = 'NEEDS_REPLY' where id = v_item;
  perform public.intake_start(h3, 'fp-intake-0000000003', 'v1');
  perform public.intake_save_step(h3, 'contact', '{"contact":{"name":"Kiri","phone":"+64 21 555 1234"}}');
  if (select count(*) from public.inbox_items where phone_normalized = '0215551234') <> 1
     or (select count(*) from public.inbox_entries where item_id = v_item) <> 2
     or (select status from public.inbox_items where id = v_item) <> 'NEW' then
    raise exception 'FAIL: same phone not grouped onto the open card';
  end if;

  -- The customer fixes a typo in their number: the card follows, nothing is left behind.
  perform public.intake_start(h4, 'fp-intake-0000000004', 'v1');
  perform public.intake_save_step(h4, 'contact', '{"contact":{"name":"Ana","phone":"022 111 1111"}}');
  perform public.intake_save_step(h4, 'contact', '{"contact":{"name":"Ana","phone":"022 222 2222"}}');
  if exists (select 1 from public.inbox_items where phone_normalized = '0221111111')
     or (select count(*) from public.inbox_items where phone_normalized = '0222222222') <> 1 then
    raise exception 'FAIL: corrected phone left a stray card';
  end if;
  -- ... and when the corrected number already has an open card, the entry moves there.
  perform public.intake_save_step(h4, 'contact', '{"contact":{"name":"Ana","phone":"021 555 1234"}}');
  if exists (select 1 from public.inbox_items where phone_normalized = '0222222222')
     or (select count(*) from public.inbox_entries where item_id = v_item) <> 3 then
    raise exception 'FAIL: entry not moved to the card with the corrected number';
  end if;

  -- Throttle: max 5 new sessions per 10 minutes per client.
  begin
    for i in 1..6 loop
      perform public.intake_start(repeat(to_hex(i + 9), 64), 'fp-intake-spam-000000', 'v1');
    end loop;
    raise exception 'FAIL: intake start not throttled';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'too_many_requests' then raise exception 'FAIL: expected too_many_requests, got %', sqlerrm; end if;
  end;

  -- Forms: contact form (email only) and validation.
  v_id := public.submit_inbox_form('CONTACT_FORM',
    '{"contact":{"name":"Mere","email":"Mere@Example.com"},"message":"Do you do WOFs?"}', null, 'fp-form-000000000001');
  v_id2 := public.submit_inbox_form('CONTACT_FORM',
    '{"contact":{"name":"Mere","email":"Mere@Example.com"},"message":"Do you do WOFs?"}', null, 'fp-form-000000000001');
  if v_id <> v_id2 then
    raise exception 'FAIL: duplicate contact form created a second entry';
  end if;
  select * into v_entry from public.inbox_entries where id = v_id;
  if v_entry.message <> 'Do you do WOFs?' or v_entry.completed_at is null
     or (select count(*) from public.notifications where entry_id = v_id) <> 2
     or (select customer_id from public.inbox_items where id = v_entry.item_id) is null then
    raise exception 'FAIL: contact form entry incomplete';
  end if;
  begin
    perform public.submit_inbox_form('CONTACT_FORM', '{"contact":{"name":"Mere","email":"mere@example.com"}}');
    raise exception 'FAIL: contact form without a message accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_message' then raise exception 'FAIL: expected invalid_message, got %', sqlerrm; end if;
  end;
  begin
    perform public.submit_inbox_form('INTAKE', '{"contact":{"name":"Mere","email":"mere@example.com"}}');
    raise exception 'FAIL: submit_inbox_form accepted kind INTAKE';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_kind' then raise exception 'FAIL: expected invalid_kind, got %', sqlerrm; end if;
  end;

  -- Notification sender: a claim takes a row once; finishing records the result.
  select id into v_id from public.claim_notifications(1);
  if v_id is null or (select attempts from public.notifications where id = v_id) <> 1 then
    raise exception 'FAIL: notification not claimed';
  end if;
  if exists (select 1 from public.claim_notifications(50) where id = v_id) then
    raise exception 'FAIL: claimed notification handed out twice';
  end if;
  perform public.finish_notification(v_id, 'SENT', null, array['info@example.com']);
  if (select sent_at from public.notifications where id = v_id) is null then
    raise exception 'FAIL: sent notification not recorded';
  end if;
end $$;

reset role;

-- 7c. Abandoned chat (time-travel the last activity, as the owner).
alter table public.inbox_entries disable trigger inbox_entries_set_updated_at;
alter table private.intake_sessions disable trigger intake_sessions_set_updated_at;
update public.inbox_entries e set updated_at = now() - interval '2 hours'
from private.intake_sessions s
where s.entry_id = e.id and s.token_hash = repeat('3', 64);
update private.intake_sessions set updated_at = now() - interval '2 hours' where token_hash = repeat('3', 64);
alter table public.inbox_entries enable trigger inbox_entries_set_updated_at;
alter table private.intake_sessions enable trigger intake_sessions_set_updated_at;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_result jsonb;
  v_entry public.inbox_entries;
begin
  v_result := public.run_intake_maintenance();
  if (v_result ->> 'abandoned')::integer <> 1 then
    raise exception 'FAIL: expected 1 abandoned intake, got %', v_result;
  end if;
  select e.* into v_entry from public.inbox_entries e
  join private.intake_sessions s on s.entry_id = e.id where s.token_hash = repeat('3', 64);
  if v_entry.abandoned_at is null or v_entry.last_step <> 'contact' then
    raise exception 'FAIL: abandoned step not recorded';
  end if;
  if (select count(*) from public.notifications where entry_id = v_entry.id and kind = 'ABANDONED_REQUEST') <> 2 then
    raise exception 'FAIL: abandoned request did not queue a notification';
  end if;
  -- Running again changes nothing and never queues a second notification.
  v_result := public.run_intake_maintenance();
  if (v_result ->> 'abandoned')::integer <> 0
     or (select count(*) from public.notifications where entry_id = v_entry.id) <> 2 then
    raise exception 'FAIL: maintenance is not idempotent';
  end if;
end $$;

reset role;
revoke select on private.intake_sessions from service_role;

-- 7d. Signed-in user who is NOT an admin.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a002"}', true);

do $$
begin
  if (select count(*) from public.admin_inbox) <> 0
     or (select count(*) from public.inbox_items) <> 0
     or (select count(*) from public.inbox_entries) <> 0
     or (select count(*) from public.notifications) <> 0 then
    raise exception 'FAIL: non-admin can see the Inbox';
  end if;
  begin
    perform public.set_inbox_status((select gen_random_uuid()), 'DONE');
    raise exception 'FAIL: non-admin could call set_inbox_status';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'forbidden' then raise exception 'FAIL: expected forbidden, got %', sqlerrm; end if;
  end;
  begin
    perform public.approve_from_inbox(gen_random_uuid(), current_date + 2, '19:00');
    raise exception 'FAIL: non-admin could call approve_from_inbox';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'forbidden' then raise exception 'FAIL: expected forbidden, got %', sqlerrm; end if;
  end;
  begin
    perform public.intake_save_step(repeat('1', 64), 'contact', '{}'::jsonb);
    raise exception 'FAIL: signed-in user can call intake_save_step';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- 7e. Admin: one-tap actions and booking approval from a card.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a001"}', true);

do $$
declare
  v_admin uuid := '00000000-0000-4000-8000-00000000a001';
  v_day date := current_setting('test.day')::date;
  v_item uuid;
  v_other uuid;
  v_appt uuid;
  v_card record;
begin
  select * into v_card from public.admin_inbox where phone_normalized = '0215551234';
  if v_card.id is null or v_card.entry_count <> 3 or v_card.status <> 'NEW' then
    raise exception 'FAIL: admin_inbox card wrong: %', row_to_json(v_card);
  end if;
  v_item := v_card.id;

  -- No direct writes, even for admins.
  begin
    update public.inbox_items set status = 'DONE' where id = v_item;
    raise exception 'FAIL: admin updated inbox_items directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.inbox_entries;
    raise exception 'FAIL: admin deleted inbox entries directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.inbox_items (contact_phone) values ('021 000 0000');
    raise exception 'FAIL: admin inserted an inbox item directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.intake_sessions limit 1;
    raise exception 'FAIL: admin can read intake sessions';
  exception when insufficient_privilege then null;
  end;

  -- One-tap WhatsApp: logged with the admin, NEW -> NEEDS_REPLY.
  perform public.log_inbox_contact(v_item, 'WHATSAPP');
  if (select status from public.inbox_items where id = v_item) <> 'NEEDS_REPLY'
     or (select status_changed_by from public.inbox_items where id = v_item) <> v_admin then
    raise exception 'FAIL: contact tap did not move the card to NEEDS_REPLY';
  end if;
  if not exists (select 1 from public.activities where related_type = 'INBOX_ITEM' and related_id = v_item
                 and activity_type = 'inbox.contacted' and created_by = v_admin) then
    raise exception 'FAIL: contact tap not logged';
  end if;

  perform public.add_inbox_note(v_item, 'Called, will confirm tonight');
  begin
    perform public.add_inbox_note(v_item, '   ');
    raise exception 'FAIL: empty note accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_note' then raise exception 'FAIL: expected invalid_note, got %', sqlerrm; end if;
  end;

  -- Past times are refused.
  begin
    perform public.approve_from_inbox(v_item, current_date - 1, '19:00');
    raise exception 'FAIL: booking approved in the past';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'past_date' then raise exception 'FAIL: expected past_date, got %', sqlerrm; end if;
  end;

  -- Approve booking: appointment created + approved, card DONE. Uses the
  -- finished chat entry (the latest entry has no vehicle).
  v_appt := public.approve_from_inbox(
    v_item, v_day, '21:00', 60, 'Confirmed on WhatsApp',
    (select e.id from public.inbox_entries e where e.item_id = v_item and e.completed_at is not null
     order by e.created_at limit 1)
  );
  if not exists (select 1 from public.appointments where id = v_appt and status = 'APPROVED'
                 and approved_by = v_admin and inbox_item_id = v_item and service_id is null
                 and vehicle_id is not null) then
    raise exception 'FAIL: approved booking not created correctly';
  end if;
  if (select status from public.inbox_items where id = v_item) <> 'DONE'
     or (select appointment_id from public.inbox_items where id = v_item) <> v_appt then
    raise exception 'FAIL: card not marked DONE with its booking';
  end if;
  begin
    perform public.approve_from_inbox(v_item, v_day, '21:00');
    raise exception 'FAIL: card booked twice';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'already_booked' then raise exception 'FAIL: expected already_booked, got %', sqlerrm; end if;
  end;

  -- Another card can't take the same slot, and nothing is left half-done.
  select id into v_other from public.inbox_items where email_normalized = 'mere@example.com';
  begin
    perform public.approve_from_inbox(v_other, v_day, '21:30');
    raise exception 'FAIL: conflicting booking approved from the Inbox';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'slot_conflict' then raise exception 'FAIL: expected slot_conflict, got %', sqlerrm; end if;
  end;
  if (select status from public.inbox_items where id = v_other) = 'DONE'
     or exists (select 1 from public.appointments where inbox_item_id = v_other) then
    raise exception 'FAIL: failed approval left changes behind';
  end if;

  perform public.set_inbox_status(v_other, 'DONE');
  perform public.set_inbox_status(v_other, 'NEW');
  if (select count(*) from public.activities where related_id = v_other
      and activity_type = 'inbox.status_changed' and created_by = v_admin) <> 2 then
    raise exception 'FAIL: status changes not logged';
  end if;

  -- Admins can see the notification queue.
  if (select count(*) from public.notifications) < 3 then
    raise exception 'FAIL: admin cannot read notifications';
  end if;
end $$;

reset role;

-- 7f. One-screen request form and chat rules (Build 11).
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_id uuid;
  v_entry public.inbox_entries;
  v_vehicle public.vehicles;
  v_err text;
  v_case jsonb;
begin
  -- Registration only: saved, linked to a registration-only vehicle.
  v_id := public.submit_inbox_form('FORM',
    '{"problem":{"category":"Brakes","text":"squeal"},"contact":{"name":"Tama","phone":"021 777 8888"},"vehicle":{"registration":"tam 42"},"reach":{"method":"SMS","times":["Weekend"]}}',
    'form-v1', 'fp-form-000000000002');
  select * into v_entry from public.inbox_entries where id = v_id;
  select * into v_vehicle from public.vehicles where id = v_entry.vehicle_id;
  if v_entry.kind <> 'FORM' or v_entry.symptom_category <> 'Brakes' or v_entry.symptom_text <> 'squeal'
     or v_entry.vehicle_registration <> 'tam 42' or v_entry.registration_unknown
     or v_entry.preferred_method <> 'SMS' or v_entry.preferred_times <> array['Weekend']
     or v_vehicle.registration_normalized <> 'TAM42' or v_vehicle.make is not null then
    raise exception 'FAIL: form entry or registration-only vehicle wrong: %', row_to_json(v_entry);
  end if;
  if (select count(*) from public.notifications where entry_id = v_id) <> 2
     or (select count(distinct channel) from public.notifications where entry_id = v_id) <> 2 then
    raise exception 'FAIL: form did not queue one Telegram and one email notification';
  end if;

  -- "I'm not sure" registration: allowed, no vehicle.
  v_id := public.submit_inbox_form('FORM',
    '{"problem":{"category":"Not sure"},"contact":{"name":"Hine","phone":"021 999 0000"},"vehicle":{"registration":null,"registration_unknown":true},"reach":{"method":"PHONE"}}',
    'form-v1', 'fp-form-000000000002');
  select * into v_entry from public.inbox_entries where id = v_id;
  if not v_entry.registration_unknown or v_entry.vehicle_id is not null then
    raise exception 'FAIL: unknown registration not handled';
  end if;

  -- Required fields on the form.
  foreach v_case in array array[
    '{"expect":"invalid_registration","a":{"contact":{"name":"A","phone":"021 111 2222"},"vehicle":{},"reach":{"method":"PHONE"}}}'::jsonb,
    '{"expect":"invalid_phone","a":{"contact":{"name":"A","email":"a@example.com"},"vehicle":{"registration":"ABC1"},"reach":{"method":"PHONE"}}}'::jsonb,
    '{"expect":"invalid_method","a":{"contact":{"name":"A","phone":"021 111 2222"},"vehicle":{"registration":"ABC1"},"reach":{}}}'::jsonb,
    '{"expect":"invalid_email","a":{"contact":{"name":"A","phone":"021 111 2222"},"vehicle":{"registration":"ABC1"},"reach":{"method":"EMAIL"}}}'::jsonb
  ] loop
    begin
      perform public.submit_inbox_form('FORM', v_case -> 'a', 'form-v1', 'fp-form-000000000003');
      raise exception 'FAIL: form accepted without a required field (%)', v_case ->> 'expect';
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_err = message_text;
      if v_err <> v_case ->> 'expect' then
        raise exception 'FAIL: expected %, got %', v_case ->> 'expect', v_err;
      end if;
    end;
  end loop;

  -- The chat needs a phone number at the contact step.
  perform public.intake_start(repeat('5', 64), 'fp-intake-0000000005', 'v1');
  begin
    perform public.intake_save_step(repeat('5', 64), 'contact', '{"contact":{"name":"Ana","email":"ana@example.com"}}');
    raise exception 'FAIL: chat accepted contact without a phone';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid_phone' then raise exception 'FAIL: expected invalid_phone, got %', sqlerrm; end if;
  end;

  -- A vehicle can never be completely empty.
  begin
    insert into public.vehicles (customer_id) values ((select id from public.customers limit 1));
    raise exception 'FAIL: empty vehicle accepted';
  exception when check_violation then null;
  end;
end $$;

reset role;

-- 7g. Notification sending (Build 14).
do $$
declare
  v_entry uuid;
  v_kinds text[];
begin
  -- A chat marked abandoned and then finished gets both alerts (per channel).
  set local role service_role;
  perform public.intake_start(repeat('7', 64), 'fp-intake-0000000007', 'chat-1');
  perform public.intake_save_step(repeat('7', 64), 'contact', '{"contact":{"name":"Rua","phone":"021 707 0707"}}');
  reset role;
  select entry_id into v_entry from private.intake_sessions where token_hash = repeat('7', 64);
  update public.inbox_entries set abandoned_at = now() where id = v_entry;
  set local role service_role;
  perform public.intake_save_step(repeat('7', 64), 'times', '{"reach":{"method":"PHONE","times":[]}}', true);
  reset role;
  select array_agg(kind || '/' || channel order by kind, channel) into v_kinds
  from public.notifications where entry_id = v_entry;
  if v_kinds is distinct from array['ABANDONED_REQUEST/TELEGRAM', 'ABANDONED_REQUEST/EMAIL', 'NEW_REQUEST/TELEGRAM', 'NEW_REQUEST/EMAIL'] then
    raise exception 'FAIL: abandoned-then-finished chat alerts wrong: %', v_kinds;
  end if;

  -- The scheduled ping does nothing without pg_net / Vault secrets.
  if private.ping_notification_dispatch() not in ('not_configured', 'requested') then
    raise exception 'FAIL: ping with due alerts returned %', private.ping_notification_dispatch();
  end if;

  -- Only the database itself may call it.
  if has_function_privilege('anon', 'private.ping_notification_dispatch()', 'execute')
     or has_function_privilege('authenticated', 'private.ping_notification_dispatch()', 'execute')
     or has_function_privilege('service_role', 'private.ping_notification_dispatch()', 'execute') then
    raise exception 'FAIL: ping_notification_dispatch is executable by an API role';
  end if;
end $$;

select 'ALL SECURITY CHECKS PASSED' as result;

rollback;
