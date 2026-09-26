-- =====================================================================
-- CDEV - 10_hardening.sql
-- Correcoes apontadas pelo Security/Performance Advisor do Supabase.
-- Idempotente. Rode depois de 01, 05 e 07.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. record_last_login: sem sessao (anon), auth.uid() e nulo e a checagem
--    "target <> auth.uid()" virava NULL, deixando qualquer um alterar o
--    ultimo acesso de qualquer usuario. Agora exige sessao.
-- ---------------------------------------------------------------------
create or replace function public.record_last_login(target_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;
  if target_user_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not allowed';
  end if;

  update public.users
     set last_login = now(),
         updated_at = now()
   where id = target_user_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. search_path fixo em funcoes auxiliares
-- ---------------------------------------------------------------------
alter function public.set_updated_at() set search_path = public;
alter function public.cc_money(numeric) set search_path = public;
alter function public.cc_type_label(text) set search_path = public;
alter function public.cc_date(date) set search_path = public;
alter function public.cc_backup_fill_client() set search_path = public;
alter function public.cc_project_publish_stamp() set search_path = public;
alter function public.cc_bucket_before(int, int[]) set search_path = public;
alter function public.cc_bucket_after(int, int[]) set search_path = public;
alter function public.cc_due_label(int) set search_path = public;
alter function public.cc_severity_for(int) set search_path = public;
alter function public.cc_next_due(date, text, int) set search_path = public;

-- ---------------------------------------------------------------------
-- 3. Ninguem sem login executa funcoes internas
--    (o Supabase concede EXECUTE ao anon por padrao; revogamos explicitamente)
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.record_last_login(uuid)',
    'public.is_admin(uuid)',
    'public.can_access_spreadsheet(uuid)',
    'public.cc_today()',
    'public.cc_run_due_checks()',
    'public.cc_mark_payment_paid(uuid, date, text, numeric)',
    'public.cc_convert_lead(uuid)'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon', f);
    exception when undefined_function then null;
    end;
  end loop;

  -- create_property_spreadsheet: todas as assinaturas existentes
  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_property_spreadsheet'
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- funcoes de trigger nao precisam ser chamaveis pela API
  foreach f in array array[
    'public.handle_new_auth_user()',
    'public.cc_track_changes()',
    'public.cc_payment_close_alerts()',
    'public.cc_payment_insert_status()',
    'public.cc_backup_fill_client()',
    'public.cc_project_publish_stamp()',
    'public.set_updated_at()'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

grant execute on function public.record_last_login(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.can_access_spreadsheet(uuid) to authenticated;
grant execute on function public.cc_today() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. RLS: uma politica de leitura por tabela e auth.uid() avaliado uma vez
-- ---------------------------------------------------------------------
-- users
drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin" on public.users
for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

-- system_settings: leitura para usuarios ativos; escrita so admin
drop policy if exists "settings_read_active_users" on public.system_settings;
drop policy if exists "settings_write_admin_only" on public.system_settings;
drop policy if exists "settings_insert_admin" on public.system_settings;
drop policy if exists "settings_update_admin" on public.system_settings;
drop policy if exists "settings_delete_admin" on public.system_settings;
create policy "settings_read_active_users" on public.system_settings
for select to authenticated
using (exists (select 1 from public.users where id = (select auth.uid()) and active = true));
create policy "settings_insert_admin" on public.system_settings for insert to authenticated with check ((select public.is_admin()));
create policy "settings_update_admin" on public.system_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "settings_delete_admin" on public.system_settings for delete to authenticated using ((select public.is_admin()));

-- property_spreadsheets: admin ve tudo (inclusive arquivadas); dono ve as ativas dele
drop policy if exists "property_spreadsheets_select_owner_or_admin" on public.property_spreadsheets;
drop policy if exists "property_spreadsheets_admin_write" on public.property_spreadsheets;
drop policy if exists "property_spreadsheets_insert_admin" on public.property_spreadsheets;
drop policy if exists "property_spreadsheets_update_admin" on public.property_spreadsheets;
drop policy if exists "property_spreadsheets_delete_admin" on public.property_spreadsheets;
create policy "property_spreadsheets_select_owner_or_admin" on public.property_spreadsheets
for select to authenticated
using (
  (select public.is_admin())
  or (
    active = true
    and owner_user_id = (select auth.uid())
    and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.active = true)
    and exists (select 1 from public.system_settings ss where ss.key = 'spreadsheet_visible' and ss.enabled = true)
  )
);
create policy "property_spreadsheets_insert_admin" on public.property_spreadsheets for insert to authenticated with check ((select public.is_admin()));
create policy "property_spreadsheets_update_admin" on public.property_spreadsheets for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "property_spreadsheets_delete_admin" on public.property_spreadsheets for delete to authenticated using ((select public.is_admin()));

-- property_spreadsheet_months
drop policy if exists "property_months_select_owner_or_admin" on public.property_spreadsheet_months;
drop policy if exists "property_months_admin_write" on public.property_spreadsheet_months;
drop policy if exists "property_months_insert_admin" on public.property_spreadsheet_months;
drop policy if exists "property_months_update_admin" on public.property_spreadsheet_months;
drop policy if exists "property_months_delete_admin" on public.property_spreadsheet_months;
create policy "property_months_select_owner_or_admin" on public.property_spreadsheet_months
for select to authenticated
using ((select public.is_admin()) or public.can_access_spreadsheet(spreadsheet_id));
create policy "property_months_insert_admin" on public.property_spreadsheet_months for insert to authenticated with check ((select public.is_admin()));
create policy "property_months_update_admin" on public.property_spreadsheet_months for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "property_months_delete_admin" on public.property_spreadsheet_months for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 5. Indices para chaves estrangeiras
-- ---------------------------------------------------------------------
create index if not exists backups_client_idx on public.backups(client_id);
create index if not exists clients_created_by_idx on public.clients(created_by);
create index if not exists clients_lead_idx on public.clients(lead_id);
create index if not exists domains_project_idx on public.domains(project_id);
create index if not exists hostings_client_idx on public.hostings(client_id);
create index if not exists incidents_client_idx on public.incidents(client_id);
create index if not exists lead_activities_lead_idx on public.lead_activities(lead_id, created_at desc);
create index if not exists lead_activities_created_by_idx on public.lead_activities(created_by);
create index if not exists leads_client_idx on public.leads(client_id);
create index if not exists leads_demo_project_idx on public.leads(demo_project_id);
create index if not exists notifications_client_idx on public.notifications(client_id);
create index if not exists notifications_project_idx on public.notifications(project_id);
create index if not exists payments_domain_idx on public.payments(domain_id);
create index if not exists payments_hosting_idx on public.payments(hosting_id);
create index if not exists payments_project_idx on public.payments(project_id);
create index if not exists projects_hosting_idx on public.projects(hosting_id);
create index if not exists projects_template_idx on public.projects(template_id);
create index if not exists property_spreadsheets_created_by_idx on public.property_spreadsheets(created_by);
create index if not exists property_spreadsheets_owner_idx on public.property_spreadsheets(owner_user_id);
