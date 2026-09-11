-- Bureau of Patty Statistics — dynamic personnel and active-auditor RLS
-- Additive/idempotent. Existing auth users, profiles, audits and records are preserved.
begin;

alter table public.profiles drop constraint if exists profiles_auditor_key_check;
alter table public.allowed_auditors drop constraint if exists allowed_auditors_auditor_key_check;
alter table public.bureau_records drop constraint if exists bureau_records_holder_check;

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists role text not null default 'auditor';
alter table public.profiles add column if not exists invitation_status text not null default 'active';
alter table public.profiles add column if not exists created_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'auditor'));
alter table public.profiles drop constraint if exists profiles_invitation_status_check;
alter table public.profiles add constraint profiles_invitation_status_check
  check (invitation_status in ('invited', 'active', 'deactivated'));
create unique index if not exists profiles_email_uidx on public.profiles (lower(email)) where email is not null;

update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
update public.profiles set role = 'admin' where auditor_key = 'ryan';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  proposed_key text;
  proposed_name text;
begin
  proposed_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
                            split_part(coalesce(new.email, 'auditor'), '@', 1));
  proposed_key := coalesce(nullif(public.bps_name_key(new.raw_user_meta_data->>'auditor_key'), ''),
                           nullif(public.bps_name_key(proposed_name), ''), new.id::text);
  proposed_key := replace(proposed_key, ' ', '-');
  if exists (select 1 from public.profiles where auditor_key = proposed_key) then
    proposed_key := proposed_key || '-' || left(new.id::text, 8);
  end if;

  insert into public.profiles
    (id, auditor_key, display_name, email, active, role, invitation_status)
  values
    (new.id, proposed_key, proposed_name, lower(new.email), new.invited_at is null, 'auditor',
     case when new.invited_at is not null and new.email_confirmed_at is null then 'invited' else 'active' end)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_auditor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

create or replace function public.is_bureau_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.active and p.role = 'admin')
$$;

create or replace function public.activate_invited_profile()
returns void language sql security definer set search_path = public as $$
  update public.profiles set invitation_status = 'active', active = true
   where id = auth.uid() and invitation_status = 'invited'
$$;

grant execute on function public.is_auditor() to authenticated;
grant execute on function public.is_bureau_admin() to authenticated;
grant execute on function public.activate_invited_profile() to authenticated;

drop function if exists public.protect_profile_identity() cascade;
create or replace function public.protect_profile_identity()
returns trigger language plpgsql as $$
begin
  if old.id = auth.uid() and old.invitation_status = 'invited' and
     new.invitation_status = 'active' and new.active and
     new.id = old.id and new.auditor_key = old.auditor_key and new.email is not distinct from old.email and
     new.role = old.role then
    return new;
  end if;
  if auth.uid() is not null and not public.is_bureau_admin() and
     (new.id is distinct from old.id or new.auditor_key is distinct from old.auditor_key or
      new.email is distinct from old.email or new.active is distinct from old.active or
      new.role is distinct from old.role or new.invitation_status is distinct from old.invitation_status) then
    raise exception 'Bureau profile identity fields cannot be changed.';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_identity before update on public.profiles
  for each row execute function public.protect_profile_identity();

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.is_auditor());

grant delete on table public.audits to authenticated;
drop policy if exists audits_delete_own on public.audits;
create policy audits_delete_own on public.audits for delete to authenticated
  using (public.is_auditor() and auditor_id = auth.uid());

commit;
