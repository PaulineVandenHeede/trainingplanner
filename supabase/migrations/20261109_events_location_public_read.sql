-- Location for public event matching / display.
alter table public.events add column if not exists location text not null default '';

comment on column public.events.location is
  'City or venue for the event. Used when matching similar public events.';

-- Allow authenticated users to read public event listings (not personal notes).
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events
  for select
  to authenticated
  using (is_public = true);
