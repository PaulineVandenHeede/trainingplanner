-- Heart-rate profile and daily recovery from Garmin.
-- Apply in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- The app still shows recovery after a sync if this has not been applied yet;
-- this table is what keeps it on the account across browsers.

create table if not exists public.training_metrics (
  user_id uuid primary key references auth.users (id) on delete cascade,
  max_hr int,
  resting_hr int,
  lthr int,
  lt_speed_mps numeric,
  vo2_run numeric,
  zones jsonb,
  load jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.wellness_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sleep_score int,
  sleep_sec int,
  sleep_label text,
  battery_morning int,
  battery_latest int,
  stress_avg int,
  hrv_night numeric,
  hrv_week numeric,
  hrv_status text,
  hrv_low numeric,
  hrv_high numeric,
  resting_hr int,
  primary key (user_id, day)
);

alter table public.training_metrics enable row level security;
alter table public.wellness_days enable row level security;

drop policy if exists "training_metrics_own" on public.training_metrics;
create policy "training_metrics_own"
  on public.training_metrics for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "wellness_days_own" on public.wellness_days;
create policy "wellness_days_own"
  on public.wellness_days for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
