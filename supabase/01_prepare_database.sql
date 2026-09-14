-- CDEV Admin - preparo completo do banco Supabase
-- Rode este arquivo no Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  active boolean not null default true,
  last_login timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  enabled boolean not null default true,
  description text,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists system_settings_set_updated_at on public.system_settings;
create trigger system_settings_set_updated_at
before update on public.system_settings
for each row execute function public.set_updated_at();

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = check_user_id
      and role = 'admin'
      and active = true
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_profile boolean;
begin
  select not exists (select 1 from public.users) into first_profile;

  insert into public.users (id, email, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    case when first_profile then 'admin' else 'user' end,
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.record_last_login(target_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'not allowed';
  end if;

  update public.users
  set last_login = now(),
      updated_at = now()
  where id = target_user_id;
end;
$$;

alter table public.users enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin"
on public.users
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "users_update_admin_only" on public.users;
create policy "users_update_admin_only"
on public.users
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users_insert_admin_only" on public.users;
create policy "users_insert_admin_only"
on public.users
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "users_delete_admin_only" on public.users;
create policy "users_delete_admin_only"
on public.users
for delete
to authenticated
using (public.is_admin());

drop policy if exists "settings_read_active_users" on public.system_settings;
create policy "settings_read_active_users"
on public.system_settings
for select
to authenticated
using (
  exists (
    select 1 from public.users
    where id = auth.uid()
      and active = true
  )
);

drop policy if exists "settings_write_admin_only" on public.system_settings;
create policy "settings_write_admin_only"
on public.system_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.system_settings (key, enabled, description)
values
  ('dashboard_enabled', true, 'Controla acesso e exibicao do dashboard.'),
  ('editing_enabled', true, 'Controla edicao inline e acoes de escrita.'),
  ('user_registration_enabled', true, 'Permite criacao ou convite de novos usuarios.'),
  ('spreadsheet_visible', true, 'Controla visualizacao de tabelas e planilhas.'),
  ('admin_panel_enabled', true, 'Controla acesso ao painel administrativo.')
on conflict (key) do update
set description = excluded.description;

do $$
begin
  alter publication supabase_realtime add table public.system_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
