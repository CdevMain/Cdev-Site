-- CDEV - planilhas: foto de capa, link do anuncio e endereco
-- Estas colunas e a versao de 13 parametros de create_property_spreadsheet ja existem em producao,
-- mas nao estavam versionadas no repositorio. Rode depois de 05_property_spreadsheets.sql.

alter table public.property_spreadsheets add column if not exists cover_image_url text;
alter table public.property_spreadsheets add column if not exists listing_url text;
alter table public.property_spreadsheets add column if not exists address text;

-- A versao antiga (10 parametros) deixava chamadas ambiguas; o Admin usa a de 13.
drop function if exists public.create_property_spreadsheet(text, text, uuid, integer, numeric, numeric, numeric, numeric, numeric, numeric);

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
  p_fixed_condo numeric default 1536.30,
  p_cover_image_url text default null,
  p_listing_url text default null,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_spreadsheet_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  if not exists (select 1 from public.users where id = p_owner_user_id and active = true) then
    raise exception 'owner user not found or inactive';
  end if;

  insert into public.property_spreadsheets (
    title, property_name, owner_user_id, year, commission_rate, cleaning_fee_per_client,
    cover_image_url, listing_url, address, created_by
  )
  values (
    coalesce(nullif(trim(p_title), ''), 'Planilha do imovel'),
    coalesce(nullif(trim(p_property_name), ''), 'Imovel'),
    p_owner_user_id,
    p_year,
    coalesce(p_commission_rate, 0.10),
    coalesce(p_cleaning_fee_per_client, 380),
    nullif(trim(p_cover_image_url), ''),
    nullif(trim(p_listing_url), ''),
    nullif(trim(p_address), ''),
    auth.uid()
  )
  returning id into new_spreadsheet_id;

  insert into public.property_spreadsheet_months (
    spreadsheet_id, month_num, clients_count, nights_count, client_description,
    paid_clients, paid_extra, fixed_gas, fixed_electricity, fixed_internet, fixed_condo
  )
  select new_spreadsheet_id, month_num, 0, 0, '*', 0, 0,
         coalesce(p_fixed_gas, 0), coalesce(p_fixed_electricity, 0), coalesce(p_fixed_internet, 0), coalesce(p_fixed_condo, 0)
    from generate_series(1, 12) as month_num;

  return new_spreadsheet_id;
end;
$$;
