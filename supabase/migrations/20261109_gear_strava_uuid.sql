-- Remember which Strava bike/shoe a local gear item came from.
-- Sync still matches by name without this column. With it, a renamed pair stays linked.

alter table public.gear add column if not exists strava_uuid text;

create unique index if not exists gear_user_strava_uuid
  on public.gear (user_id, strava_uuid)
  where strava_uuid is not null;
