/* CDEV Control Center - Estudio de mensagens (no perfil do lead) + editor de templates
 * Fluxo: estrategia/tom/tamanho/template -> Gerar (ate 3 versoes) -> Usar -> editar -> Salvar/Copiar -> Abrir WhatsApp
 * Historico em public.lead_messages. Abrir o WhatsApp NAO marca como enviada: o usuario confirma.
 */
(function () {
  const CC = window.CC;
  const { $, $$, esc, icon, api, badge, label, fmtDateTime, todayISO, addDays } = CC;
  const M = () => CC.messaging;

  const STATUS = { GERADA: ['Gerada', 'gray'], EDITADA: ['Editada', 'blue'], COPIADA: ['Copiada', 'blue'], WHATSAPP_ABERTO: ['WhatsApp aberto', 'yellow'], ENVIADA: ['Enviada', 'green'] };
  const RANK = { GERADA: 1, EDITADA: 2, COPIADA: 3, WHATSAPP_ABERTO: 4, ENVIADA: 5 };
  const statusChip = (s) => `<span class="badge ${STATUS[s]?.[1] || 'gray'}">${esc(STATUS[s]?.[0] || s)}</span>`;
  const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
  const prefsKey = 'cdev:msg-prefs';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(prefsKey) || '{}'); } catch (e) { return {}; } };
  const savePrefs = (p) => { try { localStorage.setItem(prefsKey, JSON.stringify(p)); } catch (e) { /* sem storage */ } };

  // ================================================================== ESTUDIO NO LEAD
  async function mount(el, { lead, demoUrl = '', onLeadChanged }) {
    const [templates, history] = await Promise.all([
      api.list('message_templates', { order: 'name' }),
      api.list('lead_messages', { filters: [['eq', 'lead_id', lead.id]], order: 'created_at', asc: false, limit: 30 })
    ]);
    const prefs = loadPrefs();
    const st = {
      strategy: 'AUTO', tone: prefs.tone || 'NATURAL', size: prefs.size || 'MEDIA', level: 'AUTO', templateId: 'AUTO',
      result: null, generated: '', meta: null, sessionId: null, sessionStatus: null, history, seed: Date.now()
    };
    const niche = M().detectNiche(lead);
    const phone = lead.whatsapp || lead.phone;
    const vars = M().buildVars(lead, { niche, demoUrl });
    const tplOptions = () => {
      const pool = templates.filter((t) => t.active !== false && t.channel !== 'EMAIL');
      const mine = pool.filter((t) => t.niche && t.niche === niche);
      const uni = pool.filter((t) => !t.niche);
      const other = pool.filter((t) => t.niche && t.niche !== niche);
      const group = (title, list) => (list.length ? `<optgroup label="${esc(title)}">${list.map((t) => opt(t.id, t.name, st.templateId)).join('')}</optgroup>` : '');
      return opt('AUTO', 'Automático (melhor para o lead)', st.templateId) + opt('COMPOSE', 'Composição modular (sem template)', st.templateId)
        + group(niche ? M().NICHES[niche].label : 'Nicho', mine) + group('Universal', uni) + group('Outros nichos', other);
    };
    const auto = M().autoStrategy(M().levelVars(vars, M().autoLevel(vars)));
    const dataChips = () => {
      const groups = [['basico', 'Básico'], ['medio', 'Médio'], ['avancado', 'Avançado']];
      return groups.map(([g, t]) => `<div class="ms-vargroup"><span>${t}</span>${M().VAR_ORDER.filter((k) => M().VARIABLES[k].group === g && !k.startsWith('tem_')).map((k) => {
        const val = vars[k];
        return `<span class="ms-var ${val ? 'on' : 'off'}" title="${esc(val ? `${M().VARIABLES[k].label}: ${val}` : `${M().VARIABLES[k].label}: não preenchido`)}">{{${k}}}</span>`;
      }).join('')}</div>`).join('');
    };
    const last = () => st.history[0];
    const lastBox = () => {
      const m = last();
      if (!m) return '<p class="small muted">Nenhuma mensagem salva para este lead ainda.</p>';
      return `<div class="row" style="gap:.4rem;flex-wrap:wrap">${statusChip(m.status)}<span class="tiny muted">${fmtDateTime(m.updated_at || m.created_at)}</span></div>
        <div class="tiny muted" style="margin:.35rem 0">Estratégia: <b>${esc(M().STRATEGIES[m.strategy]?.name || m.strategy || '—')}</b> · Template: <b>${esc(m.template_name || '—')}</b></div>
        <div class="ms-last-text">${esc(m.final_text)}</div>
        <div class="row" style="margin-top:.55rem;gap:.35rem;flex-wrap:wrap">
          ${m.status !== 'ENVIADA' && ['WHATSAPP_ABERTO', 'COPIADA'].includes(m.status) ? `<button class="btn btn-sm btn-primary" data-ms-sent="${m.id}">${icon('check')}Marcar como enviada</button>` : ''}
          <button class="btn btn-sm" data-ms-reuse="${m.id}">${icon('copy')}Reutilizar texto</button>
        </div>`;
    };
    const historyList = () => (st.history.length > 1 ? `<div class="ms-hist">${st.history.slice(1, 12).map((m) => `<button type="button" class="ms-hist-row" data-ms-reuse="${m.id}" title="Clique para reutilizar o texto">
        <span>${statusChip(m.status)}</span><span class="tiny">${fmtDateTime(m.updated_at || m.created_at)}</span><span class="tiny muted">${esc(M().STRATEGIES[m.strategy]?.name || '')}</span></button>`).join('')}</div>` : '');

    el.innerHTML = `
      <div class="ms">
        <div class="ms-grid">
          <section class="ms-main">
            <div class="ms-controls">
              <label><span>Estratégia</span><select class="cc-select" data-ms="strategy">${opt('AUTO', `Automática → ${auto.label}`, st.strategy)}${Object.entries(M().STRATEGIES).map(([k, s]) => opt(k, s.name, st.strategy)).join('')}</select></label>
              <label><span>Tom</span><select class="cc-select" data-ms="tone">${M().TONES.map(([k, t]) => opt(k, t, st.tone)).join('')}</select></label>
              <label><span>Tamanho</span><select class="cc-select" data-ms="size">${M().SIZES.map(([k, t]) => opt(k, t, st.size)).join('')}</select></label>
              <label><span>Template</span><select class="cc-select" data-ms="templateId">${tplOptions()}</select></label>
              <label><span>Personalização</span><select class="cc-select" data-ms="level">${M().LEVELS.map(([k, t]) => opt(k, k === 'AUTO' ? `Automática (${({ BASICO: 'básica', MEDIO: 'média', AVANCADO: 'avançada' })[M().autoLevel(vars)]})` : t, st.level)).join('')}</select></label>
              <button class="btn btn-primary ms-gen" data-ms-generate>${icon('rocket')}Gerar mensagem</button>
            </div>
            <p class="ms-auto tiny muted" data-ms-info>Nicho: <b>${esc(niche ? M().NICHES[niche].label : 'não identificado (usa templates universais)')}</b> · automática sugere <b>${esc(auto.label)}</b> porque ${esc(auto.why)}.${niche && M().NICHES[niche].notes ? ` <span class="ms-rule">${esc(M().NICHES[niche].notes)}</span>` : ''}</p>
            <div class="ms-error" data-ms-error hidden></div>
            <div class="ms-versions" data-ms-versions></div>
            <div class="ms-editor">
              <div class="ms-editor-head"><strong>Mensagem</strong><span data-ms-state class="tiny muted">Gere uma mensagem ou escreva a sua.</span><span class="spacer"></span><span class="tiny muted" data-ms-count>0 caracteres</span></div>
              <textarea class="field" rows="9" data-ms-text placeholder="A mensagem escolhida aparece aqui. Você pode editar livremente antes de enviar."></textarea>
              <div class="ms-warn" data-ms-warn hidden></div>
              <div class="ms-actions">
                <button class="btn btn-sm" data-ms-regen disabled>${icon('refresh')}Regenerar</button>
                <button class="btn btn-sm" data-ms-copy>${icon('copy')}Copiar</button>
                <button class="btn btn-sm" data-ms-save>${icon('check')}Salvar</button>
                <span class="spacer"></span>
                <button class="btn btn-primary ms-wa" data-ms-wa ${phone ? '' : 'disabled title="Lead sem telefone"'}>${icon('msg')}Abrir WhatsApp</button>
              </div>
              <p class="tiny muted" data-ms-sentline style="margin-top:.45rem">${phone ? `Abre a conversa com ${esc(CC.fmtPhone(phone))} com a mensagem preenchida, sempre na mesma aba do WhatsApp. Você decide quando enviar.` : 'Este lead não tem telefone cadastrado.'}</p>
            </div>
          </section>
          <aside class="ms-side">
            <div class="info-card"><h3>${icon('msg')}Última mensagem</h3><div data-ms-last>${lastBox()}</div><div data-ms-hist>${historyList()}</div></div>
            <div class="info-card"><h3>${icon('idcard')}Dados disponíveis</h3>
              <p class="tiny muted" style="margin-bottom:.5rem">Verde = preenchido e pode entrar na mensagem. Cinza = vazio (não será usado).</p>
              ${dataChips()}
              <button class="btn btn-sm" style="margin-top:.6rem" data-ms-edit-lead>${icon('edit')}Completar dados do lead</button>
            </div>
          </aside>
        </div>
      </div>`;

    const text = $('[data-ms-text]', el);
    const setError = (msg) => { const e = $('[data-ms-error]', el); e.hidden = !msg; e.innerHTML = msg ? `${icon('alert')}<span class="pre">${esc(msg)}</span>${/variável/.test(msg) ? '<button class="btn btn-sm" data-ms-edit-lead>Preencher dados</button>' : ''}` : ''; };
    const refreshEditorState = () => {
      const v = text.value;
      $('[data-ms-count]', el).textContent = `${v.length} caracteres`;
      const problem = v.trim() ? M().validateFinal(v) : '';
      const w = $('[data-ms-warn]', el); w.hidden = !problem; w.textContent = problem;
      const edited = st.generated && v.trim() !== st.generated.trim();
      $('[data-ms-state]', el).innerHTML = !v.trim() ? 'Gere uma mensagem ou escreva a sua.' : st.generated ? (edited ? '<span class="badge blue">editada</span>' : '<span class="badge gray">gerada</span>') : '<span class="badge blue">escrita manualmente</span>';
    };
    text.addEventListener('input', () => { if (st.sessionId && st.sessionStatus && RANK[st.sessionStatus] >= RANK.COPIADA) { st.sessionId = null; st.sessionStatus = null; } refreshEditorState(); });

    const renderVersions = () => {
      const box = $('[data-ms-versions]', el);
      const r = st.result;
      if (!r) { box.innerHTML = ''; return; }
      if (r.repeated) {
        box.innerHTML = `<div class="ms-error">${icon('alert')}<span>As combinações possíveis com os dados deste lead geraram o mesmo texto da última mensagem.</span><button class="btn btn-sm" data-ms-force>Gerar mesmo assim</button></div>`;
        return;
      }
      box.innerHTML = `<div class="ms-vhead tiny muted">Estratégia: <b>${esc(r.strategyLabel || '')}</b>${r.why ? ` (${esc(r.why)})` : ''} · personalização ${esc(({ BASICO: 'básica', MEDIO: 'média', AVANCADO: 'avançada' })[r.level] || '')}</div>
        <div class="ms-vgrid">${r.versions.map((v, i) => `<article class="ms-version ${st.meta && st.meta.index === i ? 'is-used' : ''}">
          <header><strong>Versão ${i + 1}</strong><span class="badge gray">${esc(M().TONES.find(([k]) => k === v.tone)?.[1] || v.tone)}</span><span class="tiny muted" title="${esc(v.templateName)}">${esc(v.source === 'TEMPLATE' ? v.templateName : 'modular')}</span></header>
          <div class="ms-vtext">${esc(v.text)}</div>
          <footer><button class="btn btn-sm btn-primary" data-ms-use="${i}">Usar</button><button class="btn btn-sm" data-ms-vcopy="${i}">${icon('copy')}Copiar</button></footer>
        </article>`).join('')}</div>`;
    };

    const runGenerate = ({ force = false } = {}) => {
      setError('');
      const avoid = force ? [] : [...st.history.slice(0, 3).flatMap((m) => [m.final_text, m.generated_text]), ...(st.result?.versions || []).map((v) => v.text)].filter(Boolean);
      st.seed = Date.now() + Math.floor(Math.random() * 1e6);
      const r = M().generate({ lead, templates, demoUrl, strategy: st.strategy, tone: st.tone, size: st.size, level: st.level, templateId: st.templateId, seed: st.seed, avoidTexts: avoid, lastCta: st.history[0]?.final_text ? (M().CTAS.demo.concat(M().CTAS.noDemo).find((c) => st.history[0].final_text.includes(c)) || '') : '' });
      if (r.error) { st.result = null; renderVersions(); setError(r.error); return; }
      st.result = r; renderVersions();
      $('[data-ms-regen]', el).disabled = false;
      if (!text.value.trim() && r.versions[0]) useVersion(0);
    };
    const useVersion = (i) => {
      const v = st.result.versions[i]; if (!v) return;
      text.value = v.text; st.generated = v.text;
      st.meta = { index: i, templateId: v.templateId, templateName: v.templateName, strategy: st.result.strategy, tone: v.tone, size: st.size, level: st.result.level };
      st.sessionId = null; st.sessionStatus = null;
      renderVersions(); refreshEditorState();
      text.focus();
    };

    // Grava/atualiza a mensagem no historico (uma "sessao" por texto em uso)
    const record = async (status, extra = {}) => {
      const final = text.value.trim();
      const edited = st.generated && final !== st.generated.trim();
      const nextStatus = status === 'GERADA' && edited ? 'EDITADA' : status;
      const base = {
        final_text: final, generated_text: st.generated || null, template_id: st.meta?.templateId || null, template_name: st.meta?.templateName || (st.generated ? null : 'Texto manual'),
        strategy: st.meta?.strategy || null, tone: st.meta?.tone || null, size: st.meta?.size || null, personalization: st.meta?.level || null,
        phone: CC.normalizePhone(phone) || null, updated_at: new Date().toISOString(), ...extra
      };
      if (st.sessionId) {
        const keep = RANK[st.sessionStatus] > RANK[nextStatus] ? st.sessionStatus : nextStatus;
        const row = await api.update('lead_messages', st.sessionId, { ...base, status: keep });
        st.sessionStatus = row.status; st.history = [row, ...st.history.filter((m) => m.id !== row.id)];
      } else {
        const row = await api.insert('lead_messages', { lead_id: lead.id, ...base, status: nextStatus });
        st.sessionId = row.id; st.sessionStatus = row.status; st.history = [row, ...st.history];
      }
      $('[data-ms-last]', el).innerHTML = lastBox(); $('[data-ms-hist]', el).innerHTML = historyList();
    };
    const guard = () => { const p = M().validateFinal(text.value); if (p) { CC.toast(p, 'error'); refreshEditorState(); return false; } return true; };

    el.addEventListener('change', (e) => {
      const s = e.target.closest('[data-ms]'); if (!s) return;
      st[s.dataset.ms] = s.value;
      if (['tone', 'size'].includes(s.dataset.ms)) savePrefs({ tone: st.tone, size: st.size });
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || !el.contains(b)) return;
      try {
        if (b.matches('[data-ms-generate]')) { runGenerate(); return; }
        if (b.matches('[data-ms-regen]')) { runGenerate(); CC.toast('Nova construção gerada com os mesmos dados.'); return; }
        if (b.matches('[data-ms-force]')) { runGenerate({ force: true }); return; }
        if (b.dataset.msUse !== undefined) { useVersion(Number(b.dataset.msUse)); return; }
        if (b.dataset.msVcopy !== undefined) { await navigator.clipboard.writeText(st.result.versions[Number(b.dataset.msVcopy)].text); CC.toast('Versão copiada.'); return; }
        if (b.matches('[data-ms-copy]')) { if (!guard()) return; await navigator.clipboard.writeText(text.value.trim()); await record('COPIADA'); CC.toast('Mensagem copiada.'); return; }
        if (b.matches('[data-ms-save]')) { if (!guard()) return; await record('GERADA'); CC.toast('Mensagem salva no histórico do lead.'); return; }
        if (b.matches('[data-ms-wa]')) {
          if (!guard()) return;
          if (!CC.normalizePhone(phone)) { CC.toast('Telefone do lead inválido para WhatsApp.', 'error'); return; }
          const r = CC.openWhatsAppContact(phone, text.value.trim());
          if (!r.ok) return;
          await record('WHATSAPP_ABERTO', { whatsapp_opened_at: new Date().toISOString() });
          await api.insert('lead_activities', { lead_id: lead.id, type: 'MENSAGEM', content: `WhatsApp aberto com mensagem (${M().STRATEGIES[st.meta?.strategy]?.name || 'texto manual'}). Aguardando confirmação de envio.` });
          $('[data-ms-sentline]', el).innerHTML = `${r.mode === 'desktop' ? 'Conversa aberta no app do WhatsApp' : 'WhatsApp aberto na aba CDEV'}. Depois de enviar, confirme: <button class="btn btn-sm btn-primary" data-ms-sent="${st.sessionId}">${icon('check')}Marcar como enviada</button>`;
          return;
        }
        if (b.dataset.msSent) {
          const id = b.dataset.msSent;
          const msg = st.history.find((m) => m.id === id);
          const row = await api.update('lead_messages', id, { status: 'ENVIADA', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          st.history = st.history.map((m) => (m.id === id ? row : m)); if (st.sessionId === id) st.sessionStatus = 'ENVIADA';
          const patch = { last_contact_at: new Date().toISOString() };
          if (demoUrl && msg?.final_text?.includes(demoUrl) && ['LEAD', 'CONTATADO', 'RESPONDEU'].includes(lead.status)) patch.status = 'DEMO_ENVIADA';
          else if (lead.status === 'LEAD') patch.status = 'CONTATADO';
          if (!lead.next_action_at || lead.next_action_at <= todayISO()) patch.next_action_at = addDays(todayISO(), 3);
          await api.update('leads', lead.id, patch);
          if (patch.status) await api.insert('lead_activities', { lead_id: lead.id, type: 'STATUS', content: `${label(lead.status)} → ${label(patch.status)}` });
          await api.insert('lead_activities', { lead_id: lead.id, type: 'MENSAGEM', content: 'Mensagem marcada como enviada pelo WhatsApp.' });
          Object.assign(lead, patch);
          $('[data-ms-last]', el).innerHTML = lastBox(); $('[data-ms-hist]', el).innerHTML = historyList();
          $('[data-ms-sentline]', el).textContent = 'Mensagem marcada como enviada. Follow-up agendado para 3 dias.';
          CC.toast(`Enviada${patch.status ? ` · status: ${label(patch.status)}` : ''}.`);
          if (onLeadChanged) onLeadChanged(lead);
          return;
        }
        if (b.dataset.msReuse) {
          const m = st.history.find((x) => x.id === b.dataset.msReuse); if (!m) return;
          text.value = m.final_text; st.generated = ''; st.meta = { templateId: m.template_id, templateName: m.template_name, strategy: m.strategy, tone: m.tone, size: m.size, level: m.personalization };
          st.sessionId = null; st.sessionStatus = null; refreshEditorState(); text.focus();
          return;
        }
        if (b.matches('[data-ms-edit-lead]')) { if (onLeadChanged) onLeadChanged(lead, { edit: true }); }
      } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
    });
    refreshEditorState();
  }

  // ================================================================== TEMPLATES (Mensagens -> Templates)
  const nicheName = (k) => (k ? (M().NICHES[k]?.label || k) : 'Universal');
  async function editTemplate(row, leads) {
    const t = row ? { ...row } : { name: '', niche: '', strategy: 'GENERICA', tone: 'NATURAL', size: 'MEDIA', active: true, channel: 'WHATSAPP', body: 'Olá, {{nome}}! Tudo bem?\n\nEncontrei a {{empresa}} aqui de {{cidade}}.\n\n{{cta}}' };
    const sampleLeads = leads.slice(0, 300);
    const body = `
      <div class="te">
        <div class="te-left">
          <div class="form-grid">
            <div class="form-field full"><label>Nome *</label><input class="field" name="name" value="${esc(t.name)}"></div>
            <div class="form-field"><label>Nicho</label><select class="cc-select" name="niche">${opt('', 'Universal (todos)', t.niche || '')}${Object.entries(M().NICHES).map(([k, n]) => opt(k, n.label, t.niche)).join('')}</select></div>
            <div class="form-field"><label>Estratégia</label><select class="cc-select" name="strategy">${opt('', '— uso manual (fora da geração automática)', t.strategy || '')}${Object.entries(M().STRATEGIES).map(([k, s]) => opt(k, s.name, t.strategy)).join('')}</select></div>
            <div class="form-field"><label>Tom</label><select class="cc-select" name="tone">${M().TONES.map(([k, x]) => opt(k, x, t.tone)).join('')}</select></div>
            <div class="form-field"><label>Tamanho</label><select class="cc-select" name="size">${M().SIZES.map(([k, x]) => opt(k, x, t.size)).join('')}</select></div>
            <div class="form-field full"><label class="check"><input type="checkbox" name="active" ${t.active !== false ? 'checked' : ''}> Ativo (pode ser usado na geração)</label></div>
          </div>
          <div class="te-vars"><span class="tiny muted">Clique para inserir no cursor:</span>${M().VAR_ORDER.map((k) => `<button type="button" class="ms-var on" data-insert="${k}" title="${esc(M().VARIABLES[k].label)}">{{${k}}}</button>`).join('')}</div>
          <textarea class="field te-body" name="body" rows="14">${esc(t.body)}</textarea>
        </div>
        <div class="te-right">
          <label class="tiny muted">Preview com o lead:</label>
          <select class="cc-select" data-te-lead>${sampleLeads.length ? sampleLeads.map((l) => opt(l.id, `${l.company}${l.city ? ` · ${l.city}` : ''}`, sampleLeads[0].id)).join('') : '<option value="">(nenhum lead cadastrado)</option>'}</select>
          <div class="te-preview" data-te-preview></div>
          <div class="te-check" data-te-check></div>
        </div>
      </div>`;
    return CC.modal({
      title: row ? `Editar template: ${row.name}` : 'Novo template', wide: true, body,
      actions: [{ label: 'Cancelar', value: null }, { label: 'Salvar template', primary: true, handler: async (b) => {
        const v = (n) => $(`[name=${n}]`, b);
        const rec = { name: v('name').value.trim(), niche: v('niche').value || null, strategy: v('strategy').value || null, tone: v('tone').value, size: v('size').value,
          active: v('active').checked, body: v('body').value, channel: t.channel || 'WHATSAPP', updated_at: new Date().toISOString() };
        if (!rec.name) { CC.toast('Dê um nome ao template.', 'error'); return false; }
        if (!rec.body.trim()) { CC.toast('O conteúdo está vazio.', 'error'); return false; }
        const unk = M().unknownVars(rec.body, sampleLeads[0] || {});
        if (unk.length) { CC.toast(`Variáveis desconhecidas: ${unk.map((k) => `{{${k}}}`).join(', ')}`, 'error'); return false; }
        return row ? api.update('message_templates', row.id, rec) : api.insert('message_templates', rec);
      } }],
      onOpen: (b) => {
        const ta = $('[name=body]', b);
        const preview = () => {
          const l = sampleLeads.find((x) => x.id === $('[data-te-lead]', b).value) || {};
          const vars = M().buildVars(l, { demoUrl: l.demo_project_id ? CC.demoUrl(l._demoSlug || 'demo-do-lead') : '', cta: M().CTAS.noDemo[0] });
          const r = M().renderTemplate(ta.value, vars, l);
          $('[data-te-preview]', b).textContent = r.text || '(vazio)';
          const msgs = [
            ...r.missing.map((k) => `<li class="warn">{{${k}}}: este lead não tem esse dado (a geração vai bloquear este template para ele).</li>`),
            ...r.unknown.map((k) => `<li class="err">{{${k}}}: variável desconhecida.</li>`)
          ];
          $('[data-te-check]', b).innerHTML = msgs.length ? `<ul>${msgs.join('')}</ul>` : `<p class="ok">${icon('check')}Todas as variáveis têm valor para este lead.</p>`;
        };
        ta.addEventListener('input', preview);
        $('[data-te-lead]', b).addEventListener('change', preview);
        b.addEventListener('click', (e) => {
          const k = e.target.closest('[data-insert]')?.dataset.insert; if (!k) return;
          const tok = `{{${k}}}`; const s = ta.selectionStart ?? ta.value.length; const en = ta.selectionEnd ?? s;
          ta.value = ta.value.slice(0, s) + tok + ta.value.slice(en); ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length; preview();
        });
        preview();
      }
    });
  }

  CC.routes.mensagens = async (root, r) => {
    const [rows, leads, projects] = await Promise.all([
      api.list('message_templates', { order: 'name' }),
      api.list('leads', { order: 'updated_at', asc: false, limit: 300 }),
      api.list('projects', { select: 'id,slug' })
    ]);
    leads.forEach((l) => { const p = projects.find((x) => x.id === l.demo_project_id); if (p) l._demoSlug = p.slug; });
    const st = { niche: r.query.n || '', strategy: '', q: '' };
    const draw = () => {
      const list = rows.filter((t) => (st.niche === '' || (st.niche === 'universal' ? !t.niche : t.niche === st.niche)) && (!st.strategy || (st.strategy === 'manual' ? !t.strategy : t.strategy === st.strategy)) && (!st.q || `${t.name} ${t.body}`.toLowerCase().includes(st.q.toLowerCase())));
      $('#tpl-list', root).innerHTML = CC.table([
        { label: 'Template', render: (t) => `<strong>${esc(t.name)}</strong><span class="sub">${esc((t.description || t.body).replace(/\s+/g, ' ').slice(0, 110))}</span>` },
        { label: 'Nicho', render: (t) => `<span class="badge ${t.niche ? 'blue' : 'gray'}">${esc(nicheName(t.niche))}</span>` },
        { label: 'Estratégia', render: (t) => esc(M().STRATEGIES[t.strategy]?.name || 'Uso manual') },
        { label: 'Tom · tamanho', render: (t) => `<span class="small">${esc(M().TONES.find(([k]) => k === t.tone)?.[1] || '—')} · ${esc(M().SIZES.find(([k]) => k === t.size)?.[1] || '—')}</span>` },
        { label: 'Ativo', render: (t) => `<label class="check"><input type="checkbox" data-toggle="${t.id}" ${t.active ? 'checked' : ''}></label>` },
        { label: '', render: (t) => `<div class="actions"><button class="icon-btn" data-edit="${t.id}" title="Editar">${icon('edit')}</button><button class="icon-btn" data-dup="${t.id}" title="Duplicar">${icon('copy')}</button><button class="icon-btn danger" data-del="${t.id}" title="Excluir">${icon('trash')}</button></div>` }
      ], list, { empty: 'Nenhum template com esses filtros.' });
    };
    root.innerHTML = `${CC.pageHead('Mensagens', 'Templates', 'Modelos por nicho e estratégia. A geração no perfil do lead escolhe o melhor template automaticamente e bloqueia os que usam dados que o lead não tem.',
      `<a class="btn" href="#/prospeccao">${icon('target')}Leads</a><button class="btn btn-primary" data-new>${icon('plus')}Criar template</button>`)}
      <section class="panel panel-pad">
        <div class="toolbar"><div class="chips">${[['', 'Todos'], ['universal', 'Universal'], ...Object.entries(M().NICHES).map(([k, n]) => [k, n.label])].map(([k, t]) => `<button class="chip ${st.niche === k ? 'active' : ''}" data-niche="${k}">${esc(t)}</button>`).join('')}</div>
          <div class="spacer"></div><input class="field" data-q placeholder="Buscar..." style="min-width:12rem">
          <select class="cc-select" data-strategy style="width:auto">${opt('', 'Todas as estratégias', '')}${Object.entries(M().STRATEGIES).map(([k, s]) => opt(k, s.name, '')).join('')}${opt('manual', 'Uso manual', '')}</select></div>
        <div id="tpl-list"></div>
      </section>`;
    draw();
    root.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { st.q = e.target.value; draw(); } });
    root.addEventListener('change', async (e) => {
      if (e.target.matches('[data-strategy]')) { st.strategy = e.target.value; draw(); return; }
      const tg = e.target.closest('[data-toggle]');
      if (tg) {
        try { const rec = await api.update('message_templates', tg.dataset.toggle, { active: tg.checked, updated_at: new Date().toISOString() }); Object.assign(rows.find((x) => x.id === rec.id), rec); CC.toast(tg.checked ? 'Template ativado.' : 'Template desativado.'); }
        catch (err) { tg.checked = !tg.checked; CC.toast(CC.errMsg(err), 'error'); }
      }
    });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.niche !== undefined) { st.niche = b.dataset.niche; $$('[data-niche]', root).forEach((x) => x.classList.toggle('active', x === b)); draw(); return; }
      if (b.matches('[data-new]')) { if (await editTemplate(null, leads)) { CC.toast('Template criado.'); CC.router.render(); } return; }
      const find = (id) => rows.find((t) => t.id === id);
      if (b.dataset.edit) { if (await editTemplate(find(b.dataset.edit), leads)) { CC.toast('Template salvo.'); CC.router.render(); } return; }
      if (b.dataset.dup) {
        const t = find(b.dataset.dup);
        try { await api.insert('message_templates', { name: `${t.name} (cópia)`, niche: t.niche, strategy: t.strategy, tone: t.tone, size: t.size, body: t.body, channel: t.channel || 'WHATSAPP', active: false, description: t.description, is_system: false }); CC.toast('Template duplicado (inativo até você revisar).'); CC.router.render(); }
        catch (err) { CC.toast(CC.errMsg(err), 'error'); }
        return;
      }
      if (b.dataset.del) { await CC.actions.remove('message_templates', find(b.dataset.del), 'este template'); }
    });
  };

  CC.messageStudio = { mount, editTemplate };
})();
