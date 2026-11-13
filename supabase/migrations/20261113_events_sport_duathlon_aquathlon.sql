-- Allow duathlon / aquathlon on events (single-day multi-discipline).
alter table public.events drop constraint if exists events_sport_check;
alter table public.events
  add constraint events_sport_check
  check (sport is null or sport in (
    'run', 'swim', 'bike', 'triathlon', 'duathlon', 'aquathlon', 'walk', 'ski'
  ));
