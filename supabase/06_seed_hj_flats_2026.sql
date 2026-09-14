-- CDEV Admin - recria a planilha "2026 Tabela - HJ Flats.xlsx" no banco.
-- Rode depois de `05_property_spreadsheets.sql`.
-- Por padrao, vincula ao usuario cdev.main@gmail.com. Troque o email se o dono for outro.

do $$
declare
  owner_id uuid;
  sheet_id uuid;
begin
  select id into owner_id
  from public.users
  where email = 'cdev.main@gmail.com'
  limit 1;

  if owner_id is null then
    raise exception 'Usuario dono nao encontrado. Crie/promova o usuario antes de rodar este seed.';
  end if;

  select id into sheet_id
  from public.property_spreadsheets
  where owner_user_id = owner_id
    and property_name = 'HJ Flats'
    and year = 2026
  limit 1;

  if sheet_id is null then
    insert into public.property_spreadsheets (
      title,
      property_name,
      owner_user_id,
      year,
      commission_rate,
      cleaning_fee_per_client,
      active
    )
    values (
      'Tabela 2026 Airbnb: HJ-Flats',
      'HJ Flats',
      owner_id,
      2026,
      0.10,
      380,
      true
    )
    returning id into sheet_id;
  end if;

  insert into public.property_spreadsheet_months (
    spreadsheet_id,
    month_num,
    clients_count,
    nights_count,
    client_description,
    paid_clients,
    paid_extra,
    cleaning_laundry,
    host_fee_override,
    fixed_gas,
    fixed_electricity,
    fixed_internet,
    fixed_condo,
    variable_location,
    variable_description,
    variable_date,
    variable_cost,
    variable_total
  )
  values
    (sheet_id, 1, 2, 21, 'Laura + Jesica', 7456.67, 0, 760, 700, 70, 265, 123, 1536.30, '*', 'cama(box) 350' || chr(10) || 'Panela 89' || chr(10) || 'material limpeza 100 - IPTU 2026 (3710,45)', null, 539, 539),
    (sheet_id, 2, 2, 19, 'Jade + Guilherme - (Monica)', 12655.65, 0, 760, 1189.57, 70, 265, 123, 1536.30, 'Frist class', 'Kit cama + Diversos', date '2026-02-14', 512.61, 512.61),
    (sheet_id, 3, 2, 14, 'Diego + Andre', 4906.26, 0, 760, 498.55, 70, 265, 123, 1536.30, null, null, null, 0, 0),
    (sheet_id, 4, 3, 16, 'Lucas+Thiago+Leandro', 5590.11, 0, 1140, 445.011, 70, 265, 123, 1536.30, null, null, null, 0, 0),
    (sheet_id, 5, 0, 0, '*', 0, 0, 0, 0, 0, 0, 0, 1536.30, null, null, null, 0, 0),
    (sheet_id, 6, 0, 0, '*', 0, 0, 0, 0, 0, 0, 0, 1536.30, null, null, null, 0, 0),
    (sheet_id, 7, 0, 0, '*', 0, 0, 0, 0, 0, 0, 0, 1536.30, null, null, null, 0, 0),
    (sheet_id, 8, 0, 0, '*', 0, 0, 0, 0, 0, 0, 0, 1536.30, null, null, null, 0, 0),
    (sheet_id, 9, 0, 0, '*', 0, 0, 0, 0, 0, 0, 0, 1536.30, null, null, null, 0, 0),
    (sheet_id, 10, 0, 0, '*', 0, 0, 0, 0, 0, 0, 0, 1536.30, null, null, null, 0, 0),
    (sheet_id, 11, 0, 0, '*', 0, 0, 0, 0, 0, 0, 0, 1536.30, null, null, null, 0, 0),
    (sheet_id, 12, 0, 0, '*', 0, 0, 0, 0, 0, 0, 0, 1536.30, null, null, null, 0, 0)
  on conflict (spreadsheet_id, month_num) do update
  set clients_count = excluded.clients_count,
      nights_count = excluded.nights_count,
      client_description = excluded.client_description,
      paid_clients = excluded.paid_clients,
      paid_extra = excluded.paid_extra,
      cleaning_laundry = excluded.cleaning_laundry,
      host_fee_override = excluded.host_fee_override,
      fixed_gas = excluded.fixed_gas,
      fixed_electricity = excluded.fixed_electricity,
      fixed_internet = excluded.fixed_internet,
      fixed_condo = excluded.fixed_condo,
      variable_location = excluded.variable_location,
      variable_description = excluded.variable_description,
      variable_date = excluded.variable_date,
      variable_cost = excluded.variable_cost,
      variable_total = excluded.variable_total,
      updated_at = now();
end $$;

select
  ps.title,
  ps.property_name,
  u.email as owner_email,
  ps.year,
  ps.commission_rate,
  count(pm.id) as months_created
from public.property_spreadsheets ps
join public.users u on u.id = ps.owner_user_id
left join public.property_spreadsheet_months pm on pm.spreadsheet_id = ps.id
where ps.property_name = 'HJ Flats'
  and ps.year = 2026
group by ps.title, ps.property_name, u.email, ps.year, ps.commission_rate;
