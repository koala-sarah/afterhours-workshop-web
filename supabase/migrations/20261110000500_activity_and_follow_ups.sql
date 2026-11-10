-- =============================================================================
-- Automation (kept deliberately simple and reliable):
--   * activity history for new customers, enquiries, appointment requests and
--     appointment status changes
--   * every new enquiry creates a follow-up reminder for the admin
-- No customer-facing messages are sent from the database.
-- =============================================================================

-- Writes one activity row. created_by is the signed-in user, or null for
-- public website submissions.
create function private.log_activity(
  p_customer_id uuid,
  p_related_type public.related_type,
  p_related_id uuid,
  p_activity_type text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  insert into public.activities (customer_id, related_type, related_id, activity_type, description, metadata, created_by)
  values (
    p_customer_id,
    p_related_type,
    p_related_id,
    p_activity_type,
    p_description,
    coalesce(p_metadata, '{}'::jsonb),
    -- Only reference users that have a profile.
    (select id from public.profiles where id = v_actor)
  );
end;
$$;

-- customers ------------------------------------------------------------------
create function private.on_customer_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_activity(new.id, 'CUSTOMER', new.id, 'customer.created', 'Customer record created');
  return new;
end;
$$;

create trigger customers_log_created
  after insert on public.customers
  for each row execute function private.on_customer_created();

-- enquiries ------------------------------------------------------------------
create function private.on_enquiry_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer;
  v_name text;
begin
  select enquiry_follow_up_hours into v_hours from public.business_settings limit 1;
  select full_name into v_name from public.customers where id = new.customer_id;

  perform private.log_activity(
    new.customer_id, 'ENQUIRY', new.id, 'enquiry.received',
    'Enquiry received',
    jsonb_build_object('source', new.source)
  );

  -- Spec automation rule 1: a new enquiry creates a follow-up reminder.
  insert into public.follow_up_tasks (customer_id, enquiry_id, title, due_at, priority)
  values (
    new.customer_id,
    new.id,
    left('Reply to enquiry from ' || coalesce(v_name, 'customer'), 200),
    new.created_at + make_interval(hours => coalesce(v_hours, 24)),
    'MEDIUM'
  );

  return new;
end;
$$;

create trigger enquiries_after_insert
  after insert on public.enquiries
  for each row execute function private.on_enquiry_created();

-- appointments ---------------------------------------------------------------
create function private.on_appointment_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_activity(
    new.customer_id, 'APPOINTMENT', new.id, 'appointment.requested',
    'Appointment requested',
    jsonb_build_object(
      'status', new.status,
      'preferred_date', new.preferred_date,
      'preferred_time', new.preferred_time,
      'source', new.source
    )
  );
  return new;
end;
$$;

create trigger appointments_log_created
  after insert on public.appointments
  for each row execute function private.on_appointment_created();

create function private.on_appointment_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.log_activity(
    new.customer_id, 'APPOINTMENT', new.id, 'appointment.status_changed',
    'Appointment status changed from ' || old.status || ' to ' || new.status,
    jsonb_build_object(
      'from', old.status,
      'to', new.status,
      'scheduled_start', new.scheduled_start,
      'proposed_start', new.proposed_start
    )
  );
  return new;
end;
$$;

create trigger appointments_log_status_change
  after update of status on public.appointments
  for each row
  when (old.status is distinct from new.status)
  execute function private.on_appointment_status_changed();

-- Privileges: trigger functions are never called directly.
revoke all on function private.log_activity(uuid, public.related_type, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.on_customer_created() from public, anon, authenticated;
revoke all on function private.on_enquiry_created() from public, anon, authenticated;
revoke all on function private.on_appointment_created() from public, anon, authenticated;
revoke all on function private.on_appointment_status_changed() from public, anon, authenticated;
