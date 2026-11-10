-- =============================================================================
-- Admin customer and vehicle management (spec section 6).
--
--   * admin_customers view for the list / search screen (RLS applies)
--   * an appointment's vehicle must belong to the appointment's customer
--     (composite foreign key, so no update path can link the wrong car)
--   * a vehicle can't be moved to another customer by the app (column grants)
--   * activity history for customer edits, vehicles added / edited, and an
--     appointment's vehicle being changed (triggers: every update path is
--     recorded, including website submissions)
--   * set_appointment_vehicle(): link an appointment to the right vehicle
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Appointment vehicle must belong to the same customer
-- -----------------------------------------------------------------------------
alter table public.vehicles
  add constraint vehicles_id_customer_key unique (id, customer_id);

-- MATCH SIMPLE (default): appointments without a vehicle are not checked.
alter table public.appointments
  add constraint appointments_vehicle_belongs_to_customer
  foreign key (vehicle_id, customer_id) references public.vehicles (id, customer_id);

-- Vehicles stay with the customer they were added for. (A car sold to another
-- customer is added again under the new owner.)
revoke update on public.vehicles from authenticated;
grant update (make, model, year, registration_number, additional_information)
  on public.vehicles to authenticated;

-- -----------------------------------------------------------------------------
-- List view (security_invoker: the caller's RLS applies, so only admins see rows)
-- -----------------------------------------------------------------------------
create view public.admin_customers
with (security_invoker = true)
as
select
  c.id,
  c.full_name,
  c.email,
  c.phone,
  c.email_normalized,
  c.phone_normalized,
  c.created_at,
  c.updated_at,
  v.vehicle_count,
  -- Normalised plates separated by spaces, for search and display.
  v.registrations,
  a.appointment_count,
  a.open_appointment_count,
  a.last_requested_at
from public.customers c
cross join lateral (
  select
    count(*)::integer as vehicle_count,
    string_agg(vh.registration_normalized, ' ' order by vh.created_at) as registrations
  from public.vehicles vh
  where vh.customer_id = c.id
) v
cross join lateral (
  select
    count(*)::integer as appointment_count,
    (count(*) filter (where ap.status in ('PENDING', 'RESCHEDULE_REQUESTED', 'APPROVED')))::integer
      as open_appointment_count,
    max(ap.created_at) as last_requested_at
  from public.appointments ap
  where ap.customer_id = c.id
) a;

comment on view public.admin_customers is
  'Customer list for the admin area. security_invoker = true, so RLS on the underlying tables applies.';

revoke all on public.admin_customers from public, anon;
grant select on public.admin_customers to authenticated;

-- -----------------------------------------------------------------------------
-- Activity history
-- -----------------------------------------------------------------------------

-- "Toyota Corolla (ABC123)"
create function private.vehicle_label(p_vehicle public.vehicles)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(p_vehicle.make) || ' ' || btrim(p_vehicle.model)
    || coalesce(' (' || p_vehicle.registration_normalized || ')', '');
$$;

-- Customer details edited. Only the changed field names are recorded (not the
-- old values), so the history doesn't keep extra copies of personal details.
create function private.on_customer_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[] := array_remove(array[
    case when new.full_name is distinct from old.full_name then 'name' end,
    case when new.email is distinct from old.email then 'email' end,
    case when new.phone is distinct from old.phone then 'phone' end,
    case when new.notes is distinct from old.notes then 'profile notes' end
  ], null);
begin
  if cardinality(v_fields) = 0 then
    return new;
  end if;
  perform private.log_activity(
    new.id, 'CUSTOMER', new.id, 'customer.updated',
    'Customer details updated: ' || array_to_string(v_fields, ', '),
    jsonb_build_object('fields', to_jsonb(v_fields))
  );
  return new;
end;
$$;

create trigger customers_log_updated
  after update on public.customers
  for each row execute function private.on_customer_updated();

create function private.on_vehicle_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(
      new.customer_id, 'VEHICLE', new.id, 'vehicle.added',
      'Vehicle added: ' || private.vehicle_label(new)
    );
  elsif (new.make, new.model, new.year, new.registration_number, new.additional_information)
        is distinct from
        (old.make, old.model, old.year, old.registration_number, old.additional_information) then
    perform private.log_activity(
      new.customer_id, 'VEHICLE', new.id, 'vehicle.updated',
      'Vehicle details updated: ' || private.vehicle_label(new)
    );
  end if;
  return new;
end;
$$;

create trigger vehicles_log_changed
  after insert or update on public.vehicles
  for each row execute function private.on_vehicle_changed();

create function private.on_appointment_vehicle_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
begin
  select * into v_vehicle from public.vehicles where id = new.vehicle_id;
  perform private.log_activity(
    new.customer_id, 'APPOINTMENT', new.id, 'appointment.vehicle_changed',
    case when new.vehicle_id is null then 'Vehicle removed from appointment'
         else 'Vehicle changed to ' || private.vehicle_label(v_vehicle) end,
    jsonb_build_object('from', old.vehicle_id, 'to', new.vehicle_id)
  );
  return new;
end;
$$;

create trigger appointments_log_vehicle_change
  after update of vehicle_id on public.appointments
  for each row
  when (old.vehicle_id is distinct from new.vehicle_id)
  execute function private.on_appointment_vehicle_changed();

-- -----------------------------------------------------------------------------
-- Link an appointment to one of the customer's vehicles
-- (SECURITY INVOKER: the caller's RLS still applies)
-- -----------------------------------------------------------------------------
create function public.set_appointment_vehicle(p_appointment_id uuid, p_vehicle_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.appointments := private.lock_appointment_for_admin(p_appointment_id);
begin
  if p_vehicle_id is null or not exists (
    select 1 from public.vehicles where id = p_vehicle_id and customer_id = v_row.customer_id
  ) then
    raise exception 'vehicle_mismatch' using errcode = 'P0001';
  end if;
  if v_row.vehicle_id = p_vehicle_id then
    return;
  end if;
  update public.appointments set vehicle_id = p_vehicle_id where id = p_appointment_id;
exception
  when unique_violation then
    -- The same open request already exists for that vehicle.
    raise exception 'duplicate_request' using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.vehicle_label(public.vehicles) from public, anon, authenticated;
revoke all on function private.on_customer_updated() from public, anon, authenticated;
revoke all on function private.on_vehicle_changed() from public, anon, authenticated;
revoke all on function private.on_appointment_vehicle_changed() from public, anon, authenticated;

revoke all on function public.set_appointment_vehicle(uuid, uuid) from public, anon;
grant execute on function public.set_appointment_vehicle(uuid, uuid) to authenticated;
