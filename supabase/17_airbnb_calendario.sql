-- CDEV - Calendario do Airbnb (somente leitura) + reservas por imovel
-- Rode depois de 16_mensagens_agendadas.sql. Idempotente.
--
-- property_calendars: link .ics de exportacao do Airbnb por imovel (property_name). So admin le/escreve:
--   o link da acesso de leitura as reservas, nunca vai para o navegador de proprietarios.
-- property_bookings: reservas vindas do calendario (datas, codigo) e do CSV do Airbnb (nome, valores).
--   O sistema NUNCA escreve no Airbnb: so faz GET no link .ics (Edge Function airbnb-ical).

create table if not exists public.property_calendars (
  id uuid primary key default gen_random_uuid(),
  property_name text not null unique,
  ical_url text check (ical_url is null or ical_url ~* '^https://([a-z0-9-]+\.)*airbnb\.[a-z.]+/calendar/ical/'),
  active boolean not null default true,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status is null or last_sync_status in ('OK','ERRO')),
  last_sync_message text,
  last_sync_counts jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_bookings (
  id uuid primary key default gen_random_uuid(),
  property_name text not null,
  source text not null default 'ICAL' check (source in ('ICAL','CSV','MANUAL')),
  kind text not null default 'RESERVA' check (kind in ('RESERVA','BLOQUEIO')),
  status text not null default 'ATIVA' check (status in ('ATIVA','CANCELADA','REMOVIDA')),
  ical_uid text,
  code text,                       -- codigo de confirmacao do Airbnb (HM...)
  summary text,
  check_in date not null,
  check_out date not null check (check_out > check_in),
  nights integer generated always as (check_out - check_in) stored,
  guest_name text,
  guests integer,
  gross_amount numeric(12,2),      -- valor pago pelo hospede / ganhos brutos (vai para "Valor pago pelos hospedes")
  payout_amount numeric(12,2),     -- valor recebido do Airbnb (liquido)
  cleaning_fee numeric(12,2),
  service_fee numeric(12,2),
  notes text,
  last_seen_at timestamptz,        -- ultima vez que apareceu no calendario
  csv_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists property_bookings_uid_uq on public.property_bookings (property_name, ical_uid) where ical_uid is not null;
create unique index if not exists property_bookings_code_uq on public.property_bookings (property_name, code) where code is not null;
create index if not exists property_bookings_dates_idx on public.property_bookings (property_name, check_in, check_out);

alter table public.property_calendars enable row level security;
alter table public.property_bookings enable row level security;

drop policy if exists property_calendars_admin_all on public.property_calendars;
create policy property_calendars_admin_all on public.property_calendars for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists property_bookings_select on public.property_bookings;
create policy property_bookings_select on public.property_bookings for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.property_spreadsheets s where s.property_name = property_bookings.property_name and public.can_access_spreadsheet(s.id))
  );
drop policy if exists property_bookings_admin_insert on public.property_bookings;
create policy property_bookings_admin_insert on public.property_bookings for insert to authenticated with check ((select public.is_admin()));
drop policy if exists property_bookings_admin_update on public.property_bookings;
create policy property_bookings_admin_update on public.property_bookings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists property_bookings_admin_delete on public.property_bookings;
create policy property_bookings_admin_delete on public.property_bookings for delete to authenticated using ((select public.is_admin()));

revoke all on public.property_calendars from anon;
revoke all on public.property_bookings from anon;
