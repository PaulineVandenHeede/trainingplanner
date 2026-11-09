-- Harden public table privileges for a publicly reachable SPA.
-- TRUNCATE/REFERENCES/TRIGGER bypass or widen attack surface beyond RLS.
-- Applied remotely as harden_rls_privileges; kept here for repo history.

revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Shared race list: authenticated read-only
revoke insert, update, delete, truncate, references, trigger on table public.race_catalog from authenticated;
grant select on table public.race_catalog to authenticated;

-- Garmin API keys must not be readable/writable from the browser JWT.
-- Edge Function garmin-sync uses the service role after verifying the user.
revoke all on table public.garmin_connections from authenticated;
revoke all on table public.garmin_connections from anon;

-- Defense in depth: even table owners / bypasses hit RLS
alter table public.activities force row level security;
alter table public.activity_feedback force row level security;
alter table public.activity_gear force row level security;
alter table public.busy_days force row level security;
alter table public.changes force row level security;
alter table public.coach_jobs force row level security;
alter table public.events force row level security;
alter table public.garmin_connections force row level security;
alter table public.gear force row level security;
alter table public.plans force row level security;
alter table public.profiles force row level security;
alter table public.race_catalog force row level security;
alter table public.training_metrics force row level security;
alter table public.week_feedback force row level security;
alter table public.wellness_days force row level security;

-- Profiles: no delete from client
revoke delete on table public.profiles from authenticated;

-- Future tables: no anon access by default
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
