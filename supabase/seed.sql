-- Local development seed (runs on `supabase db reset` only, never in production).
-- Reference data (services, hours, settings) lives in the migrations.
--
-- Sample records are created through the same public function the website uses,
-- so they follow the normal validation and automation path.

select public.submit_enquiry(
  p_full_name => 'Sample Customer',
  p_email => 'sample.customer@example.com',
  p_phone => '021 000 0000',
  p_message => 'Sample enquiry for local development.'
);
