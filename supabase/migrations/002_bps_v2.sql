-- =============================================================
-- Bureau of Patty Statistics — MIGRATION 002 : BPS v2
--
-- Run this ONCE in the Supabase SQL Editor, after supabase/setup.sql.
-- (Dashboard -> SQL Editor -> New query -> paste -> Run.)
--
-- WHAT THIS DOES
--   * makes the ESTABLISHMENT the ranked entity
--   * introduces a shared, permanent LOCATION register
--   * adds SERVICE (Speed + Friendliness) to every audit
--   * allows many audits per auditor per establishment
--   * adds the Records Office tables
--
-- WHAT THIS DOES NOT DO
--   * it deletes nothing. Every existing audit keeps its scores, its
--     timestamps and its owner. The `burgers` table is left intact as
--     historical provenance and each migrated audit keeps a pointer
--     back to the row it came from.
--   * it invents no Service data. Migrated audits have NULL Service,
--     which makes them pre-current-schema, which returns their
--     establishment to Pending until each auditor files a current
--     audit. That is the intended behaviour, not data loss.
--
-- The whole file is idempotent: running it twice is harmless.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- STEP 1 — NAME NORMALISATION
--
-- Must behave identically to taxonomy.js normalizeName():
-- lowercase, drop apostrophes, collapse every other punctuation run
-- to a single space, trim. This is what stops "St. Louis Park",
-- "st louis park" and "ST LOUIS PARK" becoming three locations.
-- -------------------------------------------------------------
create or replace function public.bps_name_key(v text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(v, '')), '[''‘’ʼ]', '', 'g'),
      '[^a-z0-9]+', ' ', 'g'),
    ' ')
$$;


-- -------------------------------------------------------------
-- STEP 2 — LOCATIONS
-- -------------------------------------------------------------
create table if not exists public.locations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 1 and 80),
  name_key       text not null,
  location_group text not null default 'added',
  is_preset      boolean not null default false,
  archived       boolean not null default false,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists locations_name_key_uidx on public.locations (name_key);

-- Preset Minneapolis–St. Paul metro register. Auditor-added locations
-- behave identically once created; `is_preset` is descriptive only.
insert into public.locations (name, name_key, location_group, is_preset) values
  ('Downtown Minneapolis', 'downtown minneapolis', 'minneapolis'),
  ('North Loop', 'north loop', 'minneapolis'),
  ('Northeast Minneapolis', 'northeast minneapolis', 'minneapolis'),
  ('Uptown', 'uptown', 'minneapolis'),
  ('Lyn-Lake', 'lyn lake', 'minneapolis'),
  ('Whittier', 'whittier', 'minneapolis'),
  ('Dinkytown', 'dinkytown', 'minneapolis'),
  ('Seward', 'seward', 'minneapolis'),
  ('Longfellow', 'longfellow', 'minneapolis'),
  ('Nokomis', 'nokomis', 'minneapolis'),
  ('Linden Hills', 'linden hills', 'minneapolis'),
  ('Cedar-Riverside', 'cedar riverside', 'minneapolis'),
  ('North Minneapolis', 'north minneapolis', 'minneapolis'),
  ('Downtown St. Paul', 'downtown st paul', 'saint-paul'),
  ('Grand Avenue', 'grand avenue', 'saint-paul'),
  ('Cathedral Hill', 'cathedral hill', 'saint-paul'),
  ('Highland Park', 'highland park', 'saint-paul'),
  ('Macalester-Groveland', 'macalester groveland', 'saint-paul'),
  ('West Seventh', 'west seventh', 'saint-paul'),
  ('Como', 'como', 'saint-paul'),
  ('St. Anthony Park', 'st anthony park', 'saint-paul'),
  ('St. Louis Park', 'st louis park', 'inner-ring'),
  ('Richfield', 'richfield', 'inner-ring'),
  ('Edina', 'edina', 'inner-ring'),
  ('Golden Valley', 'golden valley', 'inner-ring'),
  ('Hopkins', 'hopkins', 'inner-ring'),
  ('Roseville', 'roseville', 'inner-ring'),
  ('Falcon Heights', 'falcon heights', 'inner-ring'),
  ('Columbia Heights', 'columbia heights', 'inner-ring'),
  ('Fridley', 'fridley', 'inner-ring'),
  ('Brooklyn Center', 'brooklyn center', 'inner-ring'),
  ('Maplewood', 'maplewood', 'inner-ring'),
  ('West St. Paul', 'west st paul', 'inner-ring'),
  ('South St. Paul', 'south st paul', 'inner-ring'),
  ('Mendota Heights', 'mendota heights', 'inner-ring'),
  ('Bloomington', 'bloomington', 'greater-metro'),
  ('Eden Prairie', 'eden prairie', 'greater-metro'),
  ('Minnetonka', 'minnetonka', 'greater-metro'),
  ('Plymouth', 'plymouth', 'greater-metro'),
  ('Maple Grove', 'maple grove', 'greater-metro'),
  ('Brooklyn Park', 'brooklyn park', 'greater-metro'),
  ('Eagan', 'eagan', 'greater-metro'),
  ('Burnsville', 'burnsville', 'greater-metro'),
  ('Apple Valley', 'apple valley', 'greater-metro'),
  ('Lakeville', 'lakeville', 'greater-metro'),
  ('Savage', 'savage', 'greater-metro'),
  ('Prior Lake', 'prior lake', 'greater-metro'),
  ('Shakopee', 'shakopee', 'greater-metro'),
  ('Chanhassen', 'chanhassen', 'greater-metro'),
  ('Wayzata', 'wayzata', 'greater-metro'),
  ('Woodbury', 'woodbury', 'greater-metro'),
  ('Cottage Grove', 'cottage grove', 'greater-metro'),
  ('Inver Grove Heights', 'inver grove heights', 'greater-metro'),
  ('Blaine', 'blaine', 'north-metro'),
  ('Coon Rapids', 'coon rapids', 'north-metro'),
  ('Anoka', 'anoka', 'north-metro'),
  ('White Bear Lake', 'white bear lake', 'north-metro'),
  ('Stillwater', 'stillwater', 'north-metro')
on conflict (name_key) do nothing;


-- -------------------------------------------------------------
-- STEP 3 — ESTABLISHMENTS
--
-- One row per restaurant brand. Branches are NOT separate rows; the
-- branch lives on the audit, as its location.
-- -------------------------------------------------------------
create table if not exists public.establishments (
  id          uuid primary key default gen_random_uuid(),
  file_number text unique,
  name        text not null check (length(btrim(name)) > 0),
  name_key    text not null,
  category    text not null default 'other',
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- The controlled taxonomy. Categories are never freeform.
alter table public.establishments drop constraint if exists establishments_category_check;
alter table public.establishments add constraint establishments_category_check
  check (category in ('fast-food', 'fast-casual', 'casual-dining', 'bar-pub',
                      'brewery', 'diner-cafe', 'fine-dining', 'food-truck', 'other'));

-- Only LIVE establishments must have unique names; a record retired by a
-- merge keeps its old name in place without blocking the survivor.
create unique index if not exists establishments_name_key_uidx
  on public.establishments (name_key) where archived_at is null;

create sequence if not exists public.establishment_seq start with 1;

create or replace function public.assign_establishment_file_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.file_number is null or btrim(new.file_number) = '' then
    new.file_number := 'BPS-' || lpad(nextval('public.establishment_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists establishments_assign_file_number on public.establishments;
create trigger establishments_assign_file_number
  before insert on public.establishments
  for each row execute function public.assign_establishment_file_number();

drop trigger if exists establishments_touch on public.establishments;
create trigger establishments_touch before update on public.establishments
  for each row execute function public.touch_updated_at();

drop trigger if exists locations_touch on public.locations;
create trigger locations_touch before update on public.locations
  for each row execute function public.touch_updated_at();


-- -------------------------------------------------------------
-- STEP 4 — BACKFILL ESTABLISHMENTS FROM THE EXISTING REGISTER
--
-- Each distinct restaurant name in `burgers` becomes one establishment,
-- keeping the earliest filing's timestamp and creator.
-- -------------------------------------------------------------
insert into public.establishments (name, name_key, category, created_by, created_at)
select distinct on (public.bps_name_key(b.restaurant))
       b.restaurant,
       public.bps_name_key(b.restaurant),
       'other',
       b.created_by,
       b.created_at
from public.burgers b
order by public.bps_name_key(b.restaurant), b.created_at asc
on conflict do nothing;

-- File numbers for anything inserted before the trigger existed.
do $$
declare r record;
begin
  for r in select id from public.establishments where file_number is null order by created_at loop
    update public.establishments
       set file_number = 'BPS-' || lpad(nextval('public.establishment_seq')::text, 4, '0')
     where id = r.id;
  end loop;
end $$;


-- -------------------------------------------------------------
-- STEP 5 — AUDITS: THE v2 SHAPE
--
-- The existing `audits` table is extended in place, so every filed
-- score, timestamp and owner survives untouched.
-- -------------------------------------------------------------

-- 5a. burger_id -> legacy_burger_id (provenance, no longer the parent)
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'audits' and column_name = 'burger_id') then
    alter table public.audits rename column burger_id to legacy_burger_id;
  end if;
end $$;

alter table public.audits alter column legacy_burger_id drop not null;

-- 5b. one audit per auditor per burger is no longer the model: an
--     auditor may audit the same establishment many times.
alter table public.audits drop constraint if exists audits_one_per_auditor_per_burger;

-- 5c. new columns. Service is deliberately NULLABLE: legacy audits have
--     no Service data and must not be given a fabricated zero.
alter table public.audits add column if not exists establishment_id uuid references public.establishments (id);
alter table public.audits add column if not exists burger text;
alter table public.audits add column if not exists location_id uuid references public.locations (id);
alter table public.audits add column if not exists service_speed numeric(3,1);
alter table public.audits add column if not exists service_friendliness numeric(3,1);
alter table public.audits add column if not exists schema_version integer not null default 1;

alter table public.audits drop constraint if exists audits_service_speed_check;
alter table public.audits add constraint audits_service_speed_check
  check (service_speed is null or service_speed between 0 and 10);
alter table public.audits drop constraint if exists audits_service_friendliness_check;
alter table public.audits add constraint audits_service_friendliness_check
  check (service_friendliness is null or service_friendliness between 0 and 10);
alter table public.audits drop constraint if exists audits_burger_text_check;
alter table public.audits add constraint audits_burger_text_check
  check (burger is null or length(btrim(burger)) > 0);

-- 5d. backfill establishment + burger name from the legacy parent row
update public.audits a
   set establishment_id = e.id,
       burger = coalesce(a.burger, b.burger)
  from public.burgers b
  join public.establishments e on e.name_key = public.bps_name_key(b.restaurant)
 where a.legacy_burger_id = b.id
   and a.establishment_id is null;

-- 5e. every audit must belong to an establishment from here on
do $$
begin
  if not exists (select 1 from public.audits where establishment_id is null) then
    alter table public.audits alter column establishment_id set not null;
  end if;
  if not exists (select 1 from public.audits where burger is null) then
    alter table public.audits alter column burger set not null;
  end if;
end $$;

drop index if exists public.audits_burger_id_idx;
create index if not exists audits_establishment_id_idx on public.audits (establishment_id);
create index if not exists audits_location_id_idx on public.audits (location_id);
create index if not exists audits_auditor_id_idx on public.audits (auditor_id);
create index if not exists establishments_created_at_idx on public.establishments (created_at desc);


-- -------------------------------------------------------------
-- STEP 6 — RECORDS OFFICE
--
-- bureau_records         the entry a definition currently holds
-- bureau_record_history  every entry it has ever held
-- bureau_record_acks     which auditor has SEEN which entry
--
-- Record existence is shared. Acknowledgement is per auditor, so Ryan
-- dismissing a proclamation never prevents Devin from seeing it, and
-- neither erases the other's history.
-- -------------------------------------------------------------
create table if not exists public.bureau_records (
  record_id          text primary key,
  holder             text check (holder is null or holder in ('ryan', 'devin')),
  establishment_id   uuid references public.establishments (id) on delete set null,
  establishment_name text,
  value              numeric,
  value_text         text,
  detail             jsonb not null default '{}'::jsonb,
  fingerprint        text not null,
  version            integer not null default 1,
  established_at     timestamptz not null default now(),
  previous           jsonb,
  updated_by         uuid references public.profiles (id),
  updated_at         timestamptz not null default now()
);

create table if not exists public.bureau_record_history (
  id                 bigserial primary key,
  record_id          text not null,
  holder             text,
  establishment_id   uuid,
  establishment_name text,
  value              numeric,
  value_text         text,
  detail             jsonb not null default '{}'::jsonb,
  version            integer not null default 1,
  established_at     timestamptz,
  ended_at           timestamptz not null default now()
);

create index if not exists bureau_record_history_record_idx
  on public.bureau_record_history (record_id, ended_at desc);

create table if not exists public.bureau_record_acks (
  auditor_id      uuid not null references public.profiles (id) on delete cascade,
  record_id       text not null,
  fingerprint     text not null,
  acknowledged_at timestamptz not null default now(),
  primary key (auditor_id, record_id)
);


-- -------------------------------------------------------------
-- STEP 7 — RECORD SYNC RPC
--
-- The client decides which records changed; this applies the whole
-- batch atomically so the archive-then-advance sequence cannot half
-- apply when both auditors file at once.
-- -------------------------------------------------------------
create or replace function public.bps_records_sync(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item      jsonb;
  existing  public.bureau_records%rowtype;
  had       boolean;
  written   jsonb := '[]'::jsonb;
begin
  if not public.is_auditor() then
    raise exception 'Only Bureau auditors may enter records.';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    select * into existing from public.bureau_records where record_id = item->>'recordId';
    had := found;

    -- An identical fingerprint is not news; leave the standing entry alone.
    if had and existing.fingerprint is not distinct from (item->>'fingerprint') then
      continue;
    end if;

    if had then
      insert into public.bureau_record_history
        (record_id, holder, establishment_id, establishment_name, value, value_text,
         detail, version, established_at, ended_at)
      values
        (existing.record_id, existing.holder, existing.establishment_id, existing.establishment_name,
         existing.value, existing.value_text, existing.detail, existing.version,
         existing.established_at, now());
    end if;

    insert into public.bureau_records
      (record_id, holder, establishment_id, establishment_name, value, value_text,
       detail, fingerprint, version, established_at, previous, updated_by, updated_at)
    values (
      item->>'recordId',
      nullif(item->>'holder', ''),
      nullif(item->>'establishmentId', '')::uuid,
      nullif(item->>'establishmentName', ''),
      nullif(item->>'value', '')::numeric,
      nullif(item->>'valueText', ''),
      coalesce(item->'detail', '{}'::jsonb),
      item->>'fingerprint',
      coalesce(existing.version, 0) + 1,
      coalesce((item->>'establishedAt')::timestamptz, now()),
      case when had then jsonb_build_object(
        'holder', existing.holder,
        'value', existing.value,
        'valueText', existing.value_text,
        'establishmentName', existing.establishment_name,
        'establishedAt', existing.established_at) else null end,
      auth.uid(),
      now())
    on conflict (record_id) do update set
      holder             = excluded.holder,
      establishment_id   = excluded.establishment_id,
      establishment_name = excluded.establishment_name,
      value              = excluded.value,
      value_text         = excluded.value_text,
      detail             = excluded.detail,
      fingerprint        = excluded.fingerprint,
      version            = excluded.version,
      established_at     = excluded.established_at,
      previous           = excluded.previous,
      updated_by         = excluded.updated_by,
      updated_at         = now();

    written := written || jsonb_build_array(item->>'recordId');
  end loop;

  return written;
end;
$$;


-- -------------------------------------------------------------
-- STEP 8 — ROW LEVEL SECURITY
--
-- Same proportionate model as v1:
--   * everything requires an authenticated session with a profile
--   * both auditors read all shared data
--   * both may create establishments and locations, and correct shared
--     metadata (a typo belongs to nobody)
--   * an auditor may write ONLY their own audit rows
--   * record acknowledgement is private to each auditor
-- -------------------------------------------------------------
alter table public.establishments        enable row level security;
alter table public.locations             enable row level security;
alter table public.bureau_records        enable row level security;
alter table public.bureau_record_history enable row level security;
alter table public.bureau_record_acks    enable row level security;

revoke all on table public.establishments        from anon, authenticated;
revoke all on table public.locations             from anon, authenticated;
revoke all on table public.bureau_records        from anon, authenticated;
revoke all on table public.bureau_record_history from anon, authenticated;
revoke all on table public.bureau_record_acks    from anon, authenticated;

grant select, insert, update on table public.establishments to authenticated;
grant select, insert, update on table public.locations      to authenticated;
grant select on table public.bureau_records        to authenticated;
grant select on table public.bureau_record_history to authenticated;
grant select, insert, update on table public.bureau_record_acks to authenticated;
grant usage on sequence public.establishment_seq to authenticated;

-- establishments: shared read, shared create, shared metadata correction.
drop policy if exists establishments_read on public.establishments;
create policy establishments_read on public.establishments
  for select to authenticated using (public.is_auditor());

drop policy if exists establishments_insert on public.establishments;
create policy establishments_insert on public.establishments
  for insert to authenticated
  with check (public.is_auditor() and created_by = auth.uid());

drop policy if exists establishments_update on public.establishments;
create policy establishments_update on public.establishments
  for update to authenticated
  using (public.is_auditor()) with check (public.is_auditor());

-- locations: shared read, shared create, shared correction, never deleted.
drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations
  for select to authenticated using (public.is_auditor());

drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations
  for insert to authenticated
  with check (public.is_auditor() and is_preset = false);

drop policy if exists locations_update on public.locations;
create policy locations_update on public.locations
  for update to authenticated
  using (public.is_auditor()) with check (public.is_auditor());

-- audits: shared read; write strictly limited to your own rows. The v1
-- policies already say this and are re-asserted here for clarity.
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
  using (auditor_id = auth.uid()) with check (auditor_id = auth.uid());

-- An auditor must not be able to move their audit onto the peer's row,
-- nor reassign ownership by amendment.
create or replace function public.protect_audit_owner()
returns trigger
language plpgsql
as $$
begin
  if new.auditor_id is distinct from old.auditor_id then
    raise exception 'An audit cannot change owner.';
  end if;
  return new;
end;
$$;

drop trigger if exists audits_protect_owner on public.audits;
create trigger audits_protect_owner before update on public.audits
  for each row execute function public.protect_audit_owner();

-- records: readable by both, written only through the RPC.
drop policy if exists bureau_records_read on public.bureau_records;
create policy bureau_records_read on public.bureau_records
  for select to authenticated using (public.is_auditor());

drop policy if exists bureau_record_history_read on public.bureau_record_history;
create policy bureau_record_history_read on public.bureau_record_history
  for select to authenticated using (public.is_auditor());

-- acknowledgements: each auditor sees and writes only their own.
drop policy if exists bureau_record_acks_read on public.bureau_record_acks;
create policy bureau_record_acks_read on public.bureau_record_acks
  for select to authenticated using (auditor_id = auth.uid());

drop policy if exists bureau_record_acks_insert on public.bureau_record_acks;
create policy bureau_record_acks_insert on public.bureau_record_acks
  for insert to authenticated
  with check (public.is_auditor() and auditor_id = auth.uid());

drop policy if exists bureau_record_acks_update on public.bureau_record_acks;
create policy bureau_record_acks_update on public.bureau_record_acks
  for update to authenticated
  using (auditor_id = auth.uid()) with check (auditor_id = auth.uid());

revoke execute on function public.bps_records_sync(jsonb) from public, anon;
grant execute on function public.bps_records_sync(jsonb) to authenticated;
grant execute on function public.bps_name_key(text) to authenticated;

commit;


-- -------------------------------------------------------------
-- VERIFICATION — run these afterwards if you like.
-- -------------------------------------------------------------
-- select count(*) as locations from public.locations;                    -- expect 58+
-- select count(*) as establishments from public.establishments;
-- select count(*) filter (where establishment_id is not null) as migrated,
--        count(*) filter (where service_speed is null) as awaiting_service
--   from public.audits;
