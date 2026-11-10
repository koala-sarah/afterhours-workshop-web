-- =============================================================================
-- Reference data needed in every environment (production included).
-- Copied from the existing website (docs/SITE_CONTENT.md). Values that the site
-- does not state are left null / default and listed in docs/DATABASE.md.
-- =============================================================================

insert into public.services (slug, name, description, price_label, image_path, image_alt, sort_order)
values
  (
    'basic',
    'Basic Service',
    E'Basic check-ups of your car.\nIncluding Engine oil + filter replacement.',
    'From $99',
    '/images/unsplash-image-iFQpqbLMOFU.webp',
    'Mechanic checking under the bonnet of an SUV in a workshop',
    10
  ),
  (
    'advanced',
    'Advanced Service',
    'So-called ‘Full services’. Overall inspections of car and additional services.',
    'From $149',
    '/images/unsplash-image-UZUzvJEvKnI.webp',
    'Mechanic in gloves working on a car engine',
    20
  ),
  (
    'track-ready',
    'Track-ready Service',
    E'Our best service package for car enthusiasts’ track-ready service.\n\nBrake pad replacement, brake bleeding, spanner check for all key areas!',
    '$199',
    '/images/unsplash-image-3AvQJActhbw.webp',
    'Race car in the pit lane in front of track garages',
    30
  );

-- Existing site: "Open from 5 PM to 10 PM on weekdays and all day on weekends."
-- Weekend times are not stated, so they stay null (open, no time-of-day check)
-- until the owner sets them in the admin area.
insert into public.business_hours (day_of_week, is_open, open_time, close_time)
values
  (0, true, null, null),          -- Sunday: "all day" (times to confirm)
  (1, true, '17:00', '22:00'),    -- Monday
  (2, true, '17:00', '22:00'),    -- Tuesday
  (3, true, '17:00', '22:00'),    -- Wednesday
  (4, true, '17:00', '22:00'),    -- Thursday
  (5, true, '17:00', '22:00'),    -- Friday
  (6, true, null, null);          -- Saturday: "all day" (times to confirm)

-- Defaults: 60 min appointments, 1 booking at a time, follow up enquiries within 24 h.
-- The first two are placeholders until the owner confirms them.
insert into public.business_settings default values;
