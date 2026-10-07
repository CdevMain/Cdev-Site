/* CDEV Control Center - Nichos do agente de prospeccao (#/nichos)
 * Pagina propria com os cards dos perfis (prospect_profiles), busca, filtros,
 * exportar/importar em JSON e um prompt pronto para gerar nichos novos com IA (sem API paga:
 * copie o prompt, cole no ChatGPT/Claude, cole a resposta em "Importar").
 */
(function () {
  const CC = window.CC;
  const { $, $$, esc, icon, api, label, fmtDate, todayISO } = CC;

  const FORMAT = 'cdev-niches';
  const FILTER_KEYS = {
    min_reviews: 'int', max_reviews: 'int', require_mobile: 'bool', require_no_website: 'bool', exclude_closed: 'bool'
  };
  const FIELDS = ['key', 'name', 'segment', 'region', 'daily_min', 'daily_max', 'priority', 'active', 'search_terms', 'exclude_brands', 'filters', 'rules', 'tags'];
  const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
  const runBadge = (s) => ({ CONCLUIDA: 'green', PARCIAL: 'yellow', FALHOU: 'red', EM_ANDAMENTO: 'blue' }[s] || 'gray');

  // ---------------------------------------------------------------- normalizacao (export/import)
  const slug = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/\n|;/)).map((x) => String(x ?? '').trim()).filter(Boolean);
  const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };

  const toExport = (p) => ({
    key: p.key, name: p.name, segment: p.segment, region: p.region,
    daily_min: p.daily_min, daily_max: p.daily_max, priority: p.priority, active: !!p.active,
    search_terms: p.search_terms || [], exclude_brands: p.exclude_brands || [],
    filters: p.filters || {}, rules: p.rules || '', tags: p.tags || []
  });

  const normalize = (raw, i) => {
    const errors = [];
    const warnings = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: [`Item ${i + 1}: não é um objeto.`] };
    const name = String(raw.name || raw.nome || '').trim();
    const key = slug(raw.key || raw.chave || name);
    const rec = {
      key,
      name,
      segment: String(raw.segment || raw.segmento || '').trim(),
      region: String(raw.region || raw.regiao || raw['região'] || '').trim(),
      daily_min: int(raw.daily_min ?? raw.meta_min, 20),
      daily_max: int(raw.daily_max ?? raw.meta_max, 30),
      priority: int(raw.priority ?? raw.ordem, 100),
      active: raw.active === true || raw.active === 'true' || raw.ativo === true,
      search_terms: list(raw.search_terms ?? raw.termos),
      exclude_brands: list(raw.exclude_brands ?? raw.redes),
      rules: Array.isArray(raw.rules) ? raw.rules.join('\n') : String(raw.rules ?? raw.criterios ?? '').trim(),
      tags: list(raw.tags).map((t) => t.replace(/^#/, '')),
      filters: {}
    };
    const f = raw.filters && typeof raw.filters === 'object' && !Array.isArray(raw.filters) ? raw.filters : {};
    Object.entries(f).forEach(([k, v]) => {
      const type = FILTER_KEYS[k];
      if (!type) { warnings.push(`filtro "${k}" ignorado`); return; }
      if (type === 'bool') rec.filters[k] = v === true || v === 'true';
      else if (v !== null && v !== '') { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0) rec.filters[k] = n; else warnings.push(`filtro "${k}" inválido`); }
    });
    if (!rec.key) errors.push('sem chave/nome');
    if (!rec.name) errors.push('sem nome');
    if (!rec.segment) errors.push('sem segmento');
    if (!rec.region) errors.push('sem região');
    if (!rec.search_terms.length) errors.push('sem termos de busca');
    if (rec.daily_max < rec.daily_min) errors.push('meta máxima menor que a mínima');
    if (rec.filters.min_reviews != null && rec.filters.max_reviews != null && rec.filters.max_reviews < rec.filters.min_reviews) errors.push('max_reviews menor que min_reviews');
    if (raw.key && slug(raw.key) !== raw.key) warnings.push(`chave ajustada para "${rec.key}"`);
    return { rec, errors, warnings };
  };

  const parsePayload = (text) => {
    let data;
    const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    if (!cleaned) throw new Error('Cole o JSON ou escolha um arquivo.');
    try { data = JSON.parse(cleaned); } catch (e) {
      const a = cleaned.indexOf('{'); const b = cleaned.lastIndexOf('}');
      if (a >= 0 && b > a) { try { data = JSON.parse(cleaned.slice(a, b + 1)); } catch (e2) { throw new Error(`JSON inválido: ${e.message}`); } }
      else throw new Error(`JSON inválido: ${e.message}`);
    }
    const items = Array.isArray(data) ? data : Array.isArray(data?.niches) ? data.niches : Array.isArray(data?.nichos) ? data.nichos : data && typeof data === 'object' ? [data] : [];
    if (!items.length) throw new Error('Nenhum nicho encontrado. O formato esperado é { "niches": [ ... ] }.');
    return items;
  };

  const download = (name, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  const exportProfiles = (rows, name) => {
    download(name || `nichos-cdev-${todayISO()}.json`, { format: FORMAT, version: 1, exported_at: new Date().toISOString(), niches: rows.map(toExport) });
    CC.toast(`${rows.length} nicho(s) exportado(s).`);
  };

  // ---------------------------------------------------------------- prompt para IA
  const buildPrompt = ({ count, ideas, region, profiles }) => {
    const sample = profiles.find((p) => (p.search_terms || []).length && p.rules) || profiles[0];
    const example = sample ? toExport({ ...sample, active: false }) : {
      key: 'academias', name: 'Academias', segment: 'Academia', region: 'Brasil inteiro', daily_min: 20, daily_max: 30, priority: 100, active: false,
      search_terms: ['academia', 'academia de musculação', 'crossfit'], exclude_brands: ['Smart Fit', 'Bodytech'],
      filters: { require_no_website: true, exclude_closed: true, min_reviews: 20 }, rules: 'Aprovar: ... Descartar: ...', tags: ['academia']
    };
    const existing = profiles.map((p) => p.key).join(', ') || '(nenhum)';
    return `Você vai criar perfis de prospecção (nichos) para o agente da CDEV, que encontra pequenos negócios locais no Google Maps para oferecer criação de sites.

Gere ${count || 5} nicho(s) NOVO(S)${ideas ? ` sobre: ${ideas}` : ' com boa chance de precisar de site (negócios locais que vivem de indicação, Instagram e WhatsApp)'}.
Região padrão: ${region || 'Brasil inteiro'}.
Não repita estas chaves, que já existem: ${existing}.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, neste formato:
{
  "format": "${FORMAT}",
  "version": 1,
  "niches": [ ...um objeto por nicho... ]
}

Campos de cada nicho:
- key: identificador único, minúsculas, sem acento, palavras separadas por hífen (ex.: "lojas-de-cortinas").
- name: nome curto do nicho (ex.: "Cortinas e persianas").
- segment: segmento gravado no lead (ex.: "Cortinas").
- region: região onde buscar (ex.: "Rio Grande do Sul", "Brasil inteiro").
- daily_min / daily_max: meta de leads por dia (números; daily_max >= daily_min). Use 15 a 30.
- priority: ordem de execução (número; menor roda primeiro). Use 100 se não souber.
- active: sempre false (eu reviso antes de ativar).
- search_terms: lista de 5 a 10 termos de busca do Google Maps, como as pessoas pesquisam de verdade (sem o nome da cidade).
- exclude_brands: lista de redes e franquias grandes do nicho que devem ser descartadas (pode ser vazia).
- filters: objeto só com estas chaves opcionais: "min_reviews" (número), "max_reviews" (número), "require_mobile" (true/false), "require_no_website" (true/false), "exclude_closed" (true/false). Normalmente: require_no_website true e exclude_closed true.
- rules: texto com os critérios de aprovação e descarte (o que torna o negócio um bom lead e o que eliminar), em linhas curtas.
- tags: lista de tags curtas para os leads (sem #).

Não invente dados de empresas reais; gere apenas a configuração de busca.

Exemplo de um nicho que já uso:
${JSON.stringify(example, null, 2)}`;
  };

  const openPrompt = (profiles) => CC.modal({
    title: 'Gerar nichos com IA', wide: true,
    body: `<div class="nx-ai">
      <p class="small muted">Monte o pedido, copie e cole no ChatGPT, Claude ou outra IA. Depois copie a resposta e use <b>Importar</b>. Os nichos entram pausados para você revisar.</p>
      <div class="form-grid" style="margin-top:.8rem">
        <div class="form-field"><label>Quantos nichos</label><input class="field" type="number" min="1" max="30" value="5" data-ai="count"></div>
        <div class="form-field"><label>Região padrão</label><input class="field" value="Rio Grande do Sul" data-ai="region"></div>
        <div class="form-field full"><label>Ideias ou segmentos (opcional)</label><input class="field" placeholder="ex.: decoração, marcenaria, estética automotiva, pet shops" data-ai="ideas"></div>
      </div>
      <textarea class="field nx-prompt" rows="16" readonly data-ai-out></textarea>
    </div>`,
    actions: [{ label: 'Fechar', value: null }, { label: 'Copiar prompt', primary: true, handler: async (b) => {
      const t = $('[data-ai-out]', b).value;
      try { await navigator.clipboard.writeText(t); CC.toast('Prompt copiado. Cole na IA e depois importe a resposta.'); }
      catch (e) { $('[data-ai-out]', b).select(); CC.toast('Selecione o texto e copie com Ctrl+C.', 'error'); }
      return false;
    } }],
    onOpen: (b) => {
      const draw = () => { $('[data-ai-out]', b).value = buildPrompt({ count: $('[data-ai="count"]', b).value, region: $('[data-ai="region"]', b).value.trim(), ideas: $('[data-ai="ideas"]', b).value.trim(), profiles }); };
      b.addEventListener('input', (e) => { if (e.target.matches('[data-ai]')) draw(); });
      draw();
    }
  });

  // ---------------------------------------------------------------- importar
  const openImport = (profiles) => CC.modal({
    title: 'Importar nichos (JSON)', wide: true,
    body: `<div class="nx-import">
      <div class="row" style="gap:.5rem;flex-wrap:wrap">
        <label class="btn btn-sm">${icon('upload')}Escolher arquivo .json<input type="file" accept=".json,application/json,text/plain" data-im-file hidden></label>
        <span class="tiny muted">ou cole o JSON (a resposta da IA ou um arquivo exportado):</span>
      </div>
      <textarea class="field nx-paste" rows="9" data-im-text placeholder='{ "niches": [ { "key": "...", "name": "...", ... } ] }'></textarea>
      <div class="row" style="gap:1rem;flex-wrap:wrap;margin-top:.6rem">
        <label class="check small"><input type="checkbox" data-im-paused checked> Importar como pausados (recomendado)</label>
        <label class="small">Se a chave já existir:
          <select class="cc-select" data-im-mode style="width:auto;display:inline-block"><option value="update">atualizar o nicho existente</option><option value="skip">ignorar</option></select></label>
        <button class="btn btn-sm" type="button" data-im-check>${icon('check')}Analisar</button>
      </div>
      <div class="nx-preview" data-im-preview></div>
    </div>`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Importar', primary: true, handler: async (b) => {
      const plan = b._plan;
      if (!plan) { analyze(b, profiles); if (!b._plan) return false; return false; }
      const mode = $('[data-im-mode]', b).value;
      const paused = $('[data-im-paused]', b).checked;
      const rows = plan.filter((x) => !x.errors.length && (x.isNew || mode === 'update')).map((x) => {
        const rec = { ...x.rec, updated_at: new Date().toISOString() };
        if (paused && x.isNew) rec.active = false;
        if (!x.isNew) delete rec.active; // nao liga/desliga nichos existentes pela importacao
        return rec;
      });
      if (!rows.length) { CC.toast('Nada para importar (verifique os erros ou o modo de chaves existentes).', 'error'); return false; }
      const sb = CC.ctx.supabase.from.bind(CC.ctx.supabase);
      const inserts = rows.filter((x) => !profiles.some((p) => p.key === x.key));
      const updates = rows.filter((x) => profiles.some((p) => p.key === x.key));
      if (inserts.length) { const { error } = await sb('prospect_profiles').insert(inserts); if (error) throw error; }
      for (const u of updates) {
        const { key, ...rec } = u;
        const { error } = await sb('prospect_profiles').update(rec).eq('key', key);
        if (error) throw error;
      }
      return rows.length;
    } }],
    onOpen: (b) => {
      const reset = () => { b._plan = null; $('[data-im-preview]', b).innerHTML = ''; };
      $('[data-im-text]', b).addEventListener('input', reset);
      $('[data-im-mode]', b).addEventListener('change', () => { if (b._plan) analyze(b, profiles); });
      $('[data-im-file]', b).addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0]; if (!file) return;
        $('[data-im-text]', b).value = await file.text(); e.target.value = '';
        analyze(b, profiles);
      });
      $('[data-im-check]', b).addEventListener('click', () => analyze(b, profiles));
    }
  });

  function analyze(b, profiles) {
    const box = $('[data-im-preview]', b);
    b._plan = null;
    let items;
    try { items = parsePayload($('[data-im-text]', b).value); }
    catch (e) { box.innerHTML = `<div class="notice">${esc(e.message)}</div>`; return; }
    const seen = new Set();
    const plan = items.map((raw, i) => {
      const n = normalize(raw, i);
      if (!n.rec) return { errors: n.errors, warnings: [], rec: { name: `Item ${i + 1}` } };
      if (seen.has(n.rec.key)) n.errors.push('chave repetida no arquivo');
      seen.add(n.rec.key);
      return { ...n, isNew: !profiles.some((p) => p.key === n.rec.key) };
    });
    const mode = $('[data-im-mode]', b).value;
    const ok = plan.filter((x) => !x.errors.length);
    const creates = ok.filter((x) => x.isNew).length;
    const updates = ok.filter((x) => !x.isNew).length;
    box.innerHTML = `<p class="small" style="margin:.8rem 0 .5rem"><b>${plan.length}</b> nicho(s) no arquivo · <span class="badge green">${creates} novo(s)</span> <span class="badge blue">${updates} já existe(m)${mode === 'skip' && updates ? ' · serão ignorados' : ''}</span>${plan.length - ok.length ? ` <span class="badge red">${plan.length - ok.length} com erro</span>` : ''}</p>
      <div class="table-wrap"><table class="cc-table"><thead><tr><th>Nicho</th><th>Chave</th><th>Região</th><th>Termos</th><th>Situação</th></tr></thead><tbody>
      ${plan.map((x) => `<tr><td><strong>${esc(x.rec.name || '—')}</strong><span class="sub">${esc(x.rec.segment || '')}</span></td><td class="mono tiny">${esc(x.rec.key || '—')}</td><td class="small">${esc(x.rec.region || '—')}</td><td class="num">${(x.rec.search_terms || []).length}</td>
        <td>${x.errors.length ? `<span class="badge red">erro</span><span class="sub">${esc(x.errors.join('; '))}</span>` : `<span class="badge ${x.isNew ? 'green' : 'blue'}">${x.isNew ? 'novo' : mode === 'skip' ? 'ignorar' : 'atualizar'}</span>${x.warnings.length ? `<span class="sub">${esc(x.warnings.join('; '))}</span>` : ''}`}</td></tr>`).join('')}
      </tbody></table></div>`;
    b._plan = plan;
  }

  // ---------------------------------------------------------------- pagina
  CC.routes.nichos = async (root, r) => {
    const [profiles, leadKeys, runs] = await Promise.all([
      api.list('prospect_profiles', { order: 'priority' }),
      api.list('leads', { select: 'profile_key', limit: 20000 }),
      api.list('prospect_runs', { order: 'run_date', asc: false, limit: 400 })
    ]);
    const leadCount = {};
    leadKeys.forEach((l) => { if (l.profile_key) leadCount[l.profile_key] = (leadCount[l.profile_key] || 0) + 1; });
    const lastRun = {};
    runs.forEach((x) => { if (!lastRun[x.profile_key]) lastRun[x.profile_key] = x; });
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('cdev:nichos') || '{}'); } catch (e) { /* sem storage */ }
    const st = { q: r.query.q || '', status: prefs.status || 'all', sort: prefs.sort || 'priority' };
    const save = () => { try { localStorage.setItem('cdev:nichos', JSON.stringify({ status: st.status, sort: st.sort })); } catch (e) { /* ignora */ } };

    const visible = () => {
      const q = st.q.toLowerCase().trim();
      const out = profiles.filter((p) => (st.status === 'all' || (st.status === 'active' ? p.active : !p.active))
        && (!q || [p.name, p.key, p.segment, p.region, ...(p.search_terms || []), ...(p.tags || [])].join(' ').toLowerCase().includes(q)));
      const by = {
        priority: (a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.name.localeCompare(b.name),
        name: (a, b) => a.name.localeCompare(b.name),
        leads: (a, b) => (leadCount[b.key] || 0) - (leadCount[a.key] || 0),
        recent: (a, b) => String(lastRun[b.key]?.run_date || '').localeCompare(String(lastRun[a.key]?.run_date || ''))
      };
      return out.sort(by[st.sort] || by.priority);
    };

    const card = (p) => {
      const pf = p.filters || {};
      const last = lastRun[p.key];
      const terms = p.search_terms || [];
      const facts = [
        `${p.daily_min}–${p.daily_max}/dia`,
        pf.require_no_website ? 'sem site' : '',
        pf.require_mobile ? 'só celular' : '',
        pf.min_reviews || pf.max_reviews ? `${pf.min_reviews || 0}–${pf.max_reviews || '∞'} aval.` : ''
      ].filter(Boolean);
      return `<article class="nx-card ${p.active ? 'is-on' : ''}" data-key="${esc(p.key)}">
        <header class="nx-head">
          <div class="nx-title"><strong>${esc(p.name)}</strong><span class="mono tiny muted">${esc(p.key)} · ordem ${p.priority ?? 100}</span></div>
          <label class="nx-switch" title="${p.active ? 'Ativo: o agente diário executa' : 'Pausado'}"><input type="checkbox" data-nx-toggle="${esc(p.key)}" ${p.active ? 'checked' : ''}><span></span><em>${p.active ? 'Ativo' : 'Pausado'}</em></label>
        </header>
        <div class="nx-region">${icon('pin')}<span>${esc(p.region)}</span></div>
        <div class="nx-facts"><span class="nx-leads"><b>${leadCount[p.key] || 0}</b> leads</span>${facts.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
        <div class="nx-terms" title="${esc(terms.join(', '))}">${terms.slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join('')}${terms.length > 4 ? `<span class="more">+${terms.length - 4}</span>` : ''}${terms.length ? '' : '<span class="muted">sem termos de busca</span>'}</div>
        <div class="nx-run tiny">${last ? `Última execução ${fmtDate(last.run_date, { short: true })} <span class="badge ${runBadge(last.status)}">${label(last.status)}</span> +${last.added}` : '<span class="muted">Ainda não executado</span>'}</div>
        <footer class="nx-actions">
          <button class="btn btn-sm" data-nx-edit="${esc(p.key)}">${icon('edit')}Editar</button>
          <a class="btn btn-sm" href="#/prospeccao?p=${encodeURIComponent(p.key)}">${icon('target')}Ver leads</a>
          <span class="spacer"></span>
          <button class="icon-btn" data-nx-dup="${esc(p.key)}" title="Duplicar">${icon('copy')}</button>
          <button class="icon-btn" data-nx-export="${esc(p.key)}" title="Exportar este nicho (JSON)">${icon('download')}</button>
          <button class="icon-btn danger" data-nx-del="${esc(p.key)}" title="Excluir nicho">${icon('trash')}</button>
        </footer>
      </article>`;
    };

    const draw = () => {
      const rows = visible();
      $('#nx-grid', root).innerHTML = rows.length ? rows.map(card).join('')
        : `<div class="empty-state" style="grid-column:1/-1"><strong>${profiles.length ? 'Nenhum nicho com esse filtro.' : 'Nenhum nicho cadastrado.'}</strong><p class="small muted">${profiles.length ? 'Limpe a busca ou troque o filtro.' : 'Crie um nicho, importe um arquivo ou gere com IA.'}</p></div>`;
      $('#nx-count', root).textContent = `${rows.length} de ${profiles.length}`;
      $$('[data-nx-status]', root).forEach((b) => b.classList.toggle('active', b.dataset.nxStatus === st.status));
    };

    const active = profiles.filter((p) => p.active).length;
    root.innerHTML = `${CC.pageHead('CRM', 'Nichos do agente', `Perfis que o agente de prospecção executa todo dia às 10:00. ${active} ativo(s) de ${profiles.length}.`,
      `<a class="btn" href="#/prospeccao">${icon('target')}Prospecção</a><button class="btn" data-nx-ai>${icon('rocket')}Gerar com IA</button><button class="btn" data-nx-import>${icon('upload')}Importar</button><button class="btn" data-nx-export-all>${icon('download')}Exportar</button><button class="btn btn-primary" data-nx-new>${icon('plus')}Novo nicho</button>`)}
      <section class="panel panel-pad nx-bar">
        <div class="nx-search">${icon('search')}<input class="field" data-nx-q placeholder="Buscar nicho, chave, região, termo ou tag" value="${esc(st.q)}"></div>
        <div class="chips">
          <button class="chip" data-nx-status="all">Todos <span class="n">${profiles.length}</span></button>
          <button class="chip" data-nx-status="active">Ativos <span class="n">${active}</span></button>
          <button class="chip" data-nx-status="paused">Pausados <span class="n">${profiles.length - active}</span></button>
        </div>
        <span class="spacer"></span>
        <span class="tiny muted" id="nx-count"></span>
        <label class="small muted">Ordenar: <select class="cc-select" data-nx-sort style="width:auto;display:inline-block">${opt('priority', 'Ordem de execução', st.sort)}${opt('name', 'Nome', st.sort)}${opt('leads', 'Mais leads', st.sort)}${opt('recent', 'Executado recentemente', st.sort)}</select></label>
      </section>
      <div class="nx-grid" id="nx-grid"></div>`;
    draw();

    root.addEventListener('input', (e) => { if (e.target.matches('[data-nx-q]')) { st.q = e.target.value; draw(); } });
    root.addEventListener('change', async (e) => {
      if (e.target.matches('[data-nx-sort]')) { st.sort = e.target.value; save(); draw(); return; }
      const t = e.target.closest('[data-nx-toggle]');
      if (t) {
        const p = profiles.find((x) => x.key === t.dataset.nxToggle);
        const { error } = await CC.ctx.supabase.from('prospect_profiles').update({ active: t.checked, updated_at: new Date().toISOString() }).eq('key', p.key);
        if (error) { t.checked = !t.checked; CC.toast(CC.errMsg(error), 'error'); return; }
        p.active = t.checked;
        CC.toast(t.checked ? `${p.name}: ativo no agente diário.` : `${p.name}: pausado.`);
        draw();
      }
    });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      try {
        if (b.dataset.nxStatus) { st.status = b.dataset.nxStatus; save(); draw(); return; }
        const find = (k) => profiles.find((p) => p.key === k);
        if (b.dataset.nxEdit) { if (await CC.editProspectProfile(find(b.dataset.nxEdit))) { CC.toast('Nicho salvo.'); CC.router.render(); } return; }
        if (b.dataset.nxDup) {
          const p = find(b.dataset.nxDup);
          let key = `${p.key}-copia`; let n = 2;
          while (profiles.some((x) => x.key === key)) key = `${p.key}-copia-${n++}`;
          if (await CC.editProspectProfile(null, { ...toExport(p), key, name: `${p.name} (cópia)`, active: false })) { CC.toast('Nicho duplicado.'); CC.router.render(); }
          return;
        }
        if (b.dataset.nxDel) {
          const p = find(b.dataset.nxDel);
          const n = leadCount[p.key] || 0;
          const ok = await CC.confirmDialog(`Excluir o nicho "${p.name}"? O agente deixa de executá-lo e o histórico de execuções dele é apagado.${n ? ` Os ${n} lead(s) encontrados por ele continuam no CRM.` : ''} Dica: exporte o nicho antes se quiser guardar a configuração.`, { title: 'Excluir nicho', okLabel: 'Excluir', danger: true });
          if (!ok) return;
          const { error } = await CC.ctx.supabase.from('prospect_profiles').delete().eq('key', p.key);
          if (error) throw error;
          CC.toast(`Nicho "${p.name}" excluído.`);
          CC.router.render();
          return;
        }
        if (b.dataset.nxExport) { const p = find(b.dataset.nxExport); exportProfiles([p], `nicho-${p.key}.json`); return; }
        if (b.matches('[data-nx-export-all]')) {
          const rows = visible();
          if (!rows.length) { CC.toast('Nenhum nicho para exportar.', 'error'); return; }
          exportProfiles(rows, rows.length === profiles.length ? undefined : `nichos-cdev-filtrados-${todayISO()}.json`);
          return;
        }
        if (b.matches('[data-nx-import]')) { const n = await openImport(profiles); if (n) { CC.toast(`${n} nicho(s) importado(s).`); CC.router.render(); } return; }
        if (b.matches('[data-nx-ai]')) { openPrompt(profiles); return; }
        if (b.matches('[data-nx-new]')) { if (await CC.editProspectProfile(null)) { CC.toast('Nicho criado.'); CC.router.render(); } }
      } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
    });
  };

  CC.niches = { normalize, parsePayload, toExport, buildPrompt };
})();
