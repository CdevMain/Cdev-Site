/* CDEV ADMIN SHELL
 * Barra lateral unica para Control Center, Dashboard e Admin.
 * - Monta os itens conforme a permissao do usuario (evento "cdev:auth" disparado por cdev-auth.js):
 *     admin  -> Control Center completo + Dashboard + Admin
 *     user   -> apenas Dashboard
 * - Recolhivel (so icones), estado salvo no navegador; atalho Ctrl+\ / Cmd+\
 * - No celular vira gaveta (botao #menu-btn + fundo escurecido)
 * - URLs limpas: /control, /dashboard, /admin
 */
(function () {
  const KEY = 'cdev:side-collapsed';
  const root = document.documentElement;
  const page = (document.body && document.body.dataset.page) || (location.pathname.replace(/^\/|\.html$/g, '') || 'index');
  const onControl = page === 'control';

  const I = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    radar: '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    msg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    chevron: '<path d="m15 18-6-6 6-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    site: '<circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/><path d="M2 12h20"/>'
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || I.layout}</svg>`;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // [grupo, [ [chave, rotulo, icone, destino, permissao] ]]
  // destino: 'page:<nome>' (pagina) ou 'route:<rota>' (rota do Control Center)
  const NAV = [
    [null, [
      ['painel', 'Control Center', 'home', 'route:painel', 'control'],
      ['notificacoes', 'Alertas', 'bell', 'route:notificacoes', 'control']
    ]],
    ['Painel', [
      ['dashboard', 'Dashboard', 'chart', 'page:dashboard', 'dashboard'],
      ['admin', 'Admin', 'shield', 'page:admin', 'admin']
    ]],
    ['Relacionamento', [
      ['clientes', 'Clientes', 'users', 'route:clientes', 'control'],
      ['leads', 'Leads / CRM', 'target', 'route:leads', 'control'],
      ['prospeccao', 'Prospecção', 'radar', 'route:prospeccao', 'control'],
      ['nichos', 'Nichos do agente', 'grid', 'route:nichos', 'control'],
      ['mensagens', 'Mensagens', 'msg', 'route:mensagens', 'control']
    ]],
    ['Site Factory', [
      ['projetos', 'Projetos / Sites', 'layers', 'route:projetos', 'control'],
      ['templates', 'Templates', 'layout', 'route:templates', 'control']
    ]],
    ['Financeiro', [
      ['pagamentos', 'Pagamentos', 'wallet', 'route:pagamentos', 'control'],
      ['dominios', 'Domínios', 'globe', 'route:dominios', 'control'],
      ['hospedagens', 'Hospedagens', 'server', 'route:hospedagens', 'control']
    ]],
    ['Operação', [
      ['monitoramento', 'Monitoramento', 'activity', 'route:monitoramento', 'control'],
      ['incidentes', 'Incidentes', 'zap', 'route:incidentes', 'control'],
      ['backups', 'Backups', 'archive', 'route:backups', 'control']
    ]],
    ['Sistema', [
      ['configuracoes', 'Configurações', 'settings', 'route:configuracoes', 'control']
    ]]
  ];

  const hrefFor = (dest) => {
    const [kind, name] = dest.split(':');
    if (kind === 'page') return `/${name}`;
    return onControl ? `#/${name}` : `/control#/${name}`;
  };

  const allowed = (perm, auth) => {
    const { profile, settings } = auth;
    const on = (k) => !settings || !settings[k] || settings[k].enabled !== false;
    const isAdmin = profile && profile.role === 'admin';
    if (perm === 'dashboard') return on('dashboard_enabled');
    if (perm === 'admin') return isAdmin && on('admin_panel_enabled');
    if (perm === 'control') return isAdmin && on('admin_panel_enabled') && on('control_center_enabled');
    return false;
  };

  // ---------------------------------------------------------------- Recolher
  const isCollapsed = () => root.classList.contains('side-collapsed');
  const setCollapsed = (v) => {
    root.classList.toggle('side-collapsed', v);
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* sem storage */ }
    const btn = document.querySelector('.cc-collapse');
    if (btn) { btn.setAttribute('aria-expanded', String(!v)); btn.setAttribute('aria-label', v ? 'Expandir menu' : 'Recolher menu'); btn.title = `${v ? 'Expandir' : 'Recolher'} menu (Ctrl+\\)`; }
  };

  // Dica flutuante para os itens quando recolhido
  let tip;
  const showTip = (el) => {
    if (!isCollapsed() || window.innerWidth <= 900) return;
    tip = tip || Object.assign(document.createElement('div'), { className: 'cc-tip' });
    if (!tip.isConnected) document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    tip.textContent = el.dataset.label || '';
    tip.style.left = `${r.right + 10}px`;
    tip.style.top = `${r.top + r.height / 2}px`;
    requestAnimationFrame(() => tip.classList.add('show'));
  };
  const hideTip = () => { if (tip) tip.classList.remove('show'); };

  // ---------------------------------------------------------------- Render
  let lastAuth = null;
  const render = (auth) => {
    lastAuth = auth;
    const side = document.getElementById('cdev-side');
    if (!side) return;
    const email = (auth.profile && auth.profile.email) || '';
    const groups = NAV.map(([group, items]) => [group, items.filter((it) => allowed(it[4], auth))]).filter(([, items]) => items.length);
    side.innerHTML = `
      <div class="cc-side-head">
        <a class="nav-logo" href="/" aria-label="CDEV - site"><span class="full">CDEV</span><span class="mono-mark">C</span></a>
        <button class="cc-collapse" type="button" aria-controls="cdev-side">${icon('chevron')}</button>
      </div>
      <nav class="cc-side-scroll" aria-label="Menu principal">
        ${groups.map(([group, items]) => `${group ? `<div class="cc-side-group">${esc(group)}</div>` : ''}${items.map(([key, text, ic, dest]) => {
          const kind = dest.split(':')[0];
          const attrs = kind === 'route' ? `data-route="${key}"` : `data-page="${key}"`;
          const active = kind === 'page' && key === page;
          return `<a class="cc-nav${active ? ' active' : ''}" ${attrs} data-label="${esc(text)}" href="${hrefFor(dest)}"${active ? ' aria-current="page"' : ''}>${icon(ic)}<span class="cc-nav-label">${esc(text)}</span><span class="count" data-count="${key}" hidden></span></a>`;
        }).join('')}`).join('')}
      </nav>
      <div class="cc-side-foot">
        <div class="cc-side-user" title="${esc(email)}"><span class="avatar">${esc((email || '?').charAt(0))}</span><span class="who">${esc(email)}<small>${esc((auth.profile && auth.profile.role) || '')}</small></span></div>
        <button class="cc-nav" type="button" data-shell-signout data-label="Sair">${icon('logout')}<span class="cc-nav-label">Sair</span></button>
      </div>`;
    setCollapsed(isCollapsed());
    side.querySelector('.cc-collapse').addEventListener('click', () => { hideTip(); setCollapsed(!isCollapsed()); });
    side.querySelector('[data-shell-signout]').addEventListener('click', () => window.CDEVAuth && window.CDEVAuth.signOut());
    side.addEventListener('mouseover', (e) => { const n = e.target.closest('.cc-nav'); if (n) showTip(n); });
    side.addEventListener('mouseout', (e) => { if (e.target.closest('.cc-nav')) hideTip(); });
    side.addEventListener('click', (e) => { if (e.target.closest('a.cc-nav')) closeMenu(); });

    document.querySelectorAll('[data-shell-user]').forEach((el) => { el.innerHTML = `<b>${esc(email)}</b>${auth.profile && auth.profile.role ? ` / ${esc(auth.profile.role)}` : ''}`; });
    if (onControl && window.CC && window.CC.router) {
      const r = window.CC.router.parse();
      setActiveRoute(r.name);
    }
    if (allowed('control', auth)) refreshBadges();
  };

  const setActiveRoute = (route) => {
    document.querySelectorAll('#cdev-side .cc-nav[data-route]').forEach((a) => {
      const on = a.dataset.route === route;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  };

  // ---------------------------------------------------------------- Contadores (Central de Pendencias)
  let summaryCache = null;
  const refreshBadges = async () => {
    if (!lastAuth || !allowed('control', lastAuth) || !window.CDEVAuth) return null;
    try {
      const { data: s, error } = await window.CDEVAuth.getClient().rpc('cc_pending_summary');
      if (error || !s) return null;
      summaryCache = s;
      const set = (key, n, warn) => {
        const el = document.querySelector(`#cdev-side [data-count="${key}"]`);
        if (!el) return;
        n = Number(n) || 0;
        el.hidden = !n; el.textContent = n; el.classList.toggle('warn', !!warn);
        const link = el.closest('.cc-nav');
        if (link) link.dataset.label = `${link.querySelector('.cc-nav-label').textContent}${n ? ` (${n})` : ''}`;
      };
      set('pagamentos', Number(s.payments_overdue) + Number(s.payments_today));
      set('monitoramento', s.sites_offline);
      set('incidentes', s.incidents_open);
      set('dominios', Number(s.domains_expired) || Number(s.domains_30d), !Number(s.domains_expired));
      set('hospedagens', Number(s.hostings_expired) || Number(s.hostings_30d), !Number(s.hostings_expired));
      set('backups', s.backups_pending, true);
      set('leads', s.leads_followup, true);
      set('notificacoes', s.notifications_unread, true);
      set('painel', Number(s.payments_overdue) + Number(s.sites_offline) + Number(s.incidents_open));
      return s;
    } catch (e) { return null; } // tabelas do Control Center ainda nao criadas: ignora
  };

  // ---------------------------------------------------------------- Gaveta (celular)
  const closeMenu = () => document.body.classList.remove('menu-open');
  const bindChrome = () => {
    if (!document.querySelector('.cc-scrim')) {
      const scrim = document.createElement('div');
      scrim.className = 'cc-scrim';
      scrim.addEventListener('click', closeMenu);
      // dentro do .cc-shell: mesma camada da barra lateral (fica atras da gaveta, na frente do conteudo)
      (document.querySelector('.cc-shell') || document.body).appendChild(scrim);
    }
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn && !menuBtn.dataset.shellBound) {
      menuBtn.dataset.shellBound = '1';
      menuBtn.addEventListener('click', () => document.body.classList.toggle('menu-open'));
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
      if (e.key === '\\' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); hideTip(); setCollapsed(!isCollapsed()); }
    });
  };

  window.CDEVShell = { render, refreshBadges, setActiveRoute, setCollapsed, isCollapsed, closeMenu, get summary() { return summaryCache; } };

  const start = () => {
    bindChrome();
    document.addEventListener('cdev:auth', (e) => render(e.detail));
    if (window.CDEVAuth && window.CDEVAuth.lastAuth) render(window.CDEVAuth.lastAuth);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
