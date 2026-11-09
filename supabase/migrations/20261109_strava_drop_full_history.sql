-- Full-history import was reverted. The first sync stays on the 90-day window.

alter table public.strava_connections
  drop column if exists history_synced_at;
