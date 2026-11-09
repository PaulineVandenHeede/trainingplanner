-- Allow swim kit (already used in the app) and strength / gym equipment.
-- Strength items drive session guides and plan recommendations; they are not
-- assigned to endurance activities.

alter table public.gear drop constraint if exists gear_type_check;

alter table public.gear
  add constraint gear_type_check
  check (type = any (array[
    'shoes'::text,
    'bike'::text,
    'swimsuit'::text,
    'wetsuit'::text,
    'kettlebell'::text,
    'dumbbells'::text,
    'barbell'::text,
    'bands'::text,
    'pullup'::text,
    'gym'::text
  ]));
