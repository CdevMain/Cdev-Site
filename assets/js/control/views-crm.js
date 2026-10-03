/* CDEV Control Center - CRM / Leads / Mensagens / Importacao CSV */
(function () {
  const CC = window.CC;
  const { $, $$, esc, icon, api, badge, label, fmtDate, fmtDateTime, relTime, daysUntil, table, toolbar, bindToolbar, matchQ, SORTERS, pageHead, csv, todayISO, addDays, debounce } = CC;
  const STAGES = ['LEAD', 'CONTATADO', 'RESPONDEU', 'DEMO_ENVIADA', 'NEGOCIACAO', 'CLIENTE', 'PERDIDO'];

  // ================================================================== LEADS
  const instaHandle = (v) => (v ? String(v).replace(/^@|https?:\/\/(www\.)?instagram\.com\//g, '').replace(/[/?].*$/, '') : '');
  const pkey = (v) => { let d = CC.digits(v || ''); if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2); return d; };
  const mobileOf = (l) => [l.whatsapp, l.phone].find((v) => /^[1-9][1-9]9\d{8}$/.test(pkey(v))) || '';

  // Card do pipeline: nicho colorido, estrelas coloridas, nota/avaliacoes, tags e acoes rapidas
  const leadCard = (l) => {
    const niche = CC.tags.niche(l);
    const mob = mobileOf(l); const tel = l.phone || l.whatsapp;
    const tags = (l.tags || []).filter((t) => t !== 'favorito');
    const fav = (l.tags || []).includes('favorito');
    const due = l.next_action_at ? daysUntil(l.next_action_at) : null;
    return `<div class="pipe-card ${fav ? 'is-fav' : ''}" draggable="true" data-lead="${l.id}" ${niche ? `style="--nc:${esc(CC.tags.color('NICHO', niche))}"` : ''}>
      <div class="pc-top"><strong>${esc(l.company)}</strong>${fav ? '<span class="pc-fav" title="Favorito">★</span>' : ''}</div>
      <div class="pc-meta">${niche ? CC.tags.chip('NICHO', niche, { small: true }) : ''}<small>${esc([l.city, l.state].filter(Boolean).join(' - '))}</small></div>
      <div class="pc-score">${l.potential ? CC.potStars(l.potential) : ''}${CC.googleBadge(l)}</div>
      ${tags.length ? `<div class="pc-tags">${tags.slice(0, 4).map((t) => CC.tags.chip('TAG', t, { small: true })).join('')}${tags.length > 4 ? `<span class="tiny muted">+${tags.length - 4}</span>` : ''}</div>` : ''}
      ${due != null || l.demo_project_id ? `<small class="pc-due">${due != null ? `<span class="${due < 0 ? 'late' : due === 0 ? 'today' : ''}">follow-up ${fmtDate(l.next_action_at, { short: true })}</span>` : ''}${l.demo_project_id ? ' · demo' : ''}</small>` : ''}
      <div class="pc-fast" data-fa-bar>
        ${mob ? `<button type="button" class="fa wa" data-wa-phone="${esc(mob)}" title="WhatsApp ${esc(CC.fmtPhone(mob))}">${icon('msg')}</button>` : ''}
        ${tel ? `<a class="fa" href="tel:+55${esc(pkey(tel))}" data-fa="call" title="Ligar ${esc(CC.fmtPhone(tel))}">${icon('phone')}</a><button type="button" class="fa" data-fa="copy" title="Copiar ${esc(CC.fmtPhone(tel))}">${icon('copy')}</button>` : ''}
        ${l.status !== 'CLIENTE' && l.status !== 'PERDIDO' ? `<button type="button" class="fa sent" data-fa="sent" title="Marcar mensagem como enviada (move para ${esc(label('CONTATADO'))})">${icon('check')}<span>Enviada</span></button>` : ''}
        <button type="button" class="fa" data-fa="tag" title="Tags">${icon('plus')}<span>Tag</span></button>
        <button type="button" class="fa ${fav ? 'on' : ''}" data-fa="fav" title="${fav ? 'Remover dos favoritos' : 'Favoritar'}">★</button>
      </div>
    </div>`;
  };

  // Acoes rapidas (compartilhadas pelo pipeline e pela tabela de prospeccao)
  CC.leadFastAction = async (btn, lead, { leads = [], redraw } = {}) => {
    const act = btn.dataset.fa;
    if (act === 'call') return false; // deixa o link tel: seguir
    if (act === 'copy') { try { await navigator.clipboard.writeText(CC.fmtPhone(lead.phone || lead.whatsapp)); CC.toast(`Telefone copiado: ${CC.fmtPhone(lead.phone || lead.whatsapp)}`); } catch (e) { CC.toast('Não foi possível copiar.', 'error'); } return true; }
    if (act === 'tag') { CC.openTagPicker(btn, lead, { leads, onChange: () => redraw && redraw() }); return true; }
    if (act === 'fav') { await CC.toggleLeadTag(lead, 'favorito'); if (redraw) redraw(); return true; }
    if (act === 'sent') {
      await CC.busy(btn, async () => {
        const prev = lead.status;
        const patch = await CC.markLeadMessageSent(lead);
        CC.toast(`${lead.company}: mensagem enviada${patch.status && patch.status !== prev ? ` · movido para ${label(patch.status)}` : ''}. Follow-up em 3 dias.`);
      });
      if (redraw) redraw();
      return true;
    }
    return false;
  };

  CC.routes.leads = async (root, r) => {
    const [rows, projects] = await Promise.all([
      api.list('leads', { order: 'created_at', asc: false, limit: 5000 }),
      api.list('projects', { select: 'id,name,slug,status' }),
      CC.tags.load(true)
    ]);
    const view = r.query.v || 'pipeline';
    const st = { filter: r.query.f || 'ativos', sort: 'score', q: '', niche: r.query.n || '', tag: r.query.t || '' };
    const filters = [['ativos', 'Em aberto'], ['todos', 'Todos'], ['followup', 'Follow-up hoje'], ...STAGES.map((s) => [s, label(s)])];
    const pred = (k) => (l) => (k === 'todos' ? true : k === 'ativos' ? !['CLIENTE', 'PERDIDO'].includes(l.status) : k === 'followup' ? l.next_action_at && daysUntil(l.next_action_at) <= 0 && !['CLIENTE', 'PERDIDO'].includes(l.status) : l.status === k);
    const sorts = [['score', 'Maior score'], ['potential', 'Maior potencial'], ['rating', 'Nota no Google'], ['reviews', 'Mais avaliações'], ['newest', 'Mais recente'], ['oldest', 'Mais antigo'], ['name', 'Empresa'], ['next', 'Próximo follow-up'], ['activity', 'Última atividade']];
    const sorter = {
      score: SORTERS.num('score', -1), newest: SORTERS.date('created_at', -1), oldest: SORTERS.date('created_at'), name: SORTERS.name('company'), next: SORTERS.date('next_action_at'), activity: SORTERS.date('updated_at', -1),
      potential: (a, b) => (b.potential || 0) - (a.potential || 0) || (b.google_reviews || 0) - (a.google_reviews || 0),
      rating: (a, b) => (Number(b.google_rating) || 0) - (Number(a.google_rating) || 0) || (b.google_reviews || 0) - (a.google_reviews || 0),
      reviews: (a, b) => (b.google_reviews || 0) - (a.google_reviews || 0)
    };
    const normT = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const extraOk = (l) => (!st.niche || normT(CC.tags.niche(l)) === normT(st.niche)) && (!st.tag || (l.tags || []).some((t) => normT(t) === normT(st.tag)));
    const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
    const extraBar = () => {
      const niches = CC.tags.list('NICHO', rows.map((l) => ({ segment: CC.tags.niche(l) })));
      const tagNames = CC.tags.list('TAG', rows);
      return `<select class="cc-select" data-lf="niche" title="Nicho">${opt('', 'Todos os nichos', st.niche)}${niches.map((n) => opt(n, `${n} (${rows.filter((l) => normT(CC.tags.niche(l)) === normT(n)).length})`, st.niche)).join('')}</select>
        <select class="cc-select" data-lf="tag" title="Tag">${opt('', 'Todas as tags', st.tag)}${tagNames.map((n) => opt(n, `#${n}`, st.tag)).join('')}</select>`;
    };

    const draw = (keepFocus) => {
      const base = rows.filter(extraOk).filter((l) => CC.leadSearch(l, st.q));
      const counts = Object.fromEntries(filters.map(([k]) => [k, base.filter(pred(k)).length]));
      const list = base.filter(pred(st.filter)).sort(sorter[st.sort] || sorter.score);
      if (view === 'pipeline') {
        const stages = st.filter === 'todos' ? STAGES : STAGES.filter((s) => list.some((l) => l.status === s) || !['CLIENTE', 'PERDIDO'].includes(s));
        $('#list', root).innerHTML = `<div class="pipeline">${stages.map((s) => `<div class="pipe-col" data-stage="${s}"><h4>${label(s)}<span>${list.filter((l) => l.status === s).length}</span></h4>${list.filter((l) => l.status === s).slice(0, 300).map(leadCard).join('')}</div>`).join('')}</div>
          <p class="tiny muted mono" style="margin-top:.4rem">Arraste os cartões entre as colunas. Ações rápidas no rodapé de cada cartão: WhatsApp, ligar, copiar, <b>Enviada</b> (move para ${esc(label('CONTATADO'))}), tags e favorito.</p>`;
      } else {
        $('#list', root).innerHTML = table([
          { label: 'Empresa', render: (l) => { const n = CC.tags.niche(l); return `<strong>${esc(l.company)}</strong><span class="sub">${esc([l.name, l.city].filter(Boolean).join(' · '))}</span><div class="pc-tags">${n ? CC.tags.chip('NICHO', n, { small: true }) : ''}${(l.tags || []).map((t) => CC.tags.chip('TAG', t, { small: true })).join('')}</div>`; } },
          { label: 'Contato', render: (l) => `<span class="mono tiny">${esc(l.whatsapp || l.phone || '')}</span><span class="sub">${esc(l.instagram || l.email || '')}</span>` },
          { label: 'Potencial', render: (l) => CC.potStars(l.potential) },
          { label: 'Google', render: (l) => CC.googleBadge(l) || '<span class="muted small">—</span>' },
          { label: 'Score', cls: 'num', render: (l) => l.score },
          { label: 'Status', render: (l) => badge(l.status) },
          { label: 'Follow-up', render: (l) => (l.next_action_at ? `<span class="badge ${CC.dueTone(daysUntil(l.next_action_at))}">${fmtDate(l.next_action_at)}</span>` : '—') },
          { label: 'Ações', render: (l) => `<div class="pc-fast inline">${mobileOf(l) ? `<button type="button" class="fa wa" data-wa-phone="${esc(mobileOf(l))}" title="WhatsApp">${icon('msg')}</button>` : ''}${!['CLIENTE', 'PERDIDO'].includes(l.status) ? `<button type="button" class="fa sent" data-fa="sent" data-fa-lead="${l.id}" title="Marcar mensagem como enviada">${icon('check')}<span>Enviada</span></button>` : ''}<button type="button" class="fa" data-fa="tag" data-fa-lead="${l.id}" title="Tags">${icon('plus')}<span>Tag</span></button></div>` }
        ], list, { rowAttr: (l) => `class="clickable" data-lead="${l.id}"`, empty: 'Nenhum lead.' });
      }
      if (!keepFocus) {
        $('#tb', root).innerHTML = toolbar({ filters, sorts, state: st, counts, extra: extraBar() });
        bindToolbar($('#tb', root), st, draw);
        const q = $('[data-q]', root); if (q) { q.placeholder = 'Buscar: nome, cidade, telefone, #tag, nicho:academia, ★4, nota:4.5'; q.style.minWidth = '19rem'; }
      } else {
        $$('#tb [data-filter]', root).forEach((b) => { const n = b.querySelector('.n'); if (n) n.textContent = counts[b.dataset.filter]; });
      }
      st.visible = list;
    };

    root.innerHTML = `${pageHead('CRM', 'Leads', 'Cadastro manual e CSV (R$0). Lead → demo → mensagem → cliente, sem recadastrar nada.',
      `<a class="btn" href="#/mensagens">${icon('msg')}Modelos</a><button class="btn" data-cats>${icon('layers')}Categorias e tags</button><button class="btn" data-import>${icon('upload')}Importar CSV</button><button class="btn" data-export>${icon('download')}Exportar CSV</button><button class="btn btn-primary" data-new>${icon('plus')}Novo lead</button>`)}
      <div class="segmented-tabs" style="margin-bottom:1rem"><a class="segmented-tab ${view === 'pipeline' ? 'active' : ''}" href="#/leads?v=pipeline">${icon('layout')}Pipeline</a><a class="segmented-tab ${view === 'lista' ? 'active' : ''}" href="#/leads?v=lista">${icon('menu')}Lista</a></div>
      <section class="panel panel-pad"><div id="tb"></div><div id="list"></div></section>`;
    draw();

    const redraw = () => draw(true);
    const onLeadChanged = (l) => { const i = rows.findIndex((x) => x.id === l.id); if (i >= 0) Object.assign(rows[i], l); redraw(); };
    root.addEventListener('change', (e) => { const s = e.target.closest('[data-lf]'); if (!s) return; st[s.dataset.lf] = s.value; CC.router.setQuery({ [s.dataset.lf === 'niche' ? 'n' : 't']: s.value }); draw(); });
    root.addEventListener('click', async (e) => {
      const fa = e.target.closest('[data-fa]');
      if (fa) {
        const host = fa.closest('[data-lead]'); const id = fa.dataset.faLead || host?.dataset.lead;
        const lead = rows.find((l) => l.id === id); if (!lead) return;
        if (fa.dataset.fa !== 'call') { e.preventDefault(); e.stopPropagation(); }
        try { await CC.leadFastAction(fa, lead, { leads: rows, redraw }); } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
        return;
      }
      if (e.target.closest('[data-fa-bar], a, select, input')) return;
      const c = e.target.closest('[data-lead]'); if (c) openLead(rows.find((l) => l.id === c.dataset.lead), projects, onLeadChanged);
    });
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
    $('[data-cats]', root).onclick = async () => { if (await CC.editCategories(rows)) CC.router.render(); };
    $('[data-import]', root).onclick = () => importLeads(rows);
    $('[data-export]', root).onclick = () => csv.download(`leads-${todayISO()}.csv`, csv.stringify(st.visible, [
      { key: 'company', label: 'Empresa' }, { key: 'name', label: 'Nome' }, { key: 'segment', label: 'Segmento' }, { key: 'city', label: 'Cidade' },
      { key: 'phone', label: 'Telefone' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'email', label: 'Email' }, { key: 'instagram', label: 'Instagram' },
      { key: 'website', label: 'Site' }, { key: 'status', label: 'Status' }, { key: 'score', label: 'Score' }, { key: 'source', label: 'Origem' },
      { label: 'Tags', value: (l) => (l.tags || []).join(', ') },
      { key: 'next_action_at', label: 'Follow-up' }, { key: 'notes', label: 'Observações' }, { key: 'created_at', label: 'Cadastro' }]));
    if (r.query.id) { const l = rows.find((x) => x.id === r.query.id); if (l) openLead(l, projects, onLeadChanged); }
  };

  // ------------------------------------------------------------------ Detalhe do lead
  async function openLead(lead, projects, onChange) {
    lead = (await api.get('leads', lead.id)) || lead; // dados completos e atuais
    const acts = await api.list('lead_activities', { filters: [['eq', 'lead_id', lead.id]], order: 'created_at', asc: false, limit: 50 });
    const demo = projects.find((p) => p.id === lead.demo_project_id);
    const dash = '<span class="muted">—</span>';
    const kv = (label, value, { copy = false, raw = value } = {}) => `<dt>${label}</dt><dd>${value ? `${value}${copy ? ` <button class="copy-btn" type="button" data-copy-value="${esc(raw)}" title="Copiar">${icon('copy')}</button>` : ''}` : dash}</dd>`;
    const TAX = { MEI: 'MEI', SIMPLES: 'Simples Nacional', PRESUMIDO: 'Lucro Presumido', REAL: 'Lucro Real', ISENTO: 'Isento', OUTRO: 'Outro' };
    const phoneMain = lead.whatsapp || lead.phone;
    const fullAddress = [[lead.address, lead.address_number].filter(Boolean).join(', '), lead.address_complement, lead.neighborhood, [lead.city, lead.state].filter(Boolean).join(' - '), lead.cep ? CC.fmtCep(lead.cep) : ''].filter(Boolean).join(' · ');
    const REQUIRED = [['document', 'CPF/CNPJ'], ['legal_name', 'Razão social'], ['name', 'Responsável'], ['whatsapp', 'Celular'], ['email', 'E-mail'], ['cep', 'CEP'], ['address', 'Endereço'], ['address_number', 'Número'], ['city', 'Cidade'], ['state', 'UF']];
    const missing = REQUIRED.filter(([k]) => !lead[k]);
    const done = REQUIRED.length - missing.length;
    const initials = String(lead.company || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const insta = lead.instagram ? String(lead.instagram).replace(/^@|https?:\/\/(www\.)?instagram\.com\//g, '').replace(/\/.*$/, '') : '';
    const pot = lead.potential ? CC.potStars(lead.potential) : '';
    await CC.tags.load();
    const niche = CC.tags.niche(lead);
    const tagBox = () => `${niche ? CC.tags.chip('NICHO', niche) : ''}${(lead.tags || []).map((t) => CC.tags.chip('TAG', t, { x: true })).join('')}<button type="button" class="tag-add" data-lp-tag>${icon('plus')}Tag</button>`;
    const body = `
      <div class="lead-profile">
        <header class="lp-head">
          <div class="lp-avatar-wrap">
            <div class="lp-avatar" data-avatar>${esc(initials)}</div>
            <label class="lp-avatar-btn" title="${lead.photo_path ? 'Trocar foto' : 'Adicionar foto'}">${icon('camera')}<input type="file" accept="image/jpeg,image/png,image/webp" data-photo hidden></label>
          </div>
          <div class="lp-main">
            <h2>${esc(lead.company)}</h2>
            <div class="lp-sub">${esc([lead.legal_name && lead.legal_name !== lead.company ? lead.legal_name : '', lead.document ? `${lead.document.length === 14 ? 'CNPJ' : 'CPF'} ${CC.fmtDoc(lead.document)}` : '', lead.segment].filter(Boolean).join(' · ') || 'Cadastro sem dados fiscais')}</div>
            <div class="row lp-badges">${badge(lead.status)}${pot}${CC.googleBadge(lead)}<span class="badge blue">score ${lead.score}</span>${lead.next_action_at ? `<span class="badge ${CC.dueTone(daysUntil(lead.next_action_at))}">follow-up ${fmtDate(lead.next_action_at)}</span>` : ''}${lead.sale_value ? `<span class="badge green">venda ${CC.money(lead.sale_value)}</span>` : ''}</div>
            <div class="lp-tags" data-lp-tags>${tagBox()}</div>
          </div>
          <div class="lp-actions"><button class="btn btn-sm" data-edit>${icon('edit')}Editar cadastro</button>${lead.client_id ? `<a class="btn btn-sm btn-primary" href="#/clientes/${lead.client_id}">${icon('user')}Abrir cliente</a>` : `<button class="btn btn-sm btn-primary" data-convert>${icon('check')}Converter em cliente</button>`}</div>
        </header>
        <nav class="lp-contacts">
          ${phoneMain ? `<button type="button" class="lp-contact" data-wa-phone="${esc(phoneMain)}">${icon('msg')}<span>WhatsApp<b>${esc(CC.fmtPhone(phoneMain))}</b></span></button>` : ''}
          ${lead.phone || lead.whatsapp ? `<a class="lp-contact" href="tel:+55${esc(CC.digits(lead.phone || lead.whatsapp).replace(/^55(?=\d{10,11}$)/, ''))}">${icon('phone')}<span>Ligar<b>${esc(CC.fmtPhone(lead.phone || lead.whatsapp))}</b></span></a>` : ''}
          ${lead.email ? `<a class="lp-contact" href="mailto:${esc(lead.email)}">${icon('mail')}<span>E-mail<b>${esc(lead.email)}</b></span></a>` : ''}
          ${insta ? `<a class="lp-contact" href="https://instagram.com/${esc(insta)}" target="_blank" rel="noopener">${icon('insta')}<span>Instagram<b>@${esc(insta)}</b></span></a>` : ''}
          ${lead.maps_url ? `<a class="lp-contact" href="${esc(CC.safeUrl(lead.maps_url))}" target="_blank" rel="noopener">${icon('pin')}<span>Google Maps<b>${lead.google_rating != null ? `${String(lead.google_rating).replace('.', ',')} ★ · ${lead.google_reviews ?? 0} aval.` : 'abrir perfil'}</b></span></a>` : ''}
        </nav>
        <div class="segmented-tabs lp-tabs" role="tablist">
          <button class="segmented-tab active" data-lp-tab="mensagem" role="tab">${icon('msg')}Mensagem</button>
          <button class="segmented-tab" data-lp-tab="resumo" role="tab">${icon('rocket')}Resumo</button>
          <button class="segmented-tab" data-lp-tab="cadastro" role="tab">${icon('idcard')}Cadastro <span class="lp-count ${missing.length ? 'warn' : 'ok'}">${done}/${REQUIRED.length}</span></button>
          <button class="segmented-tab" data-lp-tab="historico" role="tab">${icon('history')}Histórico <span class="lp-count">${acts.length}</span></button>
        </div>

        <section data-lp-panel="mensagem"><div data-lp-studio><p class="small muted">Carregando mensagens…</p></div></section>

        <section data-lp-panel="resumo" hidden>
          <div class="grid-2">
            <div class="info-card"><h3>${icon('rocket')}Demo</h3>
              ${demo ? `<p class="small"><strong>${esc(demo.name)}</strong> ${badge(demo.status)}<br><a href="${esc(CC.demoUrl(demo.slug))}" target="_blank" rel="noopener">${esc(CC.demoUrl(demo.slug))}</a></p>
                <div class="row"><a class="btn btn-sm" href="#/projetos/${demo.id}?tab=conteudo">${icon('edit')}Editar demo</a><a class="btn btn-sm" href="${CC.previewUrl(demo.slug)}" target="_blank">${icon('eye')}Ver</a></div>`
              : `<p class="small muted">Crie uma demonstração com o nome e WhatsApp do lead já preenchidos.</p><button class="btn btn-sm btn-primary" data-demo>${icon('rocket')}Criar demo</button>`}
              ${lead.notes ? `<h3 style="margin-top:1.1rem">${icon('edit')}Observações</h3><p class="small pre">${esc(lead.notes)}</p>` : ''}
            </div>
            <div class="info-card"><h3>${icon('msg')}Contato</h3>
              <p class="small muted">Mensagens de prospecção são geradas, editadas e enviadas pela aba <b>Mensagem</b>. Abrir o WhatsApp não conta como enviado: você confirma depois de enviar.</p>
              <div class="row" style="margin-top:.5rem"><button class="btn btn-sm btn-primary" data-goto-tab="mensagem">${icon('msg')}Ir para Mensagem</button></div>
              ${lead.last_contact_at ? `<p class="tiny muted" style="margin-top:.6rem">Último contato: ${fmtDateTime(lead.last_contact_at)}</p>` : ''}
            </div>
          </div>
        </section>

        <section data-lp-panel="cadastro" hidden>
          ${missing.length ? `<div class="lp-missing">${icon('alert')}<span>Faltam: ${missing.map(([, l]) => l).join(', ')}.</span><button class="btn btn-sm" data-edit>${icon('edit')}Completar</button></div>` : `<div class="lp-missing ok">${icon('check')}<span>Cadastro completo: pronto para contrato e nota fiscal.</span></div>`}
          <div class="grid-2">
            <div class="info-card"><h3>${icon('building')}Empresa e fiscal</h3><dl class="kv">
              ${kv('Tipo', lead.person_type === 'PJ' ? 'Pessoa jurídica' : lead.person_type === 'PF' ? 'Pessoa física' : '')}
              ${kv(lead.document && lead.document.length === 11 ? 'CPF' : 'CNPJ', lead.document ? esc(CC.fmtDoc(lead.document)) : '', { copy: true, raw: CC.fmtDoc(lead.document || '') })}
              ${kv('Razão social', esc(lead.legal_name || ''), { copy: true, raw: lead.legal_name || '' })}
              ${kv('Nome fantasia', esc(lead.company || ''))}
              ${kv('Atividade', esc(lead.main_activity || ''))}
              ${kv('Regime', TAX[lead.tax_regime] || '')}
              ${kv('Inscr. estadual', esc(lead.state_registration || ''), { copy: true, raw: lead.state_registration || '' })}
              ${kv('Inscr. municipal', esc(lead.municipal_registration || ''), { copy: true, raw: lead.municipal_registration || '' })}
            </dl></div>
            <div class="info-card"><h3>${icon('user')}Responsável e contato</h3><dl class="kv">
              ${kv('Responsável', esc([lead.name, lead.contact_role].filter(Boolean).join(' · ')))}
              ${kv('CPF', lead.contact_document ? esc(CC.fmtDoc(lead.contact_document)) : '', { copy: true, raw: CC.fmtDoc(lead.contact_document || '') })}
              ${kv('Celular', lead.whatsapp ? esc(CC.fmtPhone(lead.whatsapp)) : '', { copy: true, raw: CC.fmtPhone(lead.whatsapp || '') })}
              ${kv('Telefone', lead.phone ? esc(CC.fmtPhone(lead.phone)) : '', { copy: true, raw: CC.fmtPhone(lead.phone || '') })}
              ${kv('E-mail', esc(lead.email || ''), { copy: true, raw: lead.email || '' })}
              ${kv('E-mail financeiro', esc(lead.billing_email || ''), { copy: true, raw: lead.billing_email || '' })}
              ${kv('Instagram', insta ? `@${esc(insta)}` : '')}
              ${kv('Site atual', lead.website ? `<a href="${esc(CC.safeUrl(lead.website))}" target="_blank" rel="noopener">${esc(lead.website)}</a>` : '<span class="muted">não tem</span>')}
            </dl></div>
            <div class="info-card"><h3>${icon('pin')}Endereço</h3><dl class="kv">
              ${kv('CEP', lead.cep ? esc(CC.fmtCep(lead.cep)) : '')}
              ${kv('Logradouro', esc([lead.address, lead.address_number].filter(Boolean).join(', ')))}
              ${kv('Complemento', esc(lead.address_complement || ''))}
              ${kv('Bairro', esc(lead.neighborhood || ''))}
              ${kv('Cidade', esc([lead.city, lead.state].filter(Boolean).join(' - ')))}
            </dl>${fullAddress ? `<div class="row" style="margin-top:.6rem"><button class="btn btn-sm" type="button" data-copy-value="${esc(fullAddress)}">${icon('copy')}Copiar endereço</button><a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}">${icon('external')}Ver no mapa</a></div>` : ''}</div>
            <div class="info-card"><h3>${icon('star')}Prospecção</h3><dl class="kv">
              ${kv('Segmento', esc(lead.segment || ''))}
              ${kv('Potencial', pot)}
              ${kv('Google', lead.google_rating != null ? `${String(lead.google_rating).replace('.', ',')} ★ · ${lead.google_reviews ?? 0} avaliações` : '')}
              ${kv('Origem', `${label(lead.source)}${lead.prospected_at ? ` · ${fmtDate(lead.prospected_at)}` : ''}`)}
              ${kv('Criado em', fmtDate(lead.created_at))}
              ${kv('Último contato', lead.last_contact_at ? fmtDateTime(lead.last_contact_at) : '')}
            </dl></div>
          </div>
        </section>

        <section data-lp-panel="historico" hidden>
          <div class="info-card">
            <div class="row"><input class="field" data-note placeholder="Adicionar nota, ligação..." style="flex:1;min-width:12rem"><select class="cc-select" data-note-type style="width:auto">${CC.optionHtml([['NOTA', 'Nota'], ['LIGACAO', 'Ligação']], 'NOTA')}</select><input class="field" type="date" data-next style="width:auto" title="Próximo follow-up" value="${esc(lead.next_action_at || '')}"><button class="btn btn-sm" data-add-note>${icon('plus')}Salvar</button></div>
            <div class="timeline" style="margin-top:.8rem">${acts.map((a) => `<div class="tl"><time>${fmtDateTime(a.created_at)}</time><span class="badge blue" style="border:0;padding:0">${icon(a.type === 'MENSAGEM' ? 'msg' : a.type === 'LIGACAO' ? 'phone' : a.type === 'DEMO' ? 'rocket' : a.type === 'CONVERSAO' ? 'check' : 'edit')}</span><span class="small pre">${esc(a.content || label(a.type))}</span></div>`).join('') || '<span class="muted small">Sem atividades.</span>'}</div>
          </div>
        </section>
      </div>`;
    CC.modal({
      title: 'Perfil do lead', wide: true, body, actions: [{ label: 'Excluir lead', danger: true, handler: async () => { if (await CC.actions.remove('leads', lead, 'este lead')) return true; return false; } }, { label: 'Fechar', value: null }],
      onOpen: (el, close) => {
        const studio = $('[data-lp-studio]', el);
        CC.messageStudio.mount(studio, {
          lead, demoUrl: demo ? CC.demoUrl(demo.slug) : '',
          onLeadChanged: (l, opts = {}) => { if (opts.edit) { close(null); CC.actions.editLead(lead); return; } if (onChange) onChange(l); }
        }).catch((err) => { studio.innerHTML = `<p class="small" style="color:var(--red)">${esc(CC.errMsg(err))}</p>`; });
        $$('[data-edit]', el).forEach((b) => { b.onclick = () => { close(null); CC.actions.editLead(lead); }; });
        const tagsEl = $('[data-lp-tags]', el);
        const tagsChanged = () => { tagsEl.innerHTML = tagBox(); if (onChange) onChange(lead); };
        tagsEl.addEventListener('click', async (e) => {
          const x = e.target.closest('[data-tag-x]');
          try {
            if (x) { await CC.toggleLeadTag(lead, x.dataset.tagX); tagsChanged(); return; }
            const add = e.target.closest('[data-lp-tag]'); if (add) CC.openTagPicker(add, lead, { onChange: tagsChanged });
          } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
        });
        const showTab = (name) => {
          $$('[data-lp-tab]', el).forEach((x) => x.classList.toggle('active', x.dataset.lpTab === name));
          $$('[data-lp-panel]', el).forEach((p) => { p.hidden = p.dataset.lpPanel !== name; });
        };
        $$('[data-lp-tab]', el).forEach((t) => { t.onclick = () => showTab(t.dataset.lpTab); });
        $$('[data-goto-tab]', el).forEach((t) => { t.onclick = () => showTab(t.dataset.gotoTab); });
        el.addEventListener('click', async (e) => {
          const c = e.target.closest('[data-copy-value]'); if (!c) return;
          try { await navigator.clipboard.writeText(c.dataset.copyValue); CC.toast('Copiado.'); } catch (err) { CC.toast('Não foi possível copiar.', 'error'); }
        });
        const avatar = $('[data-avatar]', el);
        const showPhoto = async (path) => { const url = await CC.media.url(path); if (url) avatar.innerHTML = `<img src="${esc(url)}" alt="">`; };
        if (lead.photo_path) showPhoto(lead.photo_path);
        $('[data-photo]', el).onchange = async (e) => {
          const file = e.target.files && e.target.files[0]; if (!file) return;
          avatar.classList.add('is-loading');
          try {
            const path = await CC.media.upload(file, `leads/${lead.id}`);
            await api.update('leads', lead.id, { photo_path: path });
            if (lead.photo_path) CC.media.remove(lead.photo_path).catch(() => {});
            lead.photo_path = path; await showPhoto(path);
            CC.toast('Foto atualizada.');
          } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
          finally { avatar.classList.remove('is-loading'); e.target.value = ''; }
        };
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

  // MENSAGENS / Templates: ver message-studio.js (CC.routes.mensagens)


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

  // ---------------------------------------------------------------- Classificacao usada nos filtros
  const SOCIAL_RE = /(instagram\.com|facebook\.com|fb\.com|fb\.me|linktr\.ee|linktree|beacons\.ai|bio\.link|taplink|linkbio|wa\.me|whatsapp|tiktok\.com|youtube\.com|ifood\.com|google\.com\/maps|goo\.gl|business\.site|g\.page)/i;
  const siteKind = (l) => { const w = String(l.website || '').trim(); if (!w) return 'NONE'; return SOCIAL_RE.test(w) ? 'SOCIAL' : 'OWN'; };
  const phoneKey = (v) => { let d = CC.digits(v || ''); if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2); return d; };
  const isMobile = (v) => /^[1-9][1-9]9\d{8}$/.test(phoneKey(v));
  const hasValidPhone = (l) => isMobile(l.whatsapp) || isMobile(l.phone) || [l.whatsapp, l.phone].some((v) => /^[1-9][1-9]\d{8}$/.test(phoneKey(v)));
  const oppScore = (l) => (l.potential ? l.potential * 20 : Number(l.score) || 0);
  const oppTier = (l) => { const s = oppScore(l); return !s ? 'NONE' : s >= 80 ? 'ALTA' : s >= 50 ? 'MEDIA' : 'BAIXA'; };
  const TIER = { ALTA: ['Alta', 'ok'], MEDIA: ['Média', 'mid'], BAIXA: ['Baixa', 'low'], NONE: ['Sem nota', 'none'] };
  const isFav = (l) => (l.tags || []).includes('favorito');
  const FILTER_DEFAULT = { scope: 'prospect', q: '', uf: '', city: '', status: 'open', opp: '', site: '', contact: '', rating: '', revMin: '', revMax: '', profile: '', tag: '', fav: false, today: false, sort: 'opp' };
  const loadFilters = () => { try { return { ...FILTER_DEFAULT, ...JSON.parse(localStorage.getItem('cdev:prospect-filters') || '{}') }; } catch (e) { return { ...FILTER_DEFAULT }; } };
  const saveFilters = (f) => { try { localStorage.setItem('cdev:prospect-filters', JSON.stringify(f)); } catch (e) { /* sem storage */ } };

  CC.routes.prospeccao = async (root, r) => {
    const [profiles, allLeads, runs, cityLog, sumRows, projects] = await Promise.all([
      api.list('prospect_profiles', { order: 'priority' }),
      api.list('leads', { order: 'created_at', asc: false, limit: 5000 }),
      api.list('prospect_runs', { order: 'started_at', asc: false, limit: 30 }),
      api.list('prospect_city_log', { order: 'run_date', asc: false, limit: 1000 }),
      api.list('prospect_commercial_summary', { limit: 1 }),
      api.list('projects', { select: 'id,name,slug,status' }),
      CC.tags.load(true)
    ]);
    const sum = sumRows[0] || {};
    const today = todayISO();
    const f = loadFilters();
    if (r.query.p) { f.profile = r.query.p; f.scope = 'prospect'; }
    if (r.query.f === 'todos') f.status = '';
    if (!allLeads.some((l) => l.profile_key)) f.scope = 'all';
    const profName = (k) => profiles.find((p) => p.key === k)?.name || k || 'Manual';

    const scoped = () => allLeads.filter((l) => (f.scope === 'all' || l.profile_key) && (!f.profile || l.profile_key === f.profile));
    const passes = (l) => {
      if (f.q && !CC.leadSearch(l, f.q)) return false;
      if (f.tag && !(l.tags || []).some((t) => t.toLowerCase() === f.tag.toLowerCase())) return false;
      if (f.uf && l.state !== f.uf) return false;
      if (f.city && String(l.city || '').toLowerCase() !== f.city.toLowerCase()) return false;
      if (f.status === 'open' && ['CLIENTE', 'PERDIDO'].includes(l.status)) return false;
      if (f.status && f.status !== 'open' && l.status !== f.status) return false;
      if (f.opp && oppTier(l) !== f.opp) return false;
      const sk = siteKind(l);
      if (f.site === 'nosite' && sk === 'OWN') return false;
      if (f.site === 'none' && sk !== 'NONE') return false;
      if (f.site === 'social' && sk !== 'SOCIAL') return false;
      if (f.site === 'own' && sk !== 'OWN') return false;
      if (f.contact === 'whatsapp' && !(isMobile(l.whatsapp) || isMobile(l.phone))) return false;
      if (f.contact === 'phone' && !hasValidPhone(l)) return false;
      if (f.contact === 'instagram' && !l.instagram) return false;
      if (f.contact === 'email' && !l.email) return false;
      if (f.contact === 'none' && (hasValidPhone(l) || l.instagram || l.email)) return false;
      if (f.rating && !(Number(l.google_rating) >= Number(f.rating))) return false;
      if (f.revMin !== '' && !(Number(l.google_reviews) >= Number(f.revMin))) return false;
      if (f.revMax !== '' && !(l.google_reviews != null && Number(l.google_reviews) <= Number(f.revMax))) return false;
      if (f.fav && !isFav(l)) return false;
      if (f.today && (l.prospected_at || String(l.created_at).slice(0, 10)) !== today) return false;
      return true;
    };
    const SORT = {
      opp: (a, b) => oppScore(b) - oppScore(a) || (Number(b.google_reviews) || 0) - (Number(a.google_reviews) || 0),
      rating: (a, b) => (Number(b.google_rating) || 0) - (Number(a.google_rating) || 0) || (Number(b.google_reviews) || 0) - (Number(a.google_reviews) || 0),
      reviews: (a, b) => (Number(b.google_reviews) || 0) - (Number(a.google_reviews) || 0),
      newest: (a, b) => String(b.prospected_at || b.created_at).localeCompare(String(a.prospected_at || a.created_at)),
      name: SORTERS.name('company'),
      city: (a, b) => String(a.state || '').localeCompare(String(b.state || '')) || String(a.city || '').localeCompare(String(b.city || ''), 'pt-BR')
    };

    // Controle de cidades
    const cityAgg = Object.values(cityLog.reduce((m, c) => {
      const k = `${c.profile_key}|${c.state}|${(c.city || '').toLowerCase()}`;
      m[k] = m[k] || { profile_key: c.profile_key, city: c.city, state: c.state, times: 0, added: 0, last: c.run_date };
      m[k].times += 1; m[k].added += c.added; if (c.run_date > m[k].last) m[k].last = c.run_date;
      return m;
    }, {})).sort((a, b) => (a.last < b.last ? 1 : -1));
    const runBadge = (s) => ({ CONCLUIDA: 'green', PARCIAL: 'yellow', FALHOU: 'red', EM_ANDAMENTO: 'blue' }[s] || 'gray');

    const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
    const filterBar = () => {
      const base = scoped();
      const ufs = [...new Set(base.map((l) => l.state).filter(Boolean))].sort();
      const cities = [...new Set(base.filter((l) => !f.uf || l.state === f.uf).map((l) => l.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      return `
        <div class="pf-row">
          <label class="pf-search">${icon('search')}<input class="field" data-f="q" placeholder="Buscar nome, cidade, telefone, CNPJ, #tag, nicho:academia, ★4..." value="${esc(f.q)}"></label>
          <select class="cc-select" data-f="scope" title="Origem">${opt('prospect', 'Prospectados pelo agente', f.scope)}${opt('all', 'Todos os leads do CRM', f.scope)}</select>
          <select class="cc-select" data-f="profile" title="Perfil">${opt('', 'Todos os nichos', f.profile)}${profiles.map((p) => opt(p.key, p.name, f.profile)).join('')}</select>
        </div>
        <div class="pf-grid">
          <label><span>Estado</span><select class="cc-select" data-f="uf">${opt('', 'Todos', f.uf)}${ufs.map((u) => opt(u, u, f.uf)).join('')}</select></label>
          <label><span>Cidade</span><select class="cc-select" data-f="city">${opt('', 'Todas', f.city)}${cities.map((c) => opt(c, c, f.city)).join('')}</select></label>
          <label><span>Status</span><select class="cc-select" data-f="status">${opt('open', 'Em aberto', f.status)}${opt('', 'Todos', f.status)}${STAGES.map((s) => opt(s, label(s), f.status)).join('')}</select></label>
          <label><span>Oportunidade</span><select class="cc-select" data-f="opp">${opt('', 'Toda', f.opp)}${opt('ALTA', 'Alta (4-5)', f.opp)}${opt('MEDIA', 'Média (3)', f.opp)}${opt('BAIXA', 'Baixa (1-2)', f.opp)}${opt('NONE', 'Sem nota', f.opp)}</select></label>
          <label><span>Site</span><select class="cc-select" data-f="site">${opt('', 'Com ou sem site', f.site)}${opt('nosite', 'Sem site próprio', f.site)}${opt('none', 'Sem nenhum link', f.site)}${opt('social', 'Só redes sociais/Linktree', f.site)}${opt('own', 'Com site próprio', f.site)}</select></label>
          <label><span>Contato</span><select class="cc-select" data-f="contact">${opt('', 'Qualquer', f.contact)}${opt('whatsapp', 'Tem celular/WhatsApp', f.contact)}${opt('phone', 'Tem telefone válido', f.contact)}${opt('instagram', 'Tem Instagram', f.contact)}${opt('email', 'Tem e-mail', f.contact)}${opt('none', 'Sem contato', f.contact)}</select></label>
          <label><span>Nota no Google</span><select class="cc-select" data-f="rating">${opt('', 'Qualquer', f.rating)}${['4', '4.3', '4.5', '4.7', '4.8'].map((v) => opt(v, `${v.replace('.', ',')}+ ★`, f.rating)).join('')}</select></label>
          <label><span>Tag</span><select class="cc-select" data-f="tag">${opt('', 'Todas', f.tag)}${CC.tags.list('TAG', base).map((t) => opt(t, `#${t}`, f.tag)).join('')}</select></label>
          <label><span>Avaliações</span><div class="pf-range"><input class="field" type="number" min="0" data-f="revMin" placeholder="mín." value="${esc(f.revMin)}"><i>–</i><input class="field" type="number" min="0" data-f="revMax" placeholder="máx." value="${esc(f.revMax)}"></div></label>
        </div>
        <div class="pf-chips">
          <span class="tiny muted">Atalhos:</span>
          <button class="chip" data-preset="ready">${icon('rocket')}Prontos para abordar</button>
          <button class="chip ${f.today ? 'active' : ''}" data-preset="today">Adicionados hoje</button>
          <button class="chip" data-preset="reviews">Muitas avaliações (100+)</button>
          <button class="chip ${f.fav ? 'active' : ''}" data-preset="fav">★ Favoritos</button>
          <span class="spacer"></span>
          <button class="btn btn-sm" data-clear>${icon('x')}Limpar filtros</button>
        </div>`;
    };

    const kpis = (list) => {
      const withRating = list.filter((l) => l.google_rating != null);
      const avg = withRating.length ? withRating.reduce((a, l) => a + Number(l.google_rating), 0) / withRating.length : 0;
      const card = (value, labelTxt, hint, cls = '') => `<div class="metric ${cls}"><strong>${value}</strong><span>${labelTxt}</span>${hint ? `<small>${hint}</small>` : ''}</div>`;
      return card(list.length, 'Leads', f.scope === 'all' ? 'no CRM' : 'prospectados')
        + card(list.filter((l) => oppTier(l) === 'ALTA').length, 'Alta oportunidade', 'potencial 4-5', 'is-hot')
        + card(list.filter((l) => siteKind(l) !== 'OWN').length, 'Sem site próprio', `${list.filter((l) => siteKind(l) === 'SOCIAL').length} só com redes sociais`)
        + card(list.filter(hasValidPhone).length, 'Telefone válido', `${list.filter((l) => isMobile(l.whatsapp) || isMobile(l.phone)).length} com WhatsApp`)
        + card(avg ? avg.toFixed(2).replace('.', ',') : '—', 'Nota média', 'Google Maps')
        + card(esc(CC.money(sum.total_vendas || 0)), 'Total de vendas', `${sum.total_clientes || 0} clientes`);
    };

    const quick = (l) => {
      const n = (isMobile(l.whatsapp) && l.whatsapp) || (isMobile(l.phone) && l.phone) || l.whatsapp || l.phone;
      const sk = siteKind(l);
      const insta = l.instagram ? String(l.instagram).replace(/^@|https?:\/\/(www\.)?instagram\.com\//g, '').replace(/\/.*$/, '') : '';
      return `<div class="qc">
        ${n ? `<button class="qc-btn" data-copy-phone="${esc(CC.fmtPhone(n))}" title="Copiar ${esc(CC.fmtPhone(n))}">${icon('copy')}Copiar</button>` : ''}
        ${n && isMobile(n) ? `<button type="button" class="qc-btn wa" data-wa-phone="${esc(n)}">WhatsApp</button>` : n ? `<a class="qc-btn" href="tel:+55${esc(phoneKey(n))}">Ligar</a>` : ''}
        ${sk !== 'NONE' ? `<a class="qc-btn ${sk === 'OWN' ? 'site' : ''}" href="${esc(CC.safeUrl(/^https?:/i.test(l.website) ? l.website : `https://${l.website}`))}" target="_blank" rel="noopener">${sk === 'OWN' ? 'Site' : 'Link'}</a>` : ''}
        ${insta ? `<a class="qc-btn" href="https://instagram.com/${esc(insta)}" target="_blank" rel="noopener">Instagram</a>` : ''}
        ${l.maps_url ? `<a class="qc-btn" href="${esc(CC.safeUrl(l.maps_url))}" target="_blank" rel="noopener">Maps</a>` : ''}
        ${!['CLIENTE', 'PERDIDO'].includes(l.status) ? `<button type="button" class="qc-btn sent" data-fa="sent" data-fa-lead="${l.id}" title="Marcar mensagem como enviada">${icon('check')}Enviada</button>` : ''}
        <button type="button" class="qc-btn" data-fa="tag" data-fa-lead="${l.id}" title="Tags">${icon('plus')}Tag</button>
      </div>`;
    };
    const siteBadge = (l) => ({ NONE: '<span class="site-tag none">Sem site próprio</span>', SOCIAL: '<span class="site-tag social">Só redes sociais</span>', OWN: '<span class="site-tag own">Site próprio</span>' }[siteKind(l)]);

    const drawList = () => {
      const base = scoped();
      const list = base.filter(passes).sort(SORT[f.sort] || SORT.opp);
      $('#p-kpis', root).innerHTML = kpis(base);
      $('#p-count', root).innerHTML = `<b>${list.length}</b> ${list.length === 1 ? 'lead exibido' : 'leads exibidos'}${list.length !== base.length ? ` de ${base.length}` : ''}`;
      const initials = (l) => String(l.company || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      $('#p-list', root).innerHTML = list.length ? `<div class="table-wrap"><table class="cc-table p-table"><thead><tr>
          <th></th><th>Lead</th><th>Oportunidade</th><th>Google</th><th>Site</th><th>Contatos rápidos</th><th>Status</th></tr></thead><tbody>
        ${list.slice(0, 500).map((l) => {
          const [tLabel, tCls] = TIER[oppTier(l)];
          return `<tr data-row="${l.id}">
            <td><button class="fav ${isFav(l) ? 'on' : ''}" data-fav="${l.id}" title="${isFav(l) ? 'Remover dos favoritos' : 'Favoritar'}">★</button></td>
            <td class="p-lead" data-open="${l.id}"><span class="p-thumb" data-photo-path="${esc(l.photo_path || '')}">${esc(initials(l))}</span><span><strong>${esc(l.company)}</strong><span class="sub">${esc([l.neighborhood, [l.city, l.state].filter(Boolean).join(' - ')].filter(Boolean).join(' · ') || '—')}</span><span class="pc-tags">${CC.tags.niche(l) ? CC.tags.chip('NICHO', CC.tags.niche(l), { small: true }) : ''}${(l.tags || []).filter((t) => !['favorito', 'prospeccao'].includes(t)).map((t) => CC.tags.chip('TAG', t, { small: true })).join('')}</span></span></td>
            <td><span class="opp ${tCls}"><i></i>${tLabel}${oppScore(l) ? ` · ${oppScore(l)}` : ''}</span></td>
            <td class="nowrap">${CC.googleBadge(l) || '<span class="muted small">—</span>'}${l.potential ? `<div style="margin-top:.2rem">${CC.potStars(l.potential)}</div>` : ''}</td>
            <td>${siteBadge(l)}</td>
            <td>${quick(l)}</td>
            <td><div class="p-st"><select class="cc-select p-status" data-status="${l.id}" aria-label="Status">${STAGES.map((s) => opt(s, label(s), l.status)).join('')}</select><button class="qc-btn" data-open="${l.id}">Detalhes</button><button class="qc-btn icon" data-copy-lead="${l.id}" title="Copiar dados do lead">${icon('copy')}</button></div></td>
          </tr>`; }).join('')}
        </tbody></table></div>${list.length > 500 ? `<p class="tiny muted" style="margin-top:.5rem">Mostrando 500 de ${list.length}. Refine os filtros.</p>` : ''}`
        : '<div class="empty">Nenhum lead com esses filtros.</div>';
      st.visible = list;
      // fotos (URLs assinadas em lote)
      const paths = list.slice(0, 500).map((l) => l.photo_path).filter(Boolean);
      if (paths.length) CC.media.urls(paths).then((urls) => $$('[data-photo-path]', root).forEach((el) => { const u = urls[el.dataset.photoPath]; if (u) el.innerHTML = `<img src="${esc(u)}" alt="" loading="lazy">`; })).catch(() => {});
      saveFilters(f);
    };
    const st = { visible: [] };

    root.innerHTML = `${pageHead('CRM', 'Prospecção', 'Leads encontrados pelo agente diário e pelo CRM, com filtros por nota, avaliações, site e contato.',
      `<button class="btn" data-cats>${icon('layers')}Categorias e tags</button><button class="btn" data-copy-visible>${icon('copy')}Copiar leads visíveis</button><button class="btn" data-export>${icon('download')}Exportar CSV</button><button class="btn btn-primary" data-new-profile>${icon('plus')}Novo perfil</button>`)}
      <div class="p-kpis" id="p-kpis"></div>
      <section class="panel panel-pad pf" id="p-filters">${filterBar()}</section>
      <section class="panel" style="margin-top:1rem">
        <div class="p-head"><span id="p-count" class="small muted"></span><label class="small muted">Ordenar: <select class="cc-select" data-f="sort" style="width:auto;display:inline-block">${opt('opp', 'Oportunidade', f.sort)}${opt('rating', 'Nota no Google', f.sort)}${opt('reviews', 'Mais avaliações', f.sort)}${opt('newest', 'Mais recentes', f.sort)}${opt('name', 'Nome', f.sort)}${opt('city', 'Estado/cidade', f.sort)}</select></label></div>
        <div id="p-list"></div>
      </section>
      <details class="panel p-more" style="margin-top:1rem"><summary><h2 class="block-title">Perfis do agente (nichos)</h2><span class="tiny muted">${profiles.filter((p) => p.active).length} ativo(s) · executa todo dia às 10:00</span></summary>
        <div class="panel-body grid-3">${profiles.map((p) => {
          const last = runs.find((x) => x.profile_key === p.key);
          const pf = p.filters || {};
          return `<article class="card" style="padding:1rem;border:1px solid var(--line);border-radius:8px">
            <strong style="display:block;font-size:var(--fs-md)">${esc(p.name)}</strong>
            <label class="check tiny" style="margin-top:.35rem"><input type="checkbox" data-toggle-profile="${esc(p.key)}" ${p.active ? 'checked' : ''}> ${p.active ? 'ativo no agente diário' : 'pausado'}</label>
            <div class="small muted" style="margin:.35rem 0">${esc(p.region)}</div>
            <div class="tiny mono muted">meta ${p.daily_min}–${p.daily_max}/dia · ${allLeads.filter((l) => l.profile_key === p.key).length} leads${pf.require_no_website ? ' · sem site' : ''}${pf.require_mobile ? ' · só celular' : ''}${pf.min_reviews || pf.max_reviews ? ` · ${pf.min_reviews || 0}–${pf.max_reviews || '∞'} aval.` : ''}</div>
            <div class="tiny muted" style="margin:.45rem 0 .7rem">${last ? `Última execução ${fmtDate(last.run_date, { short: true })}: <span class="badge ${runBadge(last.status)}">${label(last.status)}</span> +${last.added}` : 'Ainda não executado'}</div>
            <div class="row"><button class="btn btn-sm" data-edit-profile="${esc(p.key)}">${icon('edit')}Editar critérios</button><button class="btn btn-sm" data-show-profile="${esc(p.key)}">Ver leads</button></div>
          </article>`; }).join('') || '<div class="notice">Rode <code>supabase/12_prospeccao.sql</code> para criar os perfis.</div>'}</div></details>
      <div class="grid-2" style="margin-top:1rem">
        <details class="panel p-more"><summary><h2 class="block-title">Controle de cidades</h2><span class="tiny muted">${new Set(cityAgg.map((c) => c.state)).size} estados · ${cityAgg.length} cidades</span></summary>
          <div class="panel-body">${table([
            { label: 'Última data', render: (c) => `<span class="small">${fmtDate(c.last, { short: true })}</span>` },
            { label: 'Cidade', render: (c) => `<strong>${esc(c.city)}${c.state ? ` - ${esc(c.state)}` : ''}</strong><span class="sub">${esc(profName(c.profile_key))}</span>` },
            { label: 'Pesquisada', cls: 'num', render: (c) => `${c.times}×` },
            { label: 'Leads', cls: 'num', render: (c) => c.added }
          ], cityAgg.slice(0, 60), { empty: 'Nenhuma cidade pesquisada ainda.' })}</div></details>
        <details class="panel p-more"><summary><h2 class="block-title">Execuções do agente</h2><span class="tiny muted">${runs.length ? `última: ${fmtDate(runs[0].run_date, { short: true })} · ${label(runs[0].status)}` : 'nenhuma ainda'}</span></summary>
          <div class="panel-body">${table([
            { label: 'Data', render: (x) => `<span class="small">${fmtDate(x.run_date, { short: true })}</span><span class="sub">${esc(profName(x.profile_key))}</span>` },
            { label: 'Status', render: (x) => `<span class="badge ${runBadge(x.status)}">${label(x.status)}</span>` },
            { label: 'Novos', cls: 'num', render: (x) => `<strong>${x.added}</strong>` },
            { label: 'Duplic.', cls: 'num', render: (x) => x.duplicates },
            { label: 'Descart.', cls: 'num', render: (x) => x.discarded },
            { label: 'Observações', render: (x) => `<span class="small">${esc(x.errors || x.summary || '')}</span>` }
          ], runs, { empty: 'O agente ainda não executou.' })}</div></details>
      </div>`;
    drawList();

    const refreshBar = () => { $('#p-filters', root).innerHTML = filterBar(); };
    const setF = (k, v, redrawBar = false) => {
      f[k] = v;
      if (k === 'uf') f.city = '';
      if (k === 'scope' && v === 'prospect' && !allLeads.some((l) => l.profile_key)) f.scope = 'all';
      if (redrawBar || ['uf', 'scope', 'profile'].includes(k)) refreshBar();
      drawList();
    };
    const onField = debounce((el) => setF(el.dataset.f, el.value), 220);
    root.addEventListener('input', (e) => { const el = e.target.closest('input[data-f]'); if (el) onField(el); });
    root.addEventListener('change', async (e) => {
      const sel = e.target.closest('select[data-f]'); if (sel) { setF(sel.dataset.f, sel.value); return; }
      const stSel = e.target.closest('[data-status]');
      if (stSel) {
        const l = allLeads.find((x) => x.id === stSel.dataset.status); const prev = l.status;
        try {
          await api.update('leads', l.id, { status: stSel.value, ...(prev === 'LEAD' && stSel.value !== 'LEAD' ? { last_contact_at: new Date().toISOString() } : {}) });
          await api.insert('lead_activities', { lead_id: l.id, type: 'STATUS', content: `${label(prev)} → ${label(stSel.value)}` });
          l.status = stSel.value; CC.toast(`${l.company}: ${label(stSel.value)}.`);
          if (f.status) drawList();
        } catch (err) { stSel.value = prev; CC.toast(CC.errMsg(err), 'error'); }
        return;
      }
      const t = e.target.closest('[data-toggle-profile]');
      if (t) {
        const { error } = await CC.ctx.supabase.from('prospect_profiles').update({ active: t.checked, updated_at: new Date().toISOString() }).eq('key', t.dataset.toggleProfile);
        if (error) { t.checked = !t.checked; CC.toast(error.message, 'error'); return; }
        t.parentElement.lastChild.textContent = t.checked ? ' ativo no agente diário' : ' pausado';
        CC.toast(t.checked ? 'Perfil ativado: o agente vai executar.' : 'Perfil pausado.');
      }
    });
    const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); CC.toast(msg); } catch (err) { CC.toast('Não foi possível copiar.', 'error'); } };
    root.addEventListener('click', async (e) => {
      const fa = e.target.closest('[data-fa]');
      if (fa) {
        const lead = allLeads.find((l) => l.id === fa.dataset.faLead); if (!lead) return;
        e.preventDefault(); e.stopPropagation();
        try { await CC.leadFastAction(fa, lead, { leads: allLeads, redraw: drawList }); } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
        return;
      }
      const pre = e.target.closest('[data-preset]');
      if (pre) {
        const k = pre.dataset.preset;
        if (k === 'fav') { f.fav = !f.fav; }
        else {
          Object.assign(f, { ...FILTER_DEFAULT, scope: f.scope, profile: f.profile, sort: f.sort });
          if (k === 'ready') Object.assign(f, { status: 'LEAD', opp: 'ALTA', site: 'nosite', contact: 'whatsapp' });
          if (k === 'today') Object.assign(f, { status: '', sort: 'newest', today: true });
          if (k === 'reviews') Object.assign(f, { revMin: '100', sort: 'reviews' });
        }
        refreshBar(); drawList();
        return;
      }
      if (e.target.closest('[data-clear]')) { Object.assign(f, { ...FILTER_DEFAULT, scope: f.scope }); refreshBar(); drawList(); return; }
      const fav = e.target.closest('[data-fav]');
      if (fav) {
        const l = allLeads.find((x) => x.id === fav.dataset.fav);
        const tags = isFav(l) ? (l.tags || []).filter((t) => t !== 'favorito') : [...(l.tags || []), 'favorito'];
        try { await api.update('leads', l.id, { tags }); l.tags = tags; fav.classList.toggle('on', isFav(l)); if (f.fav) drawList(); } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
        return;
      }
      const cp = e.target.closest('[data-copy-phone]'); if (cp) { copy(cp.dataset.copyPhone, `Telefone copiado: ${cp.dataset.copyPhone}`); return; }
      const cl = e.target.closest('[data-copy-lead]');
      if (cl) {
        const l = allLeads.find((x) => x.id === cl.dataset.copyLead);
        copy([l.company, CC.fmtPhone(l.whatsapp || l.phone || ''), [l.city, l.state].filter(Boolean).join(' - '), l.google_rating != null ? `${String(l.google_rating).replace('.', ',')}★ (${l.google_reviews || 0} aval.)` : '', l.instagram || '', l.maps_url || ''].filter(Boolean).join(' · '), 'Dados do lead copiados.');
        return;
      }
      if (e.target.closest('[data-copy-visible]')) {
        const rows = (st.visible || []).map((l) => [l.company, CC.fmtPhone(l.whatsapp || l.phone || ''), l.city || '', l.state || '', l.google_rating ?? '', l.google_reviews ?? '', siteKind(l) === 'OWN' ? l.website : '', l.instagram || '', l.maps_url || ''].join('\t'));
        copy(['Empresa\tTelefone\tCidade\tUF\tNota\tAvaliações\tSite\tInstagram\tMaps', ...rows].join('\n'), `${rows.length} leads copiados (cole no Excel ou Google Sheets).`);
        return;
      }
      const sp = e.target.closest('[data-show-profile]'); if (sp) { Object.assign(f, { ...FILTER_DEFAULT, scope: 'prospect', profile: sp.dataset.showProfile, status: '' }); refreshBar(); drawList(); $('#p-filters', root).scrollIntoView({ behavior: 'smooth' }); return; }
      if (e.target.closest('a, select, input, label')) return;
      const op = e.target.closest('[data-open]'); if (op) { openLead(allLeads.find((l) => l.id === op.dataset.open), projects, (l) => { const x = allLeads.find((y) => y.id === l.id); if (x) Object.assign(x, l); drawList(); }); return; }
      const ed = e.target.closest('[data-edit-profile]');
      if (ed && await editProfile(profiles.find((p) => p.key === ed.dataset.editProfile))) { CC.toast('Perfil salvo.'); CC.router.render(); }
      if (e.target.closest('[data-cats]')) { if (await CC.editCategories(allLeads)) CC.router.render(); return; }
      if (e.target.closest('[data-new-profile]') && await editProfile(null)) { CC.toast('Perfil criado.'); CC.router.render(); }
      if (e.target.closest('[data-export]')) {
        const bought2 = (l) => (l.status === 'CLIENTE' ? 'Sim' : l.status === 'PERDIDO' ? 'Não' : l.status === 'LEAD' ? '' : 'Em negociação');
        csv.download(`prospeccao-${today}.csv`, csv.stringify(st.visible || [], [
          { label: 'Nome da Empresa', key: 'company' }, { label: 'Cidade', key: 'city' }, { label: 'Estado', key: 'state' },
          { label: 'Telefone/WhatsApp', value: (l) => CC.fmtPhone(l.whatsapp || l.phone || '') }, { label: 'Instagram', key: 'instagram' }, { label: 'Site', value: (l) => l.website || '' },
          { label: 'Situação do site', value: (l) => ({ NONE: 'Sem site', SOCIAL: 'Só redes sociais', OWN: 'Site próprio' }[siteKind(l)]) }, { label: 'Google Maps', key: 'maps_url' },
          { label: 'Avaliações Google', key: 'google_reviews' }, { label: 'Nota Google', value: (l) => (l.google_rating ?? '').toString().replace('.', ',') },
          { label: 'Potencial 1-5', key: 'potential' }, { label: 'Data de Prospecção', key: 'prospected_at' },
          { label: 'Negociação', value: (l) => label(l.status) }, { label: 'Comprou?', value: bought2 },
          { label: 'Valor da Venda', value: (l) => (l.sale_value ?? '').toString().replace('.', ',') }
        ]));
      }
    });
  };
})();
