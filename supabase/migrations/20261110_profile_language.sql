-- Profile UI language preference (en / nl).

alter table public.profiles
  add column if not exists language text;

update public.profiles
set language = 'en'
where language is null;

alter table public.profiles
  alter column language set default 'en';

alter table public.profiles
  alter column language set not null;

alter table public.profiles
  drop constraint if exists profiles_language_check;

alter table public.profiles
  add constraint profiles_language_check
  check (language = any (array['en'::text, 'nl'::text]));
