-- =============================================================================
-- Inbox and chat intake (Build 9), part 5: notification queue and scheduled
-- maintenance.
--
-- Notifications
--   * A finished request (chat, form or contact form) or an abandoned chat
--     that has contact details queues ONE notification for the operator.
--     The unique entry_id makes "at most one per request" a database rule.
--   * The queue row is written in the same transaction as the request, but
--     sending happens later on the server (Build 12). A failed or skipped
--     email never affects the request.
--   * claim_notifications / finish_notification are for the server sender
--     (service_role only). Recipients come from the server's
--     ADMIN_NOTIFY_EMAILS setting and are recorded when sent.
--
-- Maintenance (every 5 minutes with pg_cron when available; also callable by
-- the server as run_intake_maintenance()):
--   * chat intakes with contact details and no progress for
--     business_settings.intake_abandon_minutes are marked abandoned, linked
--     to a customer profile, and queue their notification
--   * intake sessions older than business_settings.intake_retention_days are
--     deleted (sessions that never reached contact details leave nothing)
-- =============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('NEW_REQUEST', 'ABANDONED_REQUEST')),
  item_id uuid not null references public.inbox_items (id) on delete cascade,
  entry_id uuid not null unique references public.inbox_entries (id) on delete cascade,
  status public.notification_status not null default 'PENDING',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  recipients text[] not null default '{}',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_sent_at check ((status = 'SENT') = (sent_at is not null))
);

comment on table public.notifications is
  'Operator email queue (one row per new request). Failures are recorded here and never affect the request.';

create index notifications_due_idx on public.notifications (next_attempt_at)
  where status in ('PENDING', 'FAILED');
create index notifications_item_id_idx on public.notifications (item_id);

create trigger notifications_set_updated_at before update on public.notifications
  for each row execute function private.set_updated_at();

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;

create policy "Admins can read notifications"
  on public.notifications for select to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Queue on finish / abandon
-- -----------------------------------------------------------------------------
create function private.queue_inbox_notification()
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

  insert into public.notifications (kind, item_id, entry_id)
  values (v_kind, new.item_id, new.id)
  on conflict (entry_id) do nothing;
  return new;
end;
$$;

create trigger inbox_entries_queue_notification_insert
  after insert on public.inbox_entries
  for each row execute function private.queue_inbox_notification();

create trigger inbox_entries_queue_notification_update
  after update of completed_at, abandoned_at on public.inbox_entries
  for each row execute function private.queue_inbox_notification();

-- -----------------------------------------------------------------------------
-- Sender API (server only)
-- -----------------------------------------------------------------------------

-- Takes up to p_limit due notifications. Each claim counts as an attempt and
-- pushes next_attempt_at back, so a crashed sender is retried later and two
-- senders never take the same row. Gives up after 5 attempts.
create function public.claim_notifications(p_limit integer default 10)
returns setof public.notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.notifications n
  set attempts = n.attempts + 1,
      next_attempt_at = now() + make_interval(mins => 5 * power(2, n.attempts)::integer)
  where n.id in (
    select id from public.notifications
    where status in ('PENDING', 'FAILED')
      and attempts < 5
      and next_attempt_at <= now()
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  returning n.*;
end;
$$;

create function public.finish_notification(
  p_id uuid,
  p_status public.notification_status,
  p_error text default null,
  p_recipients text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('SENT', 'FAILED', 'SKIPPED') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  update public.notifications
  set status = p_status,
      last_error = left(p_error, 1000),
      recipients = coalesce(p_recipients, '{}'),
      sent_at = case when p_status = 'SENT' then now() end
  where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Maintenance
-- -----------------------------------------------------------------------------
create function private.run_intake_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.business_settings;
  v_entry record;
  v_abandoned integer := 0;
  v_deleted integer := 0;
begin
  select * into v_settings from public.business_settings limit 1;

  for v_entry in
    select e.id, s.current_step
    from public.inbox_entries e
    left join private.intake_sessions s on s.entry_id = e.id
    where e.kind = 'INTAKE'
      and e.completed_at is null
      and e.abandoned_at is null
      and greatest(e.updated_at, coalesce(s.updated_at, e.updated_at))
          < now() - make_interval(mins => coalesce(v_settings.intake_abandon_minutes, 30))
    for update of e skip locked
  loop
    update public.inbox_entries
    set abandoned_at = now(),
        last_step = coalesce(v_entry.current_step, last_step)
    where id = v_entry.id;
    perform private.finalize_inbox_entry(v_entry.id);
    v_abandoned := v_abandoned + 1;
  end loop;

  delete from private.intake_sessions
  where created_at < now() - make_interval(days => coalesce(v_settings.intake_retention_days, 30));
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('abandoned', v_abandoned, 'sessions_deleted', v_deleted);
end;
$$;

-- Same, for the server (e.g. a scheduled route) where pg_cron is not available.
create function public.run_intake_maintenance()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.run_intake_maintenance();
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.queue_inbox_notification() from public, anon, authenticated;
revoke all on function private.run_intake_maintenance() from public, anon, authenticated;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
revoke all on function public.finish_notification(uuid, public.notification_status, text, text[]) from public, anon, authenticated;
grant execute on function public.finish_notification(uuid, public.notification_status, text, text[]) to service_role;
revoke all on function public.run_intake_maintenance() from public, anon, authenticated;
grant execute on function public.run_intake_maintenance() to service_role;

-- -----------------------------------------------------------------------------
-- Schedule (Supabase provides pg_cron; skipped where it is not installed,
-- e.g. a plain local Postgres)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    execute $sql$select cron.schedule('inbox-maintenance', '*/5 * * * *', 'select private.run_intake_maintenance()')$sql$;
  else
    raise notice 'pg_cron is not available: schedule run_intake_maintenance() another way';
  end if;
end $$;
