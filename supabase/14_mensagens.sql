-- CDEV - Sistema de mensagens de prospeccao (lead -> mensagem -> WhatsApp)
-- Rode depois de 13_comissao_e_dados_fiscais.sql. Idempotente.
-- Nao cria outro sistema de leads: usa public.leads e public.message_templates que ja existem.

-- ============================================================ 1. Dados de personalizacao no lead (preenchidos por voce)
alter table public.leads add column if not exists specialty text;          -- {{especialidade}}
alter table public.leads add column if not exists main_service text;       -- {{servico_principal}}
alter table public.leads add column if not exists differential text;       -- {{diferencial}}
alter table public.leads add column if not exists hook text;               -- {{gancho}}
alter table public.leads add column if not exists detected_problem text;   -- {{problema_detectado}}
alter table public.leads add column if not exists opportunity_note text;   -- {{oportunidade}}
alter table public.leads add column if not exists contact_reason text;     -- {{motivo_contato}}
alter table public.leads add column if not exists message_notes text;      -- {{observacao}} (observacao para mensagem)

-- ============================================================ 2. Templates: nicho, estrategia, tom e tamanho
alter table public.message_templates add column if not exists niche text;       -- null = universal
alter table public.message_templates add column if not exists strategy text;    -- null = uso manual (ex.: cobranca)
alter table public.message_templates add column if not exists tone text;
alter table public.message_templates add column if not exists size text;
alter table public.message_templates add column if not exists description text;
alter table public.message_templates add column if not exists is_system boolean not null default false;
alter table public.message_templates add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.message_templates add constraint message_templates_strategy_chk
    check (strategy is null or strategy in ('GENERICA','CURIOSIDADE','DEMONSTRACAO','SEM_SITE','INSTAGRAM','GOOGLE','PRESENCA_ONLINE','MODERNIZACAO','OPORTUNIDADE'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.message_templates add constraint message_templates_tone_chk
    check (tone is null or tone in ('NATURAL','PROFISSIONAL','CASUAL','DIRETO','CONSULTIVO'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.message_templates add constraint message_templates_size_chk
    check (size is null or size in ('CURTA','MEDIA','DETALHADA'));
exception when duplicate_object then null; end $$;

-- ============================================================ 3. Historico de mensagens do lead
create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  template_id uuid references public.message_templates(id) on delete set null,
  template_name text,
  strategy text,
  tone text,
  size text,
  personalization text,
  generated_text text,                 -- como o sistema gerou
  final_text text not null,            -- como foi usado (editado pelo usuario)
  status text not null default 'GERADA' check (status in ('GERADA','EDITADA','COPIADA','WHATSAPP_ABERTO','ENVIADA')),
  phone text,
  whatsapp_opened_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_messages_lead_idx on public.lead_messages (lead_id, created_at desc);
create index if not exists lead_messages_template_idx on public.lead_messages (template_id);
create index if not exists lead_messages_created_by_idx on public.lead_messages (created_by);

alter table public.lead_messages enable row level security;
drop policy if exists lead_messages_admin_all on public.lead_messages;
create policy lead_messages_admin_all on public.lead_messages for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================ 4. Templates padrao (so cria se ainda nao existir pelo nome)
insert into public.message_templates (name, channel, niche, strategy, tone, size, description, is_system, body)
select v.name, 'WHATSAPP', v.niche, v.strategy, v.tone, v.size, v.description, true, v.body
from (values
  ('Universal — Básico', null, 'GENERICA', 'NATURAL', 'CURTA', 'Só nome, empresa, segmento e cidade. Serve para qualquer lead.',
   E'Olá, {{nome}}! Tudo bem?\n\nEncontrei a {{empresa}} aqui de {{cidade}} e vi que vocês trabalham com {{segmento}}.\n\nEu trabalho com criação de sites e preparei uma ideia de como a presença online da {{empresa}} poderia ficar.\n\n{{cta}}'),
  ('Universal — Demonstração', null, 'DEMONSTRACAO', 'NATURAL', 'MEDIA', 'Leva o link da demo pronta.',
   E'Olá, {{nome}}! Tudo bem?\n\nEncontrei a {{empresa}} e dei uma olhada na presença online de vocês.\n\nInclusive, preparei uma demonstração de como poderia ficar um site moderno para a empresa:\n\n{{demo_url}}\n\nA ideia foi criar algo pensado especificamente para {{segmento}}, com informações da empresa e um caminho mais direto para o cliente entrar em contato.\n\n{{cta}}'),
  ('Universal — Personalizada', null, 'OPORTUNIDADE', 'CONSULTIVO', 'DETALHADA', 'Usa gancho e problema detectado: só aparece quando esses campos estão preenchidos.',
   E'Olá, {{nome}}! Tudo bem?\n\nEstava pesquisando empresas de {{segmento}} em {{cidade}} e encontrei a {{empresa}}.\n\n{{gancho}}\n\nNotei também uma oportunidade na parte de presença online: {{problema_detectado}}\n\nPor isso montei uma demonstração de como eu apresentaria a {{empresa}} na internet:\n\n{{demo_url}}\n\n{{cta}}'),
  ('Universal — Sem site', null, 'SEM_SITE', 'NATURAL', 'MEDIA', 'Para quem ainda não tem site próprio.',
   E'Olá, {{nome}}! Tudo bem?\n\nEncontrei a {{empresa}} aqui de {{cidade}} e vi que vocês ainda não têm um site próprio.\n\nHoje muita gente pesquisa no Google antes de entrar em contato, e um site simples já ajuda a apresentar os serviços e deixar o WhatsApp a um clique.\n\n{{cta}}'),
  ('Universal — Instagram', null, 'INSTAGRAM', 'CASUAL', 'MEDIA', 'Para quem se apresenta só pelo Instagram.',
   E'Oi, {{nome}}! Tudo certo?\n\nVi o Instagram da {{empresa}} ({{instagram}}) e percebi que o perfil é o principal canal de vocês por enquanto.\n\nUm site próprio pode complementar o Instagram, reunindo serviços, localização e contato em um endereço só.\n\n{{cta}}'),
  ('Universal — Google', null, 'GOOGLE', 'PROFISSIONAL', 'MEDIA', 'Cita a nota e o número de avaliações do Google.',
   E'Olá, {{nome}}, tudo bem?\n\nEncontrei a {{empresa}} no Google Maps, com nota {{avaliacao_google}} em {{quantidade_avaliacoes}} avaliações.\n\nQuem chega pelo Google costuma procurar mais informações antes de entrar em contato. Um site próprio ajuda a transformar essa busca em conversa.\n\n{{cta}}'),
  ('Universal — Modernização', null, 'MODERNIZACAO', 'CONSULTIVO', 'MEDIA', 'Para quem já tem site e você anotou um problema.',
   E'Olá, {{nome}}! Tudo bem?\n\nDei uma olhada no site da {{empresa}} ({{site_atual}}) e anotei um ponto que pode ser melhorado: {{problema_detectado}}\n\nTrabalho com criação e modernização de sites e posso te mostrar como ficaria uma versão atualizada.\n\n{{cta}}'),
  ('Academias — Demonstração', 'academia', 'DEMONSTRACAO', 'NATURAL', 'MEDIA', 'Modelo do nicho de academias.',
   E'Olá, {{nome}}! Tudo bem?\n\nEncontrei a {{empresa}} aqui em {{cidade}} e vi que vocês trabalham com {{gancho}}.\n\nPreparei uma demonstração de um site pensado para apresentar melhor a academia, suas informações e formas de contato:\n\n{{demo_url}}\n\nA ideia é facilitar para quem encontra a academia na internet e já quer conhecer melhor ou entrar em contato.\n\n{{cta}}'),
  ('Advocacia — Demonstração', 'advocacia', 'DEMONSTRACAO', 'PROFISSIONAL', 'MEDIA', 'Sem promessa de resultado jurídico e sem inventar especialidades.',
   E'Olá, {{nome}}! Tudo bem?\n\nEncontrei o escritório {{empresa}} enquanto pesquisava profissionais de {{segmento}} em {{cidade}}.\n\n{{gancho}}\n\nPreparei uma demonstração de como o escritório poderia ter uma presença online mais completa e profissional:\n\n{{demo_url}}\n\nA ideia é organizar de forma clara as informações do escritório e os canais de contato.\n\n{{cta}}'),
  ('Energia Solar — Demonstração', 'energia_solar', 'DEMONSTRACAO', 'PROFISSIONAL', 'MEDIA', 'Sem inventar projetos, clientes, resultados ou economia.',
   E'Olá, {{nome}}! Tudo bem?\n\nEncontrei a {{empresa}} pesquisando empresas de energia solar em {{cidade}}.\n\n{{gancho}}\n\nPreparei uma demonstração de como a empresa poderia apresentar melhor seus serviços pela internet:\n\n{{demo_url}}\n\nA estrutura foi pensada para apresentar serviços, projetos, regiões atendidas e facilitar o contato.\n\n{{cta}}')
) as v(name, niche, strategy, tone, size, description, body)
where not exists (select 1 from public.message_templates t where t.name = v.name);
