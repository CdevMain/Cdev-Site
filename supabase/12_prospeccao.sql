-- CDEV CONTROL CENTER - Prospeccao de leads (agente diario + CRM)
-- Rode depois de 07_control_center.sql (e 10_hardening.sql, se ja aplicado). Idempotente.
--
-- O que este arquivo cria:
--   * campos de prospeccao em public.leads (UF, endereco, CEP, Google Maps, nota/avaliacoes,
--     potencial 1-5, tags, perfil, data da prospeccao, valor da venda)
--   * public.prospect_profiles  : nichos configuraveis (academias, energia solar, advogados...)
--   * public.prospect_runs      : historico das execucoes diarias (e controle de cidades pesquisadas)
--   * cc_prospect_add_lead(jsonb): cadastro com verificacao de duplicidade (telefone, Instagram,
--                                  Google Maps, nome+cidade) - nunca duplica, nunca sobrescreve
--   * cc_prospect_context(text) : tudo que o agente precisa ler antes de pesquisar
--   * views de totais comerciais (TOTAL DE VENDAS / TOTAL DE CLIENTES sempre calculados)

-- ============================================================ 1. Campos em leads
alter table public.leads add column if not exists state text check (state is null or state ~ '^[A-Z]{2}$');
alter table public.leads add column if not exists address text;
alter table public.leads add column if not exists cep text;
alter table public.leads add column if not exists maps_url text;
alter table public.leads add column if not exists google_rating numeric(2,1) check (google_rating is null or google_rating between 0 and 5);
alter table public.leads add column if not exists google_reviews integer check (google_reviews is null or google_reviews >= 0);
alter table public.leads add column if not exists potential smallint check (potential is null or potential between 1 and 5);
alter table public.leads add column if not exists tags text[] not null default '{}';
alter table public.leads add column if not exists profile_key text;
alter table public.leads add column if not exists prospected_at date;
alter table public.leads add column if not exists sale_value numeric(12,2) check (sale_value is null or sale_value >= 0);
alter table public.leads add column if not exists phone_key text;
alter table public.leads add column if not exists name_key text;

-- Telefone normalizado: so digitos, sem +55. "(11) 99937-2918" e "+5511999372918" -> "11999372918"
create or replace function public.cc_phone_key(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when d is null or d = '' then null
    when length(d) in (12, 13) and left(d, 2) = '55' then substr(d, 3)
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- Celular brasileiro: DDD (11-99) + 9 digitos comecando com 9
create or replace function public.cc_is_mobile(p text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(public.cc_phone_key(p) ~ '^[1-9][1-9]9[0-9]{8}$', false);
$$;

-- Nome normalizado para achar a mesma empresa com nome em outra ordem:
-- "Academia Strong Fit" e "Strong Fit Academia" -> "fit strong"
create or replace function public.cc_name_key(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(string_agg(w, ' ' order by w), '')
  from regexp_split_to_table(
         regexp_replace(
           translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
           '[^a-z0-9 ]', ' ', 'g'),
         '\s+') as w
  where w <> '' and w not in ('academia','academias','a','o','e','de','da','do','das','dos','ltda','me','eireli','epp','sa','cia','and','the');
$$;

create or replace function public.cc_leads_keys()
returns trigger language plpgsql set search_path = public as $$
begin
  new.phone_key := coalesce(public.cc_phone_key(new.whatsapp), public.cc_phone_key(new.phone));
  new.name_key := public.cc_name_key(new.company);
  if new.state is not null then new.state := upper(trim(new.state)); end if;
  return new;
end;
$$;
drop trigger if exists leads_keys on public.leads;
create trigger leads_keys before insert or update of phone, whatsapp, company, state on public.leads
  for each row execute function public.cc_leads_keys();
update public.leads set company = company where phone_key is null or name_key is null;  -- preenche chaves antigas

create index if not exists leads_phone_key_idx on public.leads (phone_key);
create index if not exists leads_name_city_idx on public.leads (name_key, lower(city));
create index if not exists leads_profile_idx on public.leads (profile_key, potential desc);
create index if not exists leads_maps_url_idx on public.leads (maps_url);

-- ============================================================ 2. Perfis de prospeccao (nichos)
create table if not exists public.prospect_profiles (
  key text primary key check (key ~ '^[a-z0-9-]+$'),
  name text not null,
  segment text not null,                      -- vai para leads.segment
  region text not null,                       -- ex.: "Brasil inteiro" ou "Sao Paulo e regiao metropolitana"
  daily_min integer not null default 20 check (daily_min >= 0),
  daily_max integer not null default 30 check (daily_max >= daily_min),
  search_terms text[] not null default '{}',
  filters jsonb not null default '{}'::jsonb, -- min_reviews, max_reviews, require_mobile, require_no_website, exclude_closed
  exclude_brands text[] not null default '{}',
  rules text not null default '',             -- criterios de aprovacao/descarte em texto livre
  tags text[] not null default '{}',
  active boolean not null default false,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospect_runs (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null references public.prospect_profiles(key) on update cascade on delete cascade,
  run_date date not null default public.cc_today(),
  status text not null default 'EM_ANDAMENTO' check (status in ('EM_ANDAMENTO','CONCLUIDA','PARCIAL','FALHOU')),
  added integer not null default 0,
  duplicates integer not null default 0,
  discarded integer not null default 0,
  cities jsonb not null default '[]'::jsonb,  -- [{"city":"Caruaru","state":"PE","added":4}]
  errors text,
  summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists prospect_runs_profile_date_idx on public.prospect_runs (profile_key, run_date desc);

alter table public.prospect_profiles enable row level security;
alter table public.prospect_runs enable row level security;
do $$
declare t text;
begin
  foreach t in array array['prospect_profiles','prospect_runs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- ============================================================ 3. Cadastro com verificacao de duplicidade
-- Entrada (jsonb): profile_key*, company*, whatsapp|phone*, name, city, state, address, cep, instagram,
--   website, maps_url, google_rating, google_reviews, potential (1-5), notes (vira nota do lead), tags[]
-- Saida: {"status":"created","lead_id":...} | {"status":"duplicate","lead_id":...,"match":"telefone"}
--        | {"status":"rejected","reason":"..."}
create or replace function public.cc_prospect_add_lead(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.prospect_profiles;
  v_phone text := nullif(trim(p->>'phone'), '');
  v_wa text := nullif(trim(p->>'whatsapp'), '');
  k text;
  v_insta text := nullif(lower(regexp_replace(trim(coalesce(p->>'instagram', '')), '^(https?://(www\.)?instagram\.com/|@)', '')), '');
  v_insta_clean text;
  v_maps text := nullif(trim(p->>'maps_url'), '');
  v_name_key text := public.cc_name_key(p->>'company');
  v_city text := nullif(trim(p->>'city'), '');
  v_reviews integer := nullif(p->>'google_reviews', '')::integer;
  v_pot integer := nullif(p->>'potential', '')::integer;
  dup record;
  new_id uuid;
begin
  -- Somente admin no painel; auth.uid() nulo = service role / SQL do agente (anon nao tem EXECUTE)
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admin access required';
  end if;

  select * into prof from public.prospect_profiles where key = p->>'profile_key';
  if prof.key is null then return jsonb_build_object('status', 'rejected', 'reason', 'perfil de prospeccao inexistente'); end if;
  if nullif(trim(p->>'company'), '') is null then return jsonb_build_object('status', 'rejected', 'reason', 'nome da empresa vazio'); end if;

  k := coalesce(public.cc_phone_key(v_wa), public.cc_phone_key(v_phone));
  if k is null then return jsonb_build_object('status', 'rejected', 'reason', 'sem telefone/WhatsApp'); end if;
  if k ~ '^(0800|0300|3003|4004|4003|4020)' or length(k) < 10 then
    return jsonb_build_object('status', 'rejected', 'reason', 'numero de central/0800');
  end if;
  if coalesce((prof.filters->>'require_mobile')::boolean, false) and not public.cc_is_mobile(k) then
    return jsonb_build_object('status', 'rejected', 'reason', 'nao e celular (DDD + 9 digitos)');
  end if;
  if coalesce((prof.filters->>'require_no_website')::boolean, false) and nullif(trim(p->>'website'), '') is not null then
    return jsonb_build_object('status', 'rejected', 'reason', 'possui site proprio');
  end if;
  if v_reviews is not null and prof.filters ? 'min_reviews' and v_reviews < (prof.filters->>'min_reviews')::integer then
    return jsonb_build_object('status', 'rejected', 'reason', 'poucas avaliacoes');
  end if;
  if v_reviews is not null and prof.filters ? 'max_reviews' and v_reviews > (prof.filters->>'max_reviews')::integer then
    return jsonb_build_object('status', 'rejected', 'reason', 'avaliacoes acima do limite (porte grande)');
  end if;
  if v_pot is not null and v_pot not between 1 and 5 then
    return jsonb_build_object('status', 'rejected', 'reason', 'potencial deve ser de 1 a 5');
  end if;

  -- Serializa cadastros do mesmo telefone (duas execucoes ao mesmo tempo nao duplicam)
  perform pg_advisory_xact_lock(hashtext('cc_prospect:' || k));

  v_insta_clean := nullif(regexp_replace(coalesce(v_insta, ''), '[/?].*$', ''), '');

  select id, 'telefone' as match into dup from public.leads
   where phone_key = k or public.cc_phone_key(phone) = k or public.cc_phone_key(whatsapp) = k limit 1;
  if dup.id is null and v_maps is not null then
    select id, 'google_maps' as match into dup from public.leads where maps_url = v_maps limit 1;
  end if;
  if dup.id is null and v_insta_clean is not null then
    select id, 'instagram' as match into dup from public.leads
     where lower(regexp_replace(regexp_replace(coalesce(instagram, ''), '^(https?://(www\.)?instagram\.com/|@)', ''), '[/?].*$', '')) = v_insta_clean limit 1;
  end if;
  if dup.id is null and v_name_key is not null and v_city is not null then
    select id, 'nome_cidade' as match into dup from public.leads
     where name_key = v_name_key and lower(city) = lower(v_city) limit 1;
  end if;
  -- Tambem ja e cliente?
  if dup.id is null then
    select id, 'cliente_existente' as match into dup from public.clients
     where public.cc_phone_key(phone) = k or public.cc_phone_key(whatsapp) = k limit 1;
  end if;
  if dup.id is not null then
    return jsonb_build_object('status', 'duplicate', 'lead_id', dup.id, 'match', dup.match);
  end if;

  insert into public.leads (
    company, name, segment, city, state, address, cep, phone, whatsapp, instagram, website,
    maps_url, google_rating, google_reviews, potential, tags, profile_key, prospected_at,
    source, status, score, score_flags, notes
  ) values (
    trim(p->>'company'), nullif(trim(p->>'name'), ''), prof.segment, v_city, upper(nullif(trim(p->>'state'), '')),
    nullif(trim(p->>'address'), ''), nullif(regexp_replace(coalesce(p->>'cep', ''), '\D', '', 'g'), ''),
    case when v_phone is not null then '+55' || public.cc_phone_key(v_phone) end,
    case when v_wa is not null then '+55' || public.cc_phone_key(v_wa)
         when public.cc_is_mobile(k) then '+55' || k end,
    case when v_insta_clean is not null then '@' || v_insta_clean end,
    nullif(trim(p->>'website'), ''), v_maps,
    nullif(p->>'google_rating', '')::numeric, v_reviews, v_pot,
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb))), '{}') || prof.tags,
    prof.key, public.cc_today(), 'GOOGLE', 'LEAD',
    coalesce(v_pot, 0) * 20,
    jsonb_build_object('sem_site', nullif(trim(p->>'website'), '') is null, 'instagram', v_insta_clean is not null,
                       'whatsapp', public.cc_is_mobile(k), 'presenca_publica', coalesce(v_reviews, 0) >= 20),
    null
  ) returning id into new_id;

  insert into public.lead_activities (lead_id, type, content)
  values (new_id, 'NOTA', concat_ws(E'\n',
    case when p ? 'google_rating' or p ? 'google_reviews'
         then format('Google: %s estrelas, %s avaliações', coalesce(replace(p->>'google_rating', '.', ','), '?'), coalesce(p->>'google_reviews', '?')) end,
    case when v_maps is not null then 'Perfil: ' || v_maps end,
    nullif(trim(p->>'notes'), '')));

  return jsonb_build_object('status', 'created', 'lead_id', new_id);
end;
$$;

-- ============================================================ 4. Views comerciais (calculadas, nunca digitadas)
create or replace view public.prospect_city_log with (security_invoker = true) as
  select r.profile_key, r.run_date, c->>'city' as city, upper(c->>'state') as state, coalesce((c->>'added')::integer, 0) as added
    from public.prospect_runs r, jsonb_array_elements(r.cities) c;

-- "Comprou?": Sim = status CLIENTE, Nao = PERDIDO, Em negociacao = qualquer etapa depois de LEAD
create or replace view public.prospect_commercial_summary with (security_invoker = true) as
  select
    count(*) as total_leads,
    count(*) filter (where status = 'CLIENTE') as total_clientes,
    coalesce(sum(sale_value) filter (where status = 'CLIENTE'), 0)::numeric(12,2) as total_vendas,
    count(*) filter (where status not in ('LEAD','CLIENTE','PERDIDO')) as em_negociacao,
    count(*) filter (where status = 'LEAD') as nao_contatados,
    count(*) filter (where potential >= 4 and status not in ('CLIENTE','PERDIDO')) as prioridade_alta_abertos
  from public.leads;

-- ============================================================ 5. Contexto para o agente (ler antes de pesquisar)
create or replace function public.cc_prospect_context(p_profile text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is not null and not public.is_admin() then null else jsonb_build_object(
    'profile', (select to_jsonb(pp) from public.prospect_profiles pp where pp.key = p_profile),
    'today', public.cc_today(),
    'already_ran_today', exists (select 1 from public.prospect_runs r where r.profile_key = p_profile and r.run_date = public.cc_today() and r.status in ('CONCLUIDA','PARCIAL')),
    'added_today', (select count(*) from public.leads l where l.profile_key = p_profile and l.prospected_at = public.cc_today()),
    'total_leads_profile', (select count(*) from public.leads l where l.profile_key = p_profile),
    'total_leads', (select count(*) from public.leads),
    'by_state', coalesce((select jsonb_object_agg(coalesce(state, '??'), n) from (select state, count(*) n from public.leads where profile_key = p_profile group by state) s), '{}'::jsonb),
    'cities_searched', coalesce((select jsonb_agg(c order by c->>'last_date' desc) from (
        select jsonb_build_object('city', city, 'state', state, 'searched_times', count(*), 'leads_added', sum(added), 'last_date', max(run_date)) c
          from public.prospect_city_log where profile_key = p_profile group by city, state) x), '[]'::jsonb),
    'recent_runs', coalesce((select jsonb_agg(jsonb_build_object('date', run_date, 'status', status, 'added', added, 'duplicates', duplicates, 'discarded', discarded) order by started_at desc)
        from (select * from public.prospect_runs where profile_key = p_profile order by started_at desc limit 10) r), '[]'::jsonb),
    'commercial', (select to_jsonb(s) from public.prospect_commercial_summary s)
  ) end;
$$;

-- ============================================================ 6. Permissoes
revoke all on function public.cc_prospect_add_lead(jsonb) from public, anon;
revoke all on function public.cc_prospect_context(text) from public, anon;
grant execute on function public.cc_prospect_add_lead(jsonb) to authenticated;
grant execute on function public.cc_prospect_context(text) to authenticated;
revoke all on function public.cc_leads_keys() from public, anon, authenticated;
grant select on public.prospect_city_log, public.prospect_commercial_summary to authenticated;
revoke all on public.prospect_city_log, public.prospect_commercial_summary from anon;

-- ============================================================ 7. Perfis iniciais (editaveis em Control Center > Prospeccao)
insert into public.prospect_profiles (key, name, segment, region, daily_min, daily_max, search_terms, filters, exclude_brands, rules, tags, active, priority) values
('academias', 'Academias sem site', 'Academia', 'Brasil inteiro: capitais, cidades médias e pequenas; alternar Norte, Nordeste, Centro-Oeste, Sudeste e Sul', 20, 30,
 array['academia', 'academia de musculação', 'crossfit', 'estúdio de treino funcional'],
 '{"require_no_website": true, "require_mobile": false, "exclude_closed": true}'::jsonb,
 array['Smart Fit','Bluefit','Selfit','Bodytech','Fórmula','Panobianco','Pratique','Just Fit','Skyfit','Redfit','Alpha Fit','Evolve'],
 E'Aprovar somente academia local/independente, sem site próprio no Google Maps nem no Instagram, com telefone/WhatsApp.\n'
 'Linktree, Beacons, WhatsApp, Facebook, formulário, sistema de agendamento/matrícula ou pagamento NÃO contam como site próprio: abra o link para conferir.\n'
 'Site institucional próprio (apresenta estrutura, planos, serviços) = descartar.\n'
 'Em dúvida se é rede/franquia: pesquisar antes. Continua em dúvida: descartar.\n'
 'Potencial 1-5 pelo conjunto: avaliações, nota, fotos, estrutura, atividade e qualidade do Instagram, serviços, investimento aparente. Instagram bonito sozinho não vale 5.',
 array['prospeccao', 'sem site'], true, 10),
('energia-solar', 'Instaladores de energia solar - SP', 'Energia solar', 'São Paulo e região metropolitana', 25, 25,
 array['energia solar', 'instalação de energia solar', 'energia fotovoltaica', 'instalação fotovoltaica', 'integrador solar'],
 '{"min_reviews": 16, "max_reviews": 349, "require_mobile": true, "require_no_website": false, "exclude_closed": true}'::jsonb,
 array['Portal Solar','BlueSun','Solfácil','Aldo Solar','WEG','Canadian Solar'],
 E'A empresa precisa INSTALAR sistemas solares para clientes (instaladora/integradora).\n'
 'Descartar: só venda de placas/equipamentos, distribuidores, energia por assinatura, geração compartilhada, marketplace, grandes redes nacionais.\n'
 'Celular obrigatório (DDD + 9 dígitos começando com 9). Descartar fixo, 0800, 0300, 3003, 4004, centrais e telefone repetido em várias empresas.\n'
 'Entre 16 e 349 avaliações; não pode estar marcada como fechada. Site oficial é permitido (registrar no campo site).',
 array['cold call'], false, 20),
('advogados', 'Escritórios de advocacia sem site', 'Advocacia', 'Brasil inteiro, priorizando cidades médias', 20, 30,
 array['advogado', 'escritório de advocacia', 'advocacia trabalhista', 'advogado previdenciário'],
 '{"require_no_website": true, "require_mobile": false, "exclude_closed": true}'::jsonb,
 array[]::text[],
 E'Aprovar escritório ou advogado autônomo local, sem site próprio (mesmas regras de links de bio das academias), com telefone/WhatsApp.\n'
 'Descartar grandes bancas nacionais, associações, órgãos públicos e perfis sem contato.\n'
 'Respeitar o Provimento 205/2021 da OAB na abordagem: mensagem informativa, sem promessa de resultado.',
 array['prospeccao', 'sem site'], false, 30)
on conflict (key) do nothing;
