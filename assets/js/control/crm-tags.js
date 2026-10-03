/* CDEV Control Center - Tags coloridas, nichos (categorias), editor e acoes rapidas dos cards do CRM
 * Catalogo em public.crm_tags (supabase/15_crm_tags.sql). Sem a tabela, funciona com cores automaticas. */
(function () {
  const CC = window.CC;
  const { $, $$, esc, icon, api, label, todayISO, addDays } = CC;

  const PALETTE = ['#2b8ba5', '#e07b24', '#3fb58a', '#7c6cf0', '#d6b43c', '#e0483e', '#e05a7a', '#4aa3df', '#8a7f9c', '#6f8d98', '#c0563a', '#5bbf5b'];
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const hash = (s) => { let h = 0; for (const c of norm(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const autoColor = (name) => PALETTE[hash(name) % PALETTE.length];

  const T = {
    rows: [], loaded: false, missing: false,
    async load(force = false) {
      if (T.loaded && !force) return T.rows;
      try { T.rows = await api.list('crm_tags', { order: 'sort' }); T.missing = false; }
      catch (err) { T.rows = []; T.missing = /crm_tags|does not exist|schema cache/i.test(String(err?.message || err)); }
      T.loaded = true;
      return T.rows;
    },
    find(kind, name) { const n = norm(name); return T.rows.find((t) => t.kind === kind && norm(t.name) === n); },
    color(kind, name) { return T.find(kind, name)?.color || autoColor(name); },
    list(kind, leads = []) {
      const names = new Map(T.rows.filter((t) => t.kind === kind).map((t) => [norm(t.name), t.name]));
      leads.forEach((l) => (kind === 'TAG' ? (l.tags || []) : [l.segment]).filter(Boolean).forEach((n) => { if (!names.has(norm(n))) names.set(norm(n), n); }));
      const order = (n) => T.find(kind, n)?.sort ?? 999;
      return [...names.values()].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'pt-BR'));
    },
    // nicho do lead: segmento salvo; senao palavras-chave do catalogo (mesma regra do banco)
    niche(l) {
      if (l.segment) return l.segment;
      const text = norm([l.company, l.main_activity, l.specialty, l.notes].filter(Boolean).join(' '));
      const hit = T.rows.filter((t) => t.kind === 'NICHO').find((t) => (t.keywords || []).some((k) => norm(k) && text.includes(norm(k))));
      return hit ? hit.name : '';
    },
    chip(kind, name, { small = false, x = false } = {}) {
      const c = T.color(kind, name);
      return `<span class="tagc ${kind === 'NICHO' ? 'niche' : ''} ${small ? 'sm' : ''}" style="--tc:${esc(c)}">${kind === 'NICHO' ? '<i></i>' : ''}${esc(name)}${x ? `<button type="button" data-tag-x="${esc(name)}" aria-label="Remover tag ${esc(name)}">×</button>` : ''}</span>`;
    }
  };
  CC.tags = T;

  // ------------------------------------------------------------------ Estrelas coloridas + nota/avaliacoes
  const POT_CLS = { 5: 'p5', 4: 'p4', 3: 'p3', 2: 'p2', 1: 'p1' };
  CC.potStars = (n, { compact = false } = {}) => {
    if (!n) return '<span class="muted small">—</span>';
    return `<span class="pot ${POT_CLS[n]}" title="Potencial ${n} de 5">${compact ? `★ ${n}` : `${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i>`}</span>`;
  };
  CC.ratingTone = (r) => (r == null ? '' : r >= 4.7 ? 'r-top' : r >= 4.3 ? 'r-good' : r >= 4 ? 'r-mid' : 'r-low');
  CC.reviewTone = (n) => (n == null ? '' : n >= 200 ? 'v-high' : n >= 50 ? 'v-mid' : 'v-low');
  CC.googleBadge = (l) => (l.google_rating != null
    ? `<span class="gbadge ${CC.ratingTone(Number(l.google_rating))}" title="Nota ${String(l.google_rating).replace('.', ',')} no Google com ${Number(l.google_reviews || 0).toLocaleString('pt-BR')} avaliações">★ ${String(l.google_rating).replace('.', ',')}<b class="${CC.reviewTone(Number(l.google_reviews || 0))}">${Number(l.google_reviews || 0).toLocaleString('pt-BR')}</b></span>`
    : '');

  // ------------------------------------------------------------------ Busca melhorada
  // Varias palavras (todas precisam bater), sem acento. #tag filtra por tag, nicho:xxx por nicho,
  // uf:SP, cidade:xxx, ★4 (potencial minimo), nota:4.5 (nota minima).
  CC.leadSearch = (l, q) => {
    const s = String(q || '').trim(); if (!s) return true;
    const terms = s.match(/"[^"]+"|\S+/g) || [];
    const hay = norm([l.company, l.name, l.legal_name, l.segment, l.city, l.state, l.neighborhood, l.address, l.phone, l.whatsapp, CC.digits(l.whatsapp || ''), CC.digits(l.phone || ''),
      l.email, l.instagram, l.website, l.notes, l.main_activity, l.specialty, CC.digits(l.document || ''), (l.tags || []).join(' '), label(l.status)].filter(Boolean).join(' | '));
    const tags = (l.tags || []).map(norm);
    return terms.every((raw) => {
      const t = norm(raw.replace(/^"|"$/g, ''));
      if (t.startsWith('#')) return tags.some((x) => x.includes(t.slice(1)));
      const m = t.match(/^(nicho|uf|cidade|tag|status|nota|pot|potencial):(.+)$/);
      if (m) {
        const v = m[2];
        if (m[1] === 'nicho') return norm(T.niche(l)).includes(v);
        if (m[1] === 'uf') return norm(l.state) === v;
        if (m[1] === 'cidade') return norm(l.city).includes(v);
        if (m[1] === 'tag') return tags.some((x) => x.includes(v));
        if (m[1] === 'status') return norm(l.status).includes(v.replace(/\s+/g, '_')) || norm(label(l.status)).includes(v);
        if (m[1] === 'nota') return Number(l.google_rating || 0) >= Number(v.replace(',', '.'));
        return Number(l.potential || 0) >= Number(v);
      }
      if (/^★\d$/.test(raw)) return Number(l.potential || 0) >= Number(raw.slice(1));
      const d = CC.digits(t);
      if (d.length >= 4 && d.length === t.replace(/[\s().-]/g, '').length) return hay.includes(d);
      return hay.includes(t);
    });
  };

  // ------------------------------------------------------------------ Gravacoes rapidas
  const saveTags = async (lead, tags) => {
    const clean = [...new Map(tags.map((t) => [norm(t), t.trim()])).values()].filter(Boolean);
    const row = await api.update('leads', lead.id, { tags: clean });
    lead.tags = row.tags; return lead;
  };
  CC.toggleLeadTag = async (lead, name) => {
    const has = (lead.tags || []).some((t) => norm(t) === norm(name));
    await saveTags(lead, has ? lead.tags.filter((t) => norm(t) !== norm(name)) : [...(lead.tags || []), name]);
    return !has;
  };
  CC.createTag = async (name, color, kind = 'TAG') => {
    name = String(name || '').trim(); if (!name) throw new Error('Digite o nome da tag.');
    if (T.find(kind, name)) return T.find(kind, name);
    if (T.missing) return { kind, name, color: color || autoColor(name) };
    const row = await api.insert('crm_tags', { kind, name, color: color || autoColor(name), sort: 500 });
    T.rows.push(row); return row;
  };

  // Mensagem enviada a partir do card: confirma a ultima mensagem aberta/copiada e move o lead
  CC.markLeadMessageSent = async (lead, { demoUrl = '' } = {}) => {
    const now = new Date().toISOString();
    let msg = null;
    try {
      const open = await api.list('lead_messages', { filters: [['eq', 'lead_id', lead.id], ['neq', 'status', 'ENVIADA']], order: 'created_at', asc: false, limit: 1 });
      msg = open[0] || null;
      if (msg) await api.update('lead_messages', msg.id, { status: 'ENVIADA', sent_at: now, updated_at: now });
    } catch (err) { /* sem tabela de mensagens: segue so com o lead */ }
    const patch = { last_contact_at: now };
    if (demoUrl && msg?.final_text?.includes(demoUrl) && ['LEAD', 'CONTATADO', 'RESPONDEU'].includes(lead.status)) patch.status = 'DEMO_ENVIADA';
    else if (lead.status === 'LEAD') patch.status = 'CONTATADO';
    if (!lead.next_action_at || lead.next_action_at <= todayISO()) patch.next_action_at = addDays(todayISO(), 3);
    await api.update('leads', lead.id, patch);
    if (patch.status) await api.insert('lead_activities', { lead_id: lead.id, type: 'STATUS', content: `${label(lead.status)} → ${label(patch.status)}` });
    await api.insert('lead_activities', { lead_id: lead.id, type: 'MENSAGEM', content: msg ? 'Mensagem marcada como enviada (ação rápida do card).' : 'Contato marcado como enviado (ação rápida do card).' });
    Object.assign(lead, patch);
    return patch;
  };

  // ------------------------------------------------------------------ Popover de tags (card, tabela, perfil)
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onEsc); } };
  const outside = (e) => { if (pop && !pop.contains(e.target)) closePop(); };
  const onEsc = (e) => { if (e.key === 'Escape') closePop(); };
  CC.openTagPicker = async (anchor, lead, { leads = [], onChange } = {}) => {
    closePop();
    await T.load();
    pop = document.createElement('div');
    pop.className = 'tag-pop panel';
    const draw = () => {
      const names = T.list('TAG', leads.length ? leads : [lead]);
      const has = (n) => (lead.tags || []).some((t) => norm(t) === norm(n));
      pop.innerHTML = `<div class="tag-pop-head"><strong>Tags</strong><span class="tiny muted">${esc(lead.company)}</span></div>
        <input class="field" data-tp-q placeholder="Buscar ou criar tag..." autocomplete="off">
        <div class="tag-pop-list">${names.map((n) => `<button type="button" class="tag-opt ${has(n) ? 'on' : ''}" data-tp="${esc(n)}"><span class="sw" style="background:${esc(T.color('TAG', n))}"></span>${esc(n)}${has(n) ? icon('check') : ''}</button>`).join('') || '<span class="tiny muted">Nenhuma tag ainda.</span>'}</div>
        <div class="tag-pop-new" hidden><input type="color" data-tp-color value="${autoColor(String(Date.now()))}"><button type="button" class="btn btn-sm btn-primary" data-tp-create>${icon('plus')}<span></span></button></div>
        ${T.missing ? '<p class="tiny muted" style="margin-top:.4rem">Cores personalizadas: rode <code>supabase/15_crm_tags.sql</code>.</p>' : ''}`;
      const q = $('[data-tp-q]', pop);
      q.oninput = () => {
        const v = q.value.trim();
        $$('[data-tp]', pop).forEach((b) => { b.hidden = v && !norm(b.dataset.tp).includes(norm(v)); });
        const exists = names.some((n) => norm(n) === norm(v));
        const box = $('.tag-pop-new', pop); box.hidden = !v || exists;
        $('[data-tp-create] span', pop).textContent = `Criar "${v}"`;
      };
      q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const nb = $('.tag-pop-new', pop); if (!nb.hidden) $('[data-tp-create]', pop).click(); else { const first = $$('[data-tp]', pop).find((b) => !b.hidden); if (first) first.click(); } } };
      setTimeout(() => q.focus(), 20);
    };
    pop.addEventListener('click', async (e) => {
      e.stopPropagation();
      const opt = e.target.closest('[data-tp]');
      try {
        if (opt) { const on = await CC.toggleLeadTag(lead, opt.dataset.tp); CC.toast(`${on ? 'Tag adicionada' : 'Tag removida'}: ${opt.dataset.tp}`); draw(); if (onChange) onChange(lead); return; }
        if (e.target.closest('[data-tp-create]')) {
          const name = $('[data-tp-q]', pop).value.trim();
          const t = await CC.createTag(name, $('[data-tp-color]', pop).value);
          await saveTags(lead, [...(lead.tags || []), t.name]);
          CC.toast(`Tag criada: ${t.name}`); draw(); if (onChange) onChange(lead);
        }
      } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
    });
    document.body.appendChild(pop);
    draw();
    const r = anchor.getBoundingClientRect();
    const w = 260;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
    const below = r.bottom + 6; const h = pop.offsetHeight || 300;
    pop.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
    setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', onEsc); }, 0);
  };

  // ------------------------------------------------------------------ Editor de categorias (nichos + tags)
  CC.editCategories = async (leads = []) => {
    await T.load(true);
    if (T.missing) {
      await CC.modal({ title: 'Categorias e tags', body: '<div class="notice">Para editar nichos e tags com cores, rode <code>supabase/15_crm_tags.sql</code> no Supabase SQL Editor e recarregue a página.</div>' });
      return false;
    }
    const used = (kind, name) => leads.filter((l) => (kind === 'TAG' ? (l.tags || []).some((t) => norm(t) === norm(name)) : norm(l.segment) === norm(name))).length;
    const rowHtml = (t) => `<div class="cat-row" data-cat="${esc(t.id || '')}" data-kind="${t.kind}" data-orig="${esc(t.name || '')}">
        <input type="color" data-c="color" value="${esc(t.color || autoColor(t.name || String(Math.random())))}" aria-label="Cor">
        <input class="field" data-c="name" value="${esc(t.name || '')}" placeholder="${t.kind === 'NICHO' ? 'Nome do nicho' : 'Nome da tag'}">
        ${t.kind === 'NICHO' ? `<input class="field" data-c="keywords" value="${esc((t.keywords || []).join(', '))}" placeholder="palavras-chave: academia, crossfit, gym">` : '<span></span>'}
        <span class="tiny muted mono cat-n">${t.name ? `${used(t.kind, t.name)} leads` : 'novo'}</span>
        <button type="button" class="icon-btn" data-c-del title="Excluir">${icon('trash')}</button>
        ${t.kind === 'NICHO' ? `<details class="cat-msg" ${t.name ? '' : 'open'}><summary class="tiny">Mensagens deste nicho: benefícios, dores e cuidados${(t.benefits || []).length ? ` · ${(t.benefits || []).length} benefício(s)` : ' · usa o padrão'}</summary>
          <label><span class="tiny muted">Benefícios (um por linha). Completam a frase "Um site próprio ajuda a…"</span><textarea class="field" rows="2" data-c="benefits" placeholder="mostrar o cardápio, os horários e facilitar pedidos">${esc((t.benefits || []).join('\n'))}</textarea></label>
          <label><span class="tiny muted">Dores comuns (uma por linha). Viram pergunta, nunca afirmação: "Hoje vocês lidam com…?"</span><textarea class="field" rows="2" data-c="pains" placeholder="ligações perguntando cardápio e horário">${esc((t.pains || []).join('\n'))}</textarea></label>
          <label><span class="tiny muted">Cuidados (aparecem no gerador). Cite o conselho (OAB, CRM, CRO…) para ativar o filtro de área regulada.</span><input class="field" data-c="notes" value="${esc(t.notes || '')}" placeholder="Sem promessa de resultado."></label>
        </details>` : ''}
      </div>`;
    const group = (kind, title, hint) => `<section class="cat-group" data-group="${kind}"><header><h3>${title}</h3><p class="tiny muted">${hint}</p></header>
        <div class="cat-list">${T.rows.filter((t) => t.kind === kind).map(rowHtml).join('')}</div>
        <button type="button" class="btn btn-sm" data-c-add="${kind}">${icon('plus')}Adicionar ${kind === 'NICHO' ? 'nicho' : 'tag'}</button></section>`;
    const body = `<div class="cat-editor">
        ${group('NICHO', 'Nichos (categorias)', 'Separação automática: leads do agente recebem o nicho do perfil; leads manuais/CSV sem segmento recebem o primeiro nicho cujas palavras-chave aparecem no nome, atividade ou notas. O gerador de mensagens usa os benefícios, dores e cuidados de cada nicho; nicho novo funciona sem mexer no código.')}
        ${group('TAG', 'Tags', 'Tags livres com cor. Aparecem nos cards e servem de filtro (#tag na busca). Renomear atualiza todos os leads.')}
        <div class="row" style="margin-top:.8rem"><button type="button" class="btn btn-sm" data-c-apply>${icon('zap')}Aplicar nichos aos leads sem nicho</button></div>
      </div>`;
    const removed = [];
    return CC.modal({
      title: 'Categorias e tags', wide: true, body,
      actions: [{ label: 'Cancelar', value: false }, {
        label: 'Salvar', primary: true, handler: async (el) => {
          const rows = $$('.cat-row', el).map((r) => ({ el: r, id: r.dataset.cat, kind: r.dataset.kind, orig: r.dataset.orig, name: $('[data-c="name"]', r).value.trim(), color: $('[data-c="color"]', r).value, keywords: r.dataset.kind === 'NICHO' ? $('[data-c="keywords"]', r).value.split(',').map((x) => x.trim()).filter(Boolean) : [],
            lines: (k) => ($(`[data-c="${k}"]`, r)?.value || '').split('\n').map((x) => x.trim()).filter(Boolean), notes: $('[data-c="notes"]', r)?.value.trim() || null }));
          const seen = new Set();
          for (const r of rows) {
            if (!r.name) { r.el.classList.add('err'); throw new Error('Há uma linha sem nome.'); }
            const k = `${r.kind}|${norm(r.name)}`; if (seen.has(k)) { r.el.classList.add('err'); throw new Error(`Nome repetido: ${r.name}`); } seen.add(k);
          }
          for (const d of removed) await api.rpc('cc_delete_tag', { p_kind: d.kind, p_name: d.name });
          let i = 0;
          for (const r of rows) {
            i += 1;
            if (r.id && r.orig && norm(r.orig) !== norm(r.name)) await api.rpc('cc_rename_tag', { p_kind: r.kind, p_old: r.orig, p_new: r.name });
            const rec = { kind: r.kind, name: r.name, color: r.color, keywords: r.keywords, sort: i * 10, updated_at: new Date().toISOString() };
            if (r.kind === 'NICHO') Object.assign(rec, { benefits: r.lines('benefits'), pains: r.lines('pains'), notes: r.notes });
            if (r.id) await api.update('crm_tags', r.id, rec); else await api.insert('crm_tags', rec);
          }
          await T.load(true);
          if (CC.messaging?.refreshCategories) CC.messaging.refreshCategories();
          CC.toast('Categorias salvas.');
          return true;
        }
      }],
      onOpen: (el) => {
        el.addEventListener('click', async (e) => {
          const add = e.target.closest('[data-c-add]');
          if (add) { const list = $(`[data-group="${add.dataset.cAdd}"] .cat-list`, el); list.insertAdjacentHTML('beforeend', rowHtml({ kind: add.dataset.cAdd, name: '' })); $('.cat-row:last-child [data-c="name"]', list).focus(); return; }
          const del = e.target.closest('[data-c-del]');
          if (del) {
            const r = del.closest('.cat-row');
            if (r.dataset.cat) {
              const n = used(r.dataset.kind, r.dataset.orig);
              const ok = await CC.confirmDialog(r.dataset.kind === 'TAG' ? `Excluir a tag "${r.dataset.orig}"? Ela sai de ${n} lead(s).` : `Excluir o nicho "${r.dataset.orig}" do catálogo? Os ${n} lead(s) mantêm o segmento escrito.`, { okLabel: 'Excluir', danger: true });
              if (!ok) return;
              removed.push({ kind: r.dataset.kind, name: r.dataset.orig });
            }
            r.remove(); return;
          }
          const ap = e.target.closest('[data-c-apply]');
          if (ap) { try { await CC.busy(ap, async () => { const n = await api.rpc('cc_apply_niches'); CC.toast(`${n} lead(s) receberam nicho. Salve as palavras-chave antes, se mudou alguma.`); }); } catch (err) { CC.toast(CC.errMsg(err), 'error'); } }
        });
      }
    });
  };
})();
