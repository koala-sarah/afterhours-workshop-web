-- =============================================================================
-- Inbox and chat intake (Build 9), part 4: admin Inbox actions.
--
-- Signed-in users have no direct write access to the Inbox tables; every
-- change goes through these functions. They are SECURITY DEFINER and start
-- with an admin check, and the history records the admin (auth.uid()).
--
--   set_inbox_status(item, status)          NEW / NEEDS_REPLY / DONE
--   log_inbox_contact(item, method)         one-tap call / WhatsApp / SMS /
--                                           email: logged, NEW -> NEEDS_REPLY
--   add_inbox_note(item, note)              internal note
--   approve_from_inbox(item, date, time, duration, note, entry)
--       Creates the appointment and approves it in one transaction. The
--       existing appointment guard checks for conflicts and records the
--       approving admin. The card is marked DONE.
--
-- Errors (SQLSTATE P0001): forbidden, not_found, invalid_note, invalid_input,
-- already_booked, contact_required, invalid_date, invalid_duration, past_date,
-- slot_conflict, duplicate_request
-- =============================================================================

create function private.lock_inbox_item_for_admin(p_item_id uuid)
returns public.inbox_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inbox_items;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into v_row from public.inbox_items where id = p_item_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

create function public.set_inbox_status(p_item_id uuid, p_status public.inbox_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inbox_items := private.lock_inbox_item_for_admin(p_item_id);
begin
  if p_status is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if v_row.status = p_status then
    return;
  end if;
  -- History is written by the status-change trigger.
  update public.inbox_items set status = p_status where id = p_item_id;
end;
$$;

create function public.log_inbox_contact(p_item_id uuid, p_method public.contact_method)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inbox_items := private.lock_inbox_item_for_admin(p_item_id);
begin
  if p_method is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  perform private.log_activity(
    v_row.customer_id, 'INBOX_ITEM', v_row.id, 'inbox.contacted',
    case p_method
      when 'PHONE' then 'Called the customer'
      when 'WHATSAPP' then 'Opened WhatsApp to the customer'
      when 'SMS' then 'Opened a text message to the customer'
      when 'EMAIL' then 'Opened an email to the customer'
    end,
    jsonb_build_object('method', p_method)
  );
  if v_row.status = 'NEW' then
    update public.inbox_items set status = 'NEEDS_REPLY' where id = p_item_id;
  end if;
end;
$$;

create function public.add_inbox_note(p_item_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inbox_items := private.lock_inbox_item_for_admin(p_item_id);
begin
  if coalesce(char_length(btrim(p_note)), 0) not between 1 and 2000 then
    raise exception 'invalid_note' using errcode = 'P0001';
  end if;
  perform private.log_activity(v_row.customer_id, 'INBOX_ITEM', v_row.id, 'inbox.note', btrim(p_note));
end;
$$;

create function public.approve_from_inbox(
  p_item_id uuid,
  p_date date,
  p_time time,
  p_duration_minutes integer default null,
  p_note text default null,
  p_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inbox_items := private.lock_inbox_item_for_admin(p_item_id);
  v_entry public.inbox_entries;
  v_slot tstzrange;
  v_vehicle uuid;
  v_appointment uuid;
  v_tz text := coalesce((select timezone from public.business_settings limit 1), 'Pacific/Auckland');
begin
  if v_item.appointment_id is not null
     and exists (select 1 from public.appointments
                 where id = v_item.appointment_id and status in ('APPROVED', 'COMPLETED')) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;

  -- Validates date, time and duration (also refuses past times).
  v_slot := private.local_slot(p_date, p_time, p_duration_minutes);

  select * into v_entry from public.inbox_entries
  where item_id = p_item_id and (p_entry_id is null or id = p_entry_id)
  order by created_at desc limit 1;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Make sure the card has a customer profile (and the entry its vehicle).
  perform private.finalize_inbox_entry(v_entry.id);
  select * into v_item from public.inbox_items where id = p_item_id;
  select * into v_entry from public.inbox_entries where id = v_entry.id;
  if v_item.customer_id is null then
    raise exception 'contact_required' using errcode = 'P0001';
  end if;

  -- Only link the vehicle when it belongs to this card's customer.
  select id into v_vehicle from public.vehicles
  where id = v_entry.vehicle_id and customer_id = v_item.customer_id;

  insert into public.appointments (
    customer_id, vehicle_id, source, preferred_date, preferred_time,
    description, inbox_item_id
  )
  values (
    v_item.customer_id,
    v_vehicle,
    case v_entry.channel
      when 'WEB' then 'WEBSITE'
      when 'PHONE' then 'PHONE'
      when 'EMAIL' then 'EMAIL'
      else 'OTHER'
    end::public.request_source,
    p_date,
    p_time,
    left(coalesce(
      nullif(concat_ws(' - ', v_entry.symptom_category, v_entry.symptom_text, v_entry.summary, v_entry.message), ''),
      'Booked from the Inbox'
    ), 5000),
    p_item_id
  )
  returning id into v_appointment;

  -- The guard trigger checks conflicts and records approved_at / approved_by.
  perform public.approve_appointment(v_appointment, p_date, p_time, p_duration_minutes, p_note);

  update public.inbox_items
  set appointment_id = v_appointment, status = 'DONE'
  where id = p_item_id;

  perform private.log_activity(
    v_item.customer_id, 'INBOX_ITEM', p_item_id, 'inbox.booking_approved',
    'Booking approved for ' || to_char(lower(v_slot) at time zone v_tz, 'Dy DD Mon YYYY, HH24:MI'),
    jsonb_build_object('appointment_id', v_appointment)
  );

  return v_appointment;
exception
  when unique_violation then
    raise exception 'duplicate_request' using errcode = 'P0001';
end;
$$;

comment on function public.approve_from_inbox is
  'Admin only: creates and approves a booking from an Inbox card in one transaction (conflict-checked), then marks the card DONE.';

-- -----------------------------------------------------------------------------
-- Privileges: signed-in users (the functions check for an admin)
-- -----------------------------------------------------------------------------
revoke all on function private.lock_inbox_item_for_admin(uuid) from public, anon, authenticated;

revoke all on function public.set_inbox_status(uuid, public.inbox_status) from public, anon;
grant execute on function public.set_inbox_status(uuid, public.inbox_status) to authenticated;
revoke all on function public.log_inbox_contact(uuid, public.contact_method) from public, anon;
grant execute on function public.log_inbox_contact(uuid, public.contact_method) to authenticated;
revoke all on function public.add_inbox_note(uuid, text) from public, anon;
grant execute on function public.add_inbox_note(uuid, text) to authenticated;
revoke all on function public.approve_from_inbox(uuid, date, time, integer, text, uuid) from public, anon;
grant execute on function public.approve_from_inbox(uuid, date, time, integer, text, uuid) to authenticated;
