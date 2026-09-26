-- =====================================================================
-- CDEV CONTROL CENTER - Site Factory + CRM + Financeiro + Monitoramento
-- =====================================================================
-- Rode DEPOIS de 01_prepare_database.sql (usa public.users, public.is_admin,
-- public.set_updated_at e public.system_settings que ja existem).
-- Idempotente: pode ser executado novamente sem perder dados.
--
-- Ordem:
--   1. 07_control_center.sql            (este arquivo)
--   2. 08_control_center_templates.sql  (templates iniciais do Site Factory)
--   3. 09_control_center_cron.sql       (OPCIONAL - agenda via pg_cron)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 0. Toggle global do modulo (reaproveita system_settings existente)
-- ---------------------------------------------------------------------
insert into public.system_settings (key, enabled, description)
values ('control_center_enabled', true, 'Controla acesso ao CDEV Control Center (clientes, sites, financeiro, monitoramento, CRM).')
on conflict (key) do update set description = excluded.description;

-- ---------------------------------------------------------------------
-- 1. Configuracoes do Control Center (valores nao-booleanos)
-- ---------------------------------------------------------------------
create table if not exists public.cc_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.cc_settings (key, value, description) values
  ('payment_alert_days',       '[30,15,7,3,1,0]'::jsonb, 'Dias antes do vencimento em que um alerta de pagamento e emitido (0 = no dia).'),
  ('overdue_alert_days',       '[1,3,7,15,30]'::jsonb,   'Dias apos o vencimento em que um alerta de atraso e emitido.'),
  ('expiry_alert_days',        '[30,15,7,3,1,0]'::jsonb, 'Dias antes do vencimento de dominio/hospedagem sem cobranca aberta.'),
  ('ssl_alert_days',           '[30,14,7,3,1]'::jsonb,   'Dias antes da expiracao do certificado SSL.'),
  ('upcoming_window_days',     '7'::jsonb,               'Janela (dias) considerada "vencendo em breve" no dashboard.'),
  ('monitoring_interval_min',  '5'::jsonb,               'Intervalo padrao entre checks HTTP (minutos). Pode ser sobrescrito por projeto.'),
  ('monitoring_retries',       '3'::jsonb,               'Tentativas antes de considerar o site OFFLINE.'),
  ('monitoring_timeout_ms',    '10000'::jsonb,           'Timeout de cada requisicao HTTP (ms).'),
  ('monitoring_slow_ms',       '3000'::jsonb,            'Acima deste tempo de resposta o site fica INSTAVEL.'),
  ('check_retention_days',     '120'::jsonb,             'Dias de historico de checks mantidos (uptime de 90 dias precisa >= 90).'),
  ('backup_max_age_days',      '7'::jsonb,               'Sites publicados sem backup ha mais dias que isso geram pendencia.'),
  ('demo_base_domain',         '"sites.cdev.com.br"'::jsonb, 'Dominio base das demos: <slug>.<dominio>.'),
  ('timezone',                 '"America/Sao_Paulo"'::jsonb, 'Fuso horario usado para calcular "hoje".'),
  ('currency',                 '"BRL"'::jsonb,           'Moeda (ISO 4217).'),
  ('locale',                   '"pt-BR"'::jsonb,         'Locale para formatar datas e valores.'),
  ('lead_score_weights',       '{"sem_site":25,"instagram":20,"whatsapp":15,"presenca_publica":10,"imagens_profissionais":10,"relevancia_comercial":10}'::jsonb, 'Pesos do score interno de leads.')
on conflict (key) do nothing;

drop trigger if exists cc_settings_set_updated_at on public.cc_settings;
create trigger cc_settings_set_updated_at before update on public.cc_settings
for each row execute function public.set_updated_at();

create or replace function public.cc_setting(p_key text, p_default jsonb default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.cc_settings where key = p_key), p_default);
$$;

create or replace function public.cc_setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((public.cc_setting(p_key) #>> '{}')::int, p_default);
$$;

create or replace function public.cc_setting_days(p_key text)
returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(array(select (jsonb_array_elements_text(public.cc_setting(p_key, '[]'::jsonb)))::int), '{}'::int[]);
$$;

create or replace function public.cc_today()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce(public.cc_setting('timezone') #>> '{}', 'America/Sao_Paulo'))::date;
$$;

create or replace function public.cc_money(p_value numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(coalesce(p_value, 0), 'FM999,999,990.00'), ',.', '.,');
$$;

create or replace function public.cc_type_label(p_type text)
returns text language sql immutable as $$
  select case p_type when 'DOMINIO' then 'Domínio' when 'HOSPEDAGEM' then 'Hospedagem' when 'MANUTENCAO' then 'Manutenção'
                     when 'DESENVOLVIMENTO' then 'Desenvolvimento' else 'Outros' end;
$$;

create or replace function public.cc_date(p_value date)
returns text language sql immutable as $$
  select to_char(p_value, 'DD/MM/YYYY');
$$;

-- ---------------------------------------------------------------------
-- 2. Entidades
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  company text,
  document text,                          -- CPF/CNPJ (somente digitos)
  phone text,
  whatsapp text,
  email text,
  address text,
  city text,
  notes text,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9-]+$'),
  name text not null,
  segment text not null,
  description text,
  sections jsonb not null default '[]'::jsonb,   -- ordem padrao das secoes
  theme jsonb not null default '{}'::jsonb,      -- tema padrao
  content jsonb not null default '{}'::jsonb,    -- conteudo exemplo
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hostings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,   -- null = infraestrutura da CDEV
  name text not null check (length(trim(name)) > 0),
  provider text,
  type text not null default 'VPS' check (type in ('VPS','SERVIDOR_PROPRIO','SHARED','CLOUD','VERCEL','NETLIFY','CLOUDFLARE_PAGES','OUTRO')),
  panel_url text,
  host text,                               -- IP/hostname (nunca senhas)
  contracted_at date,
  expires_at date,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  billing_cycle text not null default 'MENSAL' check (billing_cycle in ('NENHUMA','MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL')),
  status text not null default 'ATIVA' check (status in ('ATIVA','SUSPENSA','CANCELADA')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  template_id uuid references public.templates(id) on delete set null,
  hosting_id uuid references public.hostings(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO','DEMO','PUBLICADO','SUSPENSO','ARQUIVADO')),
  site_url text,                           -- URL monitorada / publica
  theme jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  monitoring_enabled boolean not null default false,
  monitoring_interval_min integer check (monitoring_interval_min is null or monitoring_interval_min between 1 and 1440),
  maintenance boolean not null default false,
  monitor_status text not null default 'DESCONHECIDO' check (monitor_status in ('DESCONHECIDO','ONLINE','OFFLINE','INSTAVEL','MANUTENCAO')),
  monitor_since timestamptz,
  last_check_at timestamptz,
  last_status_code integer,
  last_response_ms integer,
  last_error text,
  ssl_expires_at timestamptz,
  published_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  domain text not null unique check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  registrar text,
  account_ref text,                        -- login/identificacao (NUNCA senha)
  panel_url text,
  contracted_at date,
  expires_at date,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'ATIVO' check (status in ('ATIVO','EXPIRADO','TRANSFERIDO','CANCELADO')),
  auto_renew boolean not null default false,
  is_primary boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  domain_id uuid references public.domains(id) on delete set null,
  hosting_id uuid references public.hostings(id) on delete set null,
  type text not null default 'OUTROS' check (type in ('DOMINIO','HOSPEDAGEM','MANUTENCAO','DESENVOLVIMENTO','OUTROS')),
  description text,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  paid_at date,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','PAGO','ATRASADO','CANCELADO')),
  recurrence text not null default 'NENHUMA' check (recurrence in ('NENHUMA','MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL')),
  recurrence_day integer check (recurrence_day is null or recurrence_day between 1 and 31),
  previous_payment_id uuid references public.payments(id) on delete set null,
  method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_paid_consistency check ((status = 'PAGO') = (paid_at is not null))
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null default 'notice' check (severity in ('danger','warning','notice','success','info')),
  title text not null,
  body text,
  link text,                               -- rota interna (#/clientes/<id>) ou URL
  client_id uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  dedupe_key text unique,                  -- impede o mesmo alerta de ser emitido duas vezes
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,                 -- alerta deixou de valer (ex.: pagamento quitado)
  delivered_at timestamptz                 -- entregue por provider externo (ex.: Telegram), opcional
);

create table if not exists public.monitoring_checks (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  status_code integer,
  response_ms integer,
  error text,
  ssl_expires_at timestamptz,
  attempts integer not null default 1
);

create table if not exists public.incidents (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  status text not null default 'ABERTO' check (status in ('ABERTO','RESOLVIDO')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  error text,
  status_code integer,
  cause text,                              -- causa registrada manualmente
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  performed_at timestamptz not null default now(),
  status text not null default 'OK' check (status in ('OK','FALHOU','PENDENTE')),
  kind text not null default 'MANUAL' check (kind in ('MANUAL','AUTOMATICO')),
  location text,
  size_mb numeric(12,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company text not null check (length(trim(company)) > 0),
  name text,
  segment text,
  city text,
  phone text,
  whatsapp text,
  email text,
  instagram text,
  website text,
  source text not null default 'MANUAL' check (source in ('MANUAL','CSV','WEB','GOOGLE','OUTRO')),
  status text not null default 'LEAD' check (status in ('LEAD','CONTATADO','RESPONDEU','DEMO_ENVIADA','NEGOCIACAO','CLIENTE','PERDIDO')),
  score integer not null default 0,
  score_flags jsonb not null default '{}'::jsonb,
  next_action_at date,
  last_contact_at timestamptz,
  lost_reason text,
  demo_project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_activities (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null default 'NOTA' check (type in ('NOTA','STATUS','MENSAGEM','LIGACAO','DEMO','CONVERSAO')),
  content text,
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'WHATSAPP' check (channel in ('WHATSAPP','EMAIL')),
  subject text,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  client_id uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  entity_type text,
  entity_id text,
  event text not null,
  message text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.clients add column if not exists lead_id uuid references public.leads(id) on delete set null;

-- Indices
create index if not exists projects_client_idx on public.projects(client_id);
create index if not exists projects_monitor_idx on public.projects(monitoring_enabled, last_check_at);
create index if not exists domains_client_idx on public.domains(client_id);
create index if not exists domains_expires_idx on public.domains(expires_at);
create index if not exists hostings_expires_idx on public.hostings(expires_at);
create index if not exists payments_client_idx on public.payments(client_id);
create index if not exists payments_due_idx on public.payments(status, due_date);
create unique index if not exists payments_one_child_idx on public.payments(previous_payment_id) where previous_payment_id is not null;
create index if not exists notifications_open_idx on public.notifications(resolved_at, read_at, created_at desc);
create index if not exists notifications_entity_idx on public.notifications(entity_type, entity_id);
create index if not exists checks_project_time_idx on public.monitoring_checks(project_id, checked_at desc);
create index if not exists checks_time_idx on public.monitoring_checks(checked_at);
create index if not exists incidents_project_idx on public.incidents(project_id, started_at desc);
create unique index if not exists incidents_one_open_idx on public.incidents(project_id) where status = 'ABERTO';
create index if not exists backups_project_idx on public.backups(project_id, performed_at desc);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists activity_client_idx on public.activity_log(client_id, created_at desc);
create index if not exists activity_project_idx on public.activity_log(project_id, created_at desc);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['clients','templates','hostings','projects','domains','payments','incidents','leads','message_templates'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. RLS: somente admins ativos (mesma regra do painel existente)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['cc_settings','clients','templates','hostings','projects','domains','payments','notifications',
                           'monitoring_checks','incidents','backups','leads','lead_activities','message_templates','activity_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Historico (activity_log) via triggers
-- ---------------------------------------------------------------------
create or replace function public.cc_log(p_client uuid, p_project uuid, p_entity_type text, p_entity_id text, p_event text, p_message text)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (client_id, project_id, entity_type, entity_id, event, message)
  values (p_client, p_project, p_entity_type, p_entity_id, p_event, p_message);
$$;
revoke all on function public.cc_log(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.cc_track_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tpl text;
begin
  if tg_table_name = 'clients' then
    if tg_op = 'INSERT' then
      perform public.cc_log(new.id, null, 'client', new.id::text, 'client_created', 'Cliente criado: ' || new.name);
    elsif new.status is distinct from old.status then
      perform public.cc_log(new.id, null, 'client', new.id::text, 'client_status', 'Status do cliente: ' || new.status);
    end if;

  elsif tg_table_name = 'projects' then
    if tg_op = 'INSERT' then
      perform public.cc_log(new.client_id, new.id, 'project', new.id::text,
        case when new.status = 'DEMO' then 'demo_created' else 'project_created' end,
        case when new.status = 'DEMO' then 'Demo criada: ' else 'Projeto criado: ' end || new.name);
    else
      if new.client_id is distinct from old.client_id and new.client_id is not null then
        perform public.cc_log(new.client_id, new.id, 'project', new.id::text, 'project_linked', 'Projeto vinculado ao cliente: ' || new.name);
      end if;
      if new.status is distinct from old.status then
        if new.status = 'PUBLICADO' then
          perform public.cc_log(new.client_id, new.id, 'project', new.id::text, 'site_published', 'Site publicado: ' || new.name);
        else
          perform public.cc_log(new.client_id, new.id, 'project', new.id::text, 'project_status', new.name || ' -> ' || new.status);
        end if;
      end if;
      if new.template_id is distinct from old.template_id then
        select name into v_tpl from public.templates where id = new.template_id;
        perform public.cc_log(new.client_id, new.id, 'project', new.id::text, 'template_changed', 'Template alterado para ' || coalesce(v_tpl, 'nenhum'));
      end if;
    end if;

  elsif tg_table_name = 'domains' then
    if tg_op = 'INSERT' then
      perform public.cc_log(new.client_id, new.project_id, 'domain', new.id::text, 'domain_added', 'Domínio cadastrado: ' || new.domain);
    elsif new.expires_at is not null and old.expires_at is not null and new.expires_at > old.expires_at then
      perform public.cc_log(new.client_id, new.project_id, 'domain', new.id::text, 'domain_renewed',
        'Domínio renovado: ' || new.domain || ' até ' || public.cc_date(new.expires_at));
    end if;

  elsif tg_table_name = 'hostings' then
    if tg_op = 'INSERT' then
      perform public.cc_log(new.client_id, null, 'hosting', new.id::text, 'hosting_added', 'Hospedagem cadastrada: ' || new.name);
    elsif new.expires_at is not null and old.expires_at is not null and new.expires_at > old.expires_at then
      perform public.cc_log(new.client_id, null, 'hosting', new.id::text, 'hosting_renewed',
        'Hospedagem renovada: ' || new.name || ' até ' || public.cc_date(new.expires_at));
    end if;

  elsif tg_table_name = 'payments' then
    if tg_op = 'UPDATE' and new.status = 'PAGO' and old.status is distinct from 'PAGO' then
      perform public.cc_log(new.client_id, new.project_id, 'payment', new.id::text, 'payment_registered',
        'Pagamento registrado: ' || coalesce(new.description, public.cc_type_label(new.type)) || ' ' || public.cc_money(new.amount));
    elsif tg_op = 'UPDATE' and new.status = 'CANCELADO' and old.status is distinct from 'CANCELADO' then
      perform public.cc_log(new.client_id, new.project_id, 'payment', new.id::text, 'payment_cancelled',
        'Cobrança cancelada: ' || coalesce(new.description, public.cc_type_label(new.type)));
    end if;

  elsif tg_table_name = 'backups' then
    if tg_op = 'INSERT' then
      perform public.cc_log(new.client_id, new.project_id, 'backup', new.id::text,
        case when new.status = 'OK' then 'backup_done' else 'backup_failed' end,
        case when new.status = 'OK' then 'Backup realizado' else 'Backup ' || lower(new.status) end
          || coalesce(' (' || new.location || ')', ''));
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['clients','projects','domains','hostings','payments','backups'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_track', t);
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.cc_track_changes()', t || '_track', t);
  end loop;
end $$;

-- Backup herda o cliente do projeto
create or replace function public.cc_backup_fill_client()
returns trigger language plpgsql as $$
begin
  if new.client_id is null then
    select client_id into new.client_id from public.projects where id = new.project_id;
  end if;
  return new;
end;
$$;
drop trigger if exists backups_fill_client on public.backups;
create trigger backups_fill_client before insert on public.backups
for each row execute function public.cc_backup_fill_client();

-- Status PUBLICADO registra published_at
create or replace function public.cc_project_publish_stamp()
returns trigger language plpgsql as $$
begin
  if new.status = 'PUBLICADO' and (tg_op = 'INSERT' or old.status is distinct from 'PUBLICADO') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  if new.maintenance then
    new.monitor_status := 'MANUTENCAO';
  elsif tg_op = 'UPDATE' and old.maintenance and not new.maintenance then
    new.monitor_status := 'DESCONHECIDO';
  end if;
  return new;
end;
$$;
drop trigger if exists projects_publish_stamp on public.projects;
create trigger projects_publish_stamp before insert or update on public.projects
for each row execute function public.cc_project_publish_stamp();

-- ---------------------------------------------------------------------
-- 5. Notificacoes (sem spam: dedupe_key unico)
-- ---------------------------------------------------------------------
create or replace function public.cc_notify(
  p_kind text, p_severity text, p_title text, p_body text, p_link text,
  p_client uuid, p_project uuid, p_entity_type text, p_entity_id uuid, p_dedupe text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.notifications (kind, severity, title, body, link, client_id, project_id, entity_type, entity_id, dedupe_key)
  values (p_kind, p_severity, p_title, p_body, p_link, p_client, p_project, p_entity_type, p_entity_id, p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is not null and p_entity_id is not null then
    -- um alerta novo substitui os anteriores da mesma entidade/tipo (ex.: 7 dias -> 3 dias)
    update public.notifications
       set resolved_at = now()
     where entity_type = p_entity_type and entity_id = p_entity_id and kind = p_kind
       and id <> v_id and resolved_at is null;
  end if;
  return v_id is not null;
end;
$$;
revoke all on function public.cc_notify(text, text, text, text, text, uuid, uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public.cc_resolve_notifications(p_entity_type text, p_entity_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications set resolved_at = now()
   where entity_type = p_entity_type and entity_id = p_entity_id and resolved_at is null;
$$;
revoke all on function public.cc_resolve_notifications(text, uuid) from public, anon, authenticated;

-- Menor limiar >= dias restantes (ex.: faltam 5 dias com [30,15,7,3,1,0] -> 7)
create or replace function public.cc_bucket_before(p_days int, p_thresholds int[])
returns int language sql immutable as $$
  select min(t) from unnest(p_thresholds) t where p_days <= t and p_days >= 0;
$$;

-- Maior limiar <= dias de atraso (ex.: 5 dias de atraso com [1,3,7] -> 3)
create or replace function public.cc_bucket_after(p_days int, p_thresholds int[])
returns int language sql immutable as $$
  select max(t) from unnest(p_thresholds) t where p_days >= t;
$$;

create or replace function public.cc_due_label(p_days int)
returns text language sql immutable as $$
  select case
    when p_days < 0 then 'venceu há ' || abs(p_days) || case when abs(p_days) = 1 then ' dia' else ' dias' end
    when p_days = 0 then 'vence hoje'
    when p_days = 1 then 'vence amanhã'
    else 'vence em ' || p_days || ' dias'
  end;
$$;

create or replace function public.cc_severity_for(p_days int)
returns text language sql immutable as $$
  select case when p_days <= 1 then 'danger' when p_days <= 7 then 'warning' else 'notice' end;
$$;

-- ---------------------------------------------------------------------
-- 6. Recorrencia de pagamentos
-- ---------------------------------------------------------------------
create or replace function public.cc_next_due(p_date date, p_recurrence text, p_day int default null)
returns date language plpgsql immutable as $$
declare
  v_months int;
  v_base date;
  v_last int;
begin
  v_months := case p_recurrence when 'MENSAL' then 1 when 'TRIMESTRAL' then 3 when 'SEMESTRAL' then 6 when 'ANUAL' then 12 else null end;
  if v_months is null then return null; end if;
  v_base := (date_trunc('month', p_date) + make_interval(months => v_months))::date;
  v_last := extract(day from (v_base + interval '1 month - 1 day'))::int;
  return v_base + (least(coalesce(p_day, extract(day from p_date)::int), v_last) - 1);
end;
$$;

create or replace function public.cc_mark_payment_paid(
  p_payment_id uuid,
  p_paid_at date default null,
  p_method text default null,
  p_amount numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
  v_next_due date;
  v_next_id uuid;
begin
  -- auth.uid() nulo = service_role/cron (anon nao tem EXECUTE)
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Pagamento nao encontrado'; end if;
  if p.status = 'PAGO' then raise exception 'Pagamento ja registrado como pago'; end if;
  if p.status = 'CANCELADO' then raise exception 'Pagamento cancelado nao pode ser pago'; end if;

  update public.payments
     set status = 'PAGO',
         paid_at = coalesce(p_paid_at, public.cc_today()),
         method = coalesce(p_method, method),
         amount = coalesce(p_amount, amount)
   where id = p.id;

  perform public.cc_resolve_notifications('payment', p.id);

  if p.recurrence <> 'NENHUMA' then
    v_next_due := public.cc_next_due(p.due_date, p.recurrence, coalesce(p.recurrence_day, extract(day from p.due_date)::int));
    insert into public.payments (client_id, project_id, domain_id, hosting_id, type, description, amount, due_date,
                                 status, recurrence, recurrence_day, previous_payment_id, notes)
    values (p.client_id, p.project_id, p.domain_id, p.hosting_id, p.type, p.description, p.amount, v_next_due,
            'PENDENTE', p.recurrence, coalesce(p.recurrence_day, extract(day from p.due_date)::int), p.id, null)
    on conflict (previous_payment_id) where previous_payment_id is not null do nothing
    returning id into v_next_id;

    -- Renovacao: dominio/hospedagem passam a vencer na proxima cobranca
    if p.domain_id is not null then
      update public.domains set expires_at = greatest(coalesce(expires_at, v_next_due), v_next_due), status = 'ATIVO'
       where id = p.domain_id;
      perform public.cc_resolve_notifications('domain', p.domain_id);
    end if;
    if p.hosting_id is not null then
      update public.hostings set expires_at = greatest(coalesce(expires_at, v_next_due), v_next_due), status = 'ATIVA'
       where id = p.hosting_id;
      perform public.cc_resolve_notifications('hosting', p.hosting_id);
    end if;
  end if;

  return v_next_id;
end;
$$;

-- Quando um pagamento e cancelado/pago por update direto, alertas pendentes sao encerrados
create or replace function public.cc_payment_close_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('PAGO','CANCELADO') and old.status is distinct from new.status then
    perform public.cc_resolve_notifications('payment', new.id);
  end if;
  if new.status = 'PENDENTE' and new.due_date < public.cc_today() then
    new.status := 'ATRASADO';
  elsif new.status = 'ATRASADO' and new.due_date >= public.cc_today() then
    new.status := 'PENDENTE';
  end if;
  return new;
end;
$$;
drop trigger if exists payments_close_alerts on public.payments;
create trigger payments_close_alerts before update on public.payments
for each row execute function public.cc_payment_close_alerts();

create or replace function public.cc_payment_insert_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'PENDENTE' and new.due_date < public.cc_today() then
    new.status := 'ATRASADO';
  end if;
  if new.recurrence <> 'NENHUMA' and new.recurrence_day is null then
    new.recurrence_day := extract(day from new.due_date)::int;
  end if;
  return new;
end;
$$;
drop trigger if exists payments_insert_status on public.payments;
create trigger payments_insert_status before insert on public.payments
for each row execute function public.cc_payment_insert_status();

-- ---------------------------------------------------------------------
-- 7. Views calculadas (security_invoker => respeitam RLS)
-- ---------------------------------------------------------------------
create or replace view public.payments_view with (security_invoker = true) as
select
  p.*,
  (p.due_date - public.cc_today()) as days_to_due,
  case
    when p.status in ('PAGO','CANCELADO') then p.status
    when p.due_date < public.cc_today() then 'ATRASADO'
    when p.due_date = public.cc_today() then 'VENCE_HOJE'
    when p.due_date <= public.cc_today() + public.cc_setting_int('upcoming_window_days', 7) then 'VENCENDO'
    else 'PENDENTE'
  end as computed_state,
  c.name as client_name,
  pr.name as project_name,
  d.domain as domain_name,
  h.name as hosting_name
from public.payments p
left join public.clients c on c.id = p.client_id
left join public.projects pr on pr.id = p.project_id
left join public.domains d on d.id = p.domain_id
left join public.hostings h on h.id = p.hosting_id;

create or replace view public.client_overview with (security_invoker = true) as
select
  c.*,
  (select count(*) from public.projects p where p.client_id = c.id and p.status <> 'ARQUIVADO') as projects_count,
  (select count(*) from public.payments p where p.client_id = c.id and p.status in ('PENDENTE','ATRASADO') and p.due_date < public.cc_today()) as overdue_count,
  (select min(p.due_date) from public.payments p where p.client_id = c.id and p.status in ('PENDENTE','ATRASADO')) as next_due_date,
  (select coalesce(sum(p.amount), 0) from public.payments p where p.client_id = c.id and p.status in ('PENDENTE','ATRASADO')) as open_amount,
  (select count(*) from public.projects p where p.client_id = c.id and p.monitor_status in ('OFFLINE','INSTAVEL')) as problem_sites,
  (select count(*) from public.incidents i where i.client_id = c.id and i.status = 'ABERTO') as open_incidents,
  (select min(d.expires_at) from public.domains d where d.client_id = c.id and d.status = 'ATIVO') as next_domain_expiry,
  greatest(c.updated_at, (select max(a.created_at) from public.activity_log a where a.client_id = c.id)) as last_activity_at
from public.clients c;

create or replace view public.incidents_view with (security_invoker = true) as
select
  i.*,
  extract(epoch from (coalesce(i.ended_at, now()) - i.started_at))::int as duration_seconds,
  p.name as project_name,
  p.site_url,
  c.name as client_name
from public.incidents i
join public.projects p on p.id = i.project_id
left join public.clients c on c.id = i.client_id;

-- ---------------------------------------------------------------------
-- 8. Verificacao de vencimentos (CRON)  -> gera notificacoes sem duplicar
-- ---------------------------------------------------------------------
create or replace function public.cc_run_due_checks()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.cc_today();
  v_before int[] := public.cc_setting_days('payment_alert_days');
  v_after int[] := public.cc_setting_days('overdue_alert_days');
  v_expiry int[] := public.cc_setting_days('expiry_alert_days');
  v_ssl int[] := public.cc_setting_days('ssl_alert_days');
  v_backup_age int := public.cc_setting_int('backup_max_age_days', 7);
  v_retention int := public.cc_setting_int('check_retention_days', 120);
  v_created int := 0;
  v_overdue int := 0;
  v_pruned int := 0;
  r record;
  v_days int;
  v_bucket int;
  v_label text;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  -- 8.1 status ATRASADO
  update public.payments set status = 'ATRASADO'
   where status = 'PENDENTE' and due_date < v_today;
  get diagnostics v_overdue = row_count;

  -- 8.2 pagamentos em aberto
  for r in
    select p.*, c.name as client_name
      from public.payments p left join public.clients c on c.id = p.client_id
     where p.status in ('PENDENTE','ATRASADO')
  loop
    v_days := r.due_date - v_today;
    v_label := coalesce(r.client_name, 'Sem cliente') || E'\n' || coalesce(r.description, public.cc_type_label(r.type)) || E'\n'
               || public.cc_date(r.due_date) || ' - ' || public.cc_money(r.amount);
    if v_days >= 0 then
      v_bucket := public.cc_bucket_before(v_days, v_before);
      if v_bucket is not null and public.cc_notify(
          'payment_due', public.cc_severity_for(v_days),
          public.cc_type_label(r.type) || ' ' || public.cc_due_label(v_days),
          v_label, '#/pagamentos?id=' || r.id, r.client_id, r.project_id, 'payment', r.id,
          'payment:' || r.id || ':before:' || v_bucket) then
        v_created := v_created + 1;
      end if;
    else
      v_bucket := public.cc_bucket_after(-v_days, v_after);
      if v_bucket is not null and public.cc_notify(
          'payment_due', 'danger',
          'Pagamento atrasado',
          v_label || E'\nDias em atraso: ' || (-v_days), '#/pagamentos?id=' || r.id, r.client_id, r.project_id, 'payment', r.id,
          'payment:' || r.id || ':after:' || v_bucket) then
        v_created := v_created + 1;
      end if;
    end if;
  end loop;

  -- 8.3 dominios sem cobranca aberta
  for r in
    select d.*, c.name as client_name from public.domains d left join public.clients c on c.id = d.client_id
     where d.status = 'ATIVO' and d.expires_at is not null
       and not exists (select 1 from public.payments p where p.domain_id = d.id and p.status in ('PENDENTE','ATRASADO'))
  loop
    v_days := r.expires_at - v_today;
    v_bucket := case when v_days >= 0 then public.cc_bucket_before(v_days, v_expiry) else -1 end;
    if v_bucket is not null and public.cc_notify(
        'domain_expiry', public.cc_severity_for(v_days),
        'Domínio ' || public.cc_due_label(v_days),
        coalesce(r.client_name, 'CDEV') || E'\n' || r.domain || E'\n' || public.cc_date(r.expires_at) || ' - ' || public.cc_money(r.amount),
        '#/dominios?id=' || r.id, r.client_id, r.project_id, 'domain', r.id,
        'domain:' || r.id || ':' || r.expires_at || ':' || v_bucket) then
      v_created := v_created + 1;
    end if;
  end loop;

  -- 8.4 hospedagens sem cobranca aberta
  for r in
    select h.*, c.name as client_name from public.hostings h left join public.clients c on c.id = h.client_id
     where h.status = 'ATIVA' and h.expires_at is not null
       and not exists (select 1 from public.payments p where p.hosting_id = h.id and p.status in ('PENDENTE','ATRASADO'))
  loop
    v_days := r.expires_at - v_today;
    v_bucket := case when v_days >= 0 then public.cc_bucket_before(v_days, v_expiry) else -1 end;
    if v_bucket is not null and public.cc_notify(
        'hosting_expiry', public.cc_severity_for(v_days),
        'Hospedagem ' || public.cc_due_label(v_days),
        coalesce(r.client_name, 'CDEV') || E'\n' || r.name || E'\n' || public.cc_date(r.expires_at) || ' - ' || public.cc_money(r.amount),
        '#/hospedagens?id=' || r.id, r.client_id, null, 'hosting', r.id,
        'hosting:' || r.id || ':' || r.expires_at || ':' || v_bucket) then
      v_created := v_created + 1;
    end if;
  end loop;

  -- 8.5 SSL
  for r in
    select p.*, c.name as client_name from public.projects p left join public.clients c on c.id = p.client_id
     where p.monitoring_enabled and p.ssl_expires_at is not null and p.status not in ('ARQUIVADO','SUSPENSO')
  loop
    v_days := (r.ssl_expires_at at time zone 'UTC')::date - v_today;
    v_bucket := case when v_days >= 0 then public.cc_bucket_before(v_days, v_ssl) else -1 end;
    if v_bucket is not null and public.cc_notify(
        'ssl_expiry', public.cc_severity_for(v_days),
        case when v_days < 0 then 'SSL expirado' else 'SSL expira em ' || v_days || ' dias' end,
        coalesce(r.client_name, r.name) || E'\n' || coalesce(r.site_url, r.slug),
        '#/monitoramento?id=' || r.id, r.client_id, r.id, 'ssl', r.id,
        'ssl:' || r.id || ':' || (r.ssl_expires_at::date) || ':' || v_bucket) then
      v_created := v_created + 1;
    end if;
  end loop;

  -- 8.6 backups atrasados (um alerta por "episodio", chaveado pelo ultimo backup)
  for r in
    select p.id, p.name, p.client_id,
           (select max(b.performed_at) from public.backups b where b.project_id = p.id and b.status = 'OK') as last_ok
      from public.projects p
     where p.status = 'PUBLICADO'
  loop
    if r.last_ok is null or r.last_ok < now() - make_interval(days => v_backup_age) then
      if public.cc_notify('backup_stale', 'warning', 'Backup pendente',
          r.name || E'\nÚltimo backup: ' || coalesce(to_char(r.last_ok, 'DD/MM/YYYY HH24:MI'), 'nunca'),
          '#/backups?project=' || r.id, r.client_id, r.id, 'backup', r.id,
          'backup:' || r.id || ':' || coalesce(r.last_ok::text, 'never')) then
        v_created := v_created + 1;
      end if;
    else
      perform public.cc_resolve_notifications('backup', r.id);
    end if;
  end loop;

  -- 8.7 follow-up de leads
  for r in
    select * from public.leads where next_action_at is not null and next_action_at <= v_today
       and status not in ('CLIENTE','PERDIDO')
  loop
    if public.cc_notify('lead_followup', 'notice', 'Follow-up de lead',
        r.company || coalesce(' - ' || r.name, '') || E'\nPrevisto para ' || public.cc_date(r.next_action_at),
        '#/leads?id=' || r.id, null, null, 'lead', r.id,
        'lead:' || r.id || ':' || r.next_action_at) then
      v_created := v_created + 1;
    end if;
  end loop;

  -- 8.8 retencao do historico de checks
  delete from public.monitoring_checks where checked_at < now() - make_interval(days => greatest(v_retention, 91));
  get diagnostics v_pruned = row_count;

  return jsonb_build_object('notifications_created', v_created, 'marked_overdue', v_overdue, 'checks_pruned', v_pruned, 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Monitoramento (chamado pelo worker na VPS com a service key)
-- ---------------------------------------------------------------------
create or replace function public.cc_monitor_targets(p_limit int default 50)
returns table (id uuid, name text, site_url text, monitor_status text, timeout_ms int, retries int, slow_ms int)
language sql security definer set search_path = public as $$
  select p.id, p.name, p.site_url, p.monitor_status,
         public.cc_setting_int('monitoring_timeout_ms', 10000),
         public.cc_setting_int('monitoring_retries', 3),
         public.cc_setting_int('monitoring_slow_ms', 3000)
    from public.projects p
   where p.monitoring_enabled
     and not p.maintenance
     and p.site_url is not null and p.site_url ~* '^https?://'
     and p.status not in ('ARQUIVADO','SUSPENSO')
     and (p.last_check_at is null
          or p.last_check_at <= now() - make_interval(mins => coalesce(p.monitoring_interval_min, public.cc_setting_int('monitoring_interval_min', 5))) + interval '10 seconds')
   order by p.last_check_at nulls first
   limit greatest(1, least(p_limit, 500));
$$;

create or replace function public.cc_record_check(
  p_project_id uuid,
  p_ok boolean,
  p_status_code int default null,
  p_response_ms int default null,
  p_error text default null,
  p_ssl_expires_at timestamptz default null,
  p_attempts int default 1
) returns text language plpgsql security definer set search_path = public as $$
declare
  p public.projects;
  v_new text;
  v_slow int := public.cc_setting_int('monitoring_slow_ms', 3000);
  v_ssl_warn int := coalesce((select min(x) from unnest(public.cc_setting_days('ssl_alert_days')) x where x > 0 and x >= 7), 14);
  v_inc public.incidents;
  v_dur int;
  v_err text := left(coalesce(p_error, case when p_status_code is not null then 'HTTP ' || p_status_code end), 500);
begin
  select * into p from public.projects where id = p_project_id for update;
  if not found then raise exception 'Projeto nao encontrado'; end if;

  insert into public.monitoring_checks (project_id, ok, status_code, response_ms, error, ssl_expires_at, attempts)
  values (p.id, p_ok, p_status_code, p_response_ms, case when p_ok then null else v_err end, p_ssl_expires_at, greatest(1, coalesce(p_attempts, 1)));

  if p.maintenance then
    v_new := 'MANUTENCAO';
  elsif not p_ok then
    v_new := 'OFFLINE';
  elsif coalesce(p_response_ms, 0) > v_slow
        or (p_ssl_expires_at is not null and p_ssl_expires_at < now() + make_interval(days => v_ssl_warn)) then
    v_new := 'INSTAVEL';
  else
    v_new := 'ONLINE';
  end if;

  -- ONLINE/INSTAVEL/DESCONHECIDO -> OFFLINE : abre incidente + alerta
  if v_new = 'OFFLINE' and p.monitor_status <> 'OFFLINE' then
    insert into public.incidents (project_id, client_id, started_at, error, status_code, status)
    values (p.id, p.client_id, now(), v_err, p_status_code, 'ABERTO')
    on conflict (project_id) where status = 'ABERTO' do nothing;

    perform public.cc_resolve_notifications('site', p.id);
    perform public.cc_notify('site_offline', 'danger', 'Site offline',
      coalesce((select name from public.clients where id = p.client_id), p.name) || E'\n' || p.site_url
        || E'\nDetectado: ' || to_char(now() at time zone coalesce(public.cc_setting('timezone') #>> '{}', 'America/Sao_Paulo'), 'DD/MM HH24:MI')
        || E'\nStatus: ' || coalesce(v_err, 'sem resposta')
        || E'\nTentativas: ' || coalesce(p_attempts, 1) || '/' || coalesce(p_attempts, 1),
      '#/monitoramento?id=' || p.id, p.client_id, p.id, 'site', p.id,
      'site:' || p.id || ':down:' || extract(epoch from now())::bigint);
    perform public.cc_log(p.client_id, p.id, 'project', p.id::text, 'site_offline', 'Site ficou offline: ' || coalesce(v_err, 'sem resposta'));
  end if;

  -- OFFLINE -> ONLINE/INSTAVEL : fecha incidente + alerta de recuperacao
  if p.monitor_status = 'OFFLINE' and v_new in ('ONLINE','INSTAVEL') then
    update public.incidents set status = 'RESOLVIDO', ended_at = now()
     where project_id = p.id and status = 'ABERTO'
     returning * into v_inc;
    v_dur := coalesce(extract(epoch from (now() - v_inc.started_at))::int, 0);
    perform public.cc_resolve_notifications('site', p.id);
    perform public.cc_notify('site_recovered', 'success', 'Site recuperado',
      coalesce((select name from public.clients where id = p.client_id), p.name) || E'\n' || p.site_url
        || E'\nDuração: ' || case when v_dur < 60 then v_dur || ' s'
                                  when v_dur < 3600 then (v_dur / 60) || ' min'
                                  else (v_dur / 3600) || ' h ' || ((v_dur % 3600) / 60) || ' min' end,
      '#/monitoramento?id=' || p.id, p.client_id, p.id, 'site_up', p.id,
      'site:' || p.id || ':up:' || extract(epoch from now())::bigint);
    perform public.cc_log(p.client_id, p.id, 'project', p.id::text, 'site_recovered', 'Site recuperado');
  end if;

  update public.projects
     set monitor_status = v_new,
         monitor_since = case when monitor_status is distinct from v_new then now() else coalesce(monitor_since, now()) end,
         last_check_at = now(),
         last_status_code = p_status_code,
         last_response_ms = p_response_ms,
         last_error = case when p_ok then null else v_err end,
         ssl_expires_at = coalesce(p_ssl_expires_at, ssl_expires_at)
   where id = p.id;

  return v_new;
end;
$$;

create or replace function public.cc_uptime_summary()
returns table (project_id uuid, up_1d numeric, up_7d numeric, up_30d numeric, up_90d numeric, avg_ms_1d int, checks_90d bigint)
language sql stable security invoker set search_path = public as $$
  select c.project_id,
    round(100.0 * count(*) filter (where c.ok and c.checked_at > now() - interval '1 day')  / nullif(count(*) filter (where c.checked_at > now() - interval '1 day'), 0), 2),
    round(100.0 * count(*) filter (where c.ok and c.checked_at > now() - interval '7 days') / nullif(count(*) filter (where c.checked_at > now() - interval '7 days'), 0), 2),
    round(100.0 * count(*) filter (where c.ok and c.checked_at > now() - interval '30 days') / nullif(count(*) filter (where c.checked_at > now() - interval '30 days'), 0), 2),
    round(100.0 * count(*) filter (where c.ok) / nullif(count(*), 0), 2),
    (avg(c.response_ms) filter (where c.ok and c.checked_at > now() - interval '1 day'))::int,
    count(*)
  from public.monitoring_checks c
  where c.checked_at > now() - interval '90 days'
  group by c.project_id;
$$;

-- ---------------------------------------------------------------------
-- 10. Central de Pendencias + busca global
-- ---------------------------------------------------------------------
create or replace function public.cc_pending_summary()
returns jsonb language sql stable security invoker set search_path = public as $$
  with t as (select public.cc_today() as today, public.cc_setting_int('upcoming_window_days', 7) as win,
                    public.cc_setting_int('backup_max_age_days', 7) as bkp)
  select jsonb_build_object(
    'today', (select today from t),
    'payments_overdue', (select count(*) from public.payments, t where status in ('PENDENTE','ATRASADO') and due_date < t.today),
    'payments_overdue_amount', (select coalesce(sum(amount),0) from public.payments, t where status in ('PENDENTE','ATRASADO') and due_date < t.today),
    'payments_today', (select count(*) from public.payments, t where status in ('PENDENTE','ATRASADO') and due_date = t.today),
    'payments_window', (select count(*) from public.payments, t where status in ('PENDENTE','ATRASADO') and due_date > t.today and due_date <= t.today + t.win),
    'payments_30d', (select count(*) from public.payments, t where status in ('PENDENTE','ATRASADO') and due_date > t.today and due_date <= t.today + 30),
    'domains_30d', (select count(*) from public.domains, t where status = 'ATIVO' and expires_at between t.today and t.today + 30),
    'domains_expired', (select count(*) from public.domains, t where status in ('ATIVO','EXPIRADO') and expires_at < t.today),
    'hostings_30d', (select count(*) from public.hostings, t where status = 'ATIVA' and expires_at between t.today and t.today + 30),
    'hostings_expired', (select count(*) from public.hostings, t where status = 'ATIVA' and expires_at < t.today),
    'sites_offline', (select count(*) from public.projects where monitoring_enabled and monitor_status = 'OFFLINE'),
    'sites_unstable', (select count(*) from public.projects where monitoring_enabled and monitor_status = 'INSTAVEL'),
    'ssl_expiring', (select count(*) from public.projects where monitoring_enabled and ssl_expires_at is not null and ssl_expires_at < now() + interval '30 days'),
    'incidents_open', (select count(*) from public.incidents where status = 'ABERTO'),
    'projects_awaiting', (select count(*) from public.projects where status in ('RASCUNHO','DEMO') and client_id is not null),
    'backups_pending', (select count(*) from public.projects p, t where p.status = 'PUBLICADO'
                          and not exists (select 1 from public.backups b where b.project_id = p.id and b.status = 'OK'
                                          and b.performed_at > now() - make_interval(days => t.bkp))),
    'leads_followup', (select count(*) from public.leads, t where next_action_at <= t.today and status not in ('CLIENTE','PERDIDO')),
    'notifications_unread', (select count(*) from public.notifications where read_at is null and resolved_at is null),
    'upcoming', coalesce((
      select jsonb_agg(x order by x.due_date, x.kind) from (
        select 'payment' as kind, p.id, p.client_id, p.due_date, p.amount, p.type as label, c.name as client_name, p.description
          from public.payments p left join public.clients c on c.id = p.client_id, t
         where p.status in ('PENDENTE','ATRASADO') and p.due_date <= t.today + 30
        union all
        select 'domain', d.id, d.client_id, d.expires_at, d.amount, 'DOMINIO', c.name, d.domain
          from public.domains d left join public.clients c on c.id = d.client_id, t
         where d.status = 'ATIVO' and d.expires_at <= t.today + 30
           and not exists (select 1 from public.payments p where p.domain_id = d.id and p.status in ('PENDENTE','ATRASADO'))
        union all
        select 'hosting', h.id, h.client_id, h.expires_at, h.amount, 'HOSPEDAGEM', c.name, h.name
          from public.hostings h left join public.clients c on c.id = h.client_id, t
         where h.status = 'ATIVA' and h.expires_at <= t.today + 30
           and not exists (select 1 from public.payments p where p.hosting_id = h.id and p.status in ('PENDENTE','ATRASADO'))
        order by 4 limit 25
      ) x), '[]'::jsonb)
  );
$$;

create or replace function public.cc_search(p_query text)
returns table (kind text, id uuid, client_id uuid, title text, subtitle text)
language sql stable security invoker set search_path = public as $$
  with q as (select '%' || lower(trim(p_query)) || '%' as s, regexp_replace(p_query, '\D', '', 'g') as digits)
  select * from (
    select 'client'::text, c.id, c.id, c.name, concat_ws(' · ', c.company, c.email, c.whatsapp, c.phone)
      from public.clients c, q
     where lower(concat_ws(' ', c.name, c.company, c.email, c.city)) like q.s
        or (length(q.digits) >= 4 and regexp_replace(concat_ws(' ', c.phone, c.whatsapp, c.document), '\D', '', 'g') like '%' || q.digits || '%')
    union all
    select 'project', p.id, p.client_id, p.name, concat_ws(' · ', p.status, p.site_url, p.slug)
      from public.projects p, q where lower(concat_ws(' ', p.name, p.slug, p.site_url)) like q.s
    union all
    select 'domain', d.id, d.client_id, d.domain, concat_ws(' · ', d.registrar, 'vence ' || public.cc_date(d.expires_at))
      from public.domains d, q where lower(d.domain) like q.s
    union all
    select 'hosting', h.id, h.client_id, h.name, concat_ws(' · ', h.provider, h.host)
      from public.hostings h, q where lower(concat_ws(' ', h.name, h.provider, h.host)) like q.s
    union all
    select 'lead', l.id, l.client_id, l.company, concat_ws(' · ', l.name, l.status, l.city)
      from public.leads l, q
     where lower(concat_ws(' ', l.company, l.name, l.email, l.city, l.instagram)) like q.s
        or (length(q.digits) >= 4 and regexp_replace(concat_ws(' ', l.phone, l.whatsapp), '\D', '', 'g') like '%' || q.digits || '%')
  ) r
  where length(trim(coalesce(p_query, ''))) >= 2
  limit 40;
$$;

-- ---------------------------------------------------------------------
-- 11. CRM: conversao de lead em cliente (sem recadastrar)
-- ---------------------------------------------------------------------
create or replace function public.cc_convert_lead(p_lead_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l public.leads;
  v_client uuid;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  select * into l from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead nao encontrado'; end if;

  v_client := l.client_id;
  if v_client is null then
    insert into public.clients (name, company, phone, whatsapp, email, city, notes, status, lead_id)
    values (coalesce(nullif(l.company, ''), l.name), l.company, l.phone, l.whatsapp, l.email, l.city,
            concat_ws(E'\n', 'Convertido do CRM.', 'Contato: ' || l.name, 'Instagram: ' || l.instagram, l.notes), 'ATIVO', l.id)
    returning id into v_client;
  end if;

  update public.leads set status = 'CLIENTE', client_id = v_client, next_action_at = null where id = l.id;
  if l.demo_project_id is not null then
    update public.projects set client_id = v_client where id = l.demo_project_id and client_id is null;
  end if;
  insert into public.lead_activities (lead_id, type, content) values (l.id, 'CONVERSAO', 'Lead convertido em cliente');
  perform public.cc_resolve_notifications('lead', l.id);
  return v_client;
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Site Engine publico (demos e sites publicados)
-- ---------------------------------------------------------------------
-- Retorna somente dados de apresentacao: nunca cliente, valores ou notas.
create or replace function public.cc_public_site(p_host text default null, p_slug text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_host text := lower(regexp_replace(coalesce(p_host, ''), '^www\.', ''));
  v_slug text := lower(coalesce(p_slug, ''));
  v_admin boolean := public.is_admin();
  r record;
begin
  select p.id, p.name, p.slug, p.status, p.theme, p.content, t.key as template_key, t.sections as template_sections
    into r
    from public.projects p
    left join public.templates t on t.id = p.template_id
   where (
          (v_slug <> '' and p.slug = v_slug)
          or (v_host <> '' and exists (select 1 from public.domains d where d.project_id = p.id and d.domain = v_host
                                        and d.status = 'ATIVO'))
         )
     and (p.status in ('DEMO','PUBLICADO') or v_admin)
   order by (p.slug = v_slug) desc
   limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'name', r.name,
    'slug', r.slug,
    'status', r.status,
    'template', r.template_key,
    'theme', r.theme,
    'content', r.content,
    'preview', r.status not in ('DEMO','PUBLICADO')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 13. Permissoes das funcoes
-- ---------------------------------------------------------------------
revoke all on function public.cc_run_due_checks() from public, anon;
grant execute on function public.cc_run_due_checks() to authenticated, service_role;

revoke all on function public.cc_monitor_targets(int) from public, anon, authenticated;
grant execute on function public.cc_monitor_targets(int) to service_role;

revoke all on function public.cc_record_check(uuid, boolean, int, int, text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.cc_record_check(uuid, boolean, int, int, text, timestamptz, int) to service_role;

revoke all on function public.cc_mark_payment_paid(uuid, date, text, numeric) from public, anon;
grant execute on function public.cc_mark_payment_paid(uuid, date, text, numeric) to authenticated, service_role;

revoke all on function public.cc_convert_lead(uuid) from public, anon;
grant execute on function public.cc_convert_lead(uuid) to authenticated;

revoke all on function public.cc_pending_summary() from public, anon;
grant execute on function public.cc_pending_summary() to authenticated;

revoke all on function public.cc_search(text) from public, anon;
grant execute on function public.cc_search(text) to authenticated;

revoke all on function public.cc_uptime_summary() from public, anon;
grant execute on function public.cc_uptime_summary() to authenticated;

grant execute on function public.cc_public_site(text, text) to anon, authenticated;

revoke all on function public.cc_setting(text, jsonb) from public, anon;
revoke all on function public.cc_setting_int(text, int) from public, anon;
revoke all on function public.cc_setting_days(text) from public, anon;
grant execute on function public.cc_setting(text, jsonb) to authenticated, service_role;
grant execute on function public.cc_setting_int(text, int) to authenticated, service_role;
grant execute on function public.cc_setting_days(text) to authenticated, service_role;

revoke all on public.payments_view, public.client_overview, public.incidents_view from anon;

-- ---------------------------------------------------------------------
-- 14. Realtime (sino de notificacoes e status dos sites ao vivo)
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; when undefined_object then null; end;
  begin alter publication supabase_realtime add table public.projects; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 15. Modelos de mensagem iniciais
-- ---------------------------------------------------------------------
insert into public.message_templates (name, channel, body)
select * from (values
  ('Primeiro contato com demo', 'WHATSAPP',
   E'Ola, {{nome}}!\n\nEncontrei a {{empresa}} e preparei uma demonstracao de como poderia ficar um site moderno para a empresa.\n\nVeja:\n{{demo_url}}\n\nSe gostar, posso colocar no ar com o seu dominio.'),
  ('Follow-up', 'WHATSAPP',
   E'Oi, {{nome}}! Tudo bem?\n\nConseguiu ver a demonstracao do site da {{empresa}}?\n{{demo_url}}\n\nPosso ajustar cores, textos e fotos do jeito que preferir.'),
  ('Lembrete de pagamento', 'WHATSAPP',
   E'Ola, {{nome}}! Passando para lembrar do vencimento referente ao site da {{empresa}}. Qualquer duvida estou a disposicao.')
) v(name, channel, body)
where not exists (select 1 from public.message_templates);
