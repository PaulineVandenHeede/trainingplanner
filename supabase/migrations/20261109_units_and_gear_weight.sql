-- Profile units preference (metric = km+kg, imperial = mi+lb).
-- Distances and strength weights stay stored in metric; convert for display.

alter table public.profiles
  add column if not exists units text;

update public.profiles
set units = 'metric'
where units is null;

alter table public.profiles
  alter column units set default 'metric';

alter table public.profiles
  alter column units set not null;

alter table public.profiles
  drop constraint if exists profiles_units_check;

alter table public.profiles
  add constraint profiles_units_check
  check (units = any (array['metric'::text, 'imperial'::text]));

-- Strength gear weight stored in kilograms.
alter table public.gear
  add column if not exists weight_kg numeric;

alter table public.gear
  drop constraint if exists gear_weight_kg_check;

alter table public.gear
  add constraint gear_weight_kg_check
  check (weight_kg is null or weight_kg > 0);
