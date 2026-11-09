-- Shoe lifespan tracking: subtype, target max distance (km), and wear alerts.

alter table public.gear
  add column if not exists shoe_kind text;

alter table public.gear
  add column if not exists max_km numeric;

alter table public.gear
  add column if not exists notify_wear boolean;

alter table public.gear
  alter column notify_wear set default false;

update public.gear
set notify_wear = false
where notify_wear is null;

alter table public.gear
  drop constraint if exists gear_shoe_kind_check;

alter table public.gear
  add constraint gear_shoe_kind_check
  check (
    shoe_kind is null
    or shoe_kind = any (array[
      'daily'::text,
      'tempo'::text,
      'race'::text,
      'trail'::text,
      'other'::text
    ])
  );

alter table public.gear
  drop constraint if exists gear_max_km_check;

alter table public.gear
  add constraint gear_max_km_check
  check (max_km is null or max_km > 0);
