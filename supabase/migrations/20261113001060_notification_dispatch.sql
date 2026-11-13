-- =============================================================================
-- Build 14: notification sending
--
-- 1. One alert per request, channel AND kind. Before, a chat that was first
--    marked abandoned and then finished by the customer could not get its
--    "new request" alert (the abandoned alert already held the slot).
-- 2. Scheduled dispatch: the website sends alerts straight after a request is
--    saved. Retries and abandoned-chat alerts are picked up by a pg_cron job
--    that calls the website's dispatch route (pg_net) every 5 minutes, only
--    when something is due. The route URL and its shared secret live in
--    Supabase Vault (names below); without them the job does nothing.
--
--      select vault.create_secret('https://<site>/api/notifications/dispatch', 'notify_dispatch_url');
--      select vault.create_secret('<same value as NOTIFY_DISPATCH_SECRET>', 'notify_dispatch_secret');
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Unique per entry, channel and kind
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_entry_channel_key;
alter table public.notifications
  add constraint notifications_entry_channel_kind_key unique (entry_id, channel, kind);

comment on table public.notifications is
  'Operator alerts: one row per request, channel (TELEGRAM, EMAIL) and kind (NEW_REQUEST, ABANDONED_REQUEST). An unconfigured channel is recorded as SKIPPED. Failures never affect the request.';

-- Same trigger as migration 1050, with the new conflict target.
create or replace function private.queue_inbox_notification()
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

  insert into public.notifications (kind, item_id, entry_id, channel)
  select v_kind, new.item_id, new.id, c
  from unnest(enum_range(null::public.notification_channel)) as c
  on conflict (entry_id, channel, kind) do nothing;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Ping the website's dispatch route when alerts are due
-- -----------------------------------------------------------------------------
create function private.ping_notification_dispatch()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.notifications
    where status in ('PENDING', 'FAILED') and attempts < 5 and next_attempt_at <= now()
  ) then
    return 'nothing_due';
  end if;

  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return 'not_configured';
  end if;

  execute $sql$select decrypted_secret from vault.decrypted_secrets where name = 'notify_dispatch_url'$sql$
    into v_url;
  execute $sql$select decrypted_secret from vault.decrypted_secrets where name = 'notify_dispatch_secret'$sql$
    into v_secret;
  if v_url is null or v_secret is null then
    return 'not_configured';
  end if;

  execute $sql$select net.http_post(url := $1, headers := $2, body := '{}'::jsonb, timeout_milliseconds := 10000)$sql$
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
  return 'requested';
end;
$$;

comment on function private.ping_notification_dispatch is
  'Asks the website to send due alerts (retries, abandoned chats). Needs pg_net and the Vault secrets notify_dispatch_url / notify_dispatch_secret.';

revoke all on function private.ping_notification_dispatch() from public, anon, authenticated;

-- Schedule (Supabase provides pg_cron and pg_net; skipped on a plain Postgres).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    execute $sql$select cron.schedule('notification-dispatch', '1-59/5 * * * *', 'select private.ping_notification_dispatch()')$sql$;
  else
    raise notice 'pg_cron / pg_net not available: call the dispatch route another way';
  end if;
end $$;
