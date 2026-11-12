-- Local development seed (runs on `supabase db reset` only, never in production).
-- Reference data (services, hours, settings) lives in the migrations.
--
-- Sample records are created through the same server-only function the website
-- uses, so they follow the normal validation and automation path.

select public.submit_inbox_form(
  p_kind => 'CONTACT_FORM',
  p_answers => '{"contact":{"name":"Sample Customer","email":"sample.customer@example.com","phone":"021 000 0000"},"message":"Sample message for local development."}'::jsonb
);
