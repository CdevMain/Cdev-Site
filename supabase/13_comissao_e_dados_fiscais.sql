-- CDEV - Pagamento da comissao do coanfitriao (planilhas) + dados fiscais de leads/clientes + fotos
-- Rode depois de 12_prospeccao.sql. Idempotente.

-- ============================================================ 1. Comissao do coanfitriao por mes
-- Pago = host_fee_paid_at preenchido. Vencimento = dia commission_due_day do mes seguinte.
alter table public.property_spreadsheet_months add column if not exists host_fee_paid_at date;
alter table public.property_spreadsheet_months add column if not exists host_fee_paid_amount numeric(12,2) check (host_fee_paid_amount is null or host_fee_paid_amount >= 0);
alter table public.property_spreadsheet_months add column if not exists host_fee_payment_method text
  check (host_fee_payment_method is null or host_fee_payment_method in ('PIX','TRANSFERENCIA','DINHEIRO','CARTAO','BOLETO','OUTRO'));
alter table public.property_spreadsheet_months add column if not exists host_fee_note text;

alter table public.property_spreadsheets add column if not exists commission_due_day smallint not null default 10
  check (commission_due_day between 1 and 28);

-- ============================================================ 2. Dados fiscais e cadastrais (leads)
alter table public.leads add column if not exists person_type text check (person_type is null or person_type in ('PF','PJ'));
alter table public.leads add column if not exists document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$');
alter table public.leads add column if not exists legal_name text;              -- razao social / nome completo
alter table public.leads add column if not exists state_registration text;      -- inscricao estadual
alter table public.leads add column if not exists municipal_registration text;  -- inscricao municipal
alter table public.leads add column if not exists tax_regime text check (tax_regime is null or tax_regime in ('MEI','SIMPLES','PRESUMIDO','REAL','ISENTO','OUTRO'));
alter table public.leads add column if not exists main_activity text;           -- CNAE principal (descricao)
alter table public.leads add column if not exists contact_role text;            -- cargo do responsavel
alter table public.leads add column if not exists contact_document text check (contact_document is null or contact_document ~ '^[0-9]{11}$'); -- CPF do responsavel
alter table public.leads add column if not exists billing_email text;
alter table public.leads add column if not exists address_number text;
alter table public.leads add column if not exists address_complement text;
alter table public.leads add column if not exists neighborhood text;
alter table public.leads add column if not exists photo_path text;              -- caminho no bucket crm-media

-- ============================================================ 3. Mesmos dados em clients (a conversao carrega tudo)
alter table public.clients add column if not exists person_type text check (person_type is null or person_type in ('PF','PJ'));
alter table public.clients add column if not exists legal_name text;
alter table public.clients add column if not exists state_registration text;
alter table public.clients add column if not exists municipal_registration text;
alter table public.clients add column if not exists tax_regime text check (tax_regime is null or tax_regime in ('MEI','SIMPLES','PRESUMIDO','REAL','ISENTO','OUTRO'));
alter table public.clients add column if not exists main_activity text;
alter table public.clients add column if not exists contact_name text;
alter table public.clients add column if not exists contact_role text;
alter table public.clients add column if not exists contact_document text check (contact_document is null or contact_document ~ '^[0-9]{11}$');
alter table public.clients add column if not exists billing_email text;
alter table public.clients add column if not exists cep text;
alter table public.clients add column if not exists address_number text;
alter table public.clients add column if not exists address_complement text;
alter table public.clients add column if not exists neighborhood text;
alter table public.clients add column if not exists state text check (state is null or state ~ '^[A-Z]{2}$');
alter table public.clients add column if not exists instagram text;
alter table public.clients add column if not exists photo_path text;

-- Conversao lead -> cliente passa a levar os dados fiscais, endereco e foto
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
    insert into public.clients (
      name, company, document, phone, whatsapp, email, address, city, notes, status, lead_id,
      person_type, legal_name, state_registration, municipal_registration, tax_regime, main_activity,
      contact_name, contact_role, contact_document, billing_email, cep, address_number, address_complement,
      neighborhood, state, instagram, photo_path
    ) values (
      coalesce(nullif(l.company, ''), l.name), l.company, l.document, l.phone, l.whatsapp, l.email, l.address, l.city,
      concat_ws(E'\n', 'Convertido do CRM.', l.notes), 'ATIVO', l.id,
      l.person_type, l.legal_name, l.state_registration, l.municipal_registration, l.tax_regime, l.main_activity,
      l.name, l.contact_role, l.contact_document, l.billing_email, l.cep, l.address_number, l.address_complement,
      l.neighborhood, l.state, l.instagram, l.photo_path
    ) returning id into v_client;
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
revoke all on function public.cc_convert_lead(uuid) from public, anon;

-- ============================================================ 4. Fotos (Supabase Storage, bucket privado)
-- Somente admin le e grava. O painel exibe com URL assinada (expira), nunca publica.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Storage indisponivel neste banco; bucket crm-media nao criado.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('crm-media', 'crm-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

  execute 'drop policy if exists crm_media_admin_select on storage.objects';
  execute 'drop policy if exists crm_media_admin_insert on storage.objects';
  execute 'drop policy if exists crm_media_admin_update on storage.objects';
  execute 'drop policy if exists crm_media_admin_delete on storage.objects';
  execute $p$create policy crm_media_admin_select on storage.objects for select to authenticated using (bucket_id = 'crm-media' and public.is_admin())$p$;
  execute $p$create policy crm_media_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'crm-media' and public.is_admin())$p$;
  execute $p$create policy crm_media_admin_update on storage.objects for update to authenticated using (bucket_id = 'crm-media' and public.is_admin()) with check (bucket_id = 'crm-media' and public.is_admin())$p$;
  execute $p$create policy crm_media_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'crm-media' and public.is_admin())$p$;
end $$;
