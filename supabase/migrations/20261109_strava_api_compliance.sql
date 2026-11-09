-- Strava API agreement: keep only this athlete's training fields, and record
-- whether they allowed those summaries to be sent to the AI coach.
-- A new Strava API app can connect one athlete until the owner raises the
-- cap at https://www.strava.com/settings/api (10 athletes from the dashboard,
-- review required after that).
-- Apply in the Supabase SQL editor if 20261109_strava_connections.sql already ran.

alter table public.strava_connections
  add column if not exists share_with_coach boolean not null default false;

comment on column public.strava_connections.share_with_coach is
  'Athlete allowed session summaries from Strava to be sent to the AI coach.';

-- Drop cached Strava payloads (maps, GPS, segment efforts). Training fields stay.
update public.activities
set raw = raw - 'strava'
where raw ? 'strava';
