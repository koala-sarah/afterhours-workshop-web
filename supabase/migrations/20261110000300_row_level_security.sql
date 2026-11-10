-- =============================================================================
-- Row Level Security and privileges.
--
-- Access model
--   anon (public website visitors)
--     * read active services, business hours and booking settings
--     * submit appointment requests / enquiries ONLY through the
--       submit_* functions (next migration); no direct table access
--   authenticated
--     * every internal record requires private.is_admin()
--     * non-admin users can only read their own profile
--   service_role (server only, bypasses RLS) - never exposed to the browser
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enable RLS on every table
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.services enable row level security;
alter table public.enquiries enable row level security;
alter table public.appointments enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.activities enable row level security;
alter table public.business_hours enable row level security;
alter table public.business_settings enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Table privileges (defence in depth on top of RLS)
--    Supabase grants ALL on new public tables to anon/authenticated by default.
--    TRUNCATE ignores RLS, so it is revoked everywhere.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Future tables and functions created by migrations (run as postgres) start locked
-- too: grant anon access and EXECUTE explicitly where it is intended.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Public read-only reference data.
grant select on public.services, public.business_hours, public.business_settings to anon;

-- Profiles: a signed-in user may only edit their own display name, never role/email.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Activity history is append-only.
revoke update, delete on public.activities from authenticated;

-- Availability rows are fixed (7 days, 1 settings row): edit only.
revoke insert, delete on public.business_hours, public.business_settings from authenticated;

-- -----------------------------------------------------------------------------
-- 3. Helper schema / function privileges
--    Functions are executable by PUBLIC by default; lock them down.
-- -----------------------------------------------------------------------------
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

revoke all on all functions in schema private from public, anon, authenticated;
-- Used inside RLS policies, so callers need EXECUTE.
grant execute on function private.is_admin() to anon, authenticated, service_role;
-- Used by generated columns when an admin inserts/updates customers or vehicles.
grant execute on function private.normalize_email(text) to authenticated, service_role;
grant execute on function private.normalize_phone(text) to authenticated, service_role;
grant execute on function private.normalize_registration(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Policies
--    (select private.is_admin()) is wrapped in a sub-select so Postgres
--    evaluates it once per statement instead of once per row.
-- -----------------------------------------------------------------------------

-- profiles ---------------------------------------------------------------------
create policy "Users can read their own profile; admins can read all"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "Users can update their own profile name"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- customers --------------------------------------------------------------------
create policy "Admins can read customers"
  on public.customers for select to authenticated
  using ((select private.is_admin()));
create policy "Admins can create customers"
  on public.customers for insert to authenticated
  with check ((select private.is_admin()));
create policy "Admins can update customers"
  on public.customers for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete customers"
  on public.customers for delete to authenticated
  using ((select private.is_admin()));

-- vehicles ---------------------------------------------------------------------
create policy "Admins can read vehicles"
  on public.vehicles for select to authenticated
  using ((select private.is_admin()));
create policy "Admins can create vehicles"
  on public.vehicles for insert to authenticated
  with check ((select private.is_admin()));
create policy "Admins can update vehicles"
  on public.vehicles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete vehicles"
  on public.vehicles for delete to authenticated
  using ((select private.is_admin()));

-- services ---------------------------------------------------------------------
create policy "Anyone can read active services"
  on public.services for select to anon, authenticated
  using (is_active);
create policy "Admins can read all services"
  on public.services for select to authenticated
  using ((select private.is_admin()));
create policy "Admins can create services"
  on public.services for insert to authenticated
  with check ((select private.is_admin()));
create policy "Admins can update services"
  on public.services for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete services"
  on public.services for delete to authenticated
  using ((select private.is_admin()));

-- enquiries --------------------------------------------------------------------
create policy "Admins can read enquiries"
  on public.enquiries for select to authenticated
  using ((select private.is_admin()));
create policy "Admins can create enquiries"
  on public.enquiries for insert to authenticated
  with check ((select private.is_admin()));
create policy "Admins can update enquiries"
  on public.enquiries for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete enquiries"
  on public.enquiries for delete to authenticated
  using ((select private.is_admin()));

-- appointments -----------------------------------------------------------------
create policy "Admins can read appointments"
  on public.appointments for select to authenticated
  using ((select private.is_admin()));
create policy "Admins can create appointments"
  on public.appointments for insert to authenticated
  with check ((select private.is_admin()));
create policy "Admins can update appointments"
  on public.appointments for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete appointments"
  on public.appointments for delete to authenticated
  using ((select private.is_admin()));

-- follow_up_tasks --------------------------------------------------------------
create policy "Admins can read follow-up tasks"
  on public.follow_up_tasks for select to authenticated
  using ((select private.is_admin()));
create policy "Admins can create follow-up tasks"
  on public.follow_up_tasks for insert to authenticated
  with check ((select private.is_admin()));
create policy "Admins can update follow-up tasks"
  on public.follow_up_tasks for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete follow-up tasks"
  on public.follow_up_tasks for delete to authenticated
  using ((select private.is_admin()));

-- activities (append-only) ----------------------------------------------------
create policy "Admins can read activities"
  on public.activities for select to authenticated
  using ((select private.is_admin()));
create policy "Admins can add activities as themselves"
  on public.activities for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));

-- business_hours / business_settings --------------------------------------------
create policy "Anyone can read business hours"
  on public.business_hours for select to anon, authenticated
  using (true);
create policy "Admins can update business hours"
  on public.business_hours for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Anyone can read booking settings"
  on public.business_settings for select to anon, authenticated
  using (true);
create policy "Admins can update booking settings"
  on public.business_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
