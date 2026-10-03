-- =====================================================================
-- 15_crm_tags.sql  ·  Tags coloridas, nichos (categorias) e nicho automático
-- Rodar no Supabase SQL Editor depois do 14. Idempotente.
--
--  crm_tags            catálogo editável de TAGS (cor) e NICHOS (cor + palavras-chave)
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
create unique index if not exists crm_tags_kind_name_uq on public.crm_tags (kind, lower(name));

alter table public.crm_tags enable row level security;
drop policy if exists crm_tags_admin on public.crm_tags;
create policy crm_tags_admin on public.crm_tags for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.crm_tags to authenticated;

create index if not exists leads_tags_gin on public.leads using gin (tags);
create index if not exists leads_segment_idx on public.leads (segment);

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
insert into public.crm_tags (kind, name, color, keywords, sort) values
  ('NICHO', 'Academia', '#e07b24', array['academia','crossfit','cross training','fitness','gym','musculação','treino funcional','studio fit'], 10),
  ('NICHO', 'Energia solar', '#d6b43c', array['energia solar','fotovoltai','solar'], 20),
  ('NICHO', 'Advocacia', '#7c6cf0', array['advoga','advocacia','jurídic','direito'], 30),
  ('NICHO', 'Barbearia', '#c0563a', array['barbearia','barber'], 40),
  ('NICHO', 'Clínica / Saúde', '#3fb58a', array['clínica','odonto','dentista','fisioterapia','estética','psicólog','nutricionista'], 50),
  ('NICHO', 'Restaurante', '#e05a7a', array['restaurante','pizzaria','hamburgueria','lanchonete','padaria','café'], 60),
  ('TAG', 'favorito', '#e8c547', '{}', 10),
  ('TAG', 'prospeccao', '#2b8ba5', '{}', 20),
  ('TAG', 'sem site', '#e07b24', '{}', 30),
  ('TAG', 'cold call', '#6f8d98', '{}', 40),
  ('TAG', 'quente', '#e0483e', '{}', 50),
  ('TAG', 'retornar', '#3fb58a', '{}', 60),
  ('TAG', 'sem resposta', '#8a7f9c', '{}', 70)
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
