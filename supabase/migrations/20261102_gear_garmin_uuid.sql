-- Remember which Garmin gear item a local pair or bike came from.
-- Apply in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Sync still matches by name without this column. With it, a renamed pair stays linked.

alter table public.gear add column if not exists garmin_uuid text;

create unique index if not exists gear_user_garmin_uuid
  on public.gear (user_id, garmin_uuid)
  where garmin_uuid is not null;
