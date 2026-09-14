import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Missing Supabase environment variables' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return json({ error: 'Missing authorization token' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Invalid session' }, 401);

  const { data: adminProfile, error: adminError } = await serviceClient
    .from('users')
    .select('id,role,active')
    .eq('id', authData.user.id)
    .single();

  if (adminError || !adminProfile?.active || adminProfile.role !== 'admin') {
    return json({ error: 'Admin access required' }, 403);
  }

  const payload = await req.json().catch(() => ({}));
  const action = String(payload.action || '');

  if (action === 'create') {
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const role = payload.role === 'admin' ? 'admin' : 'user';
    const active = payload.active !== false;

    if (!email || password.length < 6) {
      return json({ error: 'Email and a password with at least 6 characters are required' }, 400);
    }

    const { data: registrationSetting, error: settingError } = await serviceClient
      .from('system_settings')
      .select('enabled')
      .eq('key', 'user_registration_enabled')
      .single();

    if (settingError || registrationSetting?.enabled === false) {
      return json({ error: 'User registration is disabled' }, 403);
    }

    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role }
    });
    if (error || !data.user) return json({ error: error?.message || 'Could not create user' }, 400);

    const { error: profileError } = await serviceClient
      .from('users')
      .upsert({ id: data.user.id, email, role, active }, { onConflict: 'id' });
    if (profileError) return json({ error: profileError.message }, 400);

    return json({ user: { id: data.user.id, email, role, active } });
  }

  if (action === 'delete') {
    const userId = String(payload.userId || '');
    if (!userId || userId === authData.user.id) return json({ error: 'Invalid user id' }, 400);

    const { error } = await serviceClient.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === 'reset_password') {
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'Email is required' }, 400);

    const { error } = await serviceClient.auth.resetPasswordForEmail(email);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Unsupported action' }, 400);
});
