-- =====================================================================
-- 15_crm_tags.sql  ·  Tags coloridas, nichos (categorias) e nicho automático
-- Rodar no Supabase SQL Editor depois do 14. Idempotente.
--
--  crm_tags            catálogo editável de TAGS (cor) e NICHOS (cor, palavras-chave,
--                      benefícios, dores e cuidados usados pelo motor de mensagens)
--  cc_guess_segment()  descobre o nicho de um lead pelas palavras-chave
--  trigger leads       lead sem segmento recebe o nicho do perfil de prospecção
--                      ou, se não tiver perfil, o nicho pelas palavras-chave
--  cc_rename_tag()     renomeia tag/nicho e atualiza todos os leads
--  cc_delete_tag()     remove tag do catálogo e dos leads
--  cc_apply_niches()   preenche o nicho dos leads antigos que estão sem
-- =====================================================================

create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'TAG' check (kind in ('TAG', 'NICHO')),
  name text not null check (length(trim(name)) > 0),
  color text not null default '#2b8ba5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  keywords text[] not null default '{}',
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- nichos também guardam o que o motor de mensagens usa (editáveis no painel)
alter table public.crm_tags add column if not exists benefits text[] not null default '{}';  -- "o site ajuda a ..."
alter table public.crm_tags add column if not exists pains text[] not null default '{}';     -- dores comuns (viram PERGUNTA, nunca afirmação)
alter table public.crm_tags add column if not exists notes text;                             -- cuidados (ex.: OAB, conselho de saúde)
create unique index if not exists crm_tags_kind_name_uq on public.crm_tags (kind, lower(name));

alter table public.crm_tags enable row level security;
drop policy if exists crm_tags_admin on public.crm_tags;
create policy crm_tags_admin on public.crm_tags for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.crm_tags to authenticated;

create index if not exists leads_tags_gin on public.leads using gin (tags);
create index if not exists leads_segment_idx on public.leads (segment);

-- nova estratégia do motor de mensagens
alter table public.message_templates drop constraint if exists message_templates_strategy_chk;
alter table public.message_templates add constraint message_templates_strategy_chk
  check (strategy is null or strategy in ('GENERICA','CURIOSIDADE','DEMONSTRACAO','SEM_SITE','INSTAGRAM','GOOGLE','PRESENCA_ONLINE','MODERNIZACAO','OPORTUNIDADE','IA_VISIBILIDADE'));

-- Normaliza texto para comparar (minúsculas, sem acento)
create or replace function public.cc_norm(p text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;

-- Nicho pelas palavras-chave do catálogo (primeiro que bater, por ordem)
create or replace function public.cc_guess_segment(p_text text) returns text
language sql stable security definer set search_path = public as $$
  select t.name from public.crm_tags t
  where t.kind = 'NICHO' and exists (
    select 1 from unnest(t.keywords) k
    where length(trim(k)) > 0 and public.cc_norm(p_text) like '%' || public.cc_norm(trim(k)) || '%')
  order by t.sort, t.name limit 1;
$$;

create or replace function public.cc_leads_auto_segment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.segment), '') = '' then
    if new.profile_key is not null then
      select p.segment into new.segment from public.prospect_profiles p where p.key = new.profile_key;
    end if;
    if coalesce(trim(new.segment), '') = '' then
      new.segment := public.cc_guess_segment(concat_ws(' ', new.company, new.main_activity, new.specialty, new.notes));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists leads_auto_segment on public.leads;
create trigger leads_auto_segment before insert or update of segment, profile_key, company, main_activity on public.leads
  for each row execute function public.cc_leads_auto_segment();

create or replace function public.cc_rename_tag(p_kind text, p_old text, p_new text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  if not public.is_admin() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  p_new := trim(p_new);
  if p_new = '' or p_old = p_new then return 0; end if;
  update public.crm_tags set name = p_new, updated_at = now() where kind = p_kind and lower(name) = lower(p_old);
  if p_kind = 'TAG' then
    update public.leads set tags = array(select distinct case when lower(x) = lower(p_old) then p_new else x end from unnest(tags) x), updated_at = now()
      where exists (select 1 from unnest(tags) x where lower(x) = lower(p_old));
  else
    update public.leads set segment = p_new, updated_at = now() where lower(segment) = lower(p_old);
    update public.prospect_profiles set segment = p_new, updated_at = now() where lower(segment) = lower(p_old);
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.cc_delete_tag(p_kind text, p_name text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  if not public.is_admin() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  delete from public.crm_tags where kind = p_kind and lower(name) = lower(p_name);
  if p_kind = 'TAG' then
    update public.leads set tags = array(select x from unnest(tags) x where lower(x) <> lower(p_name)), updated_at = now()
      where exists (select 1 from unnest(tags) x where lower(x) = lower(p_name));
    get diagnostics n = row_count;
  end if;
  return n; -- nicho apagado do catálogo não apaga o segmento dos leads
end $$;

create or replace function public.cc_apply_niches() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  if not public.is_admin() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  update public.leads l set segment = coalesce(
      (select p.segment from public.prospect_profiles p where p.key = l.profile_key),
      public.cc_guess_segment(concat_ws(' ', l.company, l.main_activity, l.specialty, l.notes)))
    where coalesce(trim(l.segment), '') = ''
      and coalesce((select p.segment from public.prospect_profiles p where p.key = l.profile_key),
                   public.cc_guess_segment(concat_ws(' ', l.company, l.main_activity, l.specialty, l.notes))) is not null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.cc_rename_tag(text, text, text) from anon;
revoke execute on function public.cc_delete_tag(text, text) from anon;
revoke execute on function public.cc_apply_niches() from anon;
revoke execute on function public.cc_guess_segment(text) from anon;
grant execute on function public.cc_rename_tag(text, text, text), public.cc_delete_tag(text, text), public.cc_apply_niches(), public.cc_guess_segment(text) to authenticated;

-- ---------------------------------------------------------------- Catálogo inicial
insert into public.crm_tags (kind, name, color, keywords, sort, benefits, pains, notes) values
  ('NICHO', 'Academia', '#e07b24', array['academia','crossfit','cross training','fitness','gym','musculação','treino funcional','studio fit'], 10,
    array['apresentar a estrutura, as modalidades e os horários da academia','mostrar planos, modalidades e localização, com o WhatsApp a um clique'],
    array['perguntas repetidas sobre planos e horários no WhatsApp','alunos que querem ver a estrutura antes de visitar'],
    'Não inventar número de alunos, resultados ou estrutura.'),
  ('NICHO', 'Energia solar', '#d6b43c', array['energia solar','fotovoltai','solar'], 20,
    array['apresentar os serviços, as regiões atendidas e facilitar pedidos de orçamento','mostrar como a empresa trabalha e deixar o pedido de orçamento a um clique'],
    array['pedidos de orçamento que chegam sem as informações básicas do cliente'],
    'Não inventar projetos, clientes, resultados ou economia.'),
  ('NICHO', 'Advocacia', '#7c6cf0', array['advoga','advocacia','jurídic','direito'], 30,
    array['organizar as áreas de atuação e os canais de contato do escritório de forma clara','apresentar o escritório de forma sóbria, com informações e contato em um só lugar'],
    array['clientes que chegam sem saber as áreas de atuação do escritório'],
    'Sem promessa de resultado jurídico. Não inventar especialidades (Provimento 205/2021 da OAB).'),
  ('NICHO', 'Barbearia', '#c0563a', array['barbearia','barber'], 40,
    array['mostrar os serviços, o portfólio de cortes e facilitar o agendamento','apresentar serviços, preços e localização em um só lugar'],
    array['agendamentos que dependem só do Instagram ou do WhatsApp'], 'Não inventar preços, prêmios ou número de clientes.'),
  ('NICHO', 'Salão / Estética', '#e05ab8', array['salão','salao','estética','estetica','beleza','manicure','sobrancelha','cabeleireir'], 45,
    array['mostrar o portfólio, os serviços e facilitar o agendamento','reunir serviços, fotos de trabalhos e contato em um só lugar'],
    array['clientes perguntando valores e horários um por um'], 'Procedimentos estéticos: não prometer resultado.'),
  ('NICHO', 'Clínica / Saúde', '#3fb58a', array['clínica','clinica','odonto','dentista','fisioterapia','psicólog','nutricionista','médic'], 50,
    array['apresentar os serviços, facilitar o agendamento e deixar o contato a um clique','organizar especialidades, convênios e localização de forma clara'],
    array['pacientes perguntando especialidades e convênios pelo WhatsApp'], 'Área regulada por conselho (CFM/CRO/CRP): sem promessa de cura ou resultado, sem antes/depois.'),
  ('NICHO', 'Restaurante', '#e05a7a', array['restaurante','pizzaria','hamburgueria','lanchonete','padaria','café','delivery'], 60,
    array['mostrar o cardápio, os horários e facilitar pedidos ou reservas','reunir cardápio, localização e contato em um endereço próprio'],
    array['ligações e mensagens perguntando cardápio e horário'], 'Não inventar pratos, preços ou avaliações.'),
  ('NICHO', 'Imobiliária', '#4aa3df', array['imobiliária','imobiliaria','imóveis','imoveis','corretor'], 70,
    array['exibir os imóveis e facilitar o contato de quem está buscando','organizar o catálogo de imóveis e captar contatos'],
    array['imóveis divulgados só em portais e redes sociais'], 'Respeitar regras do CRECI; não inventar imóveis ou valores.'),
  ('NICHO', 'Contabilidade', '#6f8d98', array['contabilidade','contábil','contabil','contador'], 80,
    array['apresentar os serviços de forma clara e profissional','explicar como o escritório trabalha e facilitar o primeiro contato'],
    array['clientes novos que não sabem quais serviços o escritório oferece'], 'Não prometer economia de impostos.'),
  ('NICHO', 'Pet shop / Veterinária', '#5bbf5b', array['pet shop','petshop','veterinár','veterinar','banho e tosa'], 90,
    array['facilitar o agendamento e apresentar os serviços','mostrar serviços, horários e localização em um só lugar'],
    array['agendamentos de banho e tosa feitos só por mensagem'], 'Não inventar serviços ou preços.'),
  ('NICHO', 'Oficina mecânica', '#8a7f9c', array['oficina','mecânica','mecanica','autocenter','funilaria','auto peças'], 100,
    array['facilitar pedidos de orçamento e mostrar os serviços','apresentar serviços, marcas atendidas e localização'],
    array['pedidos de orçamento que chegam sem as informações do veículo'], 'Não inventar marcas atendidas ou garantias.'),
  ('TAG', 'favorito', '#e8c547', '{}', 10, '{}', '{}', null),
  ('TAG', 'prospeccao', '#2b8ba5', '{}', 20, '{}', '{}', null),
  ('TAG', 'sem site', '#e07b24', '{}', 30, '{}', '{}', null),
  ('TAG', 'cold call', '#6f8d98', '{}', 40, '{}', '{}', null),
  ('TAG', 'quente', '#e0483e', '{}', 50, '{}', '{}', null),
  ('TAG', 'retornar', '#3fb58a', '{}', 60, '{}', '{}', null),
  ('TAG', 'sem resposta', '#8a7f9c', '{}', 70, '{}', '{}', null)
on conflict (kind, lower(name)) do nothing;

-- tags já usadas nos leads entram no catálogo (cor padrão)
insert into public.crm_tags (kind, name)
select distinct 'TAG', t from public.leads, unnest(tags) t where length(trim(t)) > 0
on conflict (kind, lower(name)) do nothing;
-- nichos já usados também
insert into public.crm_tags (kind, name, sort)
select distinct 'NICHO', segment, 200 from public.leads where coalesce(trim(segment), '') <> ''
on conflict (kind, lower(name)) do nothing;

-- leads antigos sem nicho (mesma regra do cc_apply_niches, sem checagem de admin aqui)
update public.leads l set segment = coalesce(
    (select p.segment from public.prospect_profiles p where p.key = l.profile_key),
    public.cc_guess_segment(concat_ws(' ', l.company, l.main_activity, l.specialty, l.notes)))
  where coalesce(trim(l.segment), '') = '';
