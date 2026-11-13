-- Allow walk/ski on events (UI already offers them); widen km for multi-day totals.
alter table public.events drop constraint if exists events_sport_check;
alter table public.events
  add constraint events_sport_check
  check (sport is null or sport in ('run', 'swim', 'bike', 'triathlon', 'walk', 'ski'));

alter table public.events drop constraint if exists events_km_check;
alter table public.events
  add constraint events_km_check
  check (km > 0 and km < 5000);

-- Personal effort UI uses easy / race / other (DB previously had steady instead of other).
alter table public.events drop constraint if exists events_effort_check;
alter table public.events
  add constraint events_effort_check
  check (effort in ('easy', 'steady', 'race', 'other'));
