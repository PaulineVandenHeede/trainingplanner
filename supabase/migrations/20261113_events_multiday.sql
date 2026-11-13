-- Multi-day events: date range, per-day sport legs, and event kind.
alter table public.events add column if not exists end_date date;
alter table public.events add column if not exists legs jsonb not null default '[]'::jsonb;
alter table public.events add column if not exists kind text not null default 'race';

comment on column public.events.end_date is
  'Last day of a multi-day event. Null or equal to date means single-day.';
comment on column public.events.legs is
  'Per-day schedule: [{ "date": "YYYY-MM-DD", "items": [{ "sport": "walk", "km": 34 }] }]. Empty items = rest day.';
comment on column public.events.kind is
  'race | stage | camp | holiday — affects plan weave and copy.';

alter table public.events drop constraint if exists events_kind_check;
alter table public.events
  add constraint events_kind_check
  check (kind in ('race', 'stage', 'camp', 'holiday'));

-- Keep end_date consistent when present.
alter table public.events drop constraint if exists events_end_date_check;
alter table public.events
  add constraint events_end_date_check
  check (end_date is null or end_date >= date);
