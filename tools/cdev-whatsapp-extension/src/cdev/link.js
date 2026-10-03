/* CDEV WhatsApp — integracao com o CRM CDEV (cdev.com.br/control).
 *
 *  CRM -> WhatsApp
 *   - open-chat: abre a conversa SEM recarregar (lista/busca do WhatsApp) e cola a mensagem (nao envia)
 *   - lead-status: etapa mudou no CRM -> status/cor do contato aqui (mapa nas opcoes)
 *   - agendamentos: no horario, abre a conversa, cola e ENVIA a mensagem agendada
 *  WhatsApp -> CRM (fila no service worker ate o CRM confirmar)
 *   - message-sent: mensagem saiu para um lead -> CRM marca como enviada e move para "Mensagem enviada"
 *   - reply: lead respondeu -> CRM notifica e move para "Respondeu"
 *   - status-changed: status trocado aqui -> etapa no CRM
 *
 * Identidade: telefone (DDD + 8 ultimos digitos) e, quando a conversa e aberta pelo CRM, o id do lead
 * fica gravado no contato (crmLeadId) — necessario quando o WhatsApp esconde o numero (@lid).
 */
(() => {
  const { util: U, store, crm, wa, ui } = WAW;
  const S = store.state;
  const cfg = () => store.config.cdev || store.CDEV_DEFAULT();

  const L = { byKey: {}, byId: {}, at: 0, crmUrl: "" };
  let pendings = {};
  let schedules = {};
  const bootAt = Date.now();
  let lastKeyAt = 0;
  let suppressStatus = 0;

  const phoneKey = (v) => {
    let d = U.digits(v);
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
    return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : "";
  };
  const send = (m) => WAW.actions.send(m);
  const emit = (ev) => send({ type: "cdev:event", event: { at: Date.now(), ...ev } });
  const evId = (p) => `${p}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;

  /* ---------------- dados vindos do CRM ---------------- */
  async function loadData() {
    const r = await chrome.storage.local.get(["cdev:leads", "cdev:pending", "cdev:schedules"]);
    Object.assign(L, { byKey: {}, byId: {}, ...(r["cdev:leads"] || {}) });
    pendings = r["cdev:pending"] || {};
    schedules = r["cdev:schedules"] || {};
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch["cdev:leads"]) Object.assign(L, { byKey: {}, byId: {}, ...(ch["cdev:leads"].newValue || {}) });
    if (ch["cdev:pending"]) pendings = ch["cdev:pending"].newValue || {};
    if (ch["cdev:schedules"]) schedules = ch["cdev:schedules"].newValue || {};
    if (ch["cdev:leads"] || ch["cdev:schedules"]) {
      WAW.chatlist.schedule();
      WAW.conversation.schedule();
    }
  });

  function leadFor(c) {
    if (!c || c.isGroup) return null;
    if (c.crmLeadId && L.byId[c.crmLeadId]) return L.byId[c.crmLeadId];
    const id = L.byKey[phoneKey(c.phone)];
    return id ? L.byId[id] || null : null;
  }
  const leadIdFor = (c) => leadFor(c)?.id || c?.crmLeadId || "";

  function linkContact(c, lead, extra = {}) {
    if (!c || !lead) return;
    const patch = { crmLeadId: lead.id, ...extra };
    if (!c.company && lead.company) patch.company = lead.company;
    if (!c.city && lead.city) patch.city = lead.city;
    if (!c.segment && lead.segment) patch.segment = lead.segment;
    if (!c.phone && lead.phone) patch.phone = U.digits(lead.phone);
    if (Object.entries(patch).some(([k, v]) => c[k] !== v)) crm.update(c.key, patch);
  }

  /* ---------------- status ---------------- */
  function statusExists(id) {
    return Boolean(id && crm.statusById(id));
  }
  function sentStatusId() {
    const want = cfg().statusOnSent;
    if (statusExists(want)) return want;
    const byLabel = store.config.statuses.find((s) => /novo contato/i.test(s.label));
    if (byLabel) return byLabel.id;
    return statusExists("primeiro-contato") ? "primeiro-contato" : statusExists("novo") ? "novo" : "";
  }
  function setStatusQuiet(c, statusId) {
    if (!c || !statusExists(statusId) || c.statusId === statusId) return;
    suppressStatus += 1;
    try {
      crm.setStatus(c.key, statusId);
    } finally {
      suppressStatus -= 1;
    }
  }
  /** So troca automaticamente status "iniciais" (nao rebaixa quem ja esta em negociacao etc.). */
  function isEarlyStatus(id) {
    return !id || ["novo", "primeiro-contato", sentStatusId()].includes(id);
  }

  WAW.on("status-set", ({ key, statusId }) => {
    if (suppressStatus || !cfg().enabled || !cfg().statusToCrm) return;
    const c = crm.get(key);
    const lead = leadFor(c);
    const to = cfg().toCrm[statusId];
    if (!lead || !to || to === lead.status) return;
    emit({ type: "status-changed", id: evId("st"), leadId: lead.id, phone: c.phone, crmStatus: to, waStatus: crm.statusById(statusId)?.label || statusId });
  });

  function onLeadStatus(p) {
    if (!cfg().enabled || !cfg().statusFromCrm) return;
    if (L.byId[p.id]) Object.assign(L.byId[p.id], { status: p.status, statusLabel: p.statusLabel });
    const target = cfg().fromCrm[p.status];
    const contacts = Object.values(S.contacts).filter((c) => !c.isGroup && (c.crmLeadId === p.id || (p.key && phoneKey(c.phone) === p.key)));
    if (p.status === "CONTATADO") contacts.forEach((c) => isEarlyStatus(c.statusId) && setStatusQuiet(c, sentStatusId()));
    else if (target) contacts.forEach((c) => setStatusQuiet(c, target));
    WAW.conversation.schedule();
  }

  /* ---------------- abrir conversa pedida pelo CRM ---------------- */
  async function openChat(entry) {
    if (!cfg().enabled) return { ok: false, reason: "need-reload" };
    const known = Object.values(S.contacts).find((c) => !c.isGroup && (c.crmLeadId === entry.leadId || (entry.key && phoneKey(c.phone) === entry.key)));
    let res = { ok: false };
    if (known?.name) res = await wa.openChatByName(known.name, { phone: known.phone, jid: known.jid });
    if (!res.ok) res = await wa.openChatByPhoneSearch(entry.phone);
    if (!res.ok) return { ok: false, reason: "need-reload" }; // contato novo: o service worker abre pela URL
    await U.sleep(350);
    WAW.currentChat.refresh(true);
    const c = WAW.current.contact;
    const lead = L.byId[entry.leadId] || entry.lead;
    if (c && lead) linkContact(c, lead, { phone: c.phone || entry.phone });
    if (entry.text) {
      await U.sleep(150);
      const r = await wa.insertIntoComposer(entry.text, { mode: "replace" });
      if (!r.ok) ui.toast("Conversa aberta — não consegui colar a mensagem; ela está copiada no CRM.", { kind: "warn", ms: 4200 });
    }
    rebase(c?.key);
    ui.toast(`CRM: ${lead?.company || c?.name || "conversa"} aberta${entry.text ? " — revise e envie" : ""}`);
    return { ok: true };
  }

  /** Conversa aberta pela URL (contato novo): vincula ao lead quando a conversa aparece. */
  function matchUrlPending(c) {
    if (!c || c.isGroup) return;
    const list = Object.values(pendings).filter((p) => p.viaUrl && Date.now() - p.at < 3 * 60000);
    if (!list.length) return;
    const key = phoneKey(c.phone);
    let p = key ? list.find((x) => x.key === key) : null;
    // Sem numero visivel (@lid): so aceita se a pagina acabou de carregar e ha um unico pendente.
    if (!p && !key && list.length === 1 && Date.now() - bootAt < 90000) p = list[0];
    if (!p) return;
    const lead = L.byId[p.leadId] || p.lead;
    if (lead) linkContact(c, lead, { phone: c.phone || p.phone });
    pendings[p.key || p.phone] = { ...p, viaUrl: false, linkedKey: c.key };
    chrome.storage.local.set({ "cdev:pending": pendings });
  }

  /* ---------------- deteccao de envio e resposta ---------------- */
  const base = new Map(); // contactKey -> { out:Set, in:Set, since }
  const recentManual = new Map();
  const lastReply = new Map();
  let lastChecked = "";

  function rebase(key) {
    if (!key) return;
    base.set(key, { out: new Set(wa.outgoingIds()), in: new Set(wa.incomingIds()), since: Date.now() });
  }
  const lastOf = (ids, n = 3) => ids.slice(-n);

  function pendingFor(c, lead) {
    const all = Object.values(pendings).filter((p) => Date.now() - p.at < 6 * 3600000);
    return all.find((p) => (lead && p.leadId === lead.id) || p.linkedKey === c.key || (p.key && p.key === phoneKey(c.phone))) || null;
  }

  function checkCurrent() {
    if (!cfg().enabled) return;
    const c = WAW.current.contact;
    if (!c || c.isGroup) return;
    matchUrlPending(c);
    const lead = leadFor(c);
    let b = base.get(c.key);
    if (!b) {
      rebase(c.key);
      lastChecked = c.key;
      return;
    }
    if (lastChecked !== c.key) {
      lastChecked = c.key;
      b.since = Date.now();
    }
    const outs = wa.outgoingIds();
    const ins = wa.incomingIds();
    // Nos primeiros 1,5 s apos abrir a conversa o WhatsApp ainda esta renderizando: so aprende.
    if (Date.now() - b.since < 1500) {
      outs.forEach((id) => b.out.add(id));
      ins.forEach((id) => b.in.add(id));
      return;
    }
    const newOut = lastOf(outs).filter((id) => !b.out.has(id));
    const newIn = lastOf(ins).filter((id) => !b.in.has(id));
    outs.forEach((id) => b.out.add(id));
    ins.forEach((id) => b.in.add(id));

    if (newOut.length && lead) onSent(c, lead, newOut[newOut.length - 1]);
    if (newIn.length && lead) onReply(c, lead, newIn[newIn.length - 1], wa.messageText(newIn[newIn.length - 1]) || wa.lastIncomingText());
  }

  function onSent(c, lead, msgId, { messageId = "", scheduled = false } = {}) {
    const p = scheduled ? null : pendingFor(c, lead);
    const manualOk = cfg().trackManualSends && lead.status === "LEAD" && Date.now() - (recentManual.get(lead.id) || 0) > 120000;
    if (!p && !scheduled && !manualOk) return;
    if (!p && !scheduled) recentManual.set(lead.id, Date.now());
    const text = wa.messageText(msgId);
    emit({ type: "message-sent", id: `sent:${msgId}`, msgId, leadId: lead.id, phone: c.phone || lead.phone, messageId: messageId || p?.messageId || "", text, scheduled });
    if (p) send({ type: "cdev:pending-done", key: p.key || p.phone });
    if (isEarlyStatus(c.statusId)) setStatusQuiet(c, sentStatusId());
    linkContact(c, lead);
    lead.status = lead.status === "LEAD" ? "CONTATADO" : lead.status;
    ui.toast(`CRM: ${lead.company} — mensagem enviada registrada`, { ms: 2600 });
  }

  function onReply(c, lead, msgId, text) {
    // Uma notificacao por "rajada" de mensagens (15 min) por lead.
    if (Date.now() - (lastReply.get(lead.id) || 0) < 15 * 60000) return;
    lastReply.set(lead.id, Date.now());
    emit({ type: "reply", id: `reply:${msgId}`, msgId, leadId: lead.id, phone: c.phone || lead.phone, text: String(text || "").slice(0, 400) });
    const target = cfg().statusOnReply;
    if (statusExists(target) && isEarlyStatus(c.statusId)) setStatusQuiet(c, target);
    if (cfg().notifyReply) {
      if (document.hidden || !document.hasFocus() || WAW.current.contact?.key !== c.key) WAW.follow.alert(c, `${lead.company} respondeu: ${text || "nova mensagem"}`, "crm");
      else ui.toast(`💬 ${lead.company} respondeu`, { ms: 3200 });
    }
  }

  /** Card da lista: mensagem nova (nao lida) de um lead com a conversa fechada. */
  const rowSig = new Map();
  function checkRow(row, info, contact) {
    if (!cfg().enabled || !contact || contact.isGroup) return;
    const lead = leadFor(contact);
    if (!lead) return;
    const meta = wa.rowMeta(row, info.name);
    const sig = `${meta.preview}|${meta.time}|${meta.unread}`;
    const prev = rowSig.get(contact.key);
    rowSig.set(contact.key, sig);
    if (prev === undefined || prev === sig || meta.unread <= 0) return;
    if (WAW.current.contact?.key === contact.key && !document.hidden) return;
    onReply(contact, lead, `row:${contact.key}:${U.norm(meta.preview).slice(0, 40)}:${meta.time}`, meta.preview);
  }

  /* ---------------- agendamento: envio ---------------- */
  document.addEventListener("keydown", () => (lastKeyAt = Date.now()), true);

  function findSendButton() {
    const main = wa.mainPane();
    if (!main) return null;
    const icon = main.querySelector('footer [data-icon="send"], footer [data-icon="wds-ic-send-filled"], footer [data-icon^="send"]');
    const btn = icon?.closest("button, [role='button']") || main.querySelector('footer button[aria-label="Enviar"], footer button[aria-label="Send"], footer [aria-label="Enviar"]');
    return btn && wa.visible(btn) ? btn : null;
  }

  async function runSchedule(item) {
    if (!wa.mainPane() && !wa.sidePane()) return { ok: false, reason: "loading", message: "WhatsApp Web ainda carregando" };
    const draft = wa.composerText();
    if (Date.now() - lastKeyAt < 8000 && draft) return { ok: false, reason: "busy", message: "você está digitando — tento de novo em 30 s" };
    if (document.getElementById("waw-modal")) return { ok: false, reason: "busy", message: "janela da extensão aberta" };

    const key = item.key || phoneKey(item.phone);
    const target = (item.contactKey && crm.get(item.contactKey)) || Object.values(S.contacts).find((c) => !c.isGroup && ((item.leadId && c.crmLeadId === item.leadId) || (key && phoneKey(c.phone) === key)));
    const isTarget = (c) => c && (c.key === target?.key || (key && phoneKey(c.phone) === key) || (item.leadId && c.crmLeadId === item.leadId));

    WAW.currentChat.refresh(true);
    let opened = isTarget(WAW.current.contact);
    if (!opened && target?.name) opened = (await wa.openChatByName(target.name, { phone: target.phone, jid: target.jid })).ok;
    if (!opened && item.phone) opened = (await wa.openChatByPhoneSearch(item.phone)).ok;
    if (!opened && item.reloadedAt && Date.now() - item.reloadedAt < 120000 && Date.now() - bootAt < 120000 && wa.currentChat()) opened = true; // aberta pela URL do numero
    if (!opened) return { ok: false, reason: item.reloadedAt ? "not-found" : "need-reload", message: item.reloadedAt ? "não encontrei a conversa desse número no WhatsApp" : "" };

    await U.sleep(500);
    WAW.currentChat.refresh(true);
    const c = WAW.current.contact;
    const info = WAW.current.info;
    if (!c || info?.isGroup) return { ok: false, reason: "wrong-chat", message: "a conversa aberta não é de um contato" };
    if (key && c.phone && phoneKey(c.phone) !== key) return { ok: false, reason: "wrong-chat", message: `abriu outra conversa (${c.name}); não enviei` };

    const r = await wa.insertIntoComposer(item.text, { mode: "replace" });
    if (!r.ok) return { ok: false, reason: "no-composer", message: "não consegui colar a mensagem no WhatsApp" };
    await U.sleep(250);
    const probe = U.norm(item.text).slice(0, 30);
    if (!U.norm(wa.composerText()).includes(probe)) return { ok: false, reason: "no-composer", message: "o texto colado não confere" };

    const before = new Set(wa.outgoingIds());
    rebase(c.key);
    const btn = findSendButton();
    if (btn) wa.realClick(btn);
    else wa.findComposer()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));

    let msgId = "";
    for (let i = 0; i < 30 && !msgId; i += 1) {
      await U.sleep(200);
      msgId = lastOf(wa.outgoingIds()).filter((id) => !before.has(id)).pop() || "";
    }
    if (!msgId && wa.composerText()) return { ok: false, reason: "not-sent", message: "o WhatsApp não enviou (botão enviar não respondeu)" };
    const b = base.get(c.key);
    if (b && msgId) b.out.add(msgId);

    const lead = (item.leadId && L.byId[item.leadId]) || leadFor(c) || item.lead;
    if (lead?.id) {
      linkContact(c, lead, { phone: c.phone || item.phone });
      onSent(c, lead, msgId || `sched-${item.id}`, { messageId: item.id, scheduled: true });
    } else if (isEarlyStatus(c.statusId)) setStatusQuiet(c, sentStatusId());
    crm.log("schedule", `Mensagem agendada enviada para ${c.name}`, c.key);
    ui.toast(`⏰ Mensagem agendada enviada para ${c.name}`, { ms: 3600 });
    return { ok: true, msgId };
  }

  /* ---------------- agendamento: interface no WhatsApp ---------------- */
  const SCHED_QUICK = [
    { label: "+30 min", minutes: 30 },
    { label: "+2 h", minutes: 120 },
    { label: "Amanhã 9h", minutes: "t9" },
    { label: "Amanhã 14h", minutes: "t14" },
  ];

  const forContact = (c) =>
    Object.values(schedules)
      .filter((s) => s.status === "scheduled" && (s.contactKey === c?.key || (c?.crmLeadId && s.leadId === c.crmLeadId) || (s.key && phoneKey(c?.phone) === s.key)))
      .sort((a, b) => a.at - b.at);

  async function scheduleDialog(contact) {
    const c = contact || WAW.currentChat.require();
    if (!c) return;
    if (c.isGroup) return ui.toast("Agendamento só para conversas individuais", { kind: "warn" });
    const lead = leadFor(c);
    const r = await ui.form({
      title: "Agendar mensagem",
      subtitle: `${c.name}${lead ? ` · CRM: ${lead.company}` : ""}`,
      submitLabel: "Agendar",
      fields: [
        { name: "text", label: "Mensagem", type: "textarea", rows: 6, value: wa.composerText(), autofocus: true, required: true, help: "Será colada e ENVIADA automaticamente no horário (o Chrome precisa estar aberto)." },
        { name: "at", label: "Enviar em", type: "datetime", value: ui.quickTime("t9"), quick: SCHED_QUICK, required: true },
      ],
    });
    if (!r) return;
    if (!r.at || r.at < Date.now() + 30000) return ui.toast("Escolha um horário no futuro", { kind: "warn" });
    const id = crypto.randomUUID();
    const res = await send({ type: "cdev:wa-schedule", payload: { id, at: r.at, text: r.text.trim(), phone: c.phone || lead?.phone || "", key: phoneKey(c.phone || lead?.phone), leadId: lead?.id || c.crmLeadId || "", contactKey: c.key, name: c.name } });
    if (!res.ok) return ui.toast(`Não agendei: ${res.message || res.error || "erro"}`, { kind: "warn" });
    if (U.norm(wa.composerText()) === U.norm(r.text) && WAW.current.contact?.key === c.key) await wa.insertIntoComposer("", { mode: "replace" });
    ui.toast(`⏰ Agendada para ${U.fmtWhen(r.at)}${lead ? " · aparece no CRM" : ""}`, { ms: 3400 });
  }

  const STATUS_TXT = { scheduled: "Agendada", sent: "Enviada", failed: "Falhou", cancelled: "Cancelada", running: "Enviando" };
  async function listDialog() {
    const res = await send({ type: "cdev:schedules-list" });
    const items = (res.items || []).filter((s) => s.status === "scheduled" || Date.now() - (s.updatedAt || 0) < 3 * 86400000).sort((a, b) => (a.status === "scheduled" ? 0 : 1) - (b.status === "scheduled" ? 0 : 1) || a.at - b.at);
    const body = items.length
      ? `<div class="cdev-sched-list">${items
          .map(
            (s) => `<div class="cdev-sched is-${s.status}" data-sid="${U.esc(s.id)}">
          <div class="cdev-sched-top"><b>${U.esc(s.name || U.formatPhone(s.phone))}</b><span class="cdev-sched-st">${STATUS_TXT[s.status] || s.status}</span></div>
          <div class="cdev-sched-when">${WAW.icon("clock")} ${U.fmtWhen(s.at)}${s.leadId ? " · CRM" : ""}${s.source === "crm" ? " · criada no CRM" : ""}</div>
          <p>${U.esc(s.text.slice(0, 220))}</p>
          ${s.error && s.status !== "sent" ? `<small class="cdev-sched-err">${U.esc(s.error)}</small>` : ""}
          ${s.status === "scheduled" ? `<div class="cdev-sched-acts"><button type="button" class="waw-btn waw-btn-sm" data-sact="now">Enviar agora</button><button type="button" class="waw-btn waw-btn-sm waw-btn-ghost" data-sact="cancel">Cancelar</button></div>` : ""}
        </div>`,
          )
          .join("")}</div>`
      : `<p class="waw-muted">Nenhuma mensagem agendada. Use “Agendar” na barra da conversa ou no CRM (estúdio de mensagens).</p>`;
    ui.modal({
      title: "Mensagens agendadas",
      subtitle: "Criadas aqui ou no CRM — enviadas automaticamente no horário",
      width: 560,
      body,
      onMount: (root) =>
        root.addEventListener("click", async (e) => {
          const b = e.target.closest("[data-sact]");
          if (!b) return;
          const id = b.closest("[data-sid]").dataset.sid;
          if (b.dataset.sact === "cancel") {
            const r = await send({ type: "cdev:wa-schedule-cancel", payload: { id } });
            ui.toast(r.ok ? "Agendamento cancelado" : r.message || "Não cancelei", { kind: r.ok ? "info" : "warn" });
          } else {
            ui.closeModal(null);
            send({ type: "cdev:schedule-run-now", id });
            return;
          }
          ui.closeModal(null);
          listDialog();
        }),
    });
  }

  /* ---------------- barra da conversa ---------------- */
  function barHtml(c) {
    if (!cfg().enabled || !c || c.isGroup) return "";
    const lead = leadFor(c);
    const n = forContact(c).length;
    const crmChip = lead ? `<button type="button" class="cdev-crm-chip" data-cdev="crm" title="Lead no CRM CDEV · ${U.esc(lead.statusLabel || lead.status)} — clique para abrir o CRM">CRM · ${U.esc(lead.statusLabel || lead.status)}</button>` : "";
    return `${crmChip}<button type="button" class="waw-cb-ghost ${n ? "is-on" : ""}" data-cdev="schedule" title="${n ? `${n} mensagem(ns) agendada(s) — clique para ver` : "Agendar mensagem para esta conversa"}">${WAW.icon("clock")}${n ? `<small>${n}</small>` : ""}</button>`;
  }
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest?.("[data-cdev]");
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const c = WAW.current.contact;
      if (b.dataset.cdev === "schedule") return forContact(c).length ? listDialog() : scheduleDialog(c);
      if (b.dataset.cdev === "crm") {
        const lead = leadFor(c);
        const base = L.crmUrl || "https://cdev.com.br/control";
        send({ type: "cdev:open-crm", url: lead ? `${base}#/leads?v=lista&f=todos&id=${lead.id}` : base });
      }
    },
    true,
  );

  function badge(c) {
    if (!cfg().enabled) return "";
    const lead = leadFor(c);
    const n = forContact(c).length;
    return `${lead ? `<span class="waw-mini cdev-mini" title="Lead no CRM: ${U.esc(lead.company)} · ${U.esc(lead.statusLabel || lead.status)}">CRM</span>` : ""}${n ? `<span class="waw-mini" title="${n} agendada(s)">⏰${n}</span>` : ""}`;
  }

  /* ---------------- mensagens do service worker ---------------- */
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("cdev:")) return;
    if (msg.type === "cdev:open-chat") {
      openChat(msg).then(sendResponse, (e) => sendResponse({ ok: false, message: String(e) }));
      return true;
    }
    if (msg.type === "cdev:run-schedule") {
      runSchedule(msg.item || {}).then(sendResponse, (e) => sendResponse({ ok: false, reason: "error", message: String(e) }));
      return true;
    }
    if (msg.type === "cdev:lead-status") onLeadStatus(msg);
    else if (msg.type === "cdev:leads-updated" || msg.type === "cdev:schedules-updated") loadData().then(() => {
      WAW.chatlist.scan();
      WAW.conversation.render();
    });
    sendResponse({ ok: true });
  });

  loadData();
  WAW.cdev = { checkCurrent, checkRow, leadFor, phoneKey, scheduleDialog, listDialog, barHtml, badge, forContact, runSchedule };
})();
