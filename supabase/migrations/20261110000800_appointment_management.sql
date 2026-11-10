-- =============================================================================
-- Admin appointment management (spec section 6).
--
--   * admin_appointments view for the list / search screen (RLS applies)
--   * guard trigger on every appointment update:
--       - only allowed status transitions
--       - APPROVED: conflict check against approved bookings (serialised with
--         an advisory lock so two admins can't double-book the same slot),
--         approval timestamp and approving admin recorded
--     The guard runs for every update path (functions below or a direct
--     UPDATE), so the rules cannot be bypassed from the app.
--   * admin functions: approve, decline, propose another time, change status,
--     add an internal note
--   * status-change activity now includes the admin's reason / note and the
--     confirmed time in Pacific/Auckland
-- =============================================================================

-- -----------------------------------------------------------------------------
-- List view (security_invoker: the caller's RLS applies, so only admins see rows)
-- -----------------------------------------------------------------------------
create view public.admin_appointments
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
join public.services s on s.id = a.service_id
left join public.vehicles v on v.id = a.vehicle_id;

comment on view public.admin_appointments is
  'Appointment list for the admin area. security_invoker = true, so RLS on the underlying tables applies.';

revoke all on public.admin_appointments from public, anon;
grant select on public.admin_appointments to authenticated;

-- Search support (case-insensitive name search).
create index customers_full_name_lower_idx on public.customers (lower(full_name));

-- -----------------------------------------------------------------------------
-- Allowed status transitions
-- -----------------------------------------------------------------------------
create function private.appointment_transition_allowed(
  p_from public.appointment_status,
  p_to public.appointment_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or (p_from, p_to) in (
    ('PENDING', 'APPROVED'),
    ('PENDING', 'DECLINED'),
    ('PENDING', 'RESCHEDULE_REQUESTED'),
    ('PENDING', 'CANCELLED'),
    ('RESCHEDULE_REQUESTED', 'APPROVED'),
    ('RESCHEDULE_REQUESTED', 'DECLINED'),
    ('RESCHEDULE_REQUESTED', 'CANCELLED'),
    ('RESCHEDULE_REQUESTED', 'PENDING'),
    ('APPROVED', 'COMPLETED'),
    ('APPROVED', 'CANCELLED'),
    ('APPROVED', 'RESCHEDULE_REQUESTED'),
    ('DECLINED', 'PENDING'),
    ('CANCELLED', 'PENDING')
  );
$$;

-- -----------------------------------------------------------------------------
-- Guard trigger
-- -----------------------------------------------------------------------------
create function private.guard_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if new.status is distinct from old.status
     and not private.appointment_transition_allowed(old.status, new.status) then
    raise exception 'invalid_transition' using errcode = 'P0001',
      detail = format('%s -> %s', old.status, new.status);
  end if;

  if new.status = 'APPROVED'
     and (old.status <> 'APPROVED'
          or new.scheduled_start is distinct from old.scheduled_start
          or new.scheduled_end is distinct from old.scheduled_end) then

    -- Record who approved and when (spec: approval timestamp + admin identity).
    if old.status <> 'APPROVED' then
      new.approved_at := now();
      new.approved_by := coalesce(
        (select id from public.profiles where id = v_actor),
        new.approved_by
      );
    end if;

    if new.scheduled_start is not null and new.scheduled_end is not null then
      -- One approval at a time, so two admins can't take the same slot.
      perform pg_advisory_xact_lock(hashtext('public.appointments:approval'));
      if not private.slot_has_capacity(new.scheduled_start, new.scheduled_end, new.id) then
        raise exception 'slot_conflict' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger appointments_guard_update
  before update on public.appointments
  for each row execute function private.guard_appointment_update();

-- -----------------------------------------------------------------------------
-- Status-change activity: include the admin's reason and the confirmed time
-- -----------------------------------------------------------------------------
create or replace function private.on_appointment_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(current_setting('app.status_reason', true)), '');
  v_tz text := coalesce((select timezone from public.business_settings limit 1), 'Pacific/Auckland');
  v_when text;
  v_description text;
begin
  v_when := case
    when new.status = 'APPROVED' and new.scheduled_start is not null then
      to_char(new.scheduled_start at time zone v_tz, 'Dy DD Mon YYYY, HH24:MI')
    when new.status = 'RESCHEDULE_REQUESTED' and new.proposed_start is not null then
      to_char(new.proposed_start at time zone v_tz, 'Dy DD Mon YYYY, HH24:MI')
  end;

  v_description := case new.status
    when 'APPROVED' then 'Appointment approved' || coalesce(' for ' || v_when, '')
    when 'DECLINED' then 'Appointment request declined'
    when 'RESCHEDULE_REQUESTED' then 'Different time proposed' || coalesce(': ' || v_when, '')
    when 'CANCELLED' then 'Appointment cancelled'
    when 'COMPLETED' then 'Appointment completed'
    when 'PENDING' then 'Request reopened (pending)'
  end;

  -- Use the reason once; later changes in the same transaction start clean.
  perform set_config('app.status_reason', '', true);

  perform private.log_activity(
    new.customer_id, 'APPOINTMENT', new.id, 'appointment.status_changed',
    v_description || coalesce(' - ' || v_reason, ''),
    jsonb_build_object(
      'from', old.status,
      'to', new.status,
      'scheduled_start', new.scheduled_start,
      'scheduled_end', new.scheduled_end,
      'proposed_start', new.proposed_start,
      'proposed_end', new.proposed_end,
      'reason', v_reason
    )
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin functions (SECURITY INVOKER: the caller's RLS still applies)
-- -----------------------------------------------------------------------------

-- Common checks; returns the row locked for update.
create function private.lock_appointment_for_admin(p_appointment_id uuid)
returns public.appointments
language plpgsql
set search_path = ''
as $$
declare
  v_row public.appointments;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into v_row from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

-- Local (Pacific/Auckland) date + time -> start/end timestamps.
create function private.local_slot(p_date date, p_time time, p_duration_minutes integer)
returns tstzrange
language plpgsql
stable
set search_path = ''
as $$
declare
  v_settings public.business_settings;
  v_start timestamptz;
  v_minutes integer;
begin
  if p_date is null or p_time is null then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  select * into v_settings from public.business_settings limit 1;
  v_minutes := coalesce(p_duration_minutes, v_settings.appointment_duration_minutes, 60);
  if v_minutes not between 15 and 1440 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  v_start := (p_date + p_time) at time zone coalesce(v_settings.timezone, 'Pacific/Auckland');
  if v_start <= now() then
    raise exception 'past_date' using errcode = 'P0001';
  end if;
  return tstzrange(v_start, v_start + make_interval(mins => v_minutes));
end;
$$;

create function public.approve_appointment(
  p_appointment_id uuid,
  p_date date,
  p_time time,
  p_duration_minutes integer default null,
  p_note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.appointments := private.lock_appointment_for_admin(p_appointment_id);
  v_slot tstzrange := private.local_slot(p_date, p_time, p_duration_minutes);
begin
  if v_row.status not in ('PENDING', 'RESCHEDULE_REQUESTED') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  perform set_config('app.status_reason', coalesce(p_note, ''), true);

  -- The guard trigger checks conflicts and records approved_at / approved_by.
  update public.appointments
  set status = 'APPROVED',
      scheduled_start = lower(v_slot),
      scheduled_end = upper(v_slot),
      proposed_start = null,
      proposed_end = null
  where id = p_appointment_id;
end;
$$;

create function public.decline_appointment(p_appointment_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.appointments := private.lock_appointment_for_admin(p_appointment_id);
begin
  if v_row.status not in ('PENDING', 'RESCHEDULE_REQUESTED') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  perform set_config('app.status_reason', coalesce(p_reason, ''), true);
  update public.appointments set status = 'DECLINED' where id = p_appointment_id;
end;
$$;

-- Suggest a different time. The proposed slot must be free; nothing is booked
-- until the customer agrees and an admin approves it.
create function public.propose_appointment_time(
  p_appointment_id uuid,
  p_date date,
  p_time time,
  p_duration_minutes integer default null,
  p_message text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.appointments := private.lock_appointment_for_admin(p_appointment_id);
  v_slot tstzrange := private.local_slot(p_date, p_time, p_duration_minutes);
begin
  if v_row.status not in ('PENDING', 'RESCHEDULE_REQUESTED', 'APPROVED') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if not private.slot_has_capacity(lower(v_slot), upper(v_slot), p_appointment_id) then
    raise exception 'slot_conflict' using errcode = 'P0001';
  end if;
  perform set_config('app.status_reason', coalesce(p_message, ''), true);
  update public.appointments
  set status = 'RESCHEDULE_REQUESTED',
      proposed_start = lower(v_slot),
      proposed_end = upper(v_slot)
  where id = p_appointment_id;
end;
$$;

-- Cancel, mark completed, or reopen. Approve / decline / propose have their own functions.
create function public.update_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status,
  p_reason text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.appointments := private.lock_appointment_for_admin(p_appointment_id);
begin
  if p_status not in ('CANCELLED', 'COMPLETED', 'PENDING') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if v_row.status = p_status then
    return;
  end if;
  perform set_config('app.status_reason', coalesce(p_reason, ''), true);
  update public.appointments set status = p_status where id = p_appointment_id;
exception
  when unique_violation then
    -- Reopening would duplicate another open request.
    raise exception 'duplicate_request' using errcode = 'P0001';
end;
$$;

create function public.add_appointment_note(p_appointment_id uuid, p_note text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.appointments := private.lock_appointment_for_admin(p_appointment_id);
begin
  if coalesce(char_length(btrim(p_note)), 0) not between 1 and 2000 then
    raise exception 'invalid_note' using errcode = 'P0001';
  end if;
  insert into public.activities (customer_id, related_type, related_id, activity_type, description, created_by)
  values (v_row.customer_id, 'APPOINTMENT', v_row.id, 'appointment.note', btrim(p_note), (select auth.uid()));
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.appointment_transition_allowed(public.appointment_status, public.appointment_status) from public, anon;
grant execute on function private.appointment_transition_allowed(public.appointment_status, public.appointment_status) to authenticated, service_role;
revoke all on function private.guard_appointment_update() from public, anon, authenticated;
revoke all on function private.lock_appointment_for_admin(uuid) from public, anon;
grant execute on function private.lock_appointment_for_admin(uuid) to authenticated;
revoke all on function private.local_slot(date, time, integer) from public, anon;
grant execute on function private.local_slot(date, time, integer) to authenticated;
-- Called from the guard trigger and propose_appointment_time (invoker = admin).
grant execute on function private.slot_has_capacity(timestamptz, timestamptz, uuid) to authenticated;

revoke all on function public.approve_appointment(uuid, date, time, integer, text) from public, anon;
grant execute on function public.approve_appointment(uuid, date, time, integer, text) to authenticated;
revoke all on function public.decline_appointment(uuid, text) from public, anon;
grant execute on function public.decline_appointment(uuid, text) to authenticated;
revoke all on function public.propose_appointment_time(uuid, date, time, integer, text) from public, anon;
grant execute on function public.propose_appointment_time(uuid, date, time, integer, text) to authenticated;
revoke all on function public.update_appointment_status(uuid, public.appointment_status, text) from public, anon;
grant execute on function public.update_appointment_status(uuid, public.appointment_status, text) to authenticated;
revoke all on function public.add_appointment_note(uuid, text) from public, anon;
grant execute on function public.add_appointment_note(uuid, text) to authenticated;
