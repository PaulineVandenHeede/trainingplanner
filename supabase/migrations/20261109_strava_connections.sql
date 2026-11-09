-- Strava OAuth tokens (per user). Tokens are never readable from the browser JWT.
-- Apply in the Supabase SQL editor, then set Edge Function secrets:
--   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_CONNECT_PASSCODE,
--   STRAVA_REDIRECT_URI (e.g. https://your-host/connections),
--   STRAVA_WEBHOOK_VERIFY_TOKEN (any random string you invent)
-- Deploy:
--   npx supabase functions deploy strava-sync --project-ref YOUR_PROJECT_REF
--   npx supabase functions deploy strava-webhook --project-ref YOUR_PROJECT_REF
-- Create the webhook subscription once (see strava-webhook comments).

create table if not exists public.strava_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  athlete_id bigint not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  last_sync_at timestamptz,
  last_sync_status text,
  last_error text,
  share_with_coach boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint strava_connections_athlete_unique unique (athlete_id)
);

alter table public.strava_connections enable row level security;
alter table public.strava_connections force row level security;

-- No browser access — Edge Functions use the service role after verifying the user.
revoke all on table public.strava_connections from authenticated;
revoke all on table public.strava_connections from anon;

comment on table public.strava_connections is
  'Per-user Strava OAuth tokens for activity sync. Do not expose tokens in the browser.';
