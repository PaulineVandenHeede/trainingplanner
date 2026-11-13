-- Durable AI coach chat thread (one per athlete).

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) > 0 and char_length(content) <= 8000),
  job_id uuid null references public.coach_jobs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at);

alter table public.coach_messages enable row level security;
alter table public.coach_messages force row level security;

drop policy if exists coach_messages_own on public.coach_messages;
create policy coach_messages_own on public.coach_messages
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.coach_messages from anon;
revoke truncate, references, trigger on table public.coach_messages from authenticated;
grant select, insert, update, delete on table public.coach_messages to authenticated;
