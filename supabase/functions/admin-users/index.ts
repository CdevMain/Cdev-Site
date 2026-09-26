// CDEV - Edge Function "admin-users"
// Acoes administrativas que exigem a service role (nunca exposta no navegador).
// Deploy: supabase functions deploy admin-users   (ou pelo painel do Supabase)
// Variaveis SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY ja existem no ambiente das Edge Functions.
//
// Acoes (POST JSON):
//   { action: 'create', email, password, role, active }
//   { action: 'set_password', userId, password }        -> admin define nova senha
//   { action: 'reset_password', email, redirectTo? }    -> e-mail de redefinicao
//   { action: 'delete', userId, force? }                -> recusa se o usuario tiver planilhas (a menos que force)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Variáveis do Supabase ausentes na função' }, 500);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sessão ausente' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Sessão inválida. Entre novamente.' }, 401);
  const me = authData.user.id;

  const { data: adminProfile } = await service.from('users').select('id,role,active').eq('id', me).single();
  if (!adminProfile?.active || adminProfile.role !== 'admin') return json({ error: 'Apenas administradores' }, 403);

  const payload = await req.json().catch(() => ({}));
  const action = String(payload.action || '');

  try {
    if (action === 'create') {
      const email = String(payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const role = payload.role === 'admin' ? 'admin' : 'user';
      const active = payload.active !== false;
      if (!isEmail(email)) return json({ error: 'E-mail inválido' }, 400);
      if (password.length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres' }, 400);

      const { data: setting } = await service.from('system_settings').select('enabled').eq('key', 'user_registration_enabled').maybeSingle();
      if (setting && setting.enabled === false) return json({ error: 'Criação de usuários está desabilitada (Admin → Toggles)' }, 403);

      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role } });
      if (error || !data.user) {
        const msg = /already|registered|exists/i.test(error?.message || '') ? 'Já existe um usuário com este e-mail' : (error?.message || 'Não foi possível criar o usuário');
        return json({ error: msg }, 400);
      }
      const { error: profileError } = await service.from('users').upsert({ id: data.user.id, email, role, active }, { onConflict: 'id' });
      if (profileError) return json({ error: profileError.message }, 400);
      return json({ user: { id: data.user.id, email, role, active } });
    }

    if (action === 'set_password') {
      const userId = String(payload.userId || '');
      const password = String(payload.password || '');
      if (!userId) return json({ error: 'Usuário inválido' }, 400);
      if (password.length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres' }, 400);
      const { error } = await service.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'reset_password') {
      const email = String(payload.email || '').trim().toLowerCase();
      if (!isEmail(email)) return json({ error: 'E-mail inválido' }, 400);
      const redirectTo = typeof payload.redirectTo === 'string' && /^https?:\/\//.test(payload.redirectTo) ? payload.redirectTo : undefined;
      const { error } = await service.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'delete') {
      const userId = String(payload.userId || '');
      if (!userId || userId === me) return json({ error: 'Você não pode excluir a própria conta' }, 400);

      const { data: target } = await service.from('users').select('id,role,active').eq('id', userId).maybeSingle();
      if (target?.role === 'admin') {
        const { count } = await service.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true);
        if ((count || 0) <= 1) return json({ error: 'Não é possível excluir o último administrador' }, 400);
      }
      // Planilhas sao apagadas em cascata junto com o usuario: exige confirmacao explicita
      const { count: sheets } = await service.from('property_spreadsheets').select('id', { count: 'exact', head: true }).eq('owner_user_id', userId);
      if ((sheets || 0) > 0 && payload.force !== true) {
        return json({ error: `Este usuário é dono de ${sheets} planilha(s). Transfira as planilhas ou desative o usuário.`, code: 'HAS_SPREADSHEETS', sheets }, 409);
      }
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Ação não suportada' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message || 'Erro inesperado' }, 500);
  }
});
