-- Public description of an event. Personal effort and note stay on the same row
-- and must not be copied into race_catalog.
-- Apply in the Supabase SQL editor (Dashboard → SQL → New query → Run).

alter table public.events add column if not exists event_note text not null default '';

comment on column public.events.event_note is 'Public event description. Safe to share with name, date and distance.';
comment on column public.events.note is 'Personal note for the athlete. Do not copy to race_catalog.';
comment on column public.events.effort is 'Personal effort (easy, race, other). Do not copy to race_catalog.';
