-- CDEV Admin - modulo de planilhas de imoveis/clientes
-- Versao compativel para colar inteira no Supabase SQL Editor.
-- Use esta se o editor acusar "unterminated dollar-quoted string".

create table if not exists public.property_spreadsheets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  property_name text not null,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  commission_rate numeric(7,6) not null default 0.10 check (commission_rate >= 0 and commission_rate <= 1),
  cleaning_fee_per_client numeric(12,2) not null default 380,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_spreadsheet_months (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id uuid not null references public.property_spreadsheets(id) on delete cascade,
  month_num integer not null check (month_num between 1 and 12),
  clients_count numeric(12,2) not null default 0,
  nights_count numeric(12,2) not null default 0,
  client_description text not null default '*',
  paid_clients numeric(12,2) not null default 0,
  paid_extra numeric(12,2) not null default 0,
  cleaning_laundry numeric(12,2),
  host_fee_override numeric(12,2),
  fixed_gas numeric(12,2) not null default 0,
  fixed_electricity numeric(12,2) not null default 0,
  fixed_internet numeric(12,2) not null default 0,
  fixed_condo numeric(12,2) not null default 0,
  variable_location text,
  variable_description text,
  variable_date date,
  variable_cost numeric(12,2) not null default 0,
  variable_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spreadsheet_id, month_num)
);

drop trigger if exists property_spreadsheets_set_updated_at on public.property_spreadsheets;
create trigger property_spreadsheets_set_updated_at
before update on public.property_spreadsheets
for each row execute function public.set_updated_at();

drop trigger if exists property_spreadsheet_months_set_updated_at on public.property_spreadsheet_months;
create trigger property_spreadsheet_months_set_updated_at
before update on public.property_spreadsheet_months
for each row execute function public.set_updated_at();

create or replace function public.can_access_spreadsheet(target_spreadsheet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as '
  select exists (
    select 1
    from public.property_spreadsheets ps
    join public.users u on u.id = auth.uid()
    where ps.id = target_spreadsheet_id
      and ps.active = true
      and u.active = true
      and (
        u.role = ''admin''
        or (
          ps.owner_user_id = u.id
          and exists (
            select 1
            from public.system_settings ss
            where ss.key = ''spreadsheet_visible''
              and ss.enabled = true
          )
        )
      )
  );
';

create or replace function public.create_property_spreadsheet(
  p_title text,
  p_property_name text,
  p_owner_user_id uuid,
  p_year integer,
  p_commission_rate numeric default 0.10,
  p_cleaning_fee_per_client numeric default 380,
  p_fixed_gas numeric default 70,
  p_fixed_electricity numeric default 265,
  p_fixed_internet numeric default 123,
  p_fixed_condo numeric default 1536.30
)
returns uuid
language plpgsql
security definer
set search_path = public
as '
declare
  new_spreadsheet_id uuid;
begin
  if not public.is_admin() then
    raise exception ''admin access required'';
  end if;

  if not exists (select 1 from public.users where id = p_owner_user_id and active = true) then
    raise exception ''owner user not found or inactive'';
  end if;

  insert into public.property_spreadsheets (
    title,
    property_name,
    owner_user_id,
    year,
    commission_rate,
    cleaning_fee_per_client,
    created_by
  )
  values (
    coalesce(nullif(trim(p_title), ''''), ''Planilha do imovel''),
    coalesce(nullif(trim(p_property_name), ''''), ''Imovel''),
    p_owner_user_id,
    p_year,
    coalesce(p_commission_rate, 0.10),
    coalesce(p_cleaning_fee_per_client, 380),
    auth.uid()
  )
  returning id into new_spreadsheet_id;

  insert into public.property_spreadsheet_months (
    spreadsheet_id,
    month_num,
    clients_count,
    nights_count,
    client_description,
    paid_clients,
    paid_extra,
    fixed_gas,
    fixed_electricity,
    fixed_internet,
    fixed_condo
  )
  select
    new_spreadsheet_id,
    month_num,
    0,
    0,
    ''*'',
    0,
    0,
    coalesce(p_fixed_gas, 0),
    coalesce(p_fixed_electricity, 0),
    coalesce(p_fixed_internet, 0),
    coalesce(p_fixed_condo, 0)
  from generate_series(1, 12) as month_num;

  return new_spreadsheet_id;
end;
';

alter table public.property_spreadsheets enable row level security;
alter table public.property_spreadsheet_months enable row level security;

drop policy if exists "property_spreadsheets_select_owner_or_admin" on public.property_spreadsheets;
create policy "property_spreadsheets_select_owner_or_admin"
on public.property_spreadsheets
for select
to authenticated
using (
  active = true
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.active = true
      and (
        u.role = 'admin'
        or (
          owner_user_id = u.id
          and exists (
            select 1
            from public.system_settings ss
            where ss.key = 'spreadsheet_visible'
              and ss.enabled = true
          )
        )
      )
  )
);

drop policy if exists "property_spreadsheets_admin_write" on public.property_spreadsheets;
create policy "property_spreadsheets_admin_write"
on public.property_spreadsheets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "property_months_select_owner_or_admin" on public.property_spreadsheet_months;
create policy "property_months_select_owner_or_admin"
on public.property_spreadsheet_months
for select
to authenticated
using (public.can_access_spreadsheet(spreadsheet_id));

drop policy if exists "property_months_admin_write" on public.property_spreadsheet_months;
create policy "property_months_admin_write"
on public.property_spreadsheet_months
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.property_spreadsheets;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.property_spreadsheet_months;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
