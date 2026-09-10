-- =============================================================
-- Bureau of Patty Statistics — Supabase setup (BASELINE, v1)
--
-- Run this ONCE in the Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- THE ONLY THING YOU MUST EDIT is the two email addresses in
-- STEP 1 below. Everything else is ready to run as-is.
--
-- >>> THEN RUN supabase/migrations/002_bps_v2.sql <<<
--
-- This file is the ORIGINAL v1 schema, kept as the baseline so the
-- migration has something to migrate. The application in this repo
-- requires the v2 schema and will report that the register is being
-- upgraded until 002_bps_v2.sql has been applied.
-- =============================================================


-- -------------------------------------------------------------
-- STEP 1 — AUTHORIZED AUDITORS   <<< EDIT THE TWO EMAILS HERE
--
-- This table is the allow-list. Only these addresses can ever
-- obtain an account; there is no public signup. The trigger in
-- STEP 5 refuses to create a profile for anyone else.
-- -------------------------------------------------------------
create table if not exists public.allowed_auditors (
  email        text primary key,
  auditor_key  text not null unique check (auditor_key in ('ryan', 'devin')),
  display_name text not null
);

insert into public.allowed_auditors (email, auditor_key, display_name) values
  ('ryanburtonwi@gmail.com',  'ryan',  'Ryan'),     -- <<< CHANGE THIS EMAIL
  ('devinreiter907@gmail.com', 'devin', 'Devin')     -- <<< CHANGE THIS EMAIL
on conflict (auditor_key) do update
  set email = excluded.email,
      display_name = excluded.display_name;


-- -------------------------------------------------------------
-- STEP 2 — TABLES
-- -------------------------------------------------------------

-- One row per authenticated auditor. `auditor_key` is the durable
-- application identity ('ryan' / 'devin') the UI keys off, so nobody
-- ever has to pick their own name from a menu.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  auditor_key  text not null unique check (auditor_key in ('ryan', 'devin')),
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- One row per specimen. Exists as soon as ONE auditor files.
create table if not exists public.burgers (
  id              uuid primary key default gen_random_uuid(),
  specimen_number text unique not null,
  restaurant      text not null check (length(btrim(restaurant)) > 0),
  burger          text not null check (length(btrim(burger)) > 0),
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per auditor per burger. The unique constraint is what makes
-- a second audit by the same auditor impossible at the database level.
create table if not exists public.audits (
  id              uuid primary key default gen_random_uuid(),
  burger_id       uuid not null references public.burgers (id) on delete cascade,
  auditor_id      uuid not null references public.profiles (id),
  patty           numeric(3,1) not null check (patty          between 0 and 10),
  overall_flavor  numeric(3,1) not null check (overall_flavor between 0 and 10),
  bun             numeric(3,1) not null check (bun            between 0 and 10),
  fries           numeric(3,1) not null check (fries          between 0 and 10),
  value           numeric(3,1) not null check (value          between 0 and 10),
  condiments      numeric(3,1) not null check (condiments     between 0 and 10),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint audits_one_per_auditor_per_burger unique (burger_id, auditor_id)
);

create index if not exists audits_burger_id_idx  on public.audits (burger_id);
create index if not exists audits_auditor_id_idx on public.audits (auditor_id);
create index if not exists burgers_created_at_idx on public.burgers (created_at desc);


-- -------------------------------------------------------------
-- STEP 3 — SPECIMEN NUMBERS (BPS-0001, BPS-0002, ...)
-- -------------------------------------------------------------
create sequence if not exists public.specimen_seq start with 1;

create or replace function public.assign_specimen_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.specimen_number is null or btrim(new.specimen_number) = '' then
    new.specimen_number := 'BPS-' || lpad(nextval('public.specimen_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists burgers_assign_specimen on public.burgers;
create trigger burgers_assign_specimen
  before insert on public.burgers
  for each row execute function public.assign_specimen_number();


-- -------------------------------------------------------------
-- STEP 4 — updated_at maintenance
-- -------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists burgers_touch on public.burgers;
create trigger burgers_touch before update on public.burgers
  for each row execute function public.touch_updated_at();

drop trigger if exists audits_touch on public.audits;
create trigger audits_touch before update on public.audits
  for each row execute function public.touch_updated_at();


-- -------------------------------------------------------------
-- STEP 5 — PROFILE CREATION / SIGNUP LOCKDOWN
--
-- Fires when Supabase Auth creates a user. If the address is not on
-- the allow-list the insert raises, which aborts account creation.
-- This is what makes the app closed to everyone but the two auditors.
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed public.allowed_auditors%rowtype;
begin
  select * into allowed
  from public.allowed_auditors
  where lower(email) = lower(new.email);

  if not found then
    raise exception 'Address % is not an authorized Bureau auditor.', new.email;
  end if;

  insert into public.profiles (id, auditor_key, display_name)
  values (new.id, allowed.auditor_key, allowed.display_name)
  on conflict (id) do update
    set auditor_key  = excluded.auditor_key,
        display_name = excluded.display_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -------------------------------------------------------------
-- STEP 6 — ROW LEVEL SECURITY
--
-- Proportionate for a two-person site:
--   * everything requires an authenticated session with a profile
--   * both auditors can read all burgers and all audits
--   * either may create burgers
--   * an auditor may write ONLY their own audit row
--   * nobody can touch the allow-list from the browser
-- -------------------------------------------------------------
alter table public.allowed_auditors enable row level security;
alter table public.profiles         enable row level security;
alter table public.burgers          enable row level security;
alter table public.audits           enable row level security;

-- Make API privileges explicit. Supabase project defaults have changed over
-- time, so setup must neither depend on permissive defaults nor fail on newer
-- opt-in projects. RLS still decides which rows each operation may affect.
revoke all on table public.allowed_auditors from anon, authenticated;
revoke all on table public.profiles         from anon, authenticated;
revoke all on table public.burgers          from anon, authenticated;
revoke all on table public.audits           from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select, insert, update on table public.burgers to authenticated;
grant select, insert, update on table public.audits to authenticated;

-- Helper: is the caller one of the two registered auditors?
create or replace function public.is_auditor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

revoke execute on function public.is_auditor() from public;
grant execute on function public.is_auditor() to authenticated;

-- allowed_auditors: no browser access at all (service role / SQL editor only).
drop policy if exists allowed_no_select on public.allowed_auditors;
create policy allowed_no_select on public.allowed_auditors
  for select using (false);

-- profiles: any auditor may read both profiles (the UI needs peer names).
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (public.is_auditor());

-- Display name is the only self-editable field; auditor_key is fixed.
create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id or new.auditor_key is distinct from old.auditor_key then
    raise exception 'Bureau profile identity fields cannot be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_identity on public.profiles;
create trigger profiles_protect_identity before update on public.profiles
  for each row execute function public.protect_profile_identity();

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- burgers: shared read, either auditor may create, creator may amend.
drop policy if exists burgers_read on public.burgers;
create policy burgers_read on public.burgers
  for select to authenticated using (public.is_auditor());

drop policy if exists burgers_insert on public.burgers;
create policy burgers_insert on public.burgers
  for insert to authenticated
  with check (public.is_auditor() and created_by = auth.uid());

drop policy if exists burgers_update_creator on public.burgers;
create policy burgers_update_creator on public.burgers
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- audits: shared read; write strictly limited to your own row.
-- `using` governs which rows you may target, `with check` the result,
-- so an auditor can neither overwrite nor reassign the peer's audit.
drop policy if exists audits_read on public.audits;
create policy audits_read on public.audits
  for select to authenticated using (public.is_auditor());

drop policy if exists audits_insert_own on public.audits;
create policy audits_insert_own on public.audits
  for insert to authenticated
  with check (public.is_auditor() and auditor_id = auth.uid());

drop policy if exists audits_update_own on public.audits;
create policy audits_update_own on public.audits
  for update to authenticated
  using (auditor_id = auth.uid())
  with check (auditor_id = auth.uid());

-- Filed audits may be amended but not deleted. Removing an audit would reverse
-- certification and is not part of the application workflow.
drop policy if exists audits_delete_own on public.audits;


-- -------------------------------------------------------------
-- STEP 7 — BACKFILL
--
-- If you created the two auth users BEFORE running this file, this
-- links their existing accounts to profiles. Harmless otherwise.
-- -------------------------------------------------------------
insert into public.profiles (id, auditor_key, display_name)
select u.id, a.auditor_key, a.display_name
from auth.users u
join public.allowed_auditors a on lower(a.email) = lower(u.email)
on conflict (id) do update
  set auditor_key  = excluded.auditor_key,
      display_name = excluded.display_name;


-- -------------------------------------------------------------
-- Verification — should return two rows once both auditors exist.
-- -------------------------------------------------------------
-- select p.auditor_key, p.display_name, u.email
-- from public.profiles p join auth.users u on u.id = p.id
-- order by p.auditor_key;
