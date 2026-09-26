/* CDEV Control Center - bootstrap: reutiliza CDEVAuth (mesmo login, mesma permissao admin) */
(function () {
  const CC = window.CC;
  const { $, $$, esc, icon, api, debounce } = CC;

  const NAV = [
    [null, [['painel', 'Control Center', 'home'], ['notificacoes', 'Alertas', 'bell']]],
    ['Relacionamento', [['clientes', 'Clientes', 'users'], ['leads', 'Leads / CRM', 'target'], ['mensagens', 'Mensagens', 'msg']]],
    ['Site Factory', [['projetos', 'Projetos / Sites', 'layers'], ['templates', 'Templates', 'layout']]],
    ['Financeiro', [['pagamentos', 'Pagamentos', 'wallet'], ['dominios', 'Domínios', 'globe'], ['hospedagens', 'Hospedagens', 'server']]],
    ['Operação', [['monitoramento', 'Monitoramento', 'activity'], ['incidentes', 'Incidentes', 'zap'], ['backups', 'Backups', 'archive']]],
    ['Sistema', [['configuracoes', 'Configurações', 'settings']]]
  ];

  CC.loadSettings = async () => {
    const rows = await api.list('cc_settings', { select: 'key,value' });
    CC.settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  };

  const renderShell = () => {
    $('#side-nav').innerHTML = NAV.map(([group, items]) => `${group ? `<div class="cc-side-group">${esc(group)}</div>` : ''}${items.map(([route, text, ic]) =>
      `<a class="cc-nav" data-route="${route}" href="#/${route}">${icon(ic)}<span>${esc(text)}</span><span class="count" data-count="${route}" hidden></span></a>`).join('')}`).join('');
  };

  // Contadores na barra lateral e sino (derivados da Central de Pendencias)
  CC.refreshBadges = async () => {
    try {
      const s = await api.rpc('cc_pending_summary');
      const set = (route, n, warn) => { const el = $(`[data-count="${route}"]`); if (!el) return; el.hidden = !n; el.textContent = n; el.classList.toggle('warn', !!warn); };
      set('pagamentos', Number(s.payments_overdue) + Number(s.payments_today));
      set('monitoramento', Number(s.sites_offline));
      set('incidentes', Number(s.incidents_open));
      set('dominios', Number(s.domains_expired) || Number(s.domains_30d), !s.domains_expired);
      set('hospedagens', Number(s.hostings_expired) || Number(s.hostings_30d), !s.hostings_expired);
      set('backups', Number(s.backups_pending), true);
      set('leads', Number(s.leads_followup), true);
      set('notificacoes', Number(s.notifications_unread), true);
      const dot = $('#bell-dot'); dot.hidden = !Number(s.notifications_unread); dot.textContent = s.notifications_unread;
      document.title = `${Number(s.payments_overdue) + Number(s.sites_offline) ? `(${Number(s.payments_overdue) + Number(s.sites_offline)}) ` : ''}CDEV - Control Center`;
    } catch (e) { console.warn('badges', e); }
  };

  // Pesquisa global
  const KIND = { client: ['Cliente', 'user', (r) => `#/clientes/${r.id}`], project: ['Projeto', 'layers', (r) => `#/projetos/${r.id}`], domain: ['Domínio', 'globe', (r) => (r.client_id ? `#/clientes/${r.client_id}` : `#/dominios?id=${r.id}`)], hosting: ['Hospedagem', 'server', (r) => (r.client_id ? `#/clientes/${r.client_id}` : `#/hospedagens?id=${r.id}`)], lead: ['Lead', 'target', (r) => `#/leads?v=lista&f=todos&id=${r.id}`] };
  const bindSearch = () => {
    const input = $('#global-search'); const box = $('#search-results');
    let focus = -1;
    const close = () => { box.hidden = true; focus = -1; };
    const run = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) return close();
      try {
        const rows = await api.rpc('cc_search', { p_query: q });
        box.innerHTML = rows.length ? rows.map((r) => { const [k, ic, href] = KIND[r.kind]; return `<a href="${href(r)}">${icon(ic)}<span><strong class="small">${esc(r.title)}</strong><small>${k}${r.subtitle ? ' · ' + esc(r.subtitle) : ''}</small></span></a>`; }).join('')
          : `<div class="empty-state" style="padding:1.2rem"><strong>Nada encontrado para "${esc(q)}".</strong></div>`;
        box.hidden = false; focus = -1;
      } catch (e) { CC.toast(CC.errMsg(e), 'error'); }
    }, 220);
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      const links = $$('a', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focus = Math.max(0, Math.min(links.length - 1, focus + (e.key === 'ArrowDown' ? 1 : -1))); links.forEach((a, i) => a.classList.toggle('focus', i === focus)); }
      if (e.key === 'Enter' && links.length) { (links[focus] || links[0]).click(); close(); input.blur(); }
      if (e.key === 'Escape') { close(); input.blur(); }
    });
    box.addEventListener('click', (e) => { if (e.target.closest('a')) { close(); input.value = ''; } });
    document.addEventListener('click', (e) => { if (!e.target.closest('.cc-search')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } });
  };

  const init = async () => {
    // Mesmo guardiao do admin.html: sessao + role admin + admin_panel_enabled + toggle do modulo
    const ctx = await window.CDEVAuth.requireAccess({ admin: true, settingKey: 'control_center_enabled' });
    if (!ctx) return;
    CC.ctx = ctx;
    $('#cc-user').textContent = ctx.profile.email || '';
    renderShell();
    try { await CC.loadSettings(); } catch (e) {
      $('#view').innerHTML = `<div class="notice" style="margin-top:2rem"><strong>Banco do Control Center ainda não preparado.</strong><br>Rode <code>supabase/07_control_center.sql</code> e <code>supabase/08_control_center_templates.sql</code> no Supabase SQL Editor.<br><span class="small muted">${esc(CC.errMsg(e))}</span></div>`;
      return;
    }
    bindSearch();
    $$('[data-sign-out]').forEach((b) => b.addEventListener('click', window.CDEVAuth.signOut));
    $('#menu-btn').onclick = () => document.body.classList.toggle('menu-open');
    window.addEventListener('hashchange', () => { window.onbeforeunload = null; CC.router.render(); });
    await CC.router.render();
    CC.refreshBadges();
    setInterval(CC.refreshBadges, 60000);

    // Realtime: novas notificacoes e mudancas de estado dos sites
    ctx.supabase.channel('cc-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        CC.providers.get('notification').notify(payload.new);
        CC.refreshBadges();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects' }, debounce(() => {
        CC.refreshBadges();
        const r = CC.router.parse();
        if (['painel', 'monitoramento'].includes(r.name) && !document.querySelector('.cc-modal-backdrop')) CC.router.render();
      }, 1500))
      .subscribe();
    window.CDEVAuth.subscribeSettings((settings) => {
      if (!window.CDEVAuth.isEnabled(settings, 'control_center_enabled') || !window.CDEVAuth.isEnabled(settings, 'admin_panel_enabled')) location.replace('404.html?code=503');
    });
  };

  document.addEventListener('DOMContentLoaded', init);
})();
