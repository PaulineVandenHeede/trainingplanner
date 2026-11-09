-- Garmin Connect Personal API keys (per user).
-- Apply this file in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Then deploy the Edge Function from the repo root:
--   npx supabase login
--   npx supabase functions deploy garmin-sync --project-ref YOUR_PROJECT_REF
-- Owner-only RLS as defense in depth. Browser JWT has no table grants;
-- only the garmin-sync Edge Function (service role) may read/write api_key.

create table if not exists public.garmin_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  api_key text not null,
  last_sync_at timestamptz,
  last_sync_status text,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.garmin_connections enable row level security;

drop policy if exists "garmin_connections_select_own" on public.garmin_connections;
create policy "garmin_connections_select_own"
  on public.garmin_connections for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "garmin_connections_insert_own" on public.garmin_connections;
create policy "garmin_connections_insert_own"
  on public.garmin_connections for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "garmin_connections_update_own" on public.garmin_connections;
create policy "garmin_connections_update_own"
  on public.garmin_connections for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "garmin_connections_delete_own" on public.garmin_connections;
create policy "garmin_connections_delete_own"
  on public.garmin_connections for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.garmin_connections is
  'Per-user Garmin Connect Personal API key for activity sync. Do not expose api_key in the browser.';
