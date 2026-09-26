(function () {
  // URLs limpas (o Nginx serve /login -> login.html; ver ops/nginx/clean-urls.conf)
  const LOGIN_PAGE = '/login';
  const ERROR_PAGE = '/404';
  const DEFAULT_SETTINGS = [
    ['dashboard_enabled', true, 'Controla acesso e exibicao do dashboard.'],
    ['editing_enabled', true, 'Controla edicao inline e acoes de escrita.'],
    ['user_registration_enabled', true, 'Permite criacao ou convite de novos usuarios.'],
    ['spreadsheet_visible', true, 'Controla visualizacao de tabelas e planilhas.'],
    ['admin_panel_enabled', true, 'Controla acesso ao painel administrativo.']
  ];

  let client = null;
  let settingsCache = null;

  const qs = (selector, root = document) => root.querySelector(selector);

  const showSetup = (message) => {
    document.body.classList.add('auth-ready');
    const target = qs('[data-auth-status]') || qs('main') || document.body;
    target.innerHTML = `
      <section class="auth-state">
        <div class="section-label">Supabase</div>
        <h1>Configuracao pendente.</h1>
        <p>${message}</p>
      </section>
    `;
  };

  const getClient = () => {
    if (client) return client;
    const config = window.CDEV_SUPABASE_CONFIG || window.SUPABASE_CONFIG;
    if (!window.supabase || !config || !config.url || !config.anonKey) {
      throw new Error('Crie assets/js/supabase.config.js com url e anonKey do Supabase.');
    }
    client = window.supabase.createClient(config.url, config.anonKey);
    return client;
  };

  const redirectError = (code) => {
    window.location.replace(`${ERROR_PAGE}?code=${code || 403}`);
  };

  const redirectLogin = () => {
    const path = location.pathname.replace(/\.html$/, '') || '/';
    const next = encodeURIComponent(`${path}${location.search}${location.hash}`);
    window.location.replace(`${LOGIN_PAGE}?next=${next}`);
  };

  const normalizeSettings = (rows) => {
    const map = {};
    DEFAULT_SETTINGS.forEach(([key, enabled, description]) => {
      map[key] = { key, enabled, description, updated_at: null };
    });
    (rows || []).forEach((row) => {
      map[row.key] = {
        key: row.key,
        enabled: Boolean(row.enabled),
        description: row.description || map[row.key]?.description || '',
        updated_at: row.updated_at || null
      };
    });
    settingsCache = map;
    return map;
  };

  const getSession = async () => {
    const supabaseClient = getClient();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
  };

  const getProfile = async (userId) => {
    const supabaseClient = getClient();
    const { data, error } = await supabaseClient
      .from('users')
      .select('id,email,role,active,last_login,updated_at')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  };

  const getSettings = async ({ force = false } = {}) => {
    if (settingsCache && !force) return settingsCache;
    const supabaseClient = getClient();
    const { data, error } = await supabaseClient
      .from('system_settings')
      .select('key,enabled,description,updated_at')
      .order('key', { ascending: true });
    if (error) throw error;
    return normalizeSettings(data);
  };

  const isEnabled = (settings, key) => {
    if (!key) return true;
    return settings[key] ? Boolean(settings[key].enabled) : true;
  };

  const touchLogin = async (userId) => {
    const supabaseClient = getClient();
    await supabaseClient.rpc('record_last_login', { target_user_id: userId });
  };

  const requireAccess = async ({ admin = false, settingKey = null } = {}) => {
    try {
      const session = await getSession();
      if (!session) {
        redirectLogin();
        return null;
      }

      const [profile, settings] = await Promise.all([
        getProfile(session.user.id),
        getSettings({ force: true })
      ]);

      if (!profile.active) {
        redirectError(403);
        return null;
      }

      if (admin && profile.role !== 'admin') {
        redirectError(403);
        return null;
      }

      if (admin && !isEnabled(settings, 'admin_panel_enabled')) {
        redirectError(503);
        return null;
      }

      if (!isEnabled(settings, settingKey)) {
        redirectError(503);
        return null;
      }

      await touchLogin(session.user.id);
      document.body.classList.add('auth-ready');
      // avisa a barra lateral (admin-shell.js) quem esta logado e o que pode ver
      publicApi.lastAuth = { profile, settings };
      document.dispatchEvent(new CustomEvent('cdev:auth', { detail: publicApi.lastAuth }));
      return { session, profile, settings, supabase: getClient() };
    } catch (error) {
      console.error(error);
      showSetup(error.message || 'Nao foi possivel validar acesso.');
      return null;
    }
  };

  const subscribeSettings = (callback) => {
    const supabaseClient = getClient();
    return supabaseClient
      .channel('system-settings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, async () => {
        const settings = await getSettings({ force: true });
        callback(settings);
      })
      .subscribe();
  };

  const signOut = async () => {
    await getClient().auth.signOut();
    window.location.replace(LOGIN_PAGE);
  };

  const publicApi = window.CDEVAuth = {
    DEFAULT_SETTINGS,
    getClient,
    getSession,
    getProfile,
    getSettings,
    isEnabled,
    normalizeSettings,
    requireAccess,
    subscribeSettings,
    signOut,
    lastAuth: null
  };
})();
