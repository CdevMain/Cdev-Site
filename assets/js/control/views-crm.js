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
      <small>score ${l.score}${l.next_action_at ? ` · follow-up ${fmtDate(l.next_action_at, { short: true })}` : ''}${l.demo_project_id ? ' · demo' : ''}</small></div>`;

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
})();
