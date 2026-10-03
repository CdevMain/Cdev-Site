/* CDEV Control Center - ponte com a extensao "CDEV WhatsApp" (WhatsApp Web)
 *
 * Conversa com a extensao por window.postMessage (o content script da extensao roda nesta pagina).
 *   CRM -> extensao: hello, leads-sync (telefones dos leads), open-chat (abre a conversa SEM recarregar
 *                    o WhatsApp Web e ja preenche a mensagem), lead-status (mudou no CRM)
 *   extensao -> CRM: ready, event { message-sent | reply | status-changed } (com id; o CRM confirma com ack)
 *
 * Cada evento so e confirmado (ack) depois de gravado no banco. A extensao guarda os eventos ate o CRM
 * abrir, entao nada se perde se esta aba estiver fechada quando a mensagem for enviada/recebida.
 */
(function () {
  const CC = window.CC;
  const SRC_PAGE = 'cdev-crm';
  const SRC_EXT = 'cdev-ext';
  const STATUS_FLOW = ['LEAD', 'CONTATADO', 'RESPONDEU', 'DEMO_ENVIADA', 'NEGOCIACAO', 'CLIENTE', 'PERDIDO'];

  const B = CC.waBridge = { ready: false, version: '', lastSeen: 0, handled: new Set() };
  const post = (type, payload = {}) => window.postMessage({ source: SRC_PAGE, type, payload }, window.location.origin);
  const waitCtx = () => new Promise((resolve) => { const t = () => (CC.ctx?.supabase ? resolve() : setTimeout(t, 300)); t(); });
  const phoneKey = (v) => { let d = String(v || '').replace(/\D/g, ''); if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2); return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : ''; };
  const changed = (lead) => window.dispatchEvent(new CustomEvent('cdev:lead-changed', { detail: lead }));

  // ------------------------------------------------------------------ indicador no topo
  const paintIndicator = () => {
    const host = document.querySelector('.cc-top-right'); if (!host) return;
    let el = document.getElementById('wa-ext-ind');
    if (!el) { el = document.createElement('span'); el.id = 'wa-ext-ind'; el.className = 'wa-ind'; host.prepend(el); }
    el.classList.toggle('on', B.ready);
    el.title = B.ready ? `Extensão CDEV WhatsApp conectada (v${B.version}). Mensagens enviadas e respostas são sincronizadas.` : 'Extensão CDEV WhatsApp não detectada nesta aba.';
    el.innerHTML = `<i></i>${B.ready ? 'WhatsApp' : 'WhatsApp off'}${B.schedCount ? `<b title="Mensagens agendadas">⏰${B.schedCount}</b>` : ''}${B.schedFailed ? `<b class="bad" title="Agendadas que falharam">!${B.schedFailed}</b>` : ''}`;
    if (!el.dataset.wired) { el.dataset.wired = '1'; el.style.cursor = 'pointer'; el.addEventListener('click', () => B.openSchedules().catch((err) => CC.toast(CC.errMsg(err), 'error'))); }
  };

  // ------------------------------------------------------------------ envio de dados para a extensao
  let syncTimer = null;
  B.syncLeads = async () => {
    if (!B.ready) return;
    await waitCtx();
    try {
      const rows = await CC.api.list('leads', { select: 'id,company,name,whatsapp,phone,status,segment,city,state,tags', limit: 10000 });
      const leads = rows.map((l) => ({ id: l.id, company: l.company, name: l.name || '', phone: l.whatsapp || l.phone || '', key: phoneKey(l.whatsapp || l.phone), alt: phoneKey(l.whatsapp && l.phone ? l.phone : ''), status: l.status, statusLabel: CC.label(l.status), segment: l.segment || '', city: l.city || '', state: l.state || '', tags: l.tags || [] })).filter((l) => l.key);
      post('leads-sync', { leads, at: Date.now(), crmUrl: `${location.origin}/control` });
    } catch (err) { console.warn('[CDEV WhatsApp] sync', err); }
  };
  const scheduleSync = () => { clearTimeout(syncTimer); syncTimer = setTimeout(B.syncLeads, 1500); };
  B.leadStatus = (lead) => { if (B.ready && lead?.id) post('lead-status', { id: lead.id, status: lead.status, statusLabel: CC.label(lead.status), key: phoneKey(lead.whatsapp || lead.phone) }); };

  /** Abre a conversa pela extensao. ctx = { lead, leadId, messageId, text } */
  B.openChat = (phone, text = '', ctx = {}) => {
    if (!B.ready) return { ok: false, reason: 'no-extension' };
    const lead = ctx.lead || {};
    post('open-chat', {
      phone: CC.normalizePhone(phone), key: phoneKey(phone), text: String(text || ''),
      leadId: ctx.leadId || lead.id || '', messageId: ctx.messageId || '',
      lead: lead.id ? { id: lead.id, company: lead.company, name: lead.name || '', status: lead.status, statusLabel: CC.label(lead.status), segment: lead.segment || '', city: lead.city || '' } : null
    });
    return { ok: true, mode: 'extension' };
  };

  // ------------------------------------------------------------------ agendamento (quem envia e a extensao)
  const schedPayload = (m, lead) => ({
    id: m.id, leadId: lead.id, phone: CC.normalizePhone(m.phone || lead.whatsapp || lead.phone), key: phoneKey(m.phone || lead.whatsapp || lead.phone),
    text: m.final_text, at: m.scheduled_at, name: lead.company,
    lead: { id: lead.id, company: lead.company, name: lead.name || '', status: lead.status, statusLabel: CC.label(lead.status) }
  });
  /** Agenda uma linha de lead_messages (status AGENDADA) na extensao. */
  B.schedule = (m, lead) => { if (B.ready) post('schedule', schedPayload(m, lead)); return B.ready; };
  B.cancelSchedule = (id) => { if (B.ready) post('schedule-cancel', { id }); };
  let schedTimer = null;
  B.syncSchedules = async () => {
    if (!B.ready) return;
    await waitCtx();
    try {
      const rows = await CC.api.list('lead_messages', { select: 'id,lead_id,final_text,phone,scheduled_at,status', filters: [['eq', 'status', 'AGENDADA']], limit: 1000 });
      const ids = [...new Set(rows.map((r) => r.lead_id))];
      const leads = ids.length ? await CC.api.list('leads', { select: 'id,company,name,whatsapp,phone,status', filters: [['in', 'id', ids]], limit: 1000 }) : [];
      const byId = Object.fromEntries(leads.map((l) => [l.id, l]));
      post('schedules-sync', { items: rows.filter((r) => byId[r.lead_id] && r.scheduled_at).map((r) => schedPayload(r, byId[r.lead_id])) });
    } catch (err) { console.warn('[CDEV WhatsApp] agendadas', err); }
  };
  const scheduleSchedSync = () => { clearTimeout(schedTimer); schedTimer = setTimeout(B.syncSchedules, 2000); };

  /** Lista global de agendadas (clique no indicador do topo). */
  B.openSchedules = async () => {
    const rows = await CC.api.list('lead_messages', { select: 'id,lead_id,final_text,scheduled_at,status,schedule_error,schedule_source,sent_at', filters: [['in', 'status', ['AGENDADA', 'FALHOU']]], order: 'scheduled_at', asc: true, limit: 200 });
    const ids = [...new Set(rows.map((r) => r.lead_id))];
    const leads = ids.length ? await CC.api.list('leads', { select: 'id,company', filters: [['in', 'id', ids]], limit: 1000 }) : [];
    const name = Object.fromEntries(leads.map((l) => [l.id, l.company]));
    const body = rows.length ? `<div class="wa-sched-list">${rows.map((r) => `<div class="wa-sched ${r.status === 'FALHOU' ? 'is-failed' : ''}" data-sid="${r.id}">
        <div class="row" style="gap:.5rem;align-items:baseline"><a href="#/leads?v=lista&f=todos&id=${r.lead_id}"><b>${CC.esc(name[r.lead_id] || 'Lead')}</b></a><span class="badge ${r.status === 'FALHOU' ? 'red' : 'yellow'}">${r.status === 'FALHOU' ? 'Falhou' : 'Agendada'}</span><span class="tiny muted">${CC.fmtDateTime(r.scheduled_at)}${r.schedule_source === 'whatsapp' ? ' · criada no WhatsApp' : ''}</span><span class="spacer"></span>
        <button class="btn btn-sm" data-sched-cancel="${r.id}">${r.status === 'FALHOU' ? 'Descartar' : 'Cancelar'}</button></div>
        <div class="small pre" style="margin-top:.3rem">${CC.esc(String(r.final_text || '').slice(0, 260))}</div>
        ${r.schedule_error ? `<div class="tiny" style="color:var(--danger,#ef4444);margin-top:.25rem">${CC.esc(r.schedule_error)}</div>` : ''}</div>`).join('')}</div>`
      : '<p class="small muted">Nenhuma mensagem agendada. Agende pelo estúdio de mensagens no perfil do lead, ou no WhatsApp (botão do relógio na conversa).</p>';
    CC.modal({
      title: 'Mensagens agendadas', wide: true, body: `${B.ready ? '' : '<p class="small" style="color:var(--warning,#e07b24)">Extensão CDEV WhatsApp não detectada nesta aba: as agendadas só são enviadas com a extensão instalada e o Chrome aberto.</p>'}${body}`,
      onOpen: (root) => root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-sched-cancel]'); if (!b) return;
        try { await B.cancelMessage(b.dataset.schedCancel); b.closest('[data-sid]').remove(); } catch (err) { CC.toast(CC.errMsg(err), 'error'); }
      })
    });
  };
  B.cancelMessage = async (id) => {
    const row = await CC.api.update('lead_messages', id, { status: 'CANCELADA', updated_at: new Date().toISOString() });
    B.cancelSchedule(id);
    if (row?.lead_id) await CC.api.insert('lead_activities', { lead_id: row.lead_id, type: 'MENSAGEM', content: 'Mensagem agendada cancelada.' });
    refreshSchedCount();
    window.dispatchEvent(new CustomEvent('cdev:schedules-changed', { detail: { id, leadId: row?.lead_id } }));
    return row;
  };
  B.schedCount = 0;
  const refreshSchedCount = async () => {
    try {
      await waitCtx();
      const rows = await CC.api.list('lead_messages', { select: 'id,status', filters: [['in', 'status', ['AGENDADA', 'FALHOU']]], limit: 500 });
      B.schedCount = rows.filter((r) => r.status === 'AGENDADA').length; B.schedFailed = rows.length - B.schedCount;
      paintIndicator();
    } catch (e) { /* sem tabela/coluna ainda */ }
  };
  B.refreshSchedCount = refreshSchedCount;

  // ------------------------------------------------------------------ eventos vindos da extensao
  const loadLead = async (ev) => {
    if (ev.leadId) { const l = await CC.api.get('leads', ev.leadId); if (l) return l; }
    const key = phoneKey(ev.phone);
    if (!key) return null;
    const rows = await CC.api.list('leads', { select: '*', limit: 10000, order: 'created_at', asc: false });
    return rows.find((l) => phoneKey(l.whatsapp) === key || phoneKey(l.phone) === key) || null;
  };

  const HANDLERS = {
    // Mensagem enviada no WhatsApp: confirma a mensagem do CRM e move o lead para "Mensagem enviada"
    'message-sent': async (ev) => {
      const lead = await loadLead(ev); if (!lead) return 'lead-not-found';
      const prev = lead.status;
      const patch = await CC.markLeadMessageSent(lead, { messageId: ev.messageId, source: 'whatsapp', text: ev.text });
      if (ev.scheduled) refreshSchedCount();
      CC.toast(`${lead.company}: ${ev.scheduled ? 'mensagem agendada enviada' : 'mensagem enviada no WhatsApp'}${patch.status && patch.status !== prev ? ` · movido para ${CC.label(patch.status)}` : ''}.`);
      return 'ok';
    },
    // Resposta do lead: notifica, registra e move para "Respondeu"
    reply: async (ev) => {
      const lead = await loadLead(ev); if (!lead) return 'lead-not-found';
      const preview = String(ev.text || '').slice(0, 280);
      const now = new Date().toISOString();
      const patch = { last_contact_at: now };
      if (['LEAD', 'CONTATADO'].includes(lead.status)) patch.status = 'RESPONDEU';
      await CC.api.update('leads', lead.id, patch);
      if (patch.status) await CC.api.insert('lead_activities', { lead_id: lead.id, type: 'STATUS', content: `${CC.label(lead.status)} → ${CC.label(patch.status)} (resposta no WhatsApp)` });
      await CC.api.insert('lead_activities', { lead_id: lead.id, type: 'MENSAGEM', content: preview ? `Resposta recebida no WhatsApp: "${preview}"` : 'Resposta recebida no WhatsApp.' });
      try {
        await CC.api.insert('notifications', {
          kind: 'lead_reply', severity: 'success', title: `${lead.company} respondeu no WhatsApp`, body: preview || 'Nova mensagem recebida.',
          link: `#/leads?v=lista&f=todos&id=${lead.id}`, entity_type: 'lead', entity_id: lead.id, dedupe_key: `lead-reply:${lead.id}:${ev.msgId || ev.id}`
        });
      } catch (err) { if (!/duplicate|23505/i.test(String(err?.message || err?.code))) console.warn('[CDEV WhatsApp] notificação', err); }
      Object.assign(lead, patch); changed(lead);
      if (!document.hasFocus()) { try { if (Notification.permission === 'granted') new Notification(`${lead.company} respondeu`, { body: preview || 'Nova mensagem no WhatsApp' }); } catch (e) { /* sem notificacao */ } }
      return 'ok';
    },
    // Agendada pelo WhatsApp: cria a linha no historico do lead (mesmo id do agendamento)
    scheduled: async (ev) => {
      const lead = await loadLead(ev); if (!lead) return 'lead-not-found';
      const row = { status: 'AGENDADA', scheduled_at: ev.at, final_text: String(ev.text || '').slice(0, 4000), schedule_source: 'whatsapp', schedule_error: null, phone: CC.normalizePhone(ev.phone) || null, updated_at: new Date().toISOString() };
      const cur = await CC.api.get('lead_messages', ev.scheduleId).catch(() => null);
      if (cur) { if (cur.status !== 'ENVIADA') await CC.api.update('lead_messages', cur.id, row); }
      else await CC.api.insert('lead_messages', { id: ev.scheduleId, lead_id: lead.id, template_name: 'Agendada no WhatsApp', ...row });
      await CC.api.insert('lead_activities', { lead_id: lead.id, type: 'MENSAGEM', content: `Mensagem agendada pelo WhatsApp para ${CC.fmtDateTime(ev.at)}.` });
      changed(lead); refreshSchedCount();
      CC.toast(`${lead.company}: mensagem agendada para ${CC.fmtDateTime(ev.at)} (pelo WhatsApp).`);
      return 'ok';
    },
    'schedule-cancelled': async (ev) => {
      const cur = await CC.api.get('lead_messages', ev.scheduleId).catch(() => null);
      if (cur && cur.status === 'AGENDADA') await CC.api.update('lead_messages', cur.id, { status: 'CANCELADA', updated_at: new Date().toISOString() });
      refreshSchedCount();
      return 'ok';
    },
    'schedule-failed': async (ev) => {
      const lead = await loadLead(ev);
      const cur = await CC.api.get('lead_messages', ev.scheduleId).catch(() => null);
      if (cur && cur.status !== 'ENVIADA') await CC.api.update('lead_messages', cur.id, { status: 'FALHOU', schedule_error: String(ev.error || '').slice(0, 300), updated_at: new Date().toISOString() });
      if (lead) {
        await CC.api.insert('lead_activities', { lead_id: lead.id, type: 'MENSAGEM', content: `Mensagem agendada NÃO enviada: ${ev.error || 'erro'}` });
        try {
          await CC.api.insert('notifications', { kind: 'schedule_failed', severity: 'danger', title: `Agendada não enviada: ${lead.company}`, body: String(ev.error || ''), link: `#/leads?v=lista&f=todos&id=${lead.id}`, entity_type: 'lead', entity_id: lead.id, dedupe_key: `sched-fail:${ev.scheduleId}` });
        } catch (err) { /* duplicada */ }
        changed(lead);
      }
      refreshSchedCount();
      CC.toast(`Mensagem agendada não enviada${lead ? ` (${lead.company})` : ''}: ${ev.error || ''}`, 'error');
      return 'ok';
    },
    // Status trocado na extensao (mapeado para uma etapa do CRM)
    'status-changed': async (ev) => {
      const lead = await loadLead(ev); if (!lead) return 'lead-not-found';
      const to = ev.crmStatus;
      if (!STATUS_FLOW.includes(to) || to === lead.status) return 'ok';
      if (to === 'CLIENTE') return 'ok'; // virar cliente exige a conversao (dados, contrato): fica no CRM
      await CC.api.update('leads', lead.id, { status: to, ...(to === 'CONTATADO' ? { last_contact_at: new Date().toISOString() } : {}) });
      await CC.api.insert('lead_activities', { lead_id: lead.id, type: 'STATUS', content: `${CC.label(lead.status)} → ${CC.label(to)} (alterado no WhatsApp: ${ev.waStatus || ''})` });
      lead.status = to; changed(lead);
      CC.toast(`${lead.company}: ${CC.label(to)} (pelo WhatsApp).`);
      return 'ok';
    }
  };

  const handleEvent = async (ev) => {
    if (!ev?.id) return;
    if (B.handled.has(ev.id)) { post('ack', { id: ev.id, result: 'dup' }); return; }
    B.handled.add(ev.id);
    try {
      await waitCtx();
      const fn = HANDLERS[ev.type];
      const result = fn ? await fn(ev) : 'unknown';
      post('ack', { id: ev.id, result });
    } catch (err) {
      B.handled.delete(ev.id); // tenta de novo na proxima entrega
      console.warn('[CDEV WhatsApp] evento', ev.type, err);
    }
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== SRC_EXT) return;
    const { type, payload = {} } = e.data;
    if (type === 'ready') {
      const first = !B.ready;
      B.ready = true; B.version = payload.version || ''; B.lastSeen = Date.now();
      paintIndicator();
      if (first) { scheduleSync(); scheduleSchedSync(); post('flush'); refreshSchedCount(); }
    } else if (type === 'event') handleEvent(payload);
    else if (type === 'schedule-result') {
      if (!payload.ok) CC.toast(`Extensão não agendou: ${payload.message || 'erro'}`, 'error');
    } else if (type === 'gone') {
      B.ready = false; paintIndicator(); CC.toast(payload.reason || 'Extensão atualizada — recarregue a página.', 'error');
    } else if (type === 'open-result') {
      if (!payload.ok) CC.toast(`WhatsApp: ${payload.message || 'não consegui abrir a conversa'}`, 'error');
    }
  });

  // Mudancas feitas no CRM chegam na extensao (cor/etiqueta do contato no WhatsApp)
  window.addEventListener('cdev:lead-changed', (e) => { if (e.detail?.id) B.leadStatus(e.detail); });

  const hello = () => post('hello', { version: 1 });
  document.addEventListener('DOMContentLoaded', () => { paintIndicator(); hello(); setTimeout(hello, 1500); setTimeout(refreshSchedCount, 4000); });
  setInterval(() => { if (B.ready) { scheduleSync(); scheduleSchedSync(); } else hello(); }, 5 * 60000);
  window.addEventListener('cdev:schedules-changed', () => scheduleSchedSync());
  window.addEventListener('focus', () => { if (B.ready) post('flush'); });
})();
