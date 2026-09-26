/* CDEV Control Center - Site Factory (projetos, editor, templates), monitoramento, incidentes, backups */
(function () {
  const CC = window.CC;
  const { $, $$, esc, icon, api, badge, label, fmtDate, fmtDateTime, relTime, daysUntil, table, toolbar, bindToolbar, matchQ, SORTERS, pageHead, csv, todayISO, duration, debounce } = CC;
  const Engine = () => window.CDEVSiteEngine;

  // ================================================================== PROJETOS
  CC.routes.projetos = async (root, r) => {
    if (r.id) return renderProject(root, r.id, r.query.tab || 'geral');
    const rows = await api.list('projects', { select: 'id,name,slug,status,client_id,template_id,site_url,monitoring_enabled,monitor_status,updated_at,created_at,published_at', order: 'name' });
    await CC.loadLookups(['clients', 'templates']);
    const st = { filter: r.query.f || 'todos', sort: 'name', q: '' };
    const filters = [['todos', 'Todos'], ['RASCUNHO', 'Rascunho'], ['DEMO', 'Demo'], ['PUBLICADO', 'Publicado'], ['SUSPENSO', 'Suspenso'], ['ARQUIVADO', 'Arquivado'], ['aguardando', 'Aguardando publicação']];
    const pred = (k) => (p) => (k === 'todos' ? p.status !== 'ARQUIVADO' : k === 'aguardando' ? ['RASCUNHO', 'DEMO'].includes(p.status) && p.client_id : p.status === k);
    const counts = Object.fromEntries(filters.map(([k]) => [k, rows.filter(pred(k)).length]));
    const sorts = [['name', 'Nome'], ['newest', 'Mais recente'], ['oldest', 'Mais antigo'], ['activity', 'Última atividade'], ['status', 'Status']];
    const sorter = { name: SORTERS.name(), newest: SORTERS.date('created_at', -1), oldest: SORTERS.date('created_at'), activity: SORTERS.date('updated_at', -1), status: SORTERS.str('status') };
    const client = (id) => CC.lookups.clients.find((c) => c.id === id);
    const draw = (keepFocus) => {
      const list = rows.filter(pred(st.filter)).filter((p) => matchQ(p, st.q, ['name', 'slug', 'site_url', (x) => client(x.client_id)?.name])).sort(sorter[st.sort]);
      $('#list', root).innerHTML = table([
        { label: 'Projeto / site', render: (p) => `<strong>${esc(p.name)}</strong><span class="sub">${esc(p.site_url || CC.demoUrl(p.slug))}</span>` },
        { label: 'Cliente', render: (p) => p.client_id ? `<a href="#/clientes/${p.client_id}" data-stop>${esc(client(p.client_id)?.name || '')}</a>` : '<span class="muted small">demo sem cliente</span>' },
        { label: 'Template', render: (p) => `<span class="small">${esc(CC.nameOf('templates', p.template_id) || '—')}</span>` },
        { label: 'Status', render: (p) => badge(p.status) },
        { label: 'Monitor', render: (p) => p.monitoring_enabled ? `${CC.siteDot(p.monitor_status)} <span class="small">${label(p.monitor_status)}</span>` : '<span class="muted small">desligado</span>' },
        { label: '', render: (p) => `<div class="actions"><a class="icon-btn" title="Pré-visualizar" href="${CC.previewUrl(p.slug)}" target="_blank" data-stop>${icon('eye')}</a><a class="icon-btn" title="Editar conteúdo" href="#/projetos/${p.id}?tab=conteudo" data-stop>${icon('edit')}</a></div>` }
      ], list, { rowAttr: (p) => `class="clickable" data-go="#/projetos/${p.id}"`, empty: 'Nenhum projeto. Crie um site a partir de um template.' });
      if (!keepFocus) { $('#tb', root).innerHTML = toolbar({ filters, sorts, state: st, counts }); bindToolbar($('#tb', root), st, draw); }
      $$('[data-go]', root).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('[data-stop]')) CC.router.go(tr.dataset.go); }));
      st.visible = list;
    };
    root.innerHTML = `${pageHead('Site Factory', 'Projetos / Sites', 'Cada site = template + tema + conteúdo + cliente + domínio + hospedagem. Mesma base de código para todos.',
      `<button class="btn" data-export>${icon('download')}Exportar CSV</button><button class="btn btn-primary" data-new>${icon('rocket')}Novo site</button>`)}
      <section class="panel panel-pad"><div id="tb"></div><div id="list"></div></section>`;
    draw();
    $('[data-new]', root).onclick = () => CC.actions.newProject();
    $('[data-export]', root).onclick = () => csv.download(`projetos-${todayISO()}.csv`, csv.stringify(st.visible, [
      { key: 'name', label: 'Projeto' }, { key: 'slug', label: 'Slug' }, { label: 'Cliente', value: (p) => client(p.client_id)?.name || '' },
      { label: 'Template', value: (p) => CC.nameOf('templates', p.template_id) }, { key: 'status', label: 'Status' }, { key: 'site_url', label: 'URL' },
      { key: 'monitoring_enabled', label: 'Monitorado' }, { key: 'monitor_status', label: 'Estado' }, { key: 'published_at', label: 'Publicado em' }, { key: 'created_at', label: 'Criado em' }]));
  };

  // ------------------------------------------------------------------ Detalhe do projeto
  async function renderProject(root, id, tab) {
    const p = await api.get('projects', id);
    if (!p) { root.innerHTML = '<div class="notice">Projeto não encontrado.</div>'; return; }
    await CC.loadLookups(['clients', 'templates', 'hostings']);
    const tabs = [['geral', 'Visão geral', 'layers'], ['conteudo', 'Conteúdo', 'edit'], ['tema', 'Tema', 'layout'], ['avancado', 'JSON', 'settings']];
    root.innerHTML = `${pageHead('Projeto', p.name, `${badge(p.status)} · <a href="${CC.previewUrl(p.slug)}" target="_blank">${esc(CC.previewUrl(p.slug))}</a>`,
      `${p.client_id ? `<a class="btn" href="#/clientes/${p.client_id}">${icon('user')}Cliente</a>` : ''}<a class="btn" href="${esc(CC.demoUrl(p.slug))}" target="_blank" rel="noopener">${icon('external')}Abrir demo</a>${p.status !== 'PUBLICADO' ? `<button class="btn btn-primary" data-publish>${icon('rocket')}Publicar</button>` : ''}`)}
      <div class="segmented-tabs" style="margin-bottom:1rem">${tabs.map(([k, t, ic]) => `<a class="segmented-tab ${tab === k ? 'active' : ''}" href="#/projetos/${id}?tab=${k}">${icon(ic)}${t}</a>`).join('')}</div>
      <div id="tab"></div>`;
    const pub = $('[data-publish]', root);
    if (pub) pub.onclick = async () => {
      const ok = await CC.confirmDialog('Publicar este site? O status muda para PUBLICADO e o monitoramento HTTP/SSL é ativado.', { okLabel: 'Publicar' });
      if (!ok) return;
      const primary = (await api.list('domains', { select: 'domain,is_primary', filters: [['eq', 'project_id', id]] })).sort((a, b) => b.is_primary - a.is_primary)[0];
      await api.update('projects', id, { status: 'PUBLICADO', monitoring_enabled: true, site_url: primary ? `https://${primary.domain}` : p.site_url });
      CC.toast('Site publicado.'); CC.router.render();
    };
    const el = $('#tab', root);
    if (tab === 'conteudo' || tab === 'tema') return renderEditor(el, p, tab);
    if (tab === 'avancado') return renderJson(el, p);
    return renderOverview(el, p);
  }

  const PROJECT_FIELDS = () => [
    { name: 'name', label: 'Nome', required: true },
    { name: 'slug', label: 'Slug (subdomínio da demo)', required: true, validate: 'slug', lower: true },
    { name: 'status', label: 'Status', type: 'select', required: true, options: ['RASCUNHO', 'DEMO', 'PUBLICADO', 'SUSPENSO', 'ARQUIVADO'] },
    { name: 'client_id', label: 'Cliente', type: 'select', options: () => CC.lookups.clients.map((c) => [c.id, c.name]), emptyLabel: 'Sem cliente (demo)' },
    { name: 'template_id', label: 'Template', type: 'select', options: () => CC.lookups.templates.map((t) => [t.id, t.name]) },
    { name: 'hosting_id', label: 'Hospedagem', type: 'select', options: () => CC.lookups.hostings.map((h) => [h.id, h.name]) },
    { name: 'site_url', label: 'URL pública / monitorada', type: 'url', full: true, hint: 'Normalmente https://dominiodocliente.com.br (ou a URL da demo).' },
    { name: 'monitoring_enabled', label: 'Monitorar HTTP/HTTPS + SSL', type: 'checkbox' },
    { name: 'maintenance', label: 'Em manutenção (pausa alertas)', type: 'checkbox' },
    { name: 'monitoring_interval_min', label: 'Intervalo (min, vazio = padrão)', type: 'number', min: 1, max: 1440 },
    { name: 'notes', label: 'Observações', type: 'textarea', full: true }
  ];

  async function renderOverview(el, p) {
    const [domains, backups, incidents] = await Promise.all([
      api.list('domains', { filters: [['eq', 'project_id', p.id]], order: 'domain' }),
      api.list('backups', { filters: [['eq', 'project_id', p.id]], order: 'performed_at', asc: false, limit: 5 }),
      api.list('incidents_view', { filters: [['eq', 'project_id', p.id]], order: 'started_at', asc: false, limit: 5 })
    ]);
    const fields = PROJECT_FIELDS();
    el.innerHTML = `<div class="grid-2">
      <section class="panel"><div class="panel-head"><h2 class="block-title">Dados do projeto</h2></div><div class="panel-body" id="pf">${CC.formHtml(fields, p)}
        <div class="row" style="margin-top:1rem"><button class="btn btn-primary" data-save>${icon('check')}Salvar</button><span class="spacer"></span><button class="btn" data-dup>${icon('copy')}Duplicar</button><button class="btn btn-danger" data-del>${icon('trash')}Excluir</button></div></div></section>
      <div class="stack">
        <div class="info-card"><h3>Domínios <button class="btn btn-sm" data-add-domain>${icon('plus')}Domínio</button></h3>
          ${domains.map((d) => `<div class="sub-item row"><strong class="small">${esc(d.domain)}</strong>${d.is_primary ? '<span class="badge blue">principal</span>' : ''}${badge(d.status)}<span class="spacer"></span><span class="tiny mono">${d.expires_at ? fmtDate(d.expires_at) : ''}</span></div>`).join('') || '<p class="small muted">Nenhum domínio. A demo usa <code>' + esc(CC.demoUrl(p.slug)) + '</code>.</p>'}</div>
        <div class="info-card"><h3>Monitoramento</h3><dl class="kv">
          <dt>Estado</dt><dd>${p.monitoring_enabled ? `${CC.siteDot(p.monitor_status)} ${label(p.monitor_status)} desde ${fmtDateTime(p.monitor_since)}` : 'desligado'}</dd>
          <dt>Último check</dt><dd>${p.last_check_at ? `${fmtDateTime(p.last_check_at)} · HTTP ${p.last_status_code ?? '—'} · ${p.last_response_ms ?? '—'}ms` : '—'}</dd>
          <dt>SSL</dt><dd>${p.ssl_expires_at ? `expira em ${daysUntil(p.ssl_expires_at.slice(0, 10))} dias (${fmtDate(p.ssl_expires_at)})` : '—'}</dd>
          ${p.last_error ? `<dt>Erro</dt><dd class="small">${esc(p.last_error)}</dd>` : ''}</dl>
          <div class="row" style="margin-top:.7rem"><a class="btn btn-sm" href="#/monitoramento?id=${p.id}">Detalhes</a></div></div>
        <div class="info-card"><h3>Backups <button class="btn btn-sm" data-add-backup>${icon('plus')}Registrar</button></h3>
          ${backups.map((b) => `<div class="sub-item row"><span class="dot ${b.status === 'OK' ? 'green' : 'red'}"></span><span class="small">${fmtDateTime(b.performed_at)}</span>${badge(b.status)}<span class="tiny muted">${esc(b.location || '')}</span></div>`).join('') || '<p class="small muted">Nenhum backup registrado.</p>'}</div>
        <div class="info-card"><h3>Incidentes</h3>
          ${incidents.map((i) => `<div class="sub-item row"><span class="dot ${i.status === 'ABERTO' ? 'red' : 'green'}"></span><span class="small">#${i.id} ${fmtDateTime(i.started_at)}</span><span class="tiny muted">${duration(i.duration_seconds)} · ${esc(i.error || '')}</span></div>`).join('') || '<p class="small muted">Nenhum incidente.</p>'}</div>
      </div></div>`;
    $('[data-save]', el).onclick = (e) => CC.busy(e.currentTarget, async () => {
      const { values: v, ok } = CC.readForm($('#pf', el), fields);
      if (!ok) return CC.toast('Corrija os campos destacados.', 'error');
      if (v.template_id !== p.template_id && v.template_id) {
        const apply = await CC.confirmDialog('Template alterado. Aplicar o tema e as seções padrão do novo template? (o conteúdo atual será substituído; Cancelar mantém o conteúdo)', { okLabel: 'Aplicar template' });
        if (apply) {
          const tpl = await api.get('templates', v.template_id);
          v.theme = tpl.theme;
          v.content = CC.siteContentFrom(tpl, { name: v.name, whatsapp: p.content?.contact?.whatsapp, city: p.content?.contact?.city });
        }
      }
      await api.update('projects', p.id, v);
      CC.toast('Projeto salvo.'); CC.router.render();
    }).catch((err) => CC.toast(CC.errMsg(err), 'error'));
    $('[data-del]', el).onclick = async () => { if (await CC.actions.remove('projects', p, 'este projeto (histórico de checks e incidentes também)')) CC.router.go('#/projetos'); };
    $('[data-dup]', el).onclick = async () => {
      const slug = `${p.slug}-copia-${Math.random().toString(36).slice(2, 5)}`;
      const copy = await api.insert('projects', { name: `${p.name} (cópia)`, slug, status: 'RASCUNHO', template_id: p.template_id, theme: p.theme, content: p.content, site_url: CC.demoUrl(slug) });
      CC.toast('Projeto duplicado.'); CC.router.go(`#/projetos/${copy.id}`);
    };
    $('[data-add-domain]', el).onclick = () => CC.actions.editDomain({ project_id: p.id, client_id: p.client_id, is_primary: true });
    $('[data-add-backup]', el).onclick = () => CC.actions.editBackup({}, { project_id: p.id });
  }

  async function renderJson(el, p) {
    const fields = [{ name: 'theme', label: 'Tema (JSON)', type: 'json', full: true, rows: 10 }, { name: 'content', label: 'Conteúdo (JSON)', type: 'json', full: true, rows: 24 }];
    el.innerHTML = `<section class="panel"><div class="panel-body" id="jf"><div class="notice info" style="margin-bottom:1rem">Edição avançada. Prefira as abas Conteúdo e Tema.</div>${CC.formHtml(fields, p)}
      <div class="row" style="margin-top:1rem"><button class="btn btn-primary" data-save>${icon('check')}Salvar JSON</button></div></div></section>`;
    $('[data-save]', el).onclick = (e) => CC.busy(e.currentTarget, async () => {
      const { values, ok } = CC.readForm($('#jf', el), fields);
      if (!ok) return CC.toast('JSON inválido.', 'error');
      await api.update('projects', p.id, values); CC.toast('Salvo.');
    }).catch((err) => CC.toast(CC.errMsg(err), 'error'));
  }

  // ------------------------------------------------------------------ Editor baseado em formularios
  const SECTION_SCHEMAS = {
    hero: [['eyebrow', 'Chamada curta'], ['title', 'Título'], ['subtitle', 'Subtítulo', 'textarea'], ['image', 'Imagem (URL)'], ['buttonText', 'Texto do botão'], ['buttonUrl', 'Link do botão', 'text', '#contato, whatsapp ou https://...'], ['secondaryText', 'Botão secundário'], ['secondaryUrl', 'Link secundário']],
    about: [['title', 'Título'], ['text', 'Texto', 'textarea'], ['image', 'Imagem (URL)'], ['highlights', 'Destaques (um por linha)', 'lines']],
    services: [['title', 'Título'], ['subtitle', 'Subtítulo'], ['items', 'Serviços: nome | descrição | preço (um por linha)', 'rows', ['name', 'description', 'price']]],
    gallery: [['title', 'Título'], ['images', 'Imagens: URL | legenda (uma por linha)', 'rows', ['src', 'alt']]],
    testimonials: [['title', 'Título'], ['items', 'Depoimentos: nome | texto | origem', 'rows', ['name', 'text', 'role']]],
    faq: [['title', 'Título'], ['items', 'Perguntas: pergunta | resposta', 'rows', ['q', 'a']]],
    cta: [['title', 'Título'], ['text', 'Texto'], ['buttonText', 'Texto do botão'], ['buttonUrl', 'Link do botão', 'text', 'whatsapp, #contato ou https://...']],
    contact: [['title', 'Título'], ['text', 'Texto']],
    location: [['title', 'Título'], ['text', 'Texto']]
  };
  const SECTION_NAMES = { hero: 'Hero (topo)', about: 'Sobre', services: 'Serviços', gallery: 'Galeria', testimonials: 'Depoimentos', faq: 'FAQ', cta: 'Chamada (CTA)', contact: 'Contato', location: 'Localização (mapa)' };
  CC.SECTION_SCHEMAS = SECTION_SCHEMAS;

  const rowsToText = (arr, keys) => (arr || []).map((it) => keys.map((k) => String(it?.[k] ?? '').replace(/\|/g, '/')).join(' | ').replace(/( \| )+$/, '')).join('\n');
  const textToRows = (txt, keys) => String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const parts = l.split('|').map((x) => x.trim()); return Object.fromEntries(keys.map((k, i) => [k, parts[i] || ''])); });
  const inputFor = (key, lbl, kind = 'text', extra, value) => {
    const base = `data-key="${esc(key)}" data-kind="${esc(kind)}" ${kind === 'rows' ? `data-cols="${esc(extra.join(','))}"` : ''}`;
    let v = value;
    if (kind === 'rows') v = rowsToText(value, extra);
    if (kind === 'lines') v = (value || []).join('\n');
    const input = ['textarea', 'rows', 'lines'].includes(kind) ? `<textarea class="field" ${base} rows="${kind === 'textarea' ? 3 : 5}">${esc(v ?? '')}</textarea>` : `<input class="field" ${base} value="${esc(v ?? '')}" placeholder="${esc(typeof extra === 'string' ? extra : '')}">`;
    return `<div class="form-field full" style="margin-top:.6rem"><label>${esc(lbl)}</label>${input}</div>`;
  };
  const readInputs = (scope) => {
    const out = {};
    $$('[data-key]', scope).forEach((i) => {
      const k = i.dataset.key; const kind = i.dataset.kind;
      if (kind === 'rows') out[k] = textToRows(i.value, i.dataset.cols.split(','));
      else if (kind === 'lines') out[k] = i.value.split('\n').map((x) => x.trim()).filter(Boolean);
      else if (kind === 'bool') out[k] = i.checked;
      else out[k] = i.value.trim();
    });
    return out;
  };

  async function renderEditor(el, p, tab) {
    const content = JSON.parse(JSON.stringify(p.content || {}));
    content.sections = content.sections || [];
    content.brand = content.brand || {}; content.contact = content.contact || {}; content.seo = content.seo || {}; content.settings = content.settings || {};
    const theme = Engine().resolveTheme(p.theme || {});
    let dirty = false;

    const sectionBlock = (s, i) => `
      <div class="section-block ${s.enabled === false ? 'off' : ''}" data-idx="${i}">
        <header data-toggle><span class="mono tiny muted">${i + 1}</span><strong>${esc(SECTION_NAMES[s.type] || s.type)}</strong><span class="spacer"></span>
          <label class="check" data-stop><input type="checkbox" data-enabled ${s.enabled === false ? '' : 'checked'}> visível</label>
          <button class="icon-btn" data-up title="Subir" data-stop>${icon('arrowUp')}</button><button class="icon-btn" data-down title="Descer" data-stop>${icon('arrowDown')}</button><button class="icon-btn danger" data-remove title="Remover" data-stop>${icon('trash')}</button></header>
        <div class="body">${(SECTION_SCHEMAS[s.type] || []).map(([k, l, kind, extra]) => inputFor(k, l, kind, extra, (s.data || {})[k])).join('')}</div>
      </div>`;

    const contentForm = () => `
      <section class="panel" style="margin-bottom:1rem"><div class="panel-head"><h2 class="block-title">Marca, contato e SEO</h2></div><div class="panel-body" id="meta">
        <div class="form-grid">
          <div class="form-field"><label>Nome</label><input class="field" data-g="brand.name" value="${esc(content.brand.name || p.name)}"></div>
          <div class="form-field"><label>Slogan</label><input class="field" data-g="brand.tagline" value="${esc(content.brand.tagline || '')}"></div>
          <div class="form-field full"><label>Logo (URL)</label><input class="field" data-g="brand.logo" value="${esc(content.brand.logo || '')}"></div>
          <div class="form-field"><label>WhatsApp</label><input class="field" data-g="contact.whatsapp" value="${esc(content.contact.whatsapp || '')}"></div>
          <div class="form-field"><label>Telefone</label><input class="field" data-g="contact.phone" value="${esc(content.contact.phone || '')}"></div>
          <div class="form-field"><label>E-mail</label><input class="field" data-g="contact.email" value="${esc(content.contact.email || '')}"></div>
          <div class="form-field"><label>Instagram</label><input class="field" data-g="contact.instagram" value="${esc(content.contact.instagram || '')}"></div>
          <div class="form-field"><label>Endereço</label><input class="field" data-g="contact.address" value="${esc(content.contact.address || '')}"></div>
          <div class="form-field"><label>Cidade</label><input class="field" data-g="contact.city" value="${esc(content.contact.city || '')}"></div>
          <div class="form-field full"><label>Busca do mapa (opcional)</label><input class="field" data-g="contact.mapsQuery" value="${esc(content.contact.mapsQuery || '')}" placeholder="Nome do local ou endereço completo"></div>
          <div class="form-field full"><label>Horários: dia | horário (um por linha)</label><textarea class="field" data-g="contact.hours" data-kind="rows" data-cols="label,value" rows="3">${esc(rowsToText(content.contact.hours, ['label', 'value']))}</textarea></div>
          <div class="form-field"><label>Título SEO</label><input class="field" data-g="seo.title" value="${esc(content.seo.title || '')}"></div>
          <div class="form-field"><label>Descrição SEO</label><input class="field" data-g="seo.description" value="${esc(content.seo.description || '')}"></div>
          <div class="form-field full"><label class="check"><input type="checkbox" data-g="settings.whatsappFloat" data-kind="bool" ${content.settings.whatsappFloat === false ? '' : 'checked'}> Botão flutuante de WhatsApp</label></div>
        </div></div></section>
      <section class="panel"><div class="panel-head"><h2 class="block-title">Seções</h2>
        <div class="row"><select class="cc-select" data-add-type style="width:auto">${Object.entries(SECTION_NAMES).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select><button class="btn btn-sm" data-add>${icon('plus')}Adicionar</button></div></div>
        <div class="panel-body" id="sections">${content.sections.map(sectionBlock).join('')}</div></section>`;

    const presets = Object.keys(Engine().PRESETS);
    const themeForm = () => `
      <section class="panel"><div class="panel-head"><h2 class="block-title">Tema</h2></div><div class="panel-body" id="theme">
        <div class="form-grid">
          <div class="form-field"><label>Preset</label><select class="cc-select" data-t="preset">${presets.map((k) => `<option ${theme.preset === k ? 'selected' : ''}>${k}</option>`).join('')}</select><div class="hint">Trocar o preset redefine cores e fontes.</div></div>
          <div class="form-field"><label>Modo</label><select class="cc-select" data-t="mode"><option value="dark" ${theme.mode === 'dark' ? 'selected' : ''}>Escuro</option><option value="light" ${theme.mode === 'light' ? 'selected' : ''}>Claro</option></select></div>
          <div class="form-field"><label>Fonte dos títulos</label><select class="cc-select" data-t="fonts.heading">${Engine().FONTS.map((f) => `<option ${theme.fonts.heading === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="form-field"><label>Fonte do texto</label><select class="cc-select" data-t="fonts.body">${Engine().FONTS.map((f) => `<option ${theme.fonts.body === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="form-field"><label>Arredondamento</label><input class="field" data-t="radius" value="${esc(theme.radius)}" placeholder="8px"></div>
        </div>
        <div class="color-row" style="margin-top:1rem">${Object.entries({ primary: 'Primária', accent: 'Destaque', bg: 'Fundo', surface: 'Cartões', text: 'Texto', muted: 'Texto secundário' }).map(([k, t]) => `<div class="form-field"><label>${t}</label><input type="color" data-t="colors.${k}" value="${esc(theme.colors[k])}"></div>`).join('')}</div>
      </div></section>`;

    el.innerHTML = `<div class="editor-layout">
      <div>${tab === 'tema' ? themeForm() : contentForm()}
        <div class="row" style="position:sticky;bottom:0;padding:.8rem 0;background:linear-gradient(transparent,var(--ink) 40%)"><button class="btn btn-primary" data-save>${icon('check')}Salvar alterações</button><span class="mono tiny muted" id="dirty"></span></div></div>
      <div class="panel editor-preview desktop"><div class="panel-head"><span class="kicker">Preview ao vivo</span><span class="spacer"></span><div class="segmented-tabs"><button class="segmented-tab active" data-pv="desktop">Desktop</button><button class="segmented-tab" data-pv="mobile">Mobile</button></div><a class="btn btn-sm" href="${CC.previewUrl(p.slug)}" target="_blank">${icon('external')}Abrir</a></div><div class="pv-wrap"><iframe id="pv" src="site.html?live=1" title="Preview"></iframe></div></div></div>`;

    const setPath = (obj, path, val) => { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; }); o[ks[ks.length - 1]] = val; };
    const collect = () => {
      if (tab === 'tema') {
        $$('[data-t]', el).forEach((i) => setPath(theme, i.dataset.t, i.value));
        return;
      }
      $$('[data-g]', el).forEach((i) => {
        const kind = i.dataset.kind;
        const v = kind === 'rows' ? textToRows(i.value, i.dataset.cols.split(',')) : kind === 'bool' ? i.checked : i.value.trim();
        setPath(content, i.dataset.g, v);
      });
      $$('.section-block', el).forEach((b) => {
        const s = content.sections[Number(b.dataset.idx)];
        s.enabled = $('[data-enabled]', b).checked;
        s.data = { ...(s.data || {}), ...readInputs($('.body', b)) };
      });
    };
    const frame = $('#pv', el);
    const pvBox = $('.editor-preview', el);
    const fit = () => {
      const wrap = $('.pv-wrap', el); if (!wrap) return;
      if (pvBox.classList.contains('desktop')) { const sc = wrap.clientWidth / 1280; frame.style.transform = `scale(${sc})`; frame.style.height = `${wrap.clientHeight / sc}px`; }
      else { frame.style.transform = ''; frame.style.height = '100%'; }
    };
    $$('[data-pv]', el).forEach((b) => b.addEventListener('click', () => { pvBox.classList.toggle('desktop', b.dataset.pv === 'desktop'); $$('[data-pv]', el).forEach((x) => x.classList.toggle('active', x === b)); fit(); }));
    new ResizeObserver(fit).observe($('.pv-wrap', el));
    const push = () => { try { frame.contentWindow.postMessage({ type: 'cdev-site-preview', site: { name: content.brand.name || p.name, status: p.status, theme, content } }, location.origin); } catch (e) { /* iframe carregando */ } };
    const onMsg = (e) => { if (e.origin === location.origin && e.data?.type === 'cdev-site-preview-ready') push(); };
    window.addEventListener('message', onMsg);
    const cleanup = () => window.removeEventListener('message', onMsg);
    window.addEventListener('hashchange', cleanup, { once: true });
    const changed = debounce(() => { collect(); push(); dirty = true; $('#dirty', el).textContent = 'alterações não salvas'; }, 250);
    el.addEventListener('input', changed);
    el.addEventListener('change', (e) => {
      if (e.target.dataset.t === 'preset') {
        const pr = Engine().PRESETS[e.target.value];
        Object.assign(theme, JSON.parse(JSON.stringify(pr)), { preset: e.target.value });
        $$('[data-t]', el).forEach((i) => { const v = i.dataset.t.split('.').reduce((o, k) => (o ? o[k] : ''), theme); if (v !== undefined && i.dataset.t !== 'preset') i.value = v; });
      }
      changed();
    });
    const redrawSections = () => { $('#sections', el).innerHTML = content.sections.map(sectionBlock).join(''); push(); dirty = true; $('#dirty', el).textContent = 'alterações não salvas'; };
    el.addEventListener('click', (e) => {
      const blk = e.target.closest('.section-block');
      if (e.target.closest('[data-toggle]') && !e.target.closest('[data-stop]')) { blk.classList.toggle('open'); return; }
      if (!blk) return;
      const i = Number(blk.dataset.idx);
      if (e.target.closest('[data-up]') && i > 0) { collect(); [content.sections[i - 1], content.sections[i]] = [content.sections[i], content.sections[i - 1]]; redrawSections(); }
      if (e.target.closest('[data-down]') && i < content.sections.length - 1) { collect(); [content.sections[i + 1], content.sections[i]] = [content.sections[i], content.sections[i + 1]]; redrawSections(); }
      if (e.target.closest('[data-remove]')) { collect(); content.sections.splice(i, 1); redrawSections(); }
    });
    const add = $('[data-add]', el);
    if (add) add.onclick = () => {
      collect();
      const type = $('[data-add-type]', el).value;
      content.sections.push({ id: `${type}-${Date.now().toString(36)}`, type, enabled: true, data: {} });
      redrawSections();
      $$('.section-block', el).pop().classList.add('open');
    };
    $('[data-save]', el).onclick = (e) => CC.busy(e.currentTarget, async () => {
      collect();
      await api.update('projects', p.id, tab === 'tema' ? { theme } : { content });
      p.content = content; p.theme = theme; dirty = false;
      $('#dirty', el).textContent = `salvo ${CC.fmtTime(new Date().toISOString())}`;
      CC.toast('Site atualizado.');
    }).catch((err) => CC.toast(CC.errMsg(err), 'error'));
    window.onbeforeunload = () => (dirty ? 'Há alterações não salvas.' : undefined);
  }

  // ================================================================== TEMPLATES
  CC.routes.templates = async (root) => {
    const rows = await api.list('templates', { order: 'name' });
    const counts = await api.list('projects', { select: 'template_id' });
    const uses = counts.reduce((m, x) => { m[x.template_id] = (m[x.template_id] || 0) + 1; return m; }, {});
    root.innerHTML = `${pageHead('Site Factory', 'Templates', 'Modelos por segmento. Novos templates = novo registro (seções + tema + conteúdo exemplo), sem novo projeto de código.',
      `<button class="btn btn-primary" data-new>${icon('plus')}Novo template</button>`)}
      <div class="grid-3">${rows.map((t) => { const th = Engine().resolveTheme(t.theme); return `
        <article class="panel" style="overflow:hidden">
          <div style="height:6.5rem;background:linear-gradient(135deg,${esc(th.colors.primary)},${esc(th.colors.bg)});display:flex;align-items:flex-end;padding:.8rem">
            <span style="font-family:'${esc(th.fonts.heading)}',serif;font-size:var(--fs-lg);font-weight:700;color:${esc(th.colors.text)}">${esc(t.content?.brand?.name || t.name)}</span></div>
          <div class="panel-body"><div class="row"><strong>${esc(t.name)}</strong>${t.active ? '' : '<span class="badge gray">inativo</span>'}<span class="spacer"></span><span class="mono tiny muted">${uses[t.id] || 0} sites</span></div>
            <div class="small muted" style="margin:.35rem 0 .8rem">${esc(t.segment)} · ${(t.sections || []).length} seções · ${esc(t.theme?.preset || '')}</div>
            <div class="row"><a class="btn btn-sm" href="site.html?template=${encodeURIComponent(t.key)}" target="_blank">${icon('eye')}Ver</a><button class="btn btn-sm btn-primary" data-use="${t.id}">${icon('rocket')}Criar site</button><button class="icon-btn" data-edit="${t.id}">${icon('edit')}</button><button class="icon-btn" data-dup="${t.id}" title="Duplicar">${icon('copy')}</button></div></div>
        </article>`; }).join('') || '<div class="notice">Nenhum template. Rode <code>supabase/08_control_center_templates.sql</code>.</div>'}</div>`;
    const find = (id) => rows.find((t) => t.id === id);
    const fields = [
      { name: 'key', label: 'Chave', required: true, validate: 'slug', lower: true }, { name: 'name', label: 'Nome', required: true },
      { name: 'segment', label: 'Segmento', required: true }, { name: 'active', label: 'Ativo', type: 'checkbox', default: true },
      { name: 'description', label: 'Descrição', full: true },
      { name: 'theme', label: 'Tema (JSON)', type: 'json', full: true, rows: 6 }, { name: 'content', label: 'Conteúdo exemplo (JSON)', type: 'json', full: true, rows: 14 }
    ];
    const edit = async (t = {}) => {
      const saved = await CC.formModal({ title: t.id ? 'Editar template' : 'Novo template', wide: true, fields, values: { theme: { preset: 'cdev-aqua' }, content: { brand: { name: '' }, sections: [] }, ...t },
        onSubmit: async (v) => { v.sections = (v.content?.sections || []).map((s) => s.type); return t.id ? api.update('templates', t.id, v) : api.insert('templates', v); } });
      if (saved) { CC.toast('Template salvo.'); CC.router.render(); }
    };
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.use) CC.actions.newProject({ template_id: b.dataset.use });
      if (b.dataset.edit) edit(find(b.dataset.edit));
      if (b.dataset.dup) { const t = find(b.dataset.dup); const { id, created_at, updated_at, ...rest } = t; edit({ ...rest, key: `${t.key}-2`, name: `${t.name} (cópia)` }); }
    });
    $('[data-new]', root).onclick = () => edit();
  };

  // ================================================================== MONITORAMENTO
  CC.routes.monitoramento = async (root, r) => {
    const [rows, uptime] = await Promise.all([
      api.list('projects', { select: 'id,name,slug,client_id,status,site_url,monitoring_enabled,monitoring_interval_min,maintenance,monitor_status,monitor_since,last_check_at,last_status_code,last_response_ms,last_error,ssl_expires_at', order: 'name' }),
      api.rpc('cc_uptime_summary')
    ]);
    await CC.loadLookups(['clients']);
    const up = Object.fromEntries((uptime || []).map((u) => [u.project_id, u]));
    const mon = rows.filter((p) => p.monitoring_enabled);
    const sslDays = (p) => (p.ssl_expires_at ? daysUntil(p.ssl_expires_at.slice(0, 10)) : null);
    const st = { filter: r.query.f || 'todos', sort: 'status', q: '' };
    const filters = [['todos', 'Monitorados'], ['online', 'Online'], ['offline', 'Offline'], ['problemas', 'Com problemas'], ['manutencao', 'Em manutenção'], ['ssl', 'SSL < 30 dias'], ['desligados', 'Sem monitoramento']];
    const pred = {
      todos: (p) => p.monitoring_enabled, online: (p) => p.monitoring_enabled && p.monitor_status === 'ONLINE', offline: (p) => p.monitoring_enabled && p.monitor_status === 'OFFLINE',
      problemas: (p) => p.monitoring_enabled && p.monitor_status === 'INSTAVEL', manutencao: (p) => p.maintenance,
      ssl: (p) => p.monitoring_enabled && sslDays(p) !== null && sslDays(p) < 30, desligados: (p) => !p.monitoring_enabled && p.status !== 'ARQUIVADO'
    };
    const counts = Object.fromEntries(filters.map(([k]) => [k, rows.filter(pred[k]).length]));
    const order = { OFFLINE: 0, INSTAVEL: 1, DESCONHECIDO: 2, MANUTENCAO: 3, ONLINE: 4 };
    const sorts = [['status', 'Status'], ['name', 'Nome'], ['slow', 'Mais lento'], ['uptime', 'Menor uptime'], ['ssl', 'SSL mais próximo']];
    const sorter = { status: (a, b) => order[a.monitor_status] - order[b.monitor_status], name: SORTERS.name(), slow: SORTERS.num('last_response_ms', -1), uptime: (a, b) => Number(up[a.id]?.up_30d ?? 101) - Number(up[b.id]?.up_30d ?? 101), ssl: (a, b) => (sslDays(a) ?? 9999) - (sslDays(b) ?? 9999) };
    const lastAny = mon.map((p) => p.last_check_at).filter(Boolean).sort().pop();
    const stale = mon.length && (!lastAny || Date.now() - new Date(lastAny) > 15 * 60000);
    const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2).replace('.', ',')}%`);

    const draw = (keepFocus) => {
      const list = rows.filter(pred[st.filter]).filter((p) => matchQ(p, st.q, ['name', 'site_url'])).sort(sorter[st.sort]);
      $('#list', root).innerHTML = table([
        { label: 'Site', render: (p) => `<div class="row" style="flex-wrap:nowrap">${CC.siteDot(p.maintenance ? 'MANUTENCAO' : p.monitor_status)}<div><strong>${esc(p.name)}</strong><span class="sub">${esc(p.site_url || '—')}</span></div></div>` },
        { label: 'Estado', render: (p) => `${badge(p.maintenance ? 'MANUTENCAO' : p.monitor_status)}<span class="sub">${p.monitor_since ? 'desde ' + fmtDateTime(p.monitor_since) : ''}</span>` },
        { label: 'Resposta', cls: 'num', render: (p) => `${p.last_response_ms ? p.last_response_ms + 'ms' : '—'}<span class="sub">HTTP ${p.last_status_code ?? '—'}</span>` },
        { label: 'Uptime 24h / 7d / 30d / 90d', cls: 'num', render: (p) => `<span class="small">${pct(up[p.id]?.up_1d)} · ${pct(up[p.id]?.up_7d)} · ${pct(up[p.id]?.up_30d)} · ${pct(up[p.id]?.up_90d)}</span>` },
        { label: 'SSL', render: (p) => { const d = sslDays(p); return d === null ? '<span class="muted small">—</span>' : `<span class="badge ${d < 7 ? 'red' : d < 30 ? 'orange' : 'green'}">${d < 0 ? 'expirado' : `SSL OK · ${d} dias`}</span>`; } },
        { label: 'Último check', render: (p) => `<span class="small">${relTime(p.last_check_at)}</span>` },
        { label: '', render: (p) => `<div class="actions"><button class="btn btn-sm" data-detail="${p.id}">Detalhes</button><button class="icon-btn" title="${p.maintenance ? 'Sair da manutenção' : 'Modo manutenção'}" data-maint="${p.id}">${icon('settings')}</button><button class="icon-btn" title="${p.monitoring_enabled ? 'Desligar' : 'Ligar'} monitoramento" data-toggle-mon="${p.id}">${icon(p.monitoring_enabled ? 'x' : 'activity')}</button></div>` }
      ], list, { empty: st.filter === 'todos' ? 'Nenhum site monitorado. Use o filtro "Sem monitoramento" para ativar.' : 'Nenhum site neste filtro.', rowAttr: (p) => (p.id === r.query.id ? 'class="hl"' : '') });
      if (!keepFocus) { $('#tb', root).innerHTML = toolbar({ filters, sorts, state: st, counts }); bindToolbar($('#tb', root), st, draw); }
    };
    root.innerHTML = `${pageHead('Operação', 'Monitoramento', `Checagem externa HTTP/HTTPS + SSL feita pelo worker na VPS. Alertas apenas na mudança de estado (ONLINE ↔ OFFLINE). ${mon.length} sites monitorados.`,
      `<a class="btn" href="#/incidentes">${icon('alert')}Incidentes</a>`)}
      ${stale ? `<div class="notice" style="margin-bottom:1rem">Nenhum check nos últimos 15 minutos${lastAny ? ` (último: ${fmtDateTime(lastAny)})` : ''}. Verifique se o worker está rodando na VPS: <code>systemctl status cdev-monitor.timer</code></div>` : ''}
      <section class="panel panel-pad"><div id="tb"></div><div id="list"></div></section>`;
    draw();
    const find = (id) => rows.find((p) => p.id === id);
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.detail) showMonitorDetail(find(b.dataset.detail), up[b.dataset.detail]);
      if (b.dataset.maint) { const p = find(b.dataset.maint); await api.update('projects', p.id, { maintenance: !p.maintenance }); CC.toast(p.maintenance ? 'Manutenção encerrada.' : 'Modo manutenção: alertas pausados.'); CC.router.render(); }
      if (b.dataset.toggleMon) {
        const p = find(b.dataset.toggleMon);
        if (!p.monitoring_enabled && !p.site_url) return CC.toast('Defina a URL pública do projeto antes de monitorar.', 'error');
        await api.update('projects', p.id, { monitoring_enabled: !p.monitoring_enabled }); CC.toast('Monitoramento atualizado.'); CC.router.render();
      }
    });
    if (r.query.id && find(r.query.id)) showMonitorDetail(find(r.query.id), up[r.query.id]);
  };

  async function showMonitorDetail(p, u = {}) {
    const [checks, incidents] = await Promise.all([
      api.list('monitoring_checks', { filters: [['eq', 'project_id', p.id]], order: 'checked_at', asc: false, limit: 90 }),
      api.list('incidents_view', { filters: [['eq', 'project_id', p.id]], order: 'started_at', asc: false, limit: 10 })
    ]);
    const slow = CC.setting('monitoring_slow_ms', 3000);
    const strip = checks.slice(0, 60).reverse();
    const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2).replace('.', ',')}%`);
    CC.modal({
      title: p.name, wide: true,
      body: `<div class="row" style="margin-bottom:1rem">${badge(p.maintenance ? 'MANUTENCAO' : p.monitor_status)}<a href="${esc(CC.safeUrl(p.site_url))}" target="_blank" rel="noopener" class="small">${esc(p.site_url || '')}</a><span class="spacer"></span><a class="btn btn-sm" href="#/projetos/${p.id}">Abrir projeto</a>${p.client_id ? `<a class="btn btn-sm" href="#/clientes/${p.client_id}">Cliente</a>` : ''}</div>
        <div class="grid-3" style="grid-template-columns:repeat(4,1fr)">
          <div class="metric"><strong>${pct(u?.up_1d)}</strong><span>Hoje (24h)</span></div><div class="metric"><strong>${pct(u?.up_7d)}</strong><span>7 dias</span></div>
          <div class="metric"><strong>${pct(u?.up_30d)}</strong><span>30 dias</span></div><div class="metric"><strong>${pct(u?.up_90d)}</strong><span>90 dias</span></div></div>
        <p class="tiny muted mono" style="margin:.6rem 0">Calculado a partir de ${u?.checks_90d || 0} checks reais armazenados · média 24h ${u?.avg_ms_1d ?? '—'}ms · SSL ${p.ssl_expires_at ? fmtDate(p.ssl_expires_at) : '—'}</p>
        <span class="lbl">Últimos ${strip.length} checks</span>
        <div class="uptime-strip">${strip.map((c) => `<i class="${!c.ok ? 'bad' : c.response_ms > slow ? 'slow' : ''}" title="${esc(fmtDateTime(c.checked_at))} · ${c.ok ? (c.response_ms + 'ms') : esc(c.error || 'erro')}"></i>`).join('') || '<i class="none"></i>'}</div>
        <div class="grid-2" style="margin-top:1rem">
          <div><span class="lbl">Checks recentes</span>${table([{ label: 'Quando', render: (c) => fmtDateTime(c.checked_at) }, { label: 'HTTP', render: (c) => c.status_code ?? '—' }, { label: 'ms', cls: 'num', render: (c) => c.response_ms ?? '—' }, { label: '', render: (c) => c.ok ? badge('OK') : `<span class="badge red">${esc(c.error || 'falha')}</span>` }], checks.slice(0, 12), { empty: 'Sem checks ainda.' })}</div>
          <div><span class="lbl">Incidentes</span>${table([{ label: '#', render: (i) => i.id }, { label: 'Início', render: (i) => fmtDateTime(i.started_at) }, { label: 'Duração', render: (i) => duration(i.duration_seconds) }, { label: '', render: (i) => badge(i.status) }], incidents, { empty: 'Nenhum incidente.' })}</div>
        </div>`
    });
  }

  // ================================================================== INCIDENTES
  CC.routes.incidentes = async (root, r) => {
    const rows = await api.list('incidents_view', { order: 'started_at', asc: false, limit: 2000 });
    await CC.loadLookups(['clients', 'projects']);
    const st = { filter: r.query.f || 'todos', sort: 'recent', q: '', client: r.query.client || '', project: r.query.project || '', period: r.query.p || '90' };
    const filters = [['todos', 'Todos'], ['abertos', 'Abertos'], ['resolvidos', 'Resolvidos']];
    const pred = { todos: () => true, abertos: (i) => i.status === 'ABERTO', resolvidos: (i) => i.status === 'RESOLVIDO' };
    const sorts = [['recent', 'Mais recente'], ['oldest', 'Mais antigo'], ['longest', 'Maior duração']];
    const sorter = { recent: SORTERS.date('started_at', -1), oldest: SORTERS.date('started_at'), longest: SORTERS.num('duration_seconds', -1) };
    const draw = (keepFocus) => {
      const since = st.period === 'all' ? 0 : Date.now() - Number(st.period) * 86400000;
      const base = rows.filter((i) => (!st.client || i.client_id === st.client) && (!st.project || i.project_id === st.project) && new Date(i.started_at).getTime() >= since);
      const counts = Object.fromEntries(filters.map(([k]) => [k, base.filter(pred[k]).length]));
      const list = base.filter(pred[st.filter]).filter((i) => matchQ(i, st.q, ['project_name', 'client_name', 'error', 'cause'])).sort(sorter[st.sort]);
      const total = list.reduce((a, i) => a + Number(i.duration_seconds || 0), 0);
      $('#list', root).innerHTML = `<p class="mono tiny muted">${list.length} incidentes · ${duration(total)} de indisponibilidade no período</p>` + table([
        { label: '#', render: (i) => `<span class="mono">#${i.id}</span>` },
        { label: 'Site', render: (i) => `<a href="#/projetos/${i.project_id}">${esc(i.project_name)}</a><span class="sub">${esc(i.site_url || '')}</span>` },
        { label: 'Cliente', render: (i) => i.client_id ? `<a href="#/clientes/${i.client_id}">${esc(i.client_name || '')}</a>` : '—' },
        { label: 'Início', render: (i) => fmtDateTime(i.started_at) },
        { label: 'Fim', render: (i) => (i.ended_at ? fmtDateTime(i.ended_at) : '<span class="badge red">em andamento</span>') },
        { label: 'Duração', cls: 'num', render: (i) => duration(i.duration_seconds) },
        { label: 'Erro / causa', render: (i) => `<span class="small">${esc(i.error || '—')}</span><span class="sub">${esc(i.cause || 'sem causa registrada')}</span>` },
        { label: '', render: (i) => `<button class="icon-btn" data-cause="${i.id}" title="Registrar causa">${icon('edit')}</button>` }
      ], list, { empty: 'Nenhum incidente no período.' });
      if (!keepFocus) {
        $('#tb', root).innerHTML = toolbar({ filters, sorts, state: st, counts, extra: `
          <select class="cc-select" data-client><option value="">Todos os clientes</option>${CC.optionHtml(CC.lookups.clients.map((c) => [c.id, c.name]), st.client)}</select>
          <select class="cc-select" data-project><option value="">Todos os sites</option>${CC.optionHtml(CC.lookups.projects.map((p) => [p.id, p.name]), st.project)}</select>
          <select class="cc-select" data-period>${CC.optionHtml([['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['all', 'Tudo']], st.period)}</select>` });
        bindToolbar($('#tb', root), st, draw);
        $('[data-client]', root).onchange = (e) => { st.client = e.target.value; draw(); };
        $('[data-project]', root).onchange = (e) => { st.project = e.target.value; draw(); };
        $('[data-period]', root).onchange = (e) => { st.period = e.target.value; draw(); };
      }
    };
    root.innerHTML = `${pageHead('Operação', 'Incidentes', 'Criados e encerrados automaticamente pelas mudanças de estado do monitoramento.')}
      <section class="panel panel-pad"><div id="tb"></div><div id="list"></div></section>`;
    draw();
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cause]'); if (!b) return;
      const inc = rows.find((i) => String(i.id) === b.dataset.cause);
      const saved = await CC.formModal({ title: `Incidente #${inc.id}`, fields: [{ name: 'cause', label: 'Causa registrada', type: 'textarea', full: true }], values: inc,
        onSubmit: async (v) => unwrapUpdate(inc.id, v) });
      if (saved) { CC.toast('Causa registrada.'); CC.router.render(); }
    });
    const unwrapUpdate = async (id, v) => { const { error } = await CC.ctx.supabase.from('incidents').update(v).eq('id', id); if (error) throw error; return true; };
  };

  // ================================================================== BACKUPS
  CC.routes.backups = async (root, r) => {
    const [projects, backups] = await Promise.all([
      api.list('projects', { select: 'id,name,client_id,status', filters: [['neq', 'status', 'ARQUIVADO']], order: 'name' }),
      api.list('backups', { order: 'performed_at', asc: false, limit: 2000 })
    ]);
    await CC.loadLookups(['clients']);
    const maxAge = CC.setting('backup_max_age_days', 7);
    const last = {}; backups.forEach((b) => { if (b.status === 'OK' && !last[b.project_id]) last[b.project_id] = b; });
    const lastAny = {}; backups.forEach((b) => { if (!lastAny[b.project_id]) lastAny[b.project_id] = b; });
    const age = (p) => (last[p.id] ? (Date.now() - new Date(last[p.id].performed_at)) / 86400000 : Infinity);
    const st = { filter: r.query.f || 'todos', q: '', sort: 'age' };
    const filters = [['todos', 'Todos'], ['pendentes', 'Pendentes'], ['falhas', 'Última falhou'], ['ok', 'Em dia']];
    const pred = {
      todos: (p) => !r.query.client || p.client_id === r.query.client,
      pendentes: (p) => p.status === 'PUBLICADO' && age(p) > maxAge, falhas: (p) => lastAny[p.id] && lastAny[p.id].status !== 'OK', ok: (p) => age(p) <= maxAge
    };
    const counts = Object.fromEntries(filters.map(([k]) => [k, projects.filter(pred[k]).length]));
    const draw = (keepFocus) => {
      const list = projects.filter(pred[st.filter]).filter((p) => (!r.query.project || p.id === r.query.project) && matchQ(p, st.q, ['name'])).sort((a, b) => age(b) - age(a));
      $('#list', root).innerHTML = table([
        { label: 'Projeto', render: (p) => `<a href="#/projetos/${p.id}"><strong>${esc(p.name)}</strong></a><span class="sub">${esc(CC.lookups.clients.find((c) => c.id === p.client_id)?.name || '')}</span>` },
        { label: 'Status', render: (p) => badge(p.status) },
        { label: 'Último backup OK', render: (p) => (last[p.id] ? `${fmtDateTime(last[p.id].performed_at)}<span class="sub">${esc(last[p.id].location || '')}</span>` : '<span class="muted">nunca</span>') },
        { label: 'Situação', render: (p) => (age(p) <= maxAge ? '<span class="badge green">em dia</span>' : p.status === 'PUBLICADO' ? '<span class="badge orange">pendente</span>' : '<span class="badge gray">—</span>') + (lastAny[p.id] && lastAny[p.id].status !== 'OK' ? ' ' + badge('FALHOU') : '') },
        { label: '', render: (p) => `<button class="btn btn-sm" data-reg="${p.id}">${icon('plus')}Registrar</button>` }
      ], list, { empty: 'Nenhum projeto.' });
      if (!keepFocus) { $('#tb', root).innerHTML = toolbar({ filters, state: st, counts }); bindToolbar($('#tb', root), st, draw); }
    };
    root.innerHTML = `${pageHead('Operação', 'Backups', `Registro e controle de backups. Sites publicados sem backup OK há mais de ${maxAge} dias viram pendência.`,
      `<button class="btn btn-primary" data-new>${icon('plus')}Registrar backup</button>`)}
      <section class="panel panel-pad"><div id="tb"></div><div id="list"></div></section>
      <section class="panel" style="margin-top:1rem"><div class="panel-head"><h2 class="block-title">Histórico</h2></div>
        ${table([{ label: 'Data', render: (b) => fmtDateTime(b.performed_at) }, { label: 'Projeto', render: (b) => esc(projects.find((p) => p.id === b.project_id)?.name || '—') }, { label: 'Status', render: (b) => badge(b.status) }, { label: 'Tipo', render: (b) => label(b.kind) }, { label: 'Local', render: (b) => `<span class="small">${esc(b.location || '')}</span>` }, { label: 'MB', cls: 'num', render: (b) => b.size_mb ?? '—' }], backups.filter((b) => !r.query.client || b.client_id === r.query.client).slice(0, 50), { empty: 'Nenhum backup registrado.' })}</section>`;
    draw();
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-reg]'); if (b) CC.actions.editBackup({}, { project_id: b.dataset.reg }); });
    $('[data-new]', root).onclick = () => CC.actions.editBackup();
  };
})();
