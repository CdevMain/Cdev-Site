/* CDEV Control Center - painel, clientes, financeiro, notificacoes, configuracoes */
(function () {
  const CC = window.CC;
  const { $, $$, esc, icon, api, badge, label, money, fmtDate, fmtDateTime, relTime, daysUntil, dueLabel, dueTone, table, toolbar, bindToolbar, matchQ, SORTERS, pageHead, csv, safeUrl, todayISO, addDays } = CC;

  const btn = (attrs, content, cls = '') => `<button class="btn btn-sm ${cls}" ${attrs}>${content}</button>`;
  const linkBtn = (href, content, cls = '') => {
    const u = safeUrl(href);
    return u ? `<a class="btn btn-sm ${cls}" href="${esc(u)}" target="_blank" rel="noopener">${content}</a>` : `<span class="btn btn-sm ${cls}" aria-disabled="true">${content}</span>`;
  };
  CC.ui = { btn, linkBtn };

  const siteDot = (s) => `<span class="dot ${({ ONLINE: 'green', OFFLINE: 'red', INSTAVEL: 'yellow', MANUTENCAO: 'blue' })[s] || ''}" title="${esc(label(s))}"></span>`;
  CC.siteDot = siteDot;

  // Periodos de vencimento reutilizados em pagamentos/dominios/hospedagens
  const inWindow = (iso, from, to) => { const d = daysUntil(iso); return d !== null && d >= from && d <= to; };

  // ================================================================== PAINEL (Control Center)
  CC.routes.painel = async (root) => {
    const [s, notifs, activity, sites, openRecurring] = await Promise.all([
      api.rpc('cc_pending_summary'),
      api.list('notifications', { filters: [['is', 'resolved_at', null]], order: 'created_at', asc: false, limit: 8 }),
      api.list('activity_log', { select: 'id,event,message,created_at,client_id,project_id', order: 'created_at', asc: false, limit: 12 }),
      api.list('projects', { select: 'id,name,site_url,monitor_status,last_response_ms,last_check_at,client_id', filters: [['eq', 'monitoring_enabled', true]], order: 'name' }),
      api.list('payments', { select: 'amount,recurrence,client_id', filters: [['in', 'status', ['PENDENTE', 'ATRASADO']], ['neq', 'recurrence', 'NENHUMA']] })
    ]);
    await CC.loadLookups(['clients']);
    const win = CC.setting('upcoming_window_days', 7);
    const P = [
      ['red', s.payments_overdue, 'pagamentos atrasados', money(s.payments_overdue_amount), '#/pagamentos?f=atrasados'],
      ['red', s.payments_today, 'pagamentos vencem hoje', '', '#/pagamentos?f=hoje'],
      ['red', s.sites_offline, 'sites offline', '', '#/monitoramento?f=offline'],
      ['red', s.incidents_open, 'incidentes abertos', '', '#/incidentes?f=abertos'],
      ['red', s.domains_expired, 'domínios vencidos', '', '#/dominios?f=vencidos'],
      ['red', s.hostings_expired, 'hospedagens vencidas', '', '#/hospedagens?f=vencidas'],
      ['orange', s.payments_window, `pagamentos vencem em ${win} dias`, '', `#/pagamentos?f=${win}d`],
      ['orange', s.ssl_expiring, 'certificados SSL vencendo', '30 dias', '#/monitoramento?f=ssl'],
      ['yellow', s.domains_30d, 'domínios vencem em 30 dias', '', '#/dominios?f=vencendo'],
      ['yellow', s.hostings_30d, 'hospedagens vencem em 30 dias', '', '#/hospedagens?f=vencendo'],
      ['yellow', s.sites_unstable, 'sites com problemas', 'lento / SSL', '#/monitoramento?f=problemas'],
      ['yellow', s.projects_awaiting, 'projetos aguardando publicação', '', '#/projetos?f=aguardando'],
      ['yellow', s.backups_pending, 'backups pendentes', `> ${CC.setting('backup_max_age_days', 7)} dias`, '#/backups?f=pendentes'],
      ['yellow', s.leads_followup, 'leads para follow-up', '', '#/leads?f=followup']
    ];
    const active = P.filter((p) => Number(p[1]) > 0);
    const monthly = { MENSAL: 1, TRIMESTRAL: 1 / 3, SEMESTRAL: 1 / 6, ANUAL: 1 / 12 };
    const mrr = openRecurring.reduce((a, p) => a + Number(p.amount) * (monthly[p.recurrence] || 0), 0);
    const clientName = (id) => CC.lookups.clients.find((c) => c.id === id)?.name || '';
    const offline = sites.filter((x) => x.monitor_status === 'OFFLINE').length;

    const upcomingRow = (u) => {
      const d = daysUntil(u.due_date);
      const route = u.kind === 'payment' ? `#/pagamentos?id=${u.id}` : u.kind === 'domain' ? `#/dominios?id=${u.id}` : `#/hospedagens?id=${u.id}`;
      return `<a class="list-item" href="${u.client_id ? `#/clientes/${u.client_id}` : route}">
        <span class="date-pill ${d < 0 ? 'red' : d <= 1 ? 'red' : d <= 7 ? 'orange' : ''}">${fmtDate(u.due_date, { short: true })}</span>
        <div class="grow"><div class="t">${esc(u.client_name || 'CDEV')}</div><div class="s">${esc(label(u.label))} · ${esc(u.description || '')} · ${esc(dueLabel(d))}</div></div>
        <span class="mono small">${money(u.amount)}</span>
      </a>`;
    };

    root.innerHTML = `
      ${pageHead('CDEV Control Center', 'O que precisa de atenção', `Hoje é ${fmtDate(s.today)}. O sistema lembra por você.`,
        `<button class="btn" data-run-checks>${icon('refresh')}Verificar agora</button><button class="btn btn-primary" data-new-client>${icon('plus')}Cliente</button><button class="btn btn-primary" data-new-site>${icon('rocket')}Novo site</button>`)}
      <section class="panel panel-pad">
        <div class="row" style="margin-bottom:.9rem"><span class="kicker">Central de pendências</span><span class="spacer"></span><span class="muted tiny mono">${s.notifications_unread} alertas não lidos</span></div>
        ${active.length ? `<div class="pending-grid">${active.map(([tone, n, text, sub, href]) => `<a class="pending ${tone}" href="${href}"><strong>${n}</strong><span>${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></a>`).join('')}</div>`
          : `<div class="all-clear">${icon('check')}<span>Tudo em dia. Nenhum pagamento atrasado, site offline ou vencimento próximo.</span></div>`}
      </section>

      <div class="grid-3" style="margin-top:1rem">
        <div class="metric"><strong>${CC.lookups.clients.filter((c) => c.status === 'ATIVO').length}</strong><span>Clientes ativos</span></div>
        <div class="metric"><strong>${sites.length - offline}/${sites.length}</strong><span>Sites online (monitorados)</span></div>
        <div class="metric"><strong>${money(mrr)}</strong><span>Receita recorrente / mês</span></div>
      </div>

      <div class="grid-2" style="margin-top:1rem">
        <section class="panel">
          <div class="panel-head"><h2 class="block-title">Próximas ações</h2><a class="btn btn-sm" href="#/pagamentos?f=30d">Ver financeiro</a></div>
          <div class="list">${(s.upcoming || []).length ? s.upcoming.slice(0, 10).map(upcomingRow).join('') : `<div class="empty-state"><strong>Nenhum vencimento nos próximos 30 dias.</strong></div>`}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2 class="block-title">Alertas</h2><a class="btn btn-sm" href="#/notificacoes">Todos</a></div>
          <div class="list">${notifs.length ? notifs.map(CC.notifItem).join('') : `<div class="empty-state"><strong>Sem alertas abertos.</strong></div>`}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2 class="block-title">Sites monitorados</h2><a class="btn btn-sm" href="#/monitoramento">Monitoramento</a></div>
          <div class="list">${sites.length ? sites.slice().sort((a, b) => (a.monitor_status === 'OFFLINE' ? -1 : 0) - (b.monitor_status === 'OFFLINE' ? -1 : 0)).slice(0, 10).map((x) => `
            <a class="list-item" href="#/monitoramento?id=${x.id}">${siteDot(x.monitor_status)}<div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${esc(clientName(x.client_id))} · ${esc(x.site_url || '')}</div></div>
            <span class="mono tiny muted">${x.last_response_ms ? x.last_response_ms + 'ms' : ''} ${x.last_check_at ? '· ' + relTime(x.last_check_at) : ''}</span></a>`).join('')
            : `<div class="empty-state"><strong>Nenhum site com monitoramento ativo.</strong><p>Ative em Projetos → Monitoramento.</p></div>`}</div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2 class="block-title">Atividade recente</h2></div>
          <div class="panel-body timeline">${activity.map(CC.timelineItem).join('') || '<span class="muted small">Sem atividade ainda.</span>'}</div>
        </section>
      </div>`;

    $('[data-new-client]', root).onclick = () => CC.actions.editClient();
    $('[data-new-site]', root).onclick = () => CC.actions.newProject();
    $('[data-run-checks]', root).onclick = async (e) => {
      await CC.busy(e.currentTarget, async () => {
        const r = await api.rpc('cc_run_due_checks');
        CC.toast(`${r.notifications_created} novos alertas.`);
      });
      CC.router.render(); CC.refreshBadges();
    };
  };

  const EVENT_ICON = {
    client_created: ['user', 'blue'], project_created: ['layers', 'blue'], demo_created: ['eye', 'yellow'], site_published: ['rocket', 'green'],
    domain_added: ['globe', 'blue'], domain_renewed: ['globe', 'green'], hosting_added: ['server', 'blue'], hosting_renewed: ['server', 'green'],
    payment_registered: ['money', 'green'], payment_cancelled: ['money', 'gray'], site_offline: ['alert', 'red'], site_recovered: ['check', 'green'],
    backup_done: ['archive', 'green'], backup_failed: ['archive', 'red'], template_changed: ['layout', 'blue'], project_status: ['layers', 'gray'], project_linked: ['layers', 'blue']
  };
  CC.timelineItem = (a) => {
    const [ic, tone] = EVENT_ICON[a.event] || ['history', 'gray'];
    return `<div class="tl"><time>${fmtDateTime(a.created_at)}</time><span class="badge ${tone}" style="border:0;padding:0">${icon(ic)}</span><span>${esc(a.message)}</span></div>`;
  };
  CC.notifItem = (n) => `
    <a class="list-item" href="${esc(n.link || '#/notificacoes')}" data-notif="${n.id}">
      <span class="dot ${CC.SEV[n.severity] || ''}"></span>
      <div class="grow"><div class="t">${esc(n.title)}</div><div class="s pre">${esc((n.body || '').split('\n').slice(0, 2).join(' · '))}</div></div>
      <span class="mono tiny muted">${relTime(n.created_at)}</span>
    </a>`;

  // ================================================================== CLIENTES
  const clientSorts = [
    ['name', 'Nome'], ['next_due', 'Próximo vencimento'], ['amount_desc', 'Maior valor em aberto'], ['amount_asc', 'Menor valor em aberto'],
    ['oldest', 'Mais antigo'], ['newest', 'Mais recente'], ['activity', 'Última atividade'], ['status', 'Status']
  ];
  const clientSorter = {
    name: SORTERS.name(), next_due: SORTERS.date('next_due_date'), amount_desc: SORTERS.num('open_amount', -1), amount_asc: SORTERS.num('open_amount', 1),
    oldest: SORTERS.date('created_at'), newest: SORTERS.date('created_at', -1), activity: SORTERS.date('last_activity_at', -1), status: SORTERS.str('status')
  };
  const hasPending = (c) => Number(c.overdue_count) > 0 || Number(c.problem_sites) > 0 || Number(c.open_incidents) > 0;

  CC.routes.clientes = async (root, r) => {
    if (r.id) return renderClient(root, r.id);
    const rows = await api.list('client_overview', { order: 'name' });
    const st = { filter: r.query.f || 'todos', sort: 'name', q: '' };
    const filters = [['todos', 'Todos'], ['ativos', 'Ativos'], ['inativos', 'Inativos'], ['pendencias', 'Com pendências']];
    const pred = { todos: () => true, ativos: (c) => c.status === 'ATIVO', inativos: (c) => c.status === 'INATIVO', pendencias: hasPending };
    const counts = Object.fromEntries(filters.map(([k]) => [k, rows.filter(pred[k]).length]));

    const draw = (keepFocus) => {
      const list = rows.filter(pred[st.filter] || pred.todos).filter((c) => matchQ(c, st.q, ['name', 'company', 'email', 'phone', 'whatsapp', 'city'])).sort(clientSorter[st.sort]);
      const html = table([
        { label: 'Cliente', render: (c) => `<strong>${esc(c.name)}</strong><span class="sub">${esc(c.company || c.city || '')}</span>` },
        { label: 'Contato', render: (c) => `<span class="mono tiny">${esc(c.whatsapp || c.phone || '')}</span><span class="sub">${esc(c.email || '')}</span>` },
        { label: 'Projetos', cls: 'num', render: (c) => c.projects_count },
        { label: 'Próx. vencimento', render: (c) => c.next_due_date ? `${fmtDate(c.next_due_date)}<span class="sub">${esc(dueLabel(daysUntil(c.next_due_date)))}</span>` : '—' },
        { label: 'Em aberto', cls: 'num', render: (c) => money(c.open_amount) },
        { label: 'Atenção', render: (c) => [c.overdue_count > 0 && badge('ATRASADO', `${c.overdue_count} atrasado`), c.problem_sites > 0 && badge('OFFLINE', `${c.problem_sites} site`), c.open_incidents > 0 && badge('ABERTO', 'incidente')].filter(Boolean).join(' ') || badge(c.status) }
      ], list, { rowAttr: (c) => `class="clickable" data-go="#/clientes/${c.id}"`, empty: 'Nenhum cliente encontrado.' });
      $('#list', root).innerHTML = html;
      if (!keepFocus) { $('#tb', root).innerHTML = toolbar({ filters, sorts: clientSorts, state: st, counts }); bindToolbar($('#tb', root), st, draw); }
      $$('[data-go]', root).forEach((tr) => tr.addEventListener('click', () => CC.router.go(tr.dataset.go)));
      st.visible = list;
    };
    root.innerHTML = `${pageHead('Clientes', 'Clientes', 'Tudo sobre cada cliente em um só lugar.',
      `<button class="btn" data-import>${icon('upload')}Importar CSV</button><button class="btn" data-export>${icon('download')}Exportar CSV</button><button class="btn btn-primary" data-new>${icon('plus')}Novo cliente</button>`)}
      <section class="panel panel-pad"><div id="tb"></div><div id="list"></div></section>`;
    draw();
    $('[data-new]', root).onclick = () => CC.actions.editClient();
    $('[data-export]', root).onclick = () => csv.download(`clientes-${todayISO()}.csv`, csv.stringify(st.visible, [
      { key: 'name', label: 'Nome' }, { key: 'company', label: 'Empresa' }, { key: 'document', label: 'CPF/CNPJ' }, { key: 'phone', label: 'Telefone' },
      { key: 'whatsapp', label: 'WhatsApp' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Endereço' }, { key: 'city', label: 'Cidade' },
      { key: 'status', label: 'Status' }, { key: 'open_amount', label: 'Em aberto' }, { key: 'notes', label: 'Observações' }, { key: 'created_at', label: 'Cadastro' }]));
    $('[data-import]', root).onclick = () => CC.importClientsCsv();
  };

  // ------------------------------------------------------------------ Pagina do cliente
  async function renderClient(root, id) {
    const client = await api.get('clients', id);
    if (!client) { root.innerHTML = `<div class="notice">Cliente não encontrado.</div>`; return; }
    const [projects, domains, payments, incidents, backups, activity] = await Promise.all([
      api.list('projects', { filters: [['eq', 'client_id', id]], order: 'name' }),
      api.list('domains', { filters: [['eq', 'client_id', id]], order: 'expires_at' }),
      api.list('payments_view', { filters: [['eq', 'client_id', id]], order: 'due_date', asc: false, limit: 100 }),
      api.list('incidents_view', { filters: [['eq', 'client_id', id]], order: 'started_at', asc: false, limit: 10 }),
      api.list('backups', { filters: [['eq', 'client_id', id]], order: 'performed_at', asc: false, limit: 10 }),
      api.list('activity_log', { filters: [['eq', 'client_id', id]], order: 'created_at', asc: false, limit: 40 })
    ]);
    const hostingIds = [...new Set(projects.map((p) => p.hosting_id).filter(Boolean))];
    const hostings = await api.list('hostings', { filters: [['or', `client_id.eq.${id}${hostingIds.length ? `,id.in.(${hostingIds.join(',')})` : ''}`]] });
    const uptime = await api.rpc('cc_uptime_summary');
    const up = Object.fromEntries((uptime || []).map((u) => [u.project_id, u]));
    await CC.loadLookups(['templates']);

    const open = payments.filter((p) => ['PENDENTE', 'ATRASADO'].includes(p.status)).sort(SORTERS.date('due_date'));
    const next = open[0];
    const mainProject = projects.find((p) => p.status === 'PUBLICADO') || projects[0];
    const mainDomain = domains.find((d) => d.is_primary) || domains[0];
    const mainHosting = hostings[0];
    const siteUrl = mainProject?.site_url || (mainDomain ? `https://${mainDomain.domain}` : '');
    const wa = CC.waLink(client.whatsapp || client.phone);
    const openPayFor = (field, recId) => open.find((p) => p[field] === recId);

    root.innerHTML = `
      ${pageHead('Cliente', client.name, `${esc(client.company || '')}${client.city ? ' · ' + esc(client.city) : ''} · ${badge(client.status)}`,
        `<button class="btn" data-edit>${icon('edit')}Editar cliente</button><button class="btn btn-primary" data-pay-any>${icon('money')}Registrar pagamento</button>`)}
      <div class="row" style="margin-bottom:1rem">
        ${linkBtn(siteUrl, `${icon('external')}Abrir site`)}
        ${mainDomain ? btn(`data-open-domain="${mainDomain.id}"`, `${icon('globe')}Abrir domínio`) : `<span class="btn btn-sm" aria-disabled="true">${icon('globe')}Abrir domínio</span>`}
        ${mainHosting ? btn(`data-open-hosting="${mainHosting.id}"`, `${icon('server')}Abrir hospedagem`) : `<span class="btn btn-sm" aria-disabled="true">${icon('server')}Abrir hospedagem</span>`}
        ${wa ? `<a class="btn btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">${icon('msg')}WhatsApp</a>` : ''}
        ${mainProject ? `<a class="btn btn-sm" href="#/projetos/${mainProject.id}">${icon('edit')}Editar projeto</a>` : ''}
        <a class="btn btn-sm" href="#/incidentes?client=${id}">${icon('alert')}Ver incidentes</a>
        <a class="btn btn-sm" href="#/backups?client=${id}">${icon('archive')}Ver backups</a>
        <a class="btn btn-sm" href="#hist">${icon('history')}Ver histórico</a>
      </div>

      <div class="grid-2">
        <div class="info-card"><h3>Contato</h3><dl class="kv">
          <dt>Telefone</dt><dd>${esc(client.phone || '—')}</dd>
          <dt>WhatsApp</dt><dd>${esc(client.whatsapp || '—')}</dd>
          <dt>E-mail</dt><dd>${client.email ? `<a href="mailto:${esc(client.email)}">${esc(client.email)}</a>` : '—'}</dd>
          <dt>CPF/CNPJ</dt><dd class="mono">${esc(client.document || '—')}</dd>
          <dt>Endereço</dt><dd>${esc(client.address || '—')}</dd>
          <dt>Cliente desde</dt><dd>${fmtDate(client.created_at)}</dd>
          ${client.notes ? `<dt>Observações</dt><dd class="pre small">${esc(client.notes)}</dd>` : ''}
        </dl></div>

        <div class="info-card"><h3>Financeiro <button class="btn btn-sm" data-new-payment>${icon('plus')}Cobrança</button></h3>
          ${next ? `<div class="kv"><dt>Próximo</dt><dd><strong>${fmtDate(next.due_date)} — ${money(next.amount)}</strong> ${badge(next.computed_state)}<br><span class="small muted">${esc(next.description || label(next.type))}</span></dd>
            <dt>Em aberto</dt><dd class="mono">${money(open.reduce((a, p) => a + Number(p.amount), 0))} (${open.length})</dd></div>
            <div class="row" style="margin-top:.7rem">${btn(`data-pay="${next.id}"`, `${icon('check')}Registrar pagamento`, 'btn-primary')}</div>`
          : '<p class="small muted">Nenhuma cobrança em aberto.</p>'}
        </div>

        <div class="info-card"><h3>Projetos / sites <button class="btn btn-sm" data-new-project>${icon('plus')}Site</button></h3>
          ${projects.map((p) => `<div class="sub-item"><div class="row"><a href="#/projetos/${p.id}"><strong>${esc(p.name)}</strong></a>${badge(p.status)}<span class="spacer"></span>${siteDot(p.monitor_status)}<span class="mono tiny muted">${p.monitoring_enabled ? label(p.monitor_status) : 'sem monitoramento'}</span></div>
            <div class="small muted" style="margin-top:.3rem">${esc(p.site_url || CC.demoUrl(p.slug))} · Template ${esc(CC.nameOf('templates', p.template_id) || '—')}</div></div>`).join('') || '<p class="small muted">Nenhum projeto.</p>'}
        </div>

        <div class="info-card"><h3>Monitoramento</h3>
          ${projects.filter((p) => p.monitoring_enabled).map((p) => `<div class="sub-item"><div class="row">${siteDot(p.monitor_status)}<strong class="small">${esc(p.name)}</strong> ${badge(p.monitor_status)}<span class="spacer"></span><span class="mono tiny">${p.last_response_ms ? p.last_response_ms + 'ms' : ''}</span></div>
            <div class="tiny muted mono" style="margin-top:.3rem">Uptime 30d: ${up[p.id]?.up_30d ?? '—'}% · SSL: ${p.ssl_expires_at ? `expira em ${daysUntil(p.ssl_expires_at.slice(0, 10))} dias` : '—'} · ${relTime(p.last_check_at)}</div></div>`).join('') || '<p class="small muted">Nenhum site monitorado.</p>'}
        </div>

        <div class="info-card"><h3>Domínios <button class="btn btn-sm" data-new-domain>${icon('plus')}Domínio</button></h3>
          ${domains.map((d) => { const dd = daysUntil(d.expires_at); return `<div class="sub-item"><div class="row"><strong>${esc(d.domain)}</strong>${badge(d.status)}<span class="spacer"></span><span class="badge ${dueTone(dd)}">${d.expires_at ? fmtDate(d.expires_at) : 'sem vencimento'}</span></div>
            <div class="small muted" style="margin:.3rem 0">${esc(d.registrar || '—')} · ${money(d.amount)}/ano${d.auto_renew ? ' · renovação automática' : ''}</div>
            <div class="row">${linkBtn(`https://${d.domain}`, `${icon('external')}Site`)}${btn(`data-open-domain="${d.id}"`, `${icon('globe')}Painel`)}${btn(`data-pay-domain="${d.id}"`, `${icon('money')}Registrar pagamento`)}${btn(`data-edit-domain="${d.id}"`, icon('edit'))}</div></div>`; }).join('') || '<p class="small muted">Nenhum domínio.</p>'}
        </div>

        <div class="info-card"><h3>Hospedagem <button class="btn btn-sm" data-new-hosting>${icon('plus')}Hospedagem</button></h3>
          ${hostings.map((h) => { const dd = daysUntil(h.expires_at); return `<div class="sub-item"><div class="row"><strong>${esc(h.name)}</strong>${badge(h.status)}<span class="spacer"></span><span class="badge ${dueTone(dd)}">${h.expires_at ? fmtDate(h.expires_at) : 'sem vencimento'}</span></div>
            <div class="small muted" style="margin:.3rem 0">${esc(h.provider || '—')} · ${label(h.type)} · ${money(h.amount)} ${label(h.billing_cycle).toLowerCase()}${h.client_id ? '' : ' · infraestrutura CDEV'}</div>
            <div class="row">${btn(`data-open-hosting="${h.id}"`, `${icon('server')}Abrir painel`)}${h.client_id === id ? btn(`data-pay-hosting="${h.id}"`, `${icon('money')}Registrar pagamento`) : ''}${btn(`data-edit-hosting="${h.id}"`, icon('edit'))}</div></div>`; }).join('') || '<p class="small muted">Nenhuma hospedagem vinculada.</p>'}
        </div>
      </div>

      <section class="panel" style="margin-top:1rem">
        <div class="panel-head"><h2 class="block-title">Cobranças</h2></div>
        ${CC.paymentsTable(payments, { compact: true })}
      </section>

      <div class="grid-2" style="margin-top:1rem">
        <section class="panel"><div class="panel-head"><h2 class="block-title">Incidentes</h2><a class="btn btn-sm" href="#/incidentes?client=${id}">Todos</a></div>
          <div class="list">${incidents.map((i) => `<div class="list-item"><span class="dot ${i.status === 'ABERTO' ? 'red' : 'green'}"></span><div class="grow"><div class="t">#${i.id} ${esc(i.project_name)}</div><div class="s">${fmtDateTime(i.started_at)} · ${CC.duration(i.duration_seconds)} · ${esc(i.error || '')}</div></div>${badge(i.status)}</div>`).join('') || '<div class="empty-state"><strong>Sem incidentes.</strong></div>'}</div></section>
        <section class="panel"><div class="panel-head"><h2 class="block-title">Backups</h2>${mainProject ? `<button class="btn btn-sm" data-new-backup>${icon('plus')}Registrar</button>` : ''}</div>
          <div class="list">${backups.map((b) => `<div class="list-item"><span class="dot ${b.status === 'OK' ? 'green' : 'red'}"></span><div class="grow"><div class="t">${fmtDateTime(b.performed_at)}</div><div class="s">${esc(b.location || '')}</div></div>${badge(b.status)}</div>`).join('') || '<div class="empty-state"><strong>Nenhum backup registrado.</strong></div>'}</div></section>
      </div>

      <section class="panel" style="margin-top:1rem" id="hist"><div class="panel-head"><h2 class="block-title">Histórico</h2></div>
        <div class="panel-body timeline">${activity.map(CC.timelineItem).join('') || '<span class="muted small">Sem eventos.</span>'}</div></section>`;

    const byId = (list, v) => list.find((x) => x.id === v);
    $('[data-edit]', root).onclick = () => CC.actions.editClient(client);
    $('[data-new-payment]', root).onclick = () => CC.actions.editPayment({}, { client_id: id, project_id: mainProject?.id });
    $('[data-pay-any]', root).onclick = () => (next ? CC.actions.payPayment(next) : CC.actions.editPayment({}, { client_id: id, status: 'PAGO', paid_at: todayISO() }));
    $('[data-new-project]', root).onclick = () => CC.actions.newProject({ client_id: id, name: client.company || client.name, whatsapp: client.whatsapp, city: client.city });
    $('[data-new-domain]', root).onclick = () => CC.actions.editDomain({ client_id: id, project_id: mainProject?.id, is_primary: true });
    $('[data-new-hosting]', root).onclick = () => CC.actions.editHosting({ client_id: id });
    const nb = $('[data-new-backup]', root); if (nb) nb.onclick = () => CC.actions.editBackup({}, { project_id: mainProject.id });
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.openDomain) CC.actions.openDomainPanel(byId(domains, d.openDomain));
      if (d.openHosting) CC.actions.openHostingPanel(byId(hostings, d.openHosting));
      if (d.editDomain) CC.actions.editDomain(byId(domains, d.editDomain));
      if (d.editHosting) CC.actions.editHosting(byId(hostings, d.editHosting));
      if (d.payDomain) { const dm = byId(domains, d.payDomain); const p = openPayFor('domain_id', dm.id); p ? CC.actions.payPayment(p) : CC.actions.editPayment({}, { client_id: id, domain_id: dm.id, project_id: dm.project_id, type: 'DOMINIO', description: `Domínio ${dm.domain}`, amount: dm.amount, due_date: dm.expires_at || todayISO(), recurrence: 'ANUAL', status: 'PAGO', paid_at: todayISO() }); }
      if (d.payHosting) { const h = byId(hostings, d.payHosting); const p = openPayFor('hosting_id', h.id); p ? CC.actions.payPayment(p) : CC.actions.editPayment({}, { client_id: id, hosting_id: h.id, type: 'HOSPEDAGEM', description: `Hospedagem ${h.name}`, amount: h.amount, due_date: h.expires_at || todayISO(), recurrence: h.billing_cycle, status: 'PAGO', paid_at: todayISO() }); }
    });
    CC.bindPaymentActions(root, payments);
  }

  // ================================================================== PAGAMENTOS
  CC.paymentsTable = (rows, { compact = false, highlight = null } = {}) => table([
    { label: 'Vencimento', render: (p) => `<strong class="mono">${fmtDate(p.due_date)}</strong><span class="sub">${['PAGO', 'CANCELADO'].includes(p.status) ? (p.paid_at ? 'pago em ' + fmtDate(p.paid_at) : '') : esc(dueLabel(p.days_to_due))}</span>` },
    ...(compact ? [] : [{ label: 'Cliente', render: (p) => p.client_id ? `<a href="#/clientes/${p.client_id}">${esc(p.client_name || '')}</a>` : '<span class="muted">—</span>' }]),
    { label: 'Tipo', render: (p) => `${esc(label(p.type))}<span class="sub">${esc(p.description || p.domain_name || p.hosting_name || '')}</span>` },
    { label: 'Recorrência', render: (p) => `<span class="small">${esc(label(p.recurrence))}</span>` },
    { label: 'Valor', cls: 'num', render: (p) => money(p.amount) },
    { label: 'Status', render: (p) => badge(p.computed_state || p.status) },
    { label: '', render: (p) => `<div class="actions">${['PENDENTE', 'ATRASADO'].includes(p.status) ? `<button class="btn btn-sm btn-primary" data-pay="${p.id}">${icon('check')}Pagar</button><button class="icon-btn" title="Cobrar no WhatsApp" data-charge="${p.id}">${icon('msg')}</button>` : ''}<button class="icon-btn" title="Editar" data-edit-pay="${p.id}">${icon('edit')}</button>${p.status !== 'CANCELADO' && p.status !== 'PAGO' ? `<button class="icon-btn danger" title="Cancelar" data-cancel-pay="${p.id}">${icon('x')}</button>` : ''}</div>` }
  ], rows, { empty: 'Nenhuma cobrança.', rowAttr: (p) => (p.id === highlight ? 'class="hl"' : '') });

  CC.bindPaymentActions = (root, rows) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const find = (id) => rows.find((p) => p.id === id);
      if (b.dataset.pay) CC.actions.payPayment(find(b.dataset.pay));
      if (b.dataset.editPay) CC.actions.editPayment(find(b.dataset.editPay));
      if (b.dataset.cancelPay) CC.actions.cancelPayment(find(b.dataset.cancelPay));
      if (b.dataset.charge) {
        const p = find(b.dataset.charge);
        const c = p.client_id ? await api.get('clients', p.client_id) : null;
        const text = `Olá${c?.name ? ', ' + c.name.split(' ')[0] : ''}! Passando para lembrar da cobrança "${p.description || label(p.type)}" no valor de ${money(p.amount)} com vencimento em ${fmtDate(p.due_date)}. Qualquer dúvida estou à disposição.`;
        try { await CC.providers.get('message').send({ to: c?.whatsapp || c?.phone, text }); } catch (err) { CC.toast(err.message, 'error'); }
      }
    });
  };

  CC.routes.pagamentos = async (root, r) => {
    const rows = await api.list('payments_view', { order: 'due_date', limit: 5000 });
    const win = CC.setting('upcoming_window_days', 7);
    const st = { filter: r.query.f || (r.query.id ? 'todos' : 'abertos'), sort: 'due', q: '', type: '' };
    const isOpen = (p) => ['PENDENTE', 'ATRASADO'].includes(p.status);
    const filters = [['abertos', 'Em aberto'], ['todos', 'Todos'], ['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['3d', '3 dias'], [`${win}d`, `${win} dias`], ['30d', '30 dias'], ['atrasados', 'Atrasados'], ['pendentes', 'Pendentes'], ['pagos', 'Pagos'], ['cancelados', 'Cancelados']];
    const pred = {
      todos: () => true, abertos: isOpen,
      hoje: (p) => isOpen(p) && p.days_to_due === 0, amanha: (p) => isOpen(p) && p.days_to_due === 1,
      '3d': (p) => isOpen(p) && p.days_to_due >= 0 && p.days_to_due <= 3, '7d': (p) => isOpen(p) && p.days_to_due >= 0 && p.days_to_due <= 7,
      [`${win}d`]: (p) => isOpen(p) && p.days_to_due >= 0 && p.days_to_due <= win,
      '30d': (p) => isOpen(p) && p.days_to_due >= 0 && p.days_to_due <= 30,
      atrasados: (p) => isOpen(p) && p.days_to_due < 0, pendentes: (p) => isOpen(p) && p.days_to_due >= 0,
      pagos: (p) => p.status === 'PAGO', cancelados: (p) => p.status === 'CANCELADO'
    };
    const counts = Object.fromEntries(filters.map(([k]) => [k, rows.filter(pred[k] || pred.todos).length]));
    const sorts = [['due', 'Próximo vencimento'], ['due_desc', 'Vencimento mais distante'], ['amount_desc', 'Maior valor'], ['amount_asc', 'Menor valor'], ['newest', 'Mais recente'], ['oldest', 'Mais antigo'], ['client', 'Cliente'], ['status', 'Status']];
    const sorter = { due: SORTERS.date('due_date'), due_desc: SORTERS.date('due_date', -1), amount_desc: SORTERS.num('amount', -1), amount_asc: SORTERS.num('amount'), newest: SORTERS.date('created_at', -1), oldest: SORTERS.date('created_at'), client: SORTERS.name('client_name'), status: SORTERS.str('computed_state') };

    const draw = (keepFocus) => {
      let list = rows.filter(pred[st.filter] || pred.todos).filter((p) => !st.type || p.type === st.type)
        .filter((p) => matchQ(p, st.q, ['client_name', 'description', 'domain_name', 'hosting_name', 'project_name']));
      if (r.query.id && st.filter === 'todos' && !st.q) list = list.sort((a, b) => (a.id === r.query.id ? -1 : b.id === r.query.id ? 1 : 0));
      else list = list.sort(sorter[st.sort]);
      const total = list.reduce((a, p) => a + Number(p.amount), 0);
      $('#sum', root).innerHTML = `<span class="mono small">${list.length} cobranças · ${money(total)}</span>`;
      $('#list', root).innerHTML = CC.paymentsTable(list, { highlight: r.query.id });
      if (!keepFocus) {
        $('#tb', root).innerHTML = toolbar({ filters, sorts, state: st, counts, extra: `<select class="cc-select" data-type><option value="">Todos os tipos</option>${CC.optionHtml(['DOMINIO', 'HOSPEDAGEM', 'MANUTENCAO', 'DESENVOLVIMENTO', 'OUTROS'], st.type)}</select>` });
        bindToolbar($('#tb', root), st, draw);
        $('[data-type]', root).onchange = (e) => { st.type = e.target.value; draw(); };
      }
      st.visible = list;
    };
    root.innerHTML = `${pageHead('Financeiro', 'Pagamentos', 'Cobranças únicas e recorrentes. Marcar como pago gera automaticamente a próxima.',
      `<button class="btn" data-export>${icon('download')}Exportar CSV</button><button class="btn btn-primary" data-new>${icon('plus')}Nova cobrança</button>`)}
      <section class="panel panel-pad"><div id="tb"></div><div id="sum" style="margin-bottom:.6rem"></div><div id="list"></div></section>`;
    draw();
    CC.bindPaymentActions(root, rows);
    $('[data-new]', root).onclick = () => CC.actions.editPayment();
    $('[data-export]', root).onclick = () => csv.download(`pagamentos-${todayISO()}.csv`, csv.stringify(st.visible, [
      { key: 'client_name', label: 'Cliente' }, { key: 'project_name', label: 'Projeto' }, { key: 'type', label: 'Tipo' }, { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor' }, { key: 'due_date', label: 'Vencimento' }, { key: 'paid_at', label: 'Pagamento' }, { key: 'status', label: 'Status' },
      { key: 'computed_state', label: 'Situação' }, { key: 'recurrence', label: 'Recorrência' }, { key: 'method', label: 'Forma' }, { key: 'notes', label: 'Observação' }]));
  };

  // ================================================================== DOMINIOS / HOSPEDAGENS
  const expiryList = ({ kind, root, r }) => async () => {
    const isDomain = kind === 'domains';
    const [rows, openPays] = await Promise.all([
      api.list(kind, { order: 'expires_at', limit: 3000 }),
      api.list('payments', { select: 'id,domain_id,hosting_id,amount,due_date,status,description,type,recurrence', filters: [['in', 'status', ['PENDENTE', 'ATRASADO']]] })
    ]);
    await CC.loadLookups(['clients', 'projects']);
    const activeStatus = isDomain ? 'ATIVO' : 'ATIVA';
    const st = { filter: r.query.f || 'todos', sort: 'expiry', q: '' };
    const filters = [['todos', 'Todos'], [isDomain ? 'ativos' : 'ativas', isDomain ? 'Ativos' : 'Ativas'], ['vencendo', 'Próximos do vencimento'], [isDomain ? 'vencidos' : 'vencidas', isDomain ? 'Vencidos' : 'Vencidas']];
    const pred = {
      todos: () => true, ativos: (x) => x.status === activeStatus, ativas: (x) => x.status === activeStatus,
      vencendo: (x) => x.status === activeStatus && inWindow(x.expires_at, 0, 30),
      vencidos: (x) => x.expires_at && daysUntil(x.expires_at) < 0 && x.status !== 'CANCELADO' && x.status !== 'CANCELADA', vencidas: (x) => x.expires_at && daysUntil(x.expires_at) < 0 && x.status !== 'CANCELADA'
    };
    const counts = Object.fromEntries(filters.map(([k]) => [k, rows.filter(pred[k]).length]));
    const sorts = [['expiry', 'Próximo vencimento'], ['name', 'Nome'], ['amount_desc', 'Maior valor'], ['amount_asc', 'Menor valor'], ['newest', 'Mais recente'], ['oldest', 'Mais antigo'], ['status', 'Status']];
    const nameKey = isDomain ? 'domain' : 'name';
    const sorter = { expiry: SORTERS.date('expires_at'), name: SORTERS.name(nameKey), amount_desc: SORTERS.num('amount', -1), amount_asc: SORTERS.num('amount'), newest: SORTERS.date('created_at', -1), oldest: SORTERS.date('created_at'), status: SORTERS.str('status') };
    const client = (id) => CC.lookups.clients.find((c) => c.id === id);
    const field = isDomain ? 'domain_id' : 'hosting_id';

    const draw = (keepFocus) => {
      const list = rows.filter(pred[st.filter] || pred.todos).filter((x) => matchQ(x, st.q, [nameKey, 'registrar', 'provider', 'host', (x2) => client(x2.client_id)?.name])).sort(sorter[st.sort]);
      $('#list', root).innerHTML = table([
        { label: isDomain ? 'Domínio' : 'Hospedagem', render: (x) => `<strong>${esc(x[nameKey])}</strong><span class="sub">${esc(isDomain ? (x.registrar || '') : `${x.provider || ''} · ${label(x.type)}${x.host ? ' · ' + x.host : ''}`)}</span>` },
        { label: 'Cliente', render: (x) => x.client_id ? `<a href="#/clientes/${x.client_id}">${esc(client(x.client_id)?.name || '')}</a>` : '<span class="muted small">CDEV</span>' },
        { label: 'Vencimento', render: (x) => x.expires_at ? `${fmtDate(x.expires_at)}<span class="sub"><span class="badge ${dueTone(daysUntil(x.expires_at))}" style="border:0;padding:0">${esc(dueLabel(daysUntil(x.expires_at)))}</span></span>` : '—' },
        { label: 'Valor', cls: 'num', render: (x) => `${money(x.amount)}<span class="sub">${isDomain ? 'anual' : esc(label(x.billing_cycle).toLowerCase())}</span>` },
        { label: 'Status', render: (x) => badge(x.status) + (openPays.some((p) => p[field] === x.id) ? ` <span class="badge blue">cobrança aberta</span>` : '') },
        { label: '', render: (x) => `<div class="actions">${isDomain ? linkBtn(`https://${x.domain}`, icon('external'), 'icon-btn') : ''}<button class="btn btn-sm" data-panel="${x.id}">${icon(isDomain ? 'globe' : 'server')}Painel</button><button class="btn btn-sm" data-payx="${x.id}">${icon('money')}Pagamento</button><button class="icon-btn" data-editx="${x.id}">${icon('edit')}</button><button class="icon-btn danger" data-delx="${x.id}">${icon('trash')}</button></div>` }
      ], list, { empty: 'Nada cadastrado.', rowAttr: (x) => (x.id === r.query.id ? 'class="hl"' : '') });
      if (!keepFocus) { $('#tb', root).innerHTML = toolbar({ filters, sorts, state: st, counts }); bindToolbar($('#tb', root), st, draw); }
      st.visible = list;
    };

    const title = isDomain ? 'Domínios' : 'Hospedagens';
    root.innerHTML = `${pageHead('Infraestrutura', title, isDomain ? 'Vencimentos, valores e acesso direto ao painel do registrador (sem integração obrigatória).' : 'VPS, servidores e plataformas. O link do painel fica a um clique.',
      `<button class="btn" data-export>${icon('download')}Exportar CSV</button><button class="btn btn-primary" data-new>${icon('plus')}${isDomain ? 'Novo domínio' : 'Nova hospedagem'}</button>`)}
      <section class="panel panel-pad"><div id="tb"></div><div id="list"></div></section>`;
    draw();
    const find = (id) => rows.find((x) => x.id === id);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.panel) (isDomain ? CC.actions.openDomainPanel : CC.actions.openHostingPanel)(find(d.panel));
      if (d.editx) (isDomain ? CC.actions.editDomain : CC.actions.editHosting)(find(d.editx));
      if (d.delx) CC.actions.remove(kind, find(d.delx), isDomain ? 'este domínio' : 'esta hospedagem');
      if (d.payx) {
        const x = find(d.payx); const p = openPays.find((pp) => pp[field] === x.id);
        if (p) CC.actions.payPayment(p);
        else CC.actions.editPayment({}, { client_id: x.client_id, [field]: x.id, project_id: x.project_id, type: isDomain ? 'DOMINIO' : 'HOSPEDAGEM', description: `${isDomain ? 'Domínio' : 'Hospedagem'} ${x[nameKey]}`, amount: x.amount, due_date: x.expires_at || todayISO(), recurrence: isDomain ? 'ANUAL' : x.billing_cycle, status: 'PAGO', paid_at: todayISO() });
      }
    });
    $('[data-new]', root).onclick = () => (isDomain ? CC.actions.editDomain() : CC.actions.editHosting());
    $('[data-export]', root).onclick = () => csv.download(`${isDomain ? 'dominios' : 'hospedagens'}-${todayISO()}.csv`, csv.stringify(st.visible, isDomain
      ? [{ key: 'domain', label: 'Domínio' }, { label: 'Cliente', value: (x) => client(x.client_id)?.name || '' }, { key: 'registrar', label: 'Registrador' }, { key: 'panel_url', label: 'Painel' }, { key: 'contracted_at', label: 'Contratação' }, { key: 'expires_at', label: 'Vencimento' }, { key: 'amount', label: 'Valor' }, { key: 'status', label: 'Status' }, { key: 'auto_renew', label: 'Renovação automática' }, { key: 'notes', label: 'Observações' }]
      : [{ key: 'name', label: 'Nome' }, { label: 'Cliente', value: (x) => client(x.client_id)?.name || 'CDEV' }, { key: 'provider', label: 'Provedor' }, { key: 'type', label: 'Tipo' }, { key: 'panel_url', label: 'Painel' }, { key: 'host', label: 'Host' }, { key: 'contracted_at', label: 'Contratação' }, { key: 'expires_at', label: 'Vencimento' }, { key: 'amount', label: 'Valor' }, { key: 'billing_cycle', label: 'Ciclo' }, { key: 'status', label: 'Status' }, { key: 'notes', label: 'Observações' }]));
  };
  CC.routes.dominios = (root, r) => expiryList({ kind: 'domains', root, r })();
  CC.routes.hospedagens = (root, r) => expiryList({ kind: 'hostings', root, r })();

  // ================================================================== NOTIFICACOES
  CC.routes.notificacoes = async (root, r) => {
    const rows = await api.list('notifications', { order: 'created_at', asc: false, limit: 300 });
    const st = { filter: r.query.f || 'abertas' };
    const filters = [['abertas', 'Abertas'], ['naolidas', 'Não lidas'], ['todas', 'Todas'], ['resolvidas', 'Resolvidas']];
    const pred = { abertas: (n) => !n.resolved_at, naolidas: (n) => !n.read_at && !n.resolved_at, todas: () => true, resolvidas: (n) => !!n.resolved_at };
    const counts = Object.fromEntries(filters.map(([k]) => [k, rows.filter(pred[k]).length]));
    const draw = () => {
      const list = rows.filter(pred[st.filter]);
      $('#tb', root).innerHTML = toolbar({ filters, state: st, counts, search: false });
      bindToolbar($('#tb', root), st, draw);
      $('#list', root).innerHTML = list.length ? list.map((n) => `
        <div class="list-item" style="${n.read_at || n.resolved_at ? 'opacity:.6' : ''}">
          <span class="dot ${CC.SEV[n.severity] || ''}"></span>
          <div class="grow"><div class="t">${esc(n.title)} ${n.resolved_at ? '<span class="badge gray">resolvido</span>' : ''}</div><div class="s pre" style="white-space:pre-line">${esc(n.body || '')}</div></div>
          <span class="mono tiny muted nowrap">${fmtDateTime(n.created_at)}</span>
          ${n.link ? `<a class="btn btn-sm" href="${esc(n.link)}" data-read="${n.id}">Abrir</a>` : ''}
          ${!n.read_at ? `<button class="icon-btn" title="Marcar como lida" data-read="${n.id}">${icon('check')}</button>` : ''}
        </div>`).join('') : `<div class="empty-state">${icon('bell')}<strong>Nada aqui.</strong></div>`;
    };
    root.innerHTML = `${pageHead('Notificações', 'Alertas', 'Gerados automaticamente para vencimentos, SSL, backups e mudanças de estado dos sites — sem repetição.',
      `<button class="btn" data-perm>${icon('bell')}Ativar no navegador</button><button class="btn" data-readall>${icon('check')}Marcar todas como lidas</button>`)}
      <section class="panel"><div class="panel-body" id="tb"></div><div class="list" id="list"></div></section>`;
    draw();
    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-read]'); if (!el) return;
      await CC.api.update('notifications', el.dataset.read, { read_at: new Date().toISOString() });
      const n = rows.find((x) => x.id === el.dataset.read); if (n) n.read_at = new Date().toISOString();
      CC.refreshBadges(); if (el.tagName === 'BUTTON') draw();
    });
    $('[data-readall]', root).onclick = async () => {
      await CC.ctx.supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      CC.toast('Todas marcadas como lidas.'); CC.refreshBadges(); CC.router.render();
    };
    $('[data-perm]', root).onclick = async () => {
      if (!('Notification' in window)) return CC.toast('Navegador sem suporte a notificações.', 'error');
      const p = await Notification.requestPermission();
      CC.toast(p === 'granted' ? 'Notificações do navegador ativadas.' : 'Permissão negada.', p === 'granted' ? 'success' : 'error');
    };
  };

  // ================================================================== CONFIGURACOES
  const SETTINGS_FIELDS = [
    { name: 'payment_alert_days', label: 'Avisos antes do vencimento (dias)', type: 'days', hint: '0 = no dia. Ex.: 30, 15, 7, 3, 1, 0' },
    { name: 'overdue_alert_days', label: 'Avisos após o vencimento (dias)', type: 'days', hint: 'Ex.: 1, 3, 7, 15, 30' },
    { name: 'expiry_alert_days', label: 'Avisos de domínio/hospedagem sem cobrança (dias)', type: 'days' },
    { name: 'ssl_alert_days', label: 'Avisos de SSL (dias)', type: 'days' },
    { name: 'upcoming_window_days', label: 'Janela "vencendo em breve" (dias)', type: 'number', min: 1, max: 60 },
    { name: 'monitoring_interval_min', label: 'Intervalo de monitoramento (min)', type: 'number', min: 1, max: 1440 },
    { name: 'monitoring_retries', label: 'Tentativas antes de OFFLINE', type: 'number', min: 1, max: 10 },
    { name: 'monitoring_timeout_ms', label: 'Timeout (ms)', type: 'number', min: 1000, max: 60000 },
    { name: 'monitoring_slow_ms', label: 'Lento acima de (ms)', type: 'number', min: 200, max: 60000 },
    { name: 'check_retention_days', label: 'Retenção de checks (dias)', type: 'number', min: 91, max: 730 },
    { name: 'backup_max_age_days', label: 'Backup pendente após (dias)', type: 'number', min: 1, max: 365 },
    { name: 'demo_base_domain', label: 'Domínio das demos', validate: 'domain', lower: true },
    { name: 'timezone', label: 'Fuso horário', type: 'select', options: ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Noronha', 'America/Rio_Branco', 'UTC'] },
    { name: 'currency', label: 'Moeda', type: 'select', options: [['BRL', 'Real (BRL)'], ['USD', 'Dólar (USD)'], ['EUR', 'Euro (EUR)']] },
    { name: 'locale', label: 'Formato de data/valor', type: 'select', options: [['pt-BR', 'pt-BR (25/09/2026)'], ['en-US', 'en-US (09/25/2026)'], ['en-GB', 'en-GB (25/09/2026)']] }
  ];
  CC.routes.configuracoes = async (root) => {
    const [rows, lastCheck] = await Promise.all([
      api.list('cc_settings', { order: 'key' }),
      api.list('projects', { select: 'last_check_at', filters: [['not', 'last_check_at', 'is', null]], order: 'last_check_at', asc: false, limit: 1 }).catch(() => [])
    ]);
    const values = Object.fromEntries(rows.map((x) => [x.key, x.value]));
    const w = values.lead_score_weights || {};
    const workerAt = lastCheck[0]?.last_check_at;
    root.innerHTML = `${pageHead('Sistema', 'Configurações', 'Nenhum valor crítico fica fixo no código. Toggles globais de módulos continuam em <a href="admin.html">Admin</a>.')}
      <div class="grid-2">
        <section class="panel"><div class="panel-head"><h2 class="block-title">Alertas, monitoramento e formato</h2></div><div class="panel-body" id="sf">${CC.formHtml(SETTINGS_FIELDS, values)}
          <div class="row" style="margin-top:1rem"><button class="btn btn-primary" data-save>${icon('check')}Salvar configurações</button></div></div></section>
        <div class="stack">
          <section class="panel"><div class="panel-head"><h2 class="block-title">Score de leads (pesos)</h2></div><div class="panel-body" id="wf">
            ${CC.formHtml(CC.SCORE_FLAGS.map(([k, t]) => ({ name: k, label: t, type: 'number', min: 0, max: 100 })), w)}
            <div class="row" style="margin-top:1rem"><button class="btn btn-primary" data-save-w>${icon('check')}Salvar pesos</button></div></div></section>
          <section class="panel"><div class="panel-head"><h2 class="block-title">Worker (VPS)</h2></div><div class="panel-body small" style="line-height:1.6">
            ${workerAt ? `Último check HTTP registrado: <strong>${fmtDateTime(workerAt)}</strong> (${relTime(workerAt)}).` : 'Nenhum check registrado ainda.'}
            ${workerAt && (Date.now() - new Date(workerAt)) > 15 * 60000 ? '<div class="notice" style="margin-top:.6rem">O worker parece parado. Verifique <code>systemctl status cdev-monitor.timer</code> na VPS.</div>' : ''}
            <p class="muted">O worker roda na sua VPS via systemd/cron (ver <code>ops/monitor/README.md</code>). Ele verifica os sites e chama a rotina de vencimentos. Custo: R$0.</p>
            <button class="btn" data-run>${icon('refresh')}Rodar verificação de vencimentos agora</button></div></section>
          <section class="panel"><div class="panel-head"><h2 class="block-title">Providers ativos</h2></div><div class="panel-body small">
            ${['lead', 'message', 'notification', 'domain', 'hosting', 'storage'].map((t) => `<div class="row" style="padding:.25rem 0"><span class="mono tiny muted" style="width:6.5rem">${t}</span><span>${CC.providers.list(t).map((n) => esc(CC.providers.get(t, n).label)).join(', ')}</span></div>`).join('')}
            <p class="muted tiny" style="margin-top:.6rem">Integrações futuras (APIs de registrador, WhatsApp oficial, storage) entram como novos providers, sem reescrever o sistema.</p></div></section>
        </div>
      </div>`;
    $('[data-save]', root).onclick = async (e) => CC.busy(e.currentTarget, async () => {
      const { values: v, ok } = CC.readForm($('#sf', root), SETTINGS_FIELDS);
      if (!ok) return CC.toast('Corrija os campos destacados.', 'error');
      const up = Object.entries(v).map(([key, value]) => ({ key, value }));
      const { error } = await CC.ctx.supabase.from('cc_settings').upsert(up, { onConflict: 'key' });
      if (error) throw error;
      await CC.loadSettings(); CC.toast('Configurações salvas.');
    }).catch((err) => CC.toast(CC.errMsg(err), 'error'));
    $('[data-save-w]', root).onclick = async (e) => CC.busy(e.currentTarget, async () => {
      const f = CC.SCORE_FLAGS.map(([k]) => ({ name: k, type: 'number' }));
      const { values: v } = CC.readForm($('#wf', root), f);
      Object.keys(v).forEach((k) => { v[k] = Number(v[k] || 0); });
      const { error } = await CC.ctx.supabase.from('cc_settings').upsert({ key: 'lead_score_weights', value: v }, { onConflict: 'key' });
      if (error) throw error;
      await CC.loadSettings(); CC.toast('Pesos salvos.');
    }).catch((err) => CC.toast(CC.errMsg(err), 'error'));
    $('[data-run]', root).onclick = async (e) => CC.busy(e.currentTarget, async () => {
      const r = await api.rpc('cc_run_due_checks'); CC.toast(`${r.notifications_created} novos alertas, ${r.marked_overdue} marcados como atrasados.`); CC.refreshBadges();
    }).catch((err) => CC.toast(CC.errMsg(err), 'error'));
  };
})();
