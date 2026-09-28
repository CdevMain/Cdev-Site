/* CDEV Control Center - CRM / Leads / Mensagens / Importacao CSV */
(function () {
  const CC = window.CC;
  const { $, $$, esc, icon, api, badge, label, fmtDate, fmtDateTime, relTime, daysUntil, table, toolbar, bindToolbar, matchQ, SORTERS, pageHead, csv, todayISO, addDays } = CC;
  const STAGES = ['LEAD', 'CONTATADO', 'RESPONDEU', 'DEMO_ENVIADA', 'NEGOCIACAO', 'CLIENTE', 'PERDIDO'];

  const leadVars = (l, project) => ({
    nome: (l.name || l.company || '').split(' ')[0],
    empresa: l.company || '',
    segmento: l.segment || '',
    cidade: l.city || '',
    demo_url: project ? CC.demoUrl(project.slug) : ''
  });

  // ================================================================== LEADS
  CC.routes.leads = async (root, r) => {
    const [rows, projects] = await Promise.all([
      api.list('leads', { order: 'created_at', asc: false, limit: 5000 }),
      api.list('projects', { select: 'id,name,slug,status' })
    ]);
    const view = r.query.v || 'pipeline';
    const st = { filter: r.query.f || 'ativos', sort: 'score', q: '' };
    const filters = [['ativos', 'Em aberto'], ['todos', 'Todos'], ['followup', 'Follow-up hoje'], ...STAGES.map((s) => [s, label(s)])];
    const pred = (k) => (l) => (k === 'todos' ? true : k === 'ativos' ? !['CLIENTE', 'PERDIDO'].includes(l.status) : k === 'followup' ? l.next_action_at && daysUntil(l.next_action_at) <= 0 && !['CLIENTE', 'PERDIDO'].includes(l.status) : l.status === k);
    const counts = Object.fromEntries(filters.map(([k]) => [k, rows.filter(pred(k)).length]));
    const sorts = [['score', 'Maior score'], ['newest', 'Mais recente'], ['oldest', 'Mais antigo'], ['name', 'Empresa'], ['next', 'Próximo follow-up'], ['activity', 'Última atividade']];
    const sorter = { score: SORTERS.num('score', -1), newest: SORTERS.date('created_at', -1), oldest: SORTERS.date('created_at'), name: SORTERS.name('company'), next: SORTERS.date('next_action_at'), activity: SORTERS.date('updated_at', -1) };
    const card = (l) => `<div class="pipe-card" draggable="true" data-lead="${l.id}"><strong>${esc(l.company)}</strong><small>${esc([l.segment, l.city].filter(Boolean).join(' · '))}</small>
      <small>${l.potential ? `${'★'.repeat(l.potential)} · ` : ''}score ${l.score}${l.next_action_at ? ` · follow-up ${fmtDate(l.next_action_at, { short: true })}` : ''}${l.demo_project_id ? ' · demo' : ''}</small></div>`;

    const draw = (keepFocus) => {
      const list = rows.filter(pred(st.filter)).filter((l) => matchQ(l, st.q, ['company', 'name', 'city', 'segment', 'phone', 'whatsapp', 'email', 'instagram'])).sort(sorter[st.sort]);
      if (view === 'pipeline') {
        const stages = st.filter === 'todos' ? STAGES : STAGES.filter((s) => list.some((l) => l.status === s) || !['CLIENTE', 'PERDIDO'].includes(s));
        $('#list', root).innerHTML = `<div class="pipeline">${stages.map((s) => `<div class="pipe-col" data-stage="${s}"><h4>${label(s)}<span>${list.filter((l) => l.status === s).length}</span></h4>${list.filter((l) => l.status === s).map(card).join('')}</div>`).join('')}</div>
          <p class="tiny muted mono" style="margin-top:.4rem">Arraste os cartões entre as colunas para mudar o status.</p>`;
      } else {
        $('#list', root).innerHTML = table([
          { label: 'Empresa', render: (l) => `<strong>${esc(l.company)}</strong><span class="sub">${esc([l.name, l.segment, l.city].filter(Boolean).join(' · '))}</span>` },
          { label: 'Contato', render: (l) => `<span class="mono tiny">${esc(l.whatsapp || l.phone || '')}</span><span class="sub">${esc(l.instagram || l.email || '')}</span>` },
          { label: 'Potencial', render: (l) => potStars(l.potential) },
          { label: 'Score', cls: 'num', render: (l) => l.score },
          { label: 'Status', render: (l) => badge(l.status) },
          { label: 'Follow-up', render: (l) => (l.next_action_at ? `<span class="badge ${CC.dueTone(daysUntil(l.next_action_at))}">${fmtDate(l.next_action_at)}</span>` : '—') },
          { label: 'Origem', render: (l) => `<span class="small">${label(l.source)}</span>` }
        ], list, { rowAttr: (l) => `class="clickable" data-lead="${l.id}"`, empty: 'Nenhum lead.' });
      }
      if (!keepFocus) { $('#tb', root).innerHTML = toolbar({ filters, sorts, state: st, counts }); bindToolbar($('#tb', root), st, draw); }
      st.visible = list;
    };

    root.innerHTML = `${pageHead('CRM', 'Leads', 'Cadastro manual e CSV (R$0). Lead → demo → mensagem → cliente, sem recadastrar nada.',
      `<a class="btn" href="#/mensagens">${icon('msg')}Modelos</a><button class="btn" data-import>${icon('upload')}Importar CSV</button><button class="btn" data-export>${icon('download')}Exportar CSV</button><button class="btn btn-primary" data-new>${icon('plus')}Novo lead</button>`)}
      <div class="segmented-tabs" style="margin-bottom:1rem"><a class="segmented-tab ${view === 'pipeline' ? 'active' : ''}" href="#/leads?v=pipeline">${icon('layout')}Pipeline</a><a class="segmented-tab ${view === 'lista' ? 'active' : ''}" href="#/leads?v=lista">${icon('menu')}Lista</a></div>
      <section class="panel panel-pad"><div id="tb"></div><div id="list"></div></section>`;
    draw();

    root.addEventListener('click', (e) => { const c = e.target.closest('[data-lead]'); if (c) openLead(rows.find((l) => l.id === c.dataset.lead), projects); });
    // drag and drop entre etapas
    root.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-lead]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.lead); });
    root.addEventListener('dragover', (e) => { const col = e.target.closest('[data-stage]'); if (col) { e.preventDefault(); col.classList.add('drop'); } });
    root.addEventListener('dragleave', (e) => { const col = e.target.closest('[data-stage]'); if (col) col.classList.remove('drop'); });
    root.addEventListener('drop', async (e) => {
      const col = e.target.closest('[data-stage]'); if (!col) return;
      e.preventDefault(); col.classList.remove('drop');
      const lead = rows.find((l) => l.id === e.dataTransfer.getData('text/plain'));
      const to = col.dataset.stage;
      if (!lead || lead.status === to) return;
      try {
        if (to === 'CLIENTE') return convertLead(lead);
        await api.update('leads', lead.id, { status: to, ...(to === 'CONTATADO' ? { last_contact_at: new Date().toISOString() } : {}) });
        await api.insert('lead_activities', { lead_id: lead.id, type: 'STATUS', content: `${label(lead.status)} → ${label(to)}` });
        lead.status = to; draw(true); CC.toast(`${lead.company}: ${label(to)}`);
      } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
    });
    $('[data-new]', root).onclick = () => CC.actions.editLead();
    $('[data-import]', root).onclick = () => importLeads(rows);
    $('[data-export]', root).onclick = () => csv.download(`leads-${todayISO()}.csv`, csv.stringify(st.visible, [
      { key: 'company', label: 'Empresa' }, { key: 'name', label: 'Nome' }, { key: 'segment', label: 'Segmento' }, { key: 'city', label: 'Cidade' },
      { key: 'phone', label: 'Telefone' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'email', label: 'Email' }, { key: 'instagram', label: 'Instagram' },
      { key: 'website', label: 'Site' }, { key: 'status', label: 'Status' }, { key: 'score', label: 'Score' }, { key: 'source', label: 'Origem' },
      { key: 'next_action_at', label: 'Follow-up' }, { key: 'notes', label: 'Observações' }, { key: 'created_at', label: 'Cadastro' }]));
    if (r.query.id) { const l = rows.find((x) => x.id === r.query.id); if (l) openLead(l, projects); }
  };

  // ------------------------------------------------------------------ Detalhe do lead
  async function openLead(lead, projects) {
    const [acts, templates] = await Promise.all([
      api.list('lead_activities', { filters: [['eq', 'lead_id', lead.id]], order: 'created_at', asc: false, limit: 50 }),
      api.list('message_templates', { filters: [['eq', 'active', true]], order: 'name' })
    ]);
    const demo = projects.find((p) => p.id === lead.demo_project_id);
    const body = `
      <div class="row" style="margin-bottom:1rem">${badge(lead.status)}<span class="badge blue">score ${lead.score}</span>${lead.next_action_at ? `<span class="badge ${CC.dueTone(daysUntil(lead.next_action_at))}">follow-up ${fmtDate(lead.next_action_at)}</span>` : ''}
        <span class="spacer"></span><button class="btn btn-sm" data-edit>${icon('edit')}Editar</button>${lead.client_id ? `<a class="btn btn-sm btn-primary" href="#/clientes/${lead.client_id}">${icon('user')}Abrir cliente</a>` : `<button class="btn btn-sm btn-primary" data-convert>${icon('check')}Converter em cliente</button>`}</div>
      <div class="grid-2">
        <div class="info-card"><h3>Contato</h3><dl class="kv">
          <dt>Contato</dt><dd>${esc(lead.name || '—')}</dd><dt>Segmento</dt><dd>${esc(lead.segment || '—')}</dd><dt>Cidade</dt><dd>${esc(lead.city || '—')}</dd>
          <dt>WhatsApp</dt><dd>${esc(lead.whatsapp || '—')}</dd><dt>Telefone</dt><dd>${esc(lead.phone || '—')}</dd><dt>E-mail</dt><dd>${esc(lead.email || '—')}</dd>
          <dt>Instagram</dt><dd>${esc(lead.instagram || '—')}</dd><dt>Site atual</dt><dd>${esc(lead.website || 'não tem')}</dd>
          ${lead.notes ? `<dt>Notas</dt><dd class="pre small">${esc(lead.notes)}</dd>` : ''}</dl></div>
        <div class="info-card"><h3>Demo</h3>
          ${demo ? `<p class="small"><strong>${esc(demo.name)}</strong> ${badge(demo.status)}<br><a href="${esc(CC.demoUrl(demo.slug))}" target="_blank" rel="noopener">${esc(CC.demoUrl(demo.slug))}</a></p>
            <div class="row"><a class="btn btn-sm" href="#/projetos/${demo.id}?tab=conteudo">${icon('edit')}Editar demo</a><a class="btn btn-sm" href="${CC.previewUrl(demo.slug)}" target="_blank">${icon('eye')}Ver</a></div>`
          : `<p class="small muted">Crie uma demonstração com o nome e WhatsApp do lead já preenchidos.</p><button class="btn btn-sm btn-primary" data-demo>${icon('rocket')}Criar demo</button>`}
          <h3 style="margin-top:1.2rem">Mensagem</h3>
          <select class="cc-select" data-tpl>${templates.map((t) => `<option value="${t.id}">${esc(t.name)} (${label(t.channel)})</option>`).join('')}</select>
          <textarea class="field" data-msg rows="6" style="margin-top:.5rem"></textarea>
          <div class="row" style="margin-top:.5rem"><button class="btn btn-sm btn-primary" data-send>${icon('msg')}Abrir WhatsApp</button><button class="btn btn-sm" data-copy>${icon('copy')}Copiar</button></div>
          <p class="tiny muted" style="margin-top:.4rem">Envio manual (sem API paga). O contato fica registrado no histórico.</p>
        </div>
      </div>
      <div class="info-card" style="margin-top:1rem"><h3>Atividades</h3>
        <div class="row"><input class="field" data-note placeholder="Adicionar nota, ligação..." style="flex:1"><select class="cc-select" data-note-type style="width:auto">${CC.optionHtml([['NOTA', 'Nota'], ['LIGACAO', 'Ligação']], 'NOTA')}</select><input class="field" type="date" data-next style="width:auto" title="Próximo follow-up" value="${esc(lead.next_action_at || '')}"><button class="btn btn-sm" data-add-note>${icon('plus')}Salvar</button></div>
        <div class="timeline" style="margin-top:.8rem">${acts.map((a) => `<div class="tl"><time>${fmtDateTime(a.created_at)}</time><span class="badge blue" style="border:0;padding:0">${icon(a.type === 'MENSAGEM' ? 'msg' : a.type === 'LIGACAO' ? 'phone' : a.type === 'DEMO' ? 'rocket' : a.type === 'CONVERSAO' ? 'check' : 'edit')}</span><span class="small">${esc(a.content || label(a.type))}</span></div>`).join('') || '<span class="muted small">Sem atividades.</span>'}</div>
      </div>`;
    CC.modal({
      title: lead.company, wide: true, body, actions: [{ label: 'Excluir lead', danger: true, handler: async () => { if (await CC.actions.remove('leads', lead, 'este lead')) return true; return false; } }, { label: 'Fechar', value: null }],
      onOpen: (el, close) => {
        const tplSel = $('[data-tpl]', el); const msg = $('[data-msg]', el);
        const renderMsg = () => { const t = templates.find((x) => x.id === tplSel.value); msg.value = t ? CC.providers.get('message').render(t.body, leadVars(lead, demo)) : ''; };
        renderMsg(); tplSel.onchange = renderMsg;
        $('[data-copy]', el).onclick = async () => { try { await navigator.clipboard.writeText(msg.value); CC.toast('Mensagem copiada.'); } catch (e) { CC.toast('Não foi possível copiar.', 'error'); } };
        $('[data-send]', el).onclick = async () => {
          try {
            const t = templates.find((x) => x.id === tplSel.value);
            const provider = t?.channel === 'EMAIL' ? CC.providers.get('message', 'email_manual') : CC.providers.get('message');
            await provider.send({ to: t?.channel === 'EMAIL' ? lead.email : (lead.whatsapp || lead.phone), text: msg.value, subject: t?.subject });
            const patch = { last_contact_at: new Date().toISOString() };
            if (lead.status === 'LEAD') patch.status = 'CONTATADO';
            if (demo && msg.value.includes(CC.demoUrl(demo.slug)) && ['LEAD', 'CONTATADO', 'RESPONDEU'].includes(lead.status)) patch.status = 'DEMO_ENVIADA';
            if (!lead.next_action_at || daysUntil(lead.next_action_at) <= 0) patch.next_action_at = addDays(todayISO(), 3);
            await api.update('leads', lead.id, patch);
            await api.insert('lead_activities', { lead_id: lead.id, type: 'MENSAGEM', content: `Mensagem "${t?.name || 'livre'}" aberta no ${t?.channel === 'EMAIL' ? 'e-mail' : 'WhatsApp'}${patch.status ? ` · status ${label(patch.status)}` : ''}` });
            CC.toast('Contato registrado. Follow-up em 3 dias.');
          } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
        };
        $('[data-edit]', el).onclick = () => { close(null); CC.actions.editLead(lead); };
        const conv = $('[data-convert]', el); if (conv) conv.onclick = () => { close(null); convertLead(lead); };
        const dm = $('[data-demo]', el);
        if (dm) dm.onclick = async () => {
          close(null);
          const tpl = await guessTemplate(lead.segment);
          await CC.actions.newProject({
            name: lead.company, slug: CC.slugify(lead.company), status: 'DEMO', whatsapp: lead.whatsapp || lead.phone, city: lead.city, template_id: tpl?.id,
            contentPatch: { email: lead.email, instagram: lead.instagram },
            onCreated: async (project) => {
              await api.update('leads', lead.id, { demo_project_id: project.id });
              await api.insert('lead_activities', { lead_id: lead.id, type: 'DEMO', content: `Demo criada: ${CC.demoUrl(project.slug)}` });
              CC.toast('Demo criada e vinculada ao lead.');
              CC.router.go(`#/projetos/${project.id}?tab=conteudo`);
            }
          });
        };
        $('[data-add-note]', el).onclick = async (e) => CC.busy(e.currentTarget, async () => {
          const content = $('[data-note]', el).value.trim(); const next = $('[data-next]', el).value || null;
          if (content) await api.insert('lead_activities', { lead_id: lead.id, type: $('[data-note-type]', el).value, content });
          if (next !== (lead.next_action_at || null)) await api.update('leads', lead.id, { next_action_at: next });
          close(null); CC.toast('Atividade salva.'); CC.router.render();
        }).catch((err) => CC.toast(CC.errMsg(err), 'error'));
      }
    });
  }

  async function guessTemplate(segment) {
    await CC.loadLookups(['templates']);
    const s = CC.slugify(segment || '');
    return CC.lookups.templates.find((t) => s && (CC.slugify(t.segment).includes(s.split('-')[0]) || s.includes(CC.slugify(t.segment).split('-')[0])));
  }

  async function convertLead(lead) {
    const ok = await CC.confirmDialog(`Converter "${lead.company}" em cliente? Os dados do lead e a demo serão aproveitados.`, { okLabel: 'Converter' });
    if (!ok) return;
    try {
      const clientId = await api.rpc('cc_convert_lead', { p_lead_id: lead.id });
      CC.toast('Lead convertido em cliente. Agora cadastre domínio, hospedagem e cobranças.');
      CC.router.go(`#/clientes/${clientId}`);
    } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
  }

  // ================================================================== MENSAGENS
  CC.routes.mensagens = async (root) => {
    const rows = await api.list('message_templates', { order: 'name' });
    root.innerHTML = `${pageHead('CRM', 'Modelos de mensagem', 'Variáveis: <code>{{nome}}</code> <code>{{empresa}}</code> <code>{{segmento}}</code> <code>{{cidade}}</code> <code>{{demo_url}}</code>',
      `<a class="btn" href="#/leads">${icon('target')}Leads</a><button class="btn btn-primary" data-new>${icon('plus')}Novo modelo</button>`)}
      <section class="panel panel-pad">${table([
        { label: 'Nome', render: (t) => `<strong>${esc(t.name)}</strong><span class="sub">${esc(t.body.slice(0, 90))}…</span>` },
        { label: 'Canal', render: (t) => label(t.channel) }, { label: 'Ativo', render: (t) => (t.active ? badge('ATIVO') : badge('INATIVO')) },
        { label: '', render: (t) => `<div class="actions"><button class="icon-btn" data-edit="${t.id}">${icon('edit')}</button><button class="icon-btn danger" data-del="${t.id}">${icon('trash')}</button></div>` }
      ], rows, { empty: 'Nenhum modelo.' })}</section>`;
    $('[data-new]', root).onclick = () => CC.actions.editMessageTemplate();
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) CC.actions.editMessageTemplate(rows.find((t) => t.id === b.dataset.edit));
      if (b.dataset.del) CC.actions.remove('message_templates', rows.find((t) => t.id === b.dataset.del), 'este modelo');
    });
  };

  // ================================================================== IMPORTACAO CSV (com validacao antes de gravar)
  const importPreview = async ({ title, items, columns, onImport }) => {
    const valid = items.filter((i) => !i.errors.length);
    const invalid = items.filter((i) => i.errors.length);
    const body = `<div class="grid-3" style="grid-template-columns:repeat(3,1fr);margin-bottom:1rem">
        <div class="metric"><strong>${items.length}</strong><span>registros encontrados</span></div>
        <div class="metric"><strong style="color:var(--green)">${valid.length}</strong><span>válidos</span></div>
        <div class="metric"><strong style="color:var(--orange)">${invalid.length}</strong><span>com erro</span></div></div>
      ${table([{ label: 'Linha', render: (i) => i.line }, ...columns, { label: 'Validação', render: (i) => (i.errors.length ? `<span class="badge red">${esc(i.errors.join('; '))}</span>` : '<span class="badge green">ok</span>') }], items.slice(0, 200), { empty: 'Arquivo vazio.' })}
      ${items.length > 200 ? `<p class="tiny muted">Mostrando 200 de ${items.length}.</p>` : ''}`;
    return CC.modal({
      title, wide: true, body,
      actions: [{ label: 'Cancelar', value: null }, { label: `Importar ${valid.length} válidos`, primary: true, handler: async () => { if (!valid.length) { CC.toast('Nenhum registro válido.', 'error'); return false; } return onImport(valid.map((i) => i.data)); } }]
    });
  };
  const checkCommon = (d) => {
    const e = [];
    ['email'].forEach((k) => { if (d[k] && CC.VALIDATORS.email(d[k]) !== true) e.push('e-mail inválido'); });
    ['phone', 'whatsapp'].forEach((k) => { if (d[k] && CC.VALIDATORS.phone(d[k]) !== true) e.push(`${k === 'phone' ? 'telefone' : 'WhatsApp'} inválido`); });
    return e;
  };

  async function importLeads(existing) {
    const text = await csv.pickFile(); if (text === null) return;
    const provider = CC.providers.get('lead', 'csv');
    const parsed = await provider.fetch(text);
    const seen = new Set(existing.map((l) => CC.digits(l.whatsapp || l.phone) || `${(l.company || '').toLowerCase()}|${(l.city || '').toLowerCase()}`));
    const items = parsed.map((d, i) => {
      const errors = [];
      if (!d.company && d.name) d.company = d.name;
      if (!d.company) errors.push('empresa obrigatória');
      errors.push(...checkCommon(d));
      const key = CC.digits(d.whatsapp || d.phone) || `${(d.company || '').toLowerCase()}|${(d.city || '').toLowerCase()}`;
      if (d.company && seen.has(key)) errors.push('duplicado'); else seen.add(key);
      const flags = CC.autoFlags(d);
      return { line: i + 2, errors, data: { company: d.company, name: d.name || null, segment: d.segment || null, city: d.city || null, phone: d.phone || null, whatsapp: d.whatsapp || null, email: d.email || null, instagram: d.instagram || null, website: d.website || null, notes: d.notes || null, source: 'CSV', status: 'LEAD', score_flags: flags, score: CC.leadScore(flags) } };
    });
    const done = await importPreview({
      title: 'Importar leads (CSV)', items,
      columns: [{ label: 'Empresa', render: (i) => esc(i.data.company || '') }, { label: 'Cidade', render: (i) => esc(i.data.city || '') }, { label: 'WhatsApp', render: (i) => esc(i.data.whatsapp || i.data.phone || '') }],
      onImport: async (rows) => { for (let i = 0; i < rows.length; i += 500) await api.insertMany('leads', rows.slice(i, i + 500)); return rows.length; }
    });
    if (done) { CC.toast(`${done} leads importados.`); CC.router.render(); }
  }

  CC.importClientsCsv = async () => {
    const text = await csv.pickFile(); if (text === null) return;
    const existing = await api.list('clients', { select: 'name,document,email' });
    const docs = new Set(existing.map((c) => c.document).filter(Boolean));
    const parsed = CC.csv.parse(text).records.map(CC.providers.get('lead', 'csv').mapRecord);
    const items = parsed.map((d, i) => {
      const errors = [];
      const name = d.name || d.company;
      if (!name) errors.push('nome obrigatório');
      errors.push(...checkCommon(d));
      const doc = CC.digits(d.document);
      if (doc && CC.VALIDATORS.document(doc) !== true) errors.push('CPF/CNPJ inválido');
      if (doc && docs.has(doc)) errors.push('CPF/CNPJ já cadastrado'); else if (doc) docs.add(doc);
      return { line: i + 2, errors, data: { name, company: d.company || null, document: doc || null, phone: d.phone || null, whatsapp: d.whatsapp || null, email: d.email || null, address: d.address || null, city: d.city || null, notes: d.notes || null, status: 'ATIVO' } };
    });
    const done = await importPreview({
      title: 'Importar clientes (CSV)', items,
      columns: [{ label: 'Nome', render: (i) => esc(i.data.name || '') }, { label: 'Empresa', render: (i) => esc(i.data.company || '') }, { label: 'E-mail', render: (i) => esc(i.data.email || '') }],
      onImport: async (rows) => { for (let i = 0; i < rows.length; i += 500) await api.insertMany('clients', rows.slice(i, i + 500)); return rows.length; }
    });
    if (done) { CC.toast(`${done} clientes importados.`); CC.router.render(); }
  };

  // ================================================================== PROSPECCAO (agente diario + CRM)
  const potStars = (n) => (n ? `<span class="pot" title="Potencial ${n} de 5" aria-label="Potencial ${n} de 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>` : '<span class="muted small">—</span>');
  const bought = (s) => (s === 'CLIENTE' ? '<span class="badge green">Sim</span>' : s === 'PERDIDO' ? '<span class="badge gray">Não</span>' : s === 'LEAD' ? '<span class="muted small">—</span>' : '<span class="badge yellow">Em negociação</span>');
  const lines = (v) => String(v || '').split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  const PROFILE_FIELDS = [
    { name: 'key', label: 'Chave', required: true, validate: 'slug', lower: true, hint: 'Identificador, ex.: academias' },
    { name: 'name', label: 'Nome', required: true },
    { name: 'segment', label: 'Segmento (vai para o lead)', required: true },
    { name: 'region', label: 'Região', required: true, full: true },
    { name: 'daily_min', label: 'Meta mínima por dia', type: 'number', min: 0, required: true },
    { name: 'daily_max', label: 'Meta máxima por dia', type: 'number', min: 0, required: true },
    { name: 'priority', label: 'Ordem de execução', type: 'number', min: 0 },
    { name: 'active', label: 'Ativo (o agente diário executa)', type: 'checkbox' },
    { name: 'search_terms', label: 'Termos de busca no Google Maps (um por linha)', type: 'textarea', rows: 3, full: true },
    { name: 'exclude_brands', label: 'Redes/franquias a descartar (uma por linha)', type: 'textarea', rows: 3, full: true },
    { name: 'filters', label: 'Filtros automáticos (JSON)', type: 'json', rows: 5, full: true, hint: 'min_reviews, max_reviews, require_mobile, require_no_website, exclude_closed' },
    { name: 'rules', label: 'Critérios de aprovação e descarte', type: 'textarea', rows: 7, full: true },
    { name: 'tags', label: 'Tags aplicadas aos leads (uma por linha)', type: 'textarea', rows: 2, full: true }
  ];
  const editProfile = async (row) => {
    const values = row ? { ...row, search_terms: (row.search_terms || []).join('\n'), exclude_brands: (row.exclude_brands || []).join('\n'), tags: (row.tags || []).join('\n') }
      : { daily_min: 20, daily_max: 30, priority: 100, active: false, filters: { require_no_website: true, exclude_closed: true } };
    return CC.formModal({
      title: row ? `Perfil: ${row.name}` : 'Novo perfil de prospecção', wide: true,
      fields: row ? PROFILE_FIELDS.map((f) => (f.name === 'key' ? { ...f, readonly: true } : f)) : PROFILE_FIELDS, values,
      onSubmit: async (v) => {
        if (Number(v.daily_max) < Number(v.daily_min)) throw new Error('A meta máxima precisa ser maior ou igual à mínima.');
        const rec = { ...v, search_terms: lines(v.search_terms), exclude_brands: lines(v.exclude_brands), tags: lines(v.tags), priority: v.priority ?? 100, updated_at: new Date().toISOString() };
        if (row) { delete rec.key; return CC.ctx.supabase.from('prospect_profiles').update(rec).eq('key', row.key).select().single().then(({ data, error }) => { if (error) throw error; return data; }); }
        return api.insert('prospect_profiles', rec);
      }
    });
  };

  CC.routes.prospeccao = async (root, r) => {
    const [profiles, leads, runs, cityLog, sumRows, projects] = await Promise.all([
      api.list('prospect_profiles', { order: 'priority' }),
      api.list('leads', { filters: [['not', 'profile_key', 'is', null]], order: 'prospected_at', asc: false, limit: 5000 }),
      api.list('prospect_runs', { order: 'started_at', asc: false, limit: 30 }),
      api.list('prospect_city_log', { order: 'run_date', asc: false, limit: 1000 }),
      api.list('prospect_commercial_summary', { limit: 1 }),
      api.list('projects', { select: 'id,name,slug,status' })
    ]);
    const sum = sumRows[0] || {};
    const today = todayISO();
    const st = { filter: r.query.f || 'prioridade', sort: 'potential', q: '', profile: r.query.p || '' };
    const byProfile = (l) => !st.profile || l.profile_key === st.profile;
    const filters = [['prioridade', 'Potencial 4-5'], ['hoje', 'Adicionados hoje'], ['nao', 'Não contatados'], ['negociando', 'Em negociação'], ['clientes', 'Clientes'], ['todos', 'Todos']];
    const pred = (k) => (l) => (k === 'todos' ? true : k === 'prioridade' ? l.potential >= 4 && !['CLIENTE', 'PERDIDO'].includes(l.status)
      : k === 'hoje' ? l.prospected_at === today : k === 'nao' ? l.status === 'LEAD' : k === 'clientes' ? l.status === 'CLIENTE' : !['LEAD', 'CLIENTE', 'PERDIDO'].includes(l.status));
    const sorts = [['potential', 'Maior potencial'], ['reviews', 'Mais avaliações'], ['newest', 'Mais recente'], ['name', 'Empresa'], ['state', 'Estado']];
    const sorter = {
      potential: (a, b) => (b.potential || 0) - (a.potential || 0) || (b.google_reviews || 0) - (a.google_reviews || 0),
      reviews: SORTERS.num('google_reviews', -1), newest: SORTERS.date('prospected_at', -1), name: SORTERS.name('company'),
      state: (a, b) => String(a.state || '').localeCompare(String(b.state || '')) || String(a.city || '').localeCompare(String(b.city || ''))
    };
    const counts = Object.fromEntries(filters.map(([k]) => [k, leads.filter(byProfile).filter(pred(k)).length]));
    const hi = (n) => leads.filter((l) => l.potential === n).length;

    // Controle de cidades: agrega o log das execucoes
    const cityAgg = Object.values(cityLog.reduce((m, c) => {
      const k = `${c.profile_key}|${c.state}|${(c.city || '').toLowerCase()}`;
      m[k] = m[k] || { profile_key: c.profile_key, city: c.city, state: c.state, times: 0, added: 0, last: c.run_date };
      m[k].times += 1; m[k].added += c.added; if (c.run_date > m[k].last) m[k].last = c.run_date;
      return m;
    }, {})).sort((a, b) => (a.last < b.last ? 1 : -1));
    const states = [...new Set(leads.map((l) => l.state).filter(Boolean))].sort();
    const profName = (k) => profiles.find((p) => p.key === k)?.name || k;

    const draw = (keepFocus) => {
      const list = leads.filter(byProfile).filter(pred(st.filter)).filter((l) => matchQ(l, st.q, ['company', 'name', 'city', 'state', 'phone', 'whatsapp', 'instagram'])).sort(sorter[st.sort]);
      $('#p-list', root).innerHTML = table([
        { label: 'Empresa', render: (l) => `<strong>${esc(l.company)}</strong><span class="sub">${esc([l.city, l.state].filter(Boolean).join(' - '))}${st.profile ? '' : ` · ${esc(profName(l.profile_key))}`}</span>` },
        { label: 'Contato', render: (l) => { const n = l.whatsapp || l.phone; return `${n ? `<a class="mono tiny" href="${esc(CC.waLink(n))}" target="_blank" rel="noopener" data-stop>${esc(n)}</a>` : '—'}${l.instagram ? `<span class="sub"><a href="https://instagram.com/${esc(String(l.instagram).replace(/^@/, ''))}" target="_blank" rel="noopener" data-stop>${esc(l.instagram)}</a></span>` : ''}`; } },
        { label: 'Google', render: (l) => `<span class="mono tiny" style="white-space:nowrap">${l.google_rating != null ? String(l.google_rating).replace('.', ',') : '—'} ★ · ${l.google_reviews ?? '—'}</span>${l.maps_url ? `<span class="sub"><a href="${esc(CC.safeUrl(l.maps_url))}" target="_blank" rel="noopener" data-stop>abrir no Maps</a></span>` : ''}` },
        { label: 'Potencial', render: (l) => potStars(l.potential) },
        { label: 'Negociação', render: (l) => `${badge(l.status)}<span class="sub">Comprou? ${l.status === 'CLIENTE' ? 'Sim' : l.status === 'PERDIDO' ? 'Não' : l.status === 'LEAD' ? '—' : 'Em negociação'}</span>` },
        { label: 'Venda', cls: 'num', render: (l) => (l.sale_value ? `<strong style="white-space:nowrap">${esc(CC.money(l.sale_value))}</strong>` : '<span class="muted small">—</span>') }
      ], list, { rowAttr: (l) => `class="clickable" data-lead="${l.id}"`, empty: 'Nenhum lead nesse filtro. O agente diário adiciona os novos aqui.' });
      if (!keepFocus) {
        $('#p-tb', root).innerHTML = toolbar({ filters, sorts, state: st, counts, extra: `<select class="cc-select" data-prof><option value="">Todos os perfis</option>${profiles.map((p) => `<option value="${esc(p.key)}" ${st.profile === p.key ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` });
        bindToolbar($('#p-tb', root), st, draw);
        $('[data-prof]', root).onchange = (e) => { st.profile = e.target.value; CC.router.setQuery({ p: st.profile || null }); draw(); };
      }
      st.visible = list;
    };

    const runBadge = (s) => ({ CONCLUIDA: 'green', PARCIAL: 'yellow', FALHOU: 'red', EM_ANDAMENTO: 'blue' }[s] || 'gray');
    root.innerHTML = `${pageHead('CRM', 'Prospecção', 'Agente diário que encontra empresas no Google Maps, confere se têm site, dá nota de potencial e cadastra no CRM sem duplicar.',
      `<button class="btn" data-export>${icon('download')}Exportar CSV</button><button class="btn btn-primary" data-new-profile>${icon('plus')}Novo perfil</button>`)}
      <div class="grid-3" style="margin-bottom:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))">
        <div class="metric"><strong>${esc(CC.money(sum.total_vendas || 0))}</strong><span>Total de vendas</span></div>
        <div class="metric"><strong>${sum.total_clientes || 0}</strong><span>Total de clientes</span></div>
        <div class="metric"><strong>${leads.length}</strong><span>Leads prospectados</span></div>
        <div class="metric"><strong>${leads.filter((l) => l.prospected_at === today).length}</strong><span>Adicionados hoje</span></div>
        <div class="metric"><strong style="color:var(--orange)">${hi(5)} · ${hi(4)}</strong><span>Potencial 5 · 4</span></div>
      </div>
      <section class="panel" style="margin-bottom:1rem"><div class="panel-head"><h2 class="block-title">Perfis (nichos)</h2><span class="tiny muted">O agente executa os perfis ativos todo dia às 10:00.</span></div>
        <div class="panel-body grid-3">${profiles.map((p) => {
          const last = runs.find((x) => x.profile_key === p.key);
          const f = p.filters || {};
          return `<article class="card" style="padding:1rem;border:1px solid var(--line);border-radius:8px">
            <strong style="display:block;font-size:var(--fs-md)">${esc(p.name)}</strong>
            <label class="check tiny" style="margin-top:.35rem"><input type="checkbox" data-toggle-profile="${esc(p.key)}" ${p.active ? 'checked' : ''}> ${p.active ? 'ativo no agente diário' : 'pausado'}</label>
            <div class="small muted" style="margin:.35rem 0">${esc(p.region)}</div>
            <div class="tiny mono muted">meta ${p.daily_min}–${p.daily_max}/dia · ${leads.filter((l) => l.profile_key === p.key).length} leads${f.require_no_website ? ' · sem site' : ''}${f.require_mobile ? ' · só celular' : ''}${f.min_reviews || f.max_reviews ? ` · ${f.min_reviews || 0}–${f.max_reviews || '∞'} aval.` : ''}</div>
            <div class="tiny muted" style="margin:.45rem 0 .7rem">${last ? `Última execução ${fmtDate(last.run_date, { short: true })}: <span class="badge ${runBadge(last.status)}">${label(last.status)}</span> +${last.added}` : 'Ainda não executado'}</div>
            <div class="row"><button class="btn btn-sm" data-edit-profile="${esc(p.key)}">${icon('edit')}Editar critérios</button><a class="btn btn-sm" href="#/prospeccao?p=${encodeURIComponent(p.key)}&f=todos">Ver leads</a></div>
          </article>`; }).join('') || '<div class="notice">Rode <code>supabase/12_prospeccao.sql</code> para criar os perfis.</div>'}</div></section>
      <section class="panel panel-pad" style="margin-bottom:1rem"><div class="panel-head" style="padding:0 0 .6rem"><h2 class="block-title">Leads por prioridade comercial</h2></div><div id="p-tb"></div><div id="p-list"></div></section>
      <div class="grid-2">
        <section class="panel"><div class="panel-head"><h2 class="block-title">Controle de cidades</h2><span class="tiny muted">${states.length} estados · ${cityAgg.length} cidades</span></div>
          <div class="panel-body">${table([
            { label: 'Última data', render: (c) => `<span class="small">${fmtDate(c.last, { short: true })}</span>` },
            { label: 'Cidade', render: (c) => `<strong>${esc(c.city)}${c.state ? ` - ${esc(c.state)}` : ''}</strong><span class="sub">${esc(profName(c.profile_key))}</span>` },
            { label: 'Pesquisada', cls: 'num', render: (c) => `${c.times}×` },
            { label: 'Leads', cls: 'num', render: (c) => c.added }
          ], cityAgg.slice(0, 60), { empty: 'Nenhuma cidade pesquisada ainda.' })}</div></section>
        <section class="panel"><div class="panel-head"><h2 class="block-title">Execuções do agente</h2></div>
          <div class="panel-body">${table([
            { label: 'Data', render: (x) => `<span class="small">${fmtDate(x.run_date, { short: true })}</span><span class="sub">${esc(profName(x.profile_key))}</span>` },
            { label: 'Status', render: (x) => `<span class="badge ${runBadge(x.status)}">${label(x.status)}</span>` },
            { label: 'Novos', cls: 'num', render: (x) => `<strong>${x.added}</strong>` },
            { label: 'Duplic.', cls: 'num', render: (x) => x.duplicates },
            { label: 'Descart.', cls: 'num', render: (x) => x.discarded },
            { label: 'Observações', render: (x) => `<span class="small">${esc(x.errors || x.summary || '')}</span>` }
          ], runs, { empty: 'O agente ainda não executou.' })}</div></section>
      </div>`;
    draw();

    root.addEventListener('click', async (e) => {
      if (e.target.closest('[data-stop]')) return;
      const lead = e.target.closest('[data-lead]'); if (lead) return openLead(leads.find((l) => l.id === lead.dataset.lead), projects);
      const ed = e.target.closest('[data-edit-profile]');
      if (ed && await editProfile(profiles.find((p) => p.key === ed.dataset.editProfile))) { CC.toast('Perfil salvo.'); CC.router.render(); }
      if (e.target.closest('[data-new-profile]') && await editProfile(null)) { CC.toast('Perfil criado.'); CC.router.render(); }
      if (e.target.closest('[data-export]')) {
        const bought2 = (l) => (l.status === 'CLIENTE' ? 'Sim' : l.status === 'PERDIDO' ? 'Não' : l.status === 'LEAD' ? '' : 'Em negociação');
        csv.download(`prospeccao-${today}.csv`, csv.stringify(st.visible || [], [
          { label: 'Nome da Empresa', key: 'company' }, { label: 'Cidade', key: 'city' }, { label: 'Estado', key: 'state' },
          { label: 'Telefone/WhatsApp', value: (l) => l.whatsapp || l.phone || '' }, { label: 'Instagram', key: 'instagram' }, { label: 'Google Maps', key: 'maps_url' },
          { label: 'Avaliações Google', key: 'google_reviews' }, { label: 'Nota Google', value: (l) => (l.google_rating ?? '').toString().replace('.', ',') },
          { label: 'Potencial 1-5', key: 'potential' }, { label: 'Data de Prospecção', key: 'prospected_at' },
          { label: 'Negociação', value: (l) => label(l.status) }, { label: 'Comprou?', value: bought2 },
          { label: 'Valor da Venda', value: (l) => (l.sale_value ?? '').toString().replace('.', ',') }
        ]));
      }
    });
    root.addEventListener('change', async (e) => {
      const t = e.target.closest('[data-toggle-profile]'); if (!t) return;
      const { error } = await CC.ctx.supabase.from('prospect_profiles').update({ active: t.checked, updated_at: new Date().toISOString() }).eq('key', t.dataset.toggleProfile);
      if (error) { t.checked = !t.checked; CC.toast(error.message, 'error'); return; }
      t.parentElement.lastChild.textContent = t.checked ? ' ativo no agente diário' : ' pausado';
      CC.toast(t.checked ? 'Perfil ativado: o agente vai executar.' : 'Perfil pausado.');
    });
  };
})();
