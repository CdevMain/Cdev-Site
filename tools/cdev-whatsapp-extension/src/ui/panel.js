/* CDEV WhatsApp — painel lateral (workspace).
 * Abas: Painel, Contato, Follow-up, Contatos, Mensagens, Ferramentas.
 * Renderização por string + delegação de eventos; preserva foco ao re-renderizar. */
(() => {
  const { util: U, store, crm, ui, writer, actions } = WAW;
  const PANEL_ID = "waw-panel";
  const I = (n) => WAW.icon(n);
  const esc = U.esc;

  const view = {
    sub: { messages: "library", tools: "quote" },
    contactsQuery: "",
    contactsFilters: [],
    msgQuery: "",
    msgCategory: "",
    gen: null, // {objective, tone, size, context, results[]}
    rewrite: { text: "", style: "profissional", result: "" },
    suggest: { text: "", result: null },
    quote: { selected: {}, qty: {}, extras: [], discount: 0, intro: "", outro: "", client: null, clientKey: null, notes: "", validity: null },
    tabs: null,
    tabsLoading: false,
    historyFilter: "",
    diagLast: null,
  };

  /* ------------------------------------------------------------------ */
  /* casca                                                              */
  /* ------------------------------------------------------------------ */
  const TAB_ICONS = { dashboard: "chart", contact: "user", followup: "bell", contacts: "contacts", messages: "message", tools: "calc" };

  function ensureEl() {
    let el = document.getElementById(PANEL_ID);
    if (!el) {
      el = document.createElement("aside");
      el.id = PANEL_ID;
      el.setAttribute("aria-label", "CDEV WhatsApp");
      document.documentElement.appendChild(el);
      bind(el);
    }
    return el;
  }

  function applyDock() {
    const p = store.config.panel;
    const d = store.config.display;
    const docked = p.open && !p.minimized && !d.panelFloating && store.config.features.dockPanel !== false;
    document.documentElement.classList.toggle("waw-dock", docked);
    document.documentElement.style.setProperty("--waw-pw", `${store.config.display.panelWidth}px`);
  }

  function shell() {
    const cfg = store.config;
    const p = cfg.panel;
    const overdue = crm.followUpItems();
    const fuCount = overdue.overdue.length + overdue.today.length;
    return `
      <div class="waw-p-head" data-drag="1" title="Arraste pelo topo para soltar o painel">
        <div class="waw-p-title">
          <span class="waw-p-kicker">CDEV WhatsApp</span>
          <button type="button" class="waw-mode-btn" data-act="mode-menu" title="Modo de trabalho">${I(modeIcon(cfg.mode))}<span>${esc(store.MODES[cfg.mode])}</span>${I("chevronDown")}</button>
        </div>
        <div class="waw-p-head-actions">
          <button type="button" class="waw-icon-btn" data-act="palette" title="Paleta de comandos (${esc(cfg.shortcuts.palette)})">${I("command")}</button>
          <button type="button" class="waw-icon-btn" data-act="panel-look" title="Opacidade e posição do painel">${I("panel")}</button>
          <button type="button" class="waw-icon-btn" data-act="minimize" title="Minimizar">${I("minus")}</button>
          <button type="button" class="waw-icon-btn" data-act="close" title="Fechar">${I("x")}</button>
        </div>
      </div>
      <nav class="waw-p-tabs" role="tablist">
        ${Object.entries(store.PANEL_TABS)
          .map(
            ([id, label]) => `<button type="button" role="tab" class="waw-p-tab ${p.tab === id ? "is-on" : ""}" data-tab="${id}" aria-selected="${p.tab === id}" title="${esc(label)}">
              ${I(TAB_ICONS[id])}<span>${esc(label)}</span>${id === "followup" && fuCount ? `<b class="waw-badge">${fuCount}</b>` : ""}</button>`,
          )
          .join("")}
      </nav>
      <div class="waw-p-body" data-region="body">${renderTab(p.tab)}</div>`;
  }

  const modeIcon = (m) => ({ focus: "focus", prospect: "target", support: "headset", billing: "dollar", admin: "shield" })[m] || "home";

  function captureFocus(el) {
    const a = document.activeElement;
    if (!a || !el.contains(a) || !a.dataset.keep) return null;
    return { keep: a.dataset.keep, start: a.selectionStart, end: a.selectionEnd, scroll: el.querySelector(".waw-p-body")?.scrollTop };
  }
  function restoreFocus(el, f) {
    if (!f) return;
    const n = el.querySelector(`[data-keep="${f.keep}"]`);
    if (!n) return;
    n.focus();
    try {
      n.setSelectionRange(f.start, f.end);
    } catch {
      /* ignore */
    }
  }

  function render() {
    const p = store.config.panel;
    const el = ensureEl();
    applyDock();
    const d = store.config.display;
    el.style.setProperty("--waw-pw", `${d.panelWidth}px`);
    el.style.setProperty("--waw-panel-alpha", String(d.panelOpacity));
    el.dataset.state = !p.open ? "closed" : p.minimized ? "min" : "open";
    el.dataset.float = d.panelFloating ? "1" : "0";
    if (d.panelFloating && !panelDrag) {
      const w = d.panelWidth;
      el.style.left = `${Math.min(Math.max(0, d.panelX || innerWidth - w - 24), innerWidth - 120)}px`;
      el.style.top = `${Math.min(Math.max(0, d.panelY), innerHeight - 80)}px`;
      el.style.height = `${Math.min(d.panelHeight, innerHeight - 16)}px`;
    } else if (!d.panelFloating) ["left", "top", "height"].forEach((k) => el.style.removeProperty(k));
    if (!p.open) {
      el.innerHTML = "";
      return;
    }
    if (p.minimized) {
      const fu = crm.followUpItems();
      const n = fu.overdue.length + fu.today.length;
      el.innerHTML = `<button type="button" class="waw-p-mini" data-act="restore" title="Abrir painel">${I("panel")}<span>Workspace</span>${n ? `<b class="waw-badge">${n}</b>` : ""}</button>`;
      return;
    }
    const scroll = el.querySelector(".waw-p-body")?.scrollTop || 0;
    const f = captureFocus(el);
    el.innerHTML = shell();
    const body = el.querySelector(".waw-p-body");
    if (body) body.scrollTop = scroll;
    restoreFocus(el, f);
  }

  const schedule = U.debounce(render, 90);

  function open(tab, { sub } = {}) {
    store.patchConfig((cfg) => {
      cfg.panel.open = true;
      cfg.panel.minimized = false;
      if (tab && store.PANEL_TABS[tab]) cfg.panel.tab = tab;
    });
    if (sub && tab) view.sub[tab] = sub;
    render();
    WAW.rail.render();
  }
  function close() {
    store.patchConfig((cfg) => (cfg.panel.open = false));
    render();
    WAW.rail.render();
  }
  function toggle(tab) {
    const p = store.config.panel;
    if (p.open && !p.minimized && (!tab || p.tab === tab)) close();
    else open(tab || p.tab);
  }

  /* ------------------------------------------------------------------ */
  /* abas                                                               */
  /* ------------------------------------------------------------------ */
  function renderTab(tab) {
    try {
      switch (tab) {
        case "contact":
          return tabContact();
        case "followup":
          return tabFollowup();
        case "contacts":
          return tabContacts();
        case "messages":
          return tabMessages();
        case "tools":
          return tabTools();
        default:
          return tabDashboard();
      }
    } catch (error) {
      console.error("[CDEV WhatsApp] painel", error);
      return `<div class="waw-empty">Erro ao desenhar esta aba: ${esc(error.message)}</div>`;
    }
  }

  const section = (title, content, extra = "") => `<section class="waw-sec"><header><h4>${title}</h4>${extra}</header>${content}</section>`;
  const contactName = (c) => esc(c?.name || (c?.phone ? U.formatPhone(c.phone) : "Contato"));
  const statusDot = (c) => {
    const s = crm.statusById(c?.statusId);
    return `<span class="waw-dot" style="background:${s ? s.color : "#3b4a54"}" title="${esc(s?.label || "Sem status")}"></span>`;
  };

  /* ---------- Painel (dashboard) ---------- */
  function tabDashboard() {
    const cfg = store.config;
    const counts = crm.statusCounts();
    const fu = crm.followUpItems();
    const st = crm.todayStats();
    const timer = crm.timerState();
    const statusRows = cfg.statuses
      .map(
        (s) => `<button type="button" class="waw-stat-row" data-act="filter-status" data-id="${esc(s.id)}">
          <span class="waw-dot" style="background:${s.color}"></span><span>${esc(s.label)}</span><b>${counts[s.id] || 0}</b></button>`,
      )
      .join("");
    const todayList = [...fu.overdue, ...fu.today]
      .slice(0, 8)
      .map(followItemHtml)
      .join("");
    const recent = store.state.history
      .slice(0, 6)
      .map((h) => `<li><time>${U.fmtTime(h.ts)}</time><span>${esc(h.text)}</span></li>`)
      .join("");

    return `
      <div class="waw-kpis">
        <div class="waw-kpi"><b>${st.opened.length}</b><span>Contatos hoje</span></div>
        <div class="waw-kpi"><b>${st.followupsDone || 0}</b><span>Follow-ups feitos</span></div>
        <div class="waw-kpi"><b>${(st.inserts || 0) + (st.copies || 0)}</b><span>Mensagens usadas</span></div>
        <div class="waw-kpi ${fu.overdue.length ? "is-alert" : ""}"><b>${fu.overdue.length}</b><span>Atrasados</span></div>
      </div>
      <p class="waw-muted waw-small">Contadores com base apenas no que a extensão registrou hoje.</p>
      ${timer ? section("Atendimento em curso", timerHtml(timer)) : ""}
      ${section("Retornos de hoje", todayList || ui.empty("Nenhum retorno para hoje."), `<button type="button" class="waw-link" data-tab="followup">Ver tudo</button>`)}
      ${section("Funil", `<div class="waw-stat-list">${statusRows}</div>`)}
      ${section("Atividade recente", recent ? `<ul class="waw-hist">${recent}</ul>` : ui.empty("Sem atividade registrada ainda."), `<button type="button" class="waw-link" data-act="goto-history">Histórico</button>`)}`;
  }

  function timerHtml(timer) {
    return `<div class="waw-timer">
      <span class="waw-timer-val" data-timer-val>${U.fmtDuration(crm.timerElapsed(timer))}</span>
      <span class="waw-muted">${esc(timer.name || "")}</span>
      <span class="waw-cb-spacer"></span>
      ${timer.running ? `<button type="button" class="waw-btn waw-btn-sm" data-act="timer-pause">${I("pause")}Pausar</button>` : `<button type="button" class="waw-btn waw-btn-sm" data-act="timer-resume">${I("play")}Retomar</button>`}
      <button type="button" class="waw-btn waw-btn-sm" data-act="timer-finish">${I("stop")}Finalizar</button>
    </div>`;
  }

  function followItemHtml(i) {
    const late = i.due < Date.now();
    return `<div class="waw-fu-item ${late ? "is-late" : ""}" data-key="${esc(i.contact.key)}" data-kind="${i.kind}" data-id="${esc(i.id)}">
      <button type="button" class="waw-fu-main" data-act="open-contact" data-key="${esc(i.contact.key)}">
        ${statusDot(i.contact)}<span class="waw-fu-name">${contactName(i.contact)}</span>
        <span class="waw-fu-text">${i.kind === "task" ? "☐ " : "🔔 "}${esc(i.text)}</span>
        <time>${U.fmtWhen(i.due)}</time>
      </button>
      <div class="waw-fu-acts">
        <button type="button" class="waw-icon-btn" data-act="fu-done" title="Concluir">${I("check")}</button>
        ${i.kind === "reminder" ? `<button type="button" class="waw-icon-btn" data-act="fu-snooze" title="Adiar">${I("clock")}</button>` : ""}
      </div>
    </div>`;
  }

  /* ---------- Contato ---------- */
  function contextualActions(c) {
    const s = c.statusId;
    const A = (label, act, icon, extra = "") => `<button type="button" class="waw-btn waw-btn-sm" data-act="${act}" ${extra}>${I(icon)}${esc(label)}</button>`;
    if (["cliente", "fechado"].includes(s))
      return [A("Pós-venda", "gen", "heart", 'data-obj="pos-venda"'), A("Suporte", "msg-cat", "headset", 'data-cat="Suporte"'), A("Nova proposta", "goto-quote", "calc")];
    if (["proposta", "negociacao"].includes(s))
      return [A("Follow-up da proposta", "gen", "sparkles", 'data-obj="follow-up"'), A("Criar lembrete", "c-reminder", "bell"), A("Orçamento", "goto-quote", "calc")];
    if (["interessado"].includes(s))
      return [A("Gerar follow-up", "gen", "sparkles", 'data-obj="follow-up"'), A("Abrir proposta", "goto-quote", "calc"), A("Criar lembrete", "c-reminder", "bell")];
    if (["sem-interesse"].includes(s)) return [A("Reativação", "gen", "sparkles", 'data-obj="reativacao"'), A("Arquivar", "c-archive", "archive")];
    if (["follow-up", "aguardando"].includes(s)) return [A("Gerar follow-up", "gen", "sparkles", 'data-obj="follow-up"'), A("Adiar retorno", "c-reminder", "bell")];
    return [A("Primeiro contato", "gen", "sparkles", 'data-obj="primeiro-contato"'), A("Marcar interessado", "c-set-status", "star", 'data-id="interessado"'), A("Criar follow-up", "c-reminder", "bell")];
  }

  function notesHtml(c, limit = 20) {
    if (!c.notes.length) return ui.empty("Sem notas.");
    return `<ul class="waw-notes">${c.notes
      .slice(0, limit)
      .map(
        (n) => `<li data-note="${esc(n.id)}" class="${n.pinned ? "is-pinned" : ""}">
        <p>${esc(n.text)}</p>
        <footer><time>${U.fmtDateTime(n.createdAt)}</time>
          <button type="button" class="waw-icon-btn" data-act="note-pin" title="${n.pinned ? "Desafixar" : "Fixar"}">${I("pin")}</button>
          <button type="button" class="waw-icon-btn" data-act="note-edit" title="Editar">${I("edit")}</button>
          <button type="button" class="waw-icon-btn" data-act="note-del" title="Excluir">${I("trash")}</button>
        </footer></li>`,
      )
      .join("")}</ul>`;
  }

  function remindersHtml(c) {
    const list = crm.pendingReminders(c);
    if (!list.length) return ui.empty("Nenhum lembrete pendente.");
    return `<ul class="waw-rems">${list
      .map(
        (r) => `<li data-rem="${esc(r.id)}" class="${r.due < Date.now() ? "is-late" : ""}">
        <span>🔔 ${esc(r.text)}<br/><small>${U.fmtWhen(r.due)}</small></span>
        <span class="waw-row-acts">
          <button type="button" class="waw-icon-btn" data-act="rem-done" title="Concluir">${I("check")}</button>
          <button type="button" class="waw-icon-btn" data-act="rem-snooze" title="Adiar">${I("clock")}</button>
          <button type="button" class="waw-icon-btn" data-act="rem-edit" title="Editar">${I("edit")}</button>
          <button type="button" class="waw-icon-btn" data-act="rem-del" title="Excluir">${I("trash")}</button>
        </span></li>`,
      )
      .join("")}</ul>`;
  }

  function tasksHtml(c, onlyNext = false) {
    const list = onlyNext ? crm.openTasks(c).slice(0, 1) : c.tasks;
    if (!list.length) return ui.empty(onlyNext ? "Nenhuma tarefa aberta." : "Sem tarefas.");
    const icon = { pending: "☐", doing: "◐", done: "☑" };
    return `<ul class="waw-tasks">${list
      .map(
        (t) => `<li data-task="${esc(t.id)}" class="is-${t.status}">
        <button type="button" class="waw-task-st" data-act="task-cycle" title="${esc(crm.TASK_STATUS[t.status])} — clique para avançar">${icon[t.status]}</button>
        <span>${esc(t.text)}${t.due ? `<br/><small class="${t.status !== "done" && t.due < Date.now() ? "waw-late" : ""}">Prazo: ${U.fmtWhen(t.due)}</small>` : ""}</span>
        <button type="button" class="waw-icon-btn" data-act="task-del" title="Excluir">${I("trash")}</button></li>`,
      )
      .join("")}</ul>`;
  }

  function checklistHtml(c) {
    const items = store.config.checklist;
    if (!items.length) return ui.empty("Configure o checklist nas configurações.");
    const done = items.filter((i) => c.checklist[i.id]).length;
    return `<div class="waw-progress"><span style="width:${Math.round((done / items.length) * 100)}%"></span></div>
      <ul class="waw-check-list">${items
        .map((i) => `<li><label><input type="checkbox" data-act="ck" data-id="${esc(i.id)}" ${c.checklist[i.id] ? "checked" : ""}/> <span>${esc(i.label)}</span></label></li>`)
        .join("")}</ul>`;
  }

  function quickMsgList(category, limit = 6) {
    const list = store.config.quickMessages.filter((m) => !category || m.category === category).slice(0, limit);
    if (!list.length) return ui.empty("Nenhuma mensagem nessa categoria.");
    return `<ul class="waw-msgs">${list.map(msgItemHtml).join("")}</ul>`;
  }

  function contactHeader(c) {
    const st = crm.statusById(c.statusId);
    const timing = crm.contactTiming(c);
    const tags = c.tags.map((id) => crm.tagById(id)).filter(Boolean);
    const states = { active: "Ativo", follow: "Acompanhamento", archived: "Arquivado" };
    return `
      <div class="waw-ch">
        <div class="waw-ch-top">
          <div class="waw-avatar" style="--c:${st ? st.color : "#3b4a54"}">${esc((c.name || "?").trim().slice(0, 1).toUpperCase())}</div>
          <div class="waw-ch-id">
            <strong>${contactName(c)}</strong>
            <small>${[c.phone ? U.formatPhone(c.phone) : "", c.company, c.segment, c.city].filter(Boolean).map(esc).join(" · ") || (c.isGroup ? "Grupo" : "Sem dados — edite o perfil")}</small>
          </div>
          <button type="button" class="waw-icon-btn ${c.favorite ? "is-on" : ""}" data-act="c-fav" title="Favorito">${I("heart")}</button>
          <button type="button" class="waw-icon-btn ${c.following ? "is-follow" : ""}" data-act="c-follow" title="${c.following ? "Seguindo — clique para parar" : "Seguir (avisa online e mensagem nova)"}">${I("eye")}</button>
          <button type="button" class="waw-icon-btn ${c.priority ? "is-on" : ""}" data-act="c-prio" title="Prioridade (fixa a conversa)">${I("star")}</button>
          <button type="button" class="waw-icon-btn" data-act="c-edit" title="Editar perfil">${I("edit")}</button>
        </div>
        <div class="waw-ch-row">
          <button type="button" class="waw-pill" data-act="c-status" style="--c:${st ? st.color : "#8696a0"}"><span class="waw-dot" style="background:${st ? st.color : "#8696a0"}"></span>${esc(st ? st.label : "Sem status")}${I("chevronDown")}</button>
          <button type="button" class="waw-pill waw-pill-ghost" data-act="c-state">${esc(states[c.state] || "Ativo")}${I("chevronDown")}</button>
          ${tags.map((t) => ui.chip(t.label, t.color)).join("")}
          <button type="button" class="waw-pill waw-pill-ghost" data-act="c-tags">${I("tag")}Tags</button>
        </div>
        <div class="waw-ch-meta ${timing.waitingReply ? "is-wait" : ""}">${I("clock")} ${esc(timing.text)}${c.timeSpentMs ? ` · ${U.fmtDuration(c.timeSpentMs)} em atendimento` : ""}</div>
      </div>`;
  }

  function timerControls(c) {
    const t = crm.timerState();
    if (t && t.key === c.key) return timerHtml(t);
    return `<button type="button" class="waw-btn waw-btn-sm" data-act="timer-start">${I("play")}Iniciar timer de atendimento</button>`;
  }

  function tabContact() {
    const cur = WAW.current;
    if (cur.ambiguous) return `<div class="waw-empty">${I("alert")} Há mais de um contato com o nome “${esc(cur.info?.name)}”. Role até uma mensagem da conversa para identificar pelo ID.</div>`;
    const c = cur.contact;
    if (!c) return ui.empty("Abra uma conversa no WhatsApp para ver a ficha do contato.");
    const mode = store.config.mode;
    const addBtn = (act, label) => `<button type="button" class="waw-link" data-act="${act}">+ ${label}</button>`;
    const pinned = crm.pinnedNotes(c)[0] || crm.lastNote(c);
    const nextRem = crm.pendingReminders(c)[0];

    if (mode === "focus") {
      return `${contactHeader(c)}
        ${section("Nota", pinned ? `<p class="waw-note-quote">${pinned.pinned ? "📌 " : ""}${esc(pinned.text)}</p>` : ui.empty("Sem notas."), addBtn("c-note", "Nota"))}
        ${section("Lembrete", nextRem ? remindersHtml({ ...c, reminders: [nextRem] }) : ui.empty("Sem lembretes."), addBtn("c-reminder", "Lembrete"))}
        ${section("Próxima tarefa", tasksHtml(c, true), addBtn("c-task", "Tarefa"))}
        ${section("Mensagem rápida", quickMsgList("", 4), `<button type="button" class="waw-link" data-act="goto-library">Todas</button>`)}`;
    }

    if (mode === "prospect") {
      const demo = store.config.links.find((l) => /demo/i.test(l.label));
      return `${contactHeader(c)}
        ${section("Lead", `<dl class="waw-dl"><dt>Empresa</dt><dd>${esc(c.company || "—")}</dd><dt>Segmento</dt><dd>${esc(c.segment || "—")}</dd><dt>Cidade</dt><dd>${esc(c.city || "—")}</dd></dl>`, `<button type="button" class="waw-link" data-act="c-edit">Editar</button>`)}
        <div class="waw-actions-grid">
          <button type="button" class="waw-btn" data-act="gen" data-obj="primeiro-contato">${I("sparkles")}Gerar mensagem</button>
          <button type="button" class="waw-btn" data-act="goto-library" data-cat="Prospecção">${I("insert")}Inserir</button>
          <button type="button" class="waw-btn" data-act="open-demo" ${demo ? "" : "disabled title='Cadastre um link com “demo” no nome'"}>${I("globe")}Abrir demo</button>
          <button type="button" class="waw-btn" data-act="c-set-status" data-id="interessado">${I("star")}Marcar interessado</button>
          <button type="button" class="waw-btn" data-act="c-followup">${I("bell")}Criar follow-up</button>
          <button type="button" class="waw-btn" data-act="c-note">${I("note")}Nota</button>
        </div>
        ${section("Mensagens de prospecção", quickMsgList("Prospecção", 5))}
        ${section("Follow-up", remindersHtml(c), addBtn("c-reminder", "Lembrete"))}`;
    }

    if (mode === "support") {
      const hist = store.state.history.filter((h) => h.key === c.key).slice(0, 12);
      return `${contactHeader(c)}
        ${section("Atendimento", timerControls(c))}
        ${section("Notas", notesHtml(c, 8), addBtn("c-note", "Nota"))}
        ${section("Tarefas", tasksHtml(c), addBtn("c-task", "Tarefa"))}
        ${section("Respostas rápidas", quickMsgList("Suporte", 6), `<button type="button" class="waw-link" data-act="goto-suggest">Sugerir resposta</button>`)}
        ${section("Histórico interno", hist.length ? `<ul class="waw-hist">${hist.map((h) => `<li><time>${U.fmtDateTime(h.ts)}</time><span>${esc(h.text)}</span></li>`).join("")}</ul>` : ui.empty("Sem histórico registrado."))}`;
    }

    if (mode === "billing") {
      return `${contactHeader(c)}
        <p class="waw-muted waw-small">Modo cobrança: toda mensagem passa por revisão antes de ir para o campo de texto.</p>
        ${section("Mensagens de cobrança", quickMsgList("Cobrança", 12))}
        ${section("Lembretes", remindersHtml(c), addBtn("c-reminder", "Lembrete"))}
        ${section("Notas", notesHtml(c, 5), addBtn("c-note", "Nota"))}`;
    }

    const base = `${contactHeader(c)}
      <div class="waw-actions-row">${contextualActions(c).join("")}</div>
      ${section("Notas", notesHtml(c), addBtn("c-note", "Nota"))}
      ${section("Lembretes", remindersHtml(c), addBtn("c-reminder", "Lembrete"))}
      ${section("Tarefas", tasksHtml(c), addBtn("c-task", "Tarefa"))}
      ${section("Checklist de atendimento", checklistHtml(c))}
      ${section("Timer de atendimento", timerControls(c))}`;
    if (mode !== "admin") return base;

    // Admin: tudo de todos os modos numa só ficha.
    const demo = store.config.links.find((l) => /demo/i.test(l.label));
    const hist = store.state.history.filter((h) => h.key === c.key).slice(0, 12);
    return `${base}
      ${section("Lead", `<dl class="waw-dl"><dt>Empresa</dt><dd>${esc(c.company || "—")}</dd><dt>Segmento</dt><dd>${esc(c.segment || "—")}</dd><dt>Cidade</dt><dd>${esc(c.city || "—")}</dd></dl>`, `<button type="button" class="waw-link" data-act="c-edit">Editar</button>`)}
      <div class="waw-actions-grid">
        <button type="button" class="waw-btn" data-act="gen" data-obj="primeiro-contato">${I("sparkles")}Gerar mensagem</button>
        <button type="button" class="waw-btn" data-act="goto-suggest">${I("sparkles")}Sugerir resposta</button>
        <button type="button" class="waw-btn" data-act="open-demo" ${demo ? "" : "disabled title='Cadastre um link com “demo” no nome'"}>${I("globe")}Abrir demo</button>
        <button type="button" class="waw-btn" data-act="goto-quote">${I("calc")}Orçamento</button>
        <button type="button" class="waw-btn" data-act="c-followup">${I("bell")}Criar follow-up</button>
        <button type="button" class="waw-btn" data-act="c-follow">${I("eye")}${c.following ? "Seguindo" : "Seguir"}</button>
      </div>
      ${section("Prospecção", quickMsgList("Prospecção", 3))}
      ${section("Suporte", quickMsgList("Suporte", 3))}
      ${section("Cobrança", quickMsgList("Cobrança", 5))}
      ${section("Histórico interno", hist.length ? `<ul class="waw-hist">${hist.map((h) => `<li><time>${U.fmtDateTime(h.ts)}</time><span>${esc(h.text)}</span></li>`).join("")}</ul>` : ui.empty("Sem histórico registrado."))}`;
  }

  /* ---------- Follow-up ---------- */
  function tabFollowup() {
    const fu = crm.followUpItems();
    const block = (title, list, cls = "") =>
      section(`${title} <span class="waw-count ${cls}">${list.length}</span>`, list.length ? list.map(followItemHtml).join("") : ui.empty("Nada aqui."));
    return `${block("Atrasados", fu.overdue, "is-alert")}${block("Hoje", fu.today)}${block("Próximos", fu.upcoming.slice(0, 40))}`;
  }

  /* ---------- Contatos ---------- */
  function contactRow(c) {
    const tags = c.tags.map((id) => crm.tagById(id)).filter(Boolean).slice(0, 3);
    const last = crm.lastNote(c);
    const rem = crm.pendingReminders(c)[0];
    return `<li class="waw-crow" data-key="${esc(c.key)}">
      <button type="button" class="waw-crow-main" data-act="open-contact" data-key="${esc(c.key)}">
        ${statusDot(c)}
        <span class="waw-crow-txt"><strong>${c.priority ? "★ " : ""}${contactName(c)}</strong>
        <small>${esc([c.company, crm.statusById(c.statusId)?.label].filter(Boolean).join(" · ") || (c.phone ? U.formatPhone(c.phone) : ""))}</small>
        ${last ? `<small class="waw-crow-note">📝 ${esc(last.text.slice(0, 70))}</small>` : ""}</span>
        <span class="waw-crow-side">${tags.map((t) => ui.chip(t.label, t.color)).join("")}${rem ? `<small class="${rem.due < Date.now() ? "waw-late" : ""}">🔔 ${U.fmtDate(rem.due)}</small>` : ""}</span>
      </button>
      <button type="button" class="waw-icon-btn ${c.favorite ? "is-on" : ""}" data-act="row-fav" data-key="${esc(c.key)}" title="Favorito">${I("heart")}</button>
    </li>`;
  }

  function tabContacts() {
    const cfg = store.config;
    const q = view.contactsQuery;
    const f = view.contactsFilters;
    const chips = Object.entries(crm.FILTERS)
      .map(([id, label]) => `<button type="button" class="waw-chip ${f.includes(id) || (id === "all" && !f.length) ? "is-on" : ""}" data-act="cf" data-id="${id}">${esc(label)}</button>`)
      .join("");
    const statusOpts = cfg.statuses.map((s) => `<option value="status:${esc(s.id)}" ${f.includes(`status:${s.id}`) ? "selected" : ""}>${esc(s.label)}</option>`).join("");
    const tagOpts = cfg.tags.map((t) => `<option value="tag:${esc(t.id)}" ${f.includes(`tag:${t.id}`) ? "selected" : ""}>${esc(t.label)}</option>`).join("");
    const searchBox = `
      <div class="waw-search">${I("search")}<input type="search" data-keep="csearch" data-input="contacts-q" placeholder="Buscar cliente: nome, telefone, empresa, nota…" value="${esc(q)}"/></div>
      <div class="waw-chips">${chips}</div>
      <div class="waw-selects">
        <select data-change="cf-status"><option value="">Status…</option>${statusOpts}</select>
        <select data-change="cf-tag"><option value="">Tag…</option>${tagOpts}</select>
      </div>`;

    if (!q && !f.length) {
      const favs = Object.values(store.state.contacts).filter((c) => c.favorite);
      const prios = Object.values(store.state.contacts).filter((c) => c.priority && c.state !== "archived");
      const recents = store.state.recents.map((k) => crm.get(k)).filter(Boolean).slice(0, 12);
      const favLinks = cfg.links.filter((l) => l.favorite);
      const favButtons = cfg.buttons.filter((b) => b.favorite && b.active !== false);
      const favMsgs = cfg.quickMessages.filter((m) => m.favorite);
      const favoritesArea =
        favs.length || favLinks.length || favButtons.length || favMsgs.length
          ? `${favButtons.length ? `<div class="waw-fav-row">${favButtons.map((b) => `<button type="button" class="waw-btn waw-btn-sm" data-act="run-btn" data-id="${esc(b.id)}">${I(b.icon)}${esc(b.label)}</button>`).join("")}</div>` : ""}
             ${favLinks.length ? `<div class="waw-fav-row">${favLinks.map((l) => `<button type="button" class="waw-btn waw-btn-sm" data-act="open-link" data-id="${esc(l.id)}">${I("link")}${esc(l.label)}</button>`).join("")}</div>` : ""}
             ${favMsgs.length ? `<ul class="waw-msgs">${favMsgs.map(msgItemHtml).join("")}</ul>` : ""}
             ${favs.length ? `<ul class="waw-clist">${favs.map(contactRow).join("")}</ul>` : ""}`
          : ui.empty("Marque contatos, botões, links ou mensagens com ♥/★ para vê-los aqui.");
      return `${searchBox}
        ${section("⭐ Favoritos", favoritesArea)}
        ${section("Prioridades", prios.length ? `<ul class="waw-clist">${prios.map(contactRow).join("")}</ul>` : ui.empty("Nenhum contato prioritário."))}
        ${section("Recentes", recents.length ? `<ul class="waw-clist">${recents.map(contactRow).join("")}</ul>` : ui.empty("Os contatos que você abrir aparecem aqui."))}`;
    }
    const results = crm.search(q, f);
    return `${searchBox}
      <div data-region="contacts-results">${section(`Resultados <span class="waw-count">${results.length}</span>`, results.length ? `<ul class="waw-clist">${results.slice(0, 100).map(contactRow).join("")}</ul>` : ui.empty("Nenhum contato encontrado."))}</div>`;
  }

  /* ---------- Mensagens ---------- */
  function msgItemHtml(m) {
    return `<li class="waw-msg" data-msg="${esc(m.id)}">
      <div class="waw-msg-head"><strong>${esc(m.title)}</strong><span class="waw-muted waw-small">${esc(m.category)}</span>
        <button type="button" class="waw-icon-btn ${m.favorite ? "is-on" : ""}" data-act="msg-fav" title="Favorito">${I("star")}</button></div>
      <p>${esc(m.text.length > 180 ? `${m.text.slice(0, 180)}…` : m.text)}</p>
      <div class="waw-msg-acts">
        <button type="button" class="waw-btn waw-btn-sm" data-act="msg-copy">${I("copy")}Copiar</button>
        <button type="button" class="waw-btn waw-btn-sm waw-btn-primary" data-act="msg-insert">${I("insert")}Inserir</button>
      </div></li>`;
  }

  function subnav(tab, items) {
    const cur = view.sub[tab];
    return `<div class="waw-subnav">${Object.entries(items)
      .map(([id, label]) => `<button type="button" class="${cur === id ? "is-on" : ""}" data-act="sub" data-tab="${tab}" data-id="${id}">${esc(label)}</button>`)
      .join("")}</div>`;
  }

  function optionList(obj, selected) {
    return Object.entries(obj)
      .map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(l)}</option>`)
      .join("");
  }

  function tabMessages() {
    const nav = subnav("messages", { library: "Rápidas", generate: "✨ Gerar", rewrite: "Reescrever", suggest: "Sugerir" });
    const sub = view.sub.messages;
    const c = WAW.current.contact;

    if (sub === "generate") {
      const g = view.gen || (view.gen = { ...store.config.genDefaults, context: "", results: [] });
      return `${nav}
        <div class="waw-form">
          <label class="waw-field"><span>Objetivo</span><select data-change="gen-objective">${optionList(writer.OBJECTIVES, g.objective)}</select></label>
          <div class="waw-grid2">
            <label class="waw-field"><span>Tom</span><select data-change="gen-tone">${optionList(writer.TONES, g.tone)}</select></label>
            <label class="waw-field"><span>Tamanho</span><select data-change="gen-size">${optionList(writer.SIZES, g.size)}</select></label>
          </div>
          <label class="waw-field"><span>Detalhe extra (opcional)</span><textarea rows="2" data-keep="gen-ctx" data-input="gen-context" placeholder="Ex.: a demonstração do site já está pronta.">${esc(g.context || "")}</textarea></label>
          <button type="button" class="waw-btn waw-btn-primary" data-act="gen-run">${I("sparkles")}Gerar 3 opções${c ? ` para ${contactName(c)}` : ""}</button>
          <p class="waw-muted waw-small">Gerado localmente a partir de modelos, usando só os dados do contato salvos na extensão. Revise antes de inserir.</p>
        </div>
        ${g.results.length ? section("Opções", `<ul class="waw-msgs">${g.results.map((r, i) => resultItem(r.text, `gen-${i}`, r.missing)).join("")}</ul>`) : ""}`;
    }

    if (sub === "rewrite") {
      const r = view.rewrite;
      return `${nav}
        <div class="waw-form">
          <label class="waw-field"><span>Texto</span><textarea rows="5" data-keep="rw-text" data-input="rw-text" placeholder="Cole o texto, selecione um texto na página ou use o que já está digitado no campo de mensagem.">${esc(r.text)}</textarea></label>
          <div class="waw-chips">
            <button type="button" class="waw-chip" data-act="rw-from-composer">Usar texto do campo</button>
            <button type="button" class="waw-chip" data-act="rw-from-selection">Usar seleção</button>
          </div>
          <div class="waw-chips">${Object.entries(writer.REWRITE_STYLES).map(([id, l]) => `<button type="button" class="waw-chip ${r.style === id ? "is-on" : ""}" data-act="rw-run" data-id="${id}">${esc(l)}</button>`).join("")}</div>
        </div>
        ${r.result ? section("Resultado para revisão", `<ul class="waw-msgs">${resultItem(r.result, "rw")}</ul>`) : ""}`;
    }

    if (sub === "suggest") {
      const s = view.suggest;
      return `${nav}
        <div class="waw-form">
          <label class="waw-field"><span>Mensagem do cliente</span><textarea rows="4" data-keep="sg-text" data-input="sg-text" placeholder="Cole ou selecione a mensagem que você quer responder.">${esc(s.text)}</textarea></label>
          <div class="waw-chips">
            <button type="button" class="waw-chip" data-act="sg-from-last">Usar última mensagem recebida</button>
            <button type="button" class="waw-chip" data-act="sg-from-selection">Usar seleção</button>
          </div>
          <button type="button" class="waw-btn waw-btn-primary" data-act="sg-run">${I("sparkles")}Sugerir respostas</button>
          <p class="waw-muted waw-small">Usa somente o texto que você fornecer aqui. Nada é enviado automaticamente.</p>
        </div>
        ${s.result ? section(`Sugestões <span class="waw-muted waw-small">(${esc(s.result.intent)})</span>`, `<ul class="waw-msgs">${s.result.replies.map((t, i) => resultItem(t, `sg-${i}`)).join("")}</ul>`) : ""}`;
    }

    // biblioteca
    const cfg = store.config;
    const tokens = U.norm(view.msgQuery).split(" ").filter(Boolean);
    const list = cfg.quickMessages
      .filter((m) => !view.msgCategory || (view.msgCategory === "★" ? m.favorite : m.category === view.msgCategory))
      .filter((m) => !tokens.length || tokens.every((t) => U.norm(`${m.title} ${m.category} ${m.text}`).includes(t)))
      .sort((a, b) => b.favorite - a.favorite);
    const cats = ["", "★", ...cfg.categories];
    return `${nav}
      <div class="waw-search">${I("search")}<input type="search" data-keep="msearch" data-input="msg-q" placeholder="Procurar mensagem…" value="${esc(view.msgQuery)}"/></div>
      <div class="waw-chips">${cats.map((cat) => `<button type="button" class="waw-chip ${view.msgCategory === cat ? "is-on" : ""}" data-act="msg-cat-filter" data-cat="${esc(cat)}">${esc(cat || "Todas")}</button>`).join("")}</div>
      <div data-region="msg-results">${list.length ? `<ul class="waw-msgs">${list.map(msgItemHtml).join("")}</ul>` : ui.empty("Nenhuma mensagem. Cadastre em Configurações › Mensagens.")}</div>
      <p class="waw-muted waw-small">Variáveis: ${Object.keys(writer.VARIABLES).map((v) => `<code>{{${v}}}</code>`).join(" ")}</p>`;
  }

  function resultItem(text, id, missing = []) {
    return `<li class="waw-msg" data-result="${esc(id)}">
      ${missing?.length ? `<p class="waw-warn waw-small">Sem valor para: ${missing.map((m) => `{{${esc(m)}}}`).join(", ")}</p>` : ""}
      <p class="waw-pre">${esc(text)}</p>
      <div class="waw-msg-acts">
        <button type="button" class="waw-btn waw-btn-sm" data-act="res-copy">${I("copy")}Copiar</button>
        <button type="button" class="waw-btn waw-btn-sm" data-act="res-save">${I("star")}Salvar</button>
        <button type="button" class="waw-btn waw-btn-sm waw-btn-primary" data-act="res-insert">${I("insert")}Inserir</button>
      </div></li>`;
  }

  /* ---------- Ferramentas ---------- */
  function tabTools() {
    const items = { quote: "Orçamento", catalog: "Catálogo", links: "Links", tabs: "Abas", history: "Histórico" };
    if (store.config.features.diagnostic || store.config.mode === "admin") items.diag = "Diagnóstico";
    if (!items[view.sub.tools]) view.sub.tools = "quote";
    const nav = subnav("tools", items);
    const sub = view.sub.tools;
    const cfg = store.config;

    if (sub === "catalog") {
      return `${nav}${
        cfg.catalog.length
          ? `<ul class="waw-msgs">${cfg.catalog
              .map(
                (i) => `<li class="waw-msg" data-cat-item="${esc(i.id)}">
            <div class="waw-msg-head"><strong>${esc(i.name)}</strong><b>${U.money(i.price)}</b></div>
            ${i.description ? `<p>${esc(i.description)}</p>` : ""}
            <div class="waw-msg-acts">
              ${i.link ? `<button type="button" class="waw-btn waw-btn-sm" data-act="cat-open">${I("globe")}Abrir</button>` : ""}
              <button type="button" class="waw-btn waw-btn-sm waw-btn-primary" data-act="cat-insert">${I("insert")}Inserir no WhatsApp</button>
            </div></li>`,
              )
              .join("")}</ul>`
          : ui.empty("Catálogo vazio. Cadastre produtos/serviços em Configurações.")
      }`;
    }

    if (sub === "links") {
      return `${nav}${
        cfg.links.length
          ? `<div class="waw-link-grid">${cfg.links.map((l) => `<button type="button" class="waw-btn" data-act="open-link" data-id="${esc(l.id)}" title="${esc(l.url)}">${I("link")}${esc(l.label)}</button>`).join("")}</div>`
          : ui.empty("Cadastre links rápidos (CRM, Drive, Demo…) em Configurações.")
      }`;
    }

    if (sub === "tabs") {
      if (!view.tabs && !view.tabsLoading) loadTabs();
      const tabs = view.tabs || [];
      return `${nav}
        <div class="waw-row-between"><span class="waw-muted waw-small">Abas do WhatsApp e dos seus links rápidos</span><button type="button" class="waw-link" data-act="tabs-refresh">Atualizar</button></div>
        ${view.tabsLoading ? ui.empty("Carregando…") : tabs.length ? `<ul class="waw-tablist">${tabs.map((t) => `<li><button type="button" data-act="tab-activate" data-id="${t.id}" data-win="${t.windowId}" class="${t.active ? "is-on" : ""}">${t.favIconUrl ? `<img src="${esc(t.favIconUrl)}" alt=""/>` : I("tabs")}<span>${esc(t.title || t.url)}</span>${t.isWhatsApp ? '<b class="waw-badge waw-badge-wa">WA</b>' : ""}</button></li>`).join("")}</ul>` : ui.empty("Nenhuma aba relacionada aberta.")}
        <label class="waw-check"><input type="checkbox" data-act="toggle-reuse" ${cfg.features.reuseWhatsAppTab ? "checked" : ""}/><span>Reutilizar aba existente do WhatsApp (não duplicar)</span></label>`;
    }

    if (sub === "history") {
      const f = U.norm(view.historyFilter);
      const list = store.state.history.filter((h) => !f || U.norm(h.text).includes(f)).slice(0, 200);
      let lastDay = "";
      const rows = list
        .map((h) => {
          const day = U.dayKey(h.ts);
          const head = day !== lastDay ? `<li class="waw-hist-day">${U.fmtDate(h.ts)}</li>` : "";
          lastDay = day;
          return `${head}<li><time>${U.fmtTime(h.ts)}</time><span>${esc(h.text)}</span></li>`;
        })
        .join("");
      return `${nav}
        <div class="waw-search">${I("search")}<input type="search" data-keep="hsearch" data-input="hist-q" placeholder="Filtrar histórico…" value="${esc(view.historyFilter)}"/></div>
        ${rows ? `<ul class="waw-hist">${rows}</ul>` : ui.empty("Sem ações registradas.")}`;
    }

    if (sub === "diag") {
      const caps = store.state.diag.slice(0, 10);
      const ld = WAW.lists.getLastDiagnostic();
      return `${nav}
        <div class="waw-actions-grid">
          <button type="button" class="waw-btn waw-btn-primary" data-act="diag-capture">${I("crosshair")}Capturar elemento</button>
          <button type="button" class="waw-btn" data-act="diag-test-lists">${I("lists")}Testar “Mais listas”</button>
          <button type="button" class="waw-btn" data-act="diag-report">${I("copy")}Copiar relatório</button>
          <button type="button" class="waw-btn" data-act="diag-clear">${I("trash")}Limpar capturas</button>
        </div>
        ${ld ? section("Última detecção de listas", `<pre class="waw-code">${esc(JSON.stringify(ld, null, 2))}</pre>`) : ""}
        ${section(`Capturas <span class="waw-count">${store.state.diag.length}</span>`, caps.length ? caps.map((d) => `<details class="waw-diag"><summary><b>${esc(d.tag)}</b> ${esc(d.ariaLabel || d.title || d.clickableAncestor?.ariaLabel || d.text.slice(0, 40) || d.dataTestid || d.dataIcons?.[0] || "")} <small>${U.fmtDateTime(d.at)}</small></summary><pre class="waw-code">${esc(JSON.stringify(d, null, 2))}</pre><button type="button" class="waw-btn waw-btn-sm" data-act="diag-copy" data-id="${esc(d.id)}">${I("copy")}Copiar JSON</button></details>`).join("") : ui.empty("Nenhuma captura ainda."))}`;
    }

    // orçamento / calculadora
    const q = view.quote;
    const cur = WAW.current.contact;
    if (q.clientKey !== (cur?.key || "")) {
      q.clientKey = cur?.key || "";
      q.client = { name: cur?.name || "", company: cur?.company || "", doc: "", email: cur?.email || "", phone: cur?.phone ? U.formatPhone(cur.phone) : "", city: cur?.city || "" };
    }
    if (q.validity == null) q.validity = cfg.pdf.validityDays;
    const quotes = store.state.quotes;
    const mine = cur ? quotes.filter((x) => x.contactKey === cur.key) : [];
    const recent = (mine.length ? mine : quotes).slice(0, 8);
    const cf = (k, label, ph = "") => `<label class="waw-field"><span>${label}</span><input data-keep="qc-${k}" data-input="q-client" data-k="${k}" value="${esc(q.client[k] || "")}" placeholder="${esc(ph)}"/></label>`;
    const lines = [
      ...cfg.catalog.filter((i) => q.selected[i.id]).map((i) => ({ name: i.name, price: i.price, qty: Number(q.qty[i.id]) || 1 })),
      ...q.extras.filter((e) => e.name && e.price).map((e) => ({ name: e.name, price: U.parseMoney(e.price), qty: 1 })),
    ];
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const discount = U.parseMoney(q.discount);
    const total = Math.max(0, subtotal - discount);
    return `${nav}
      <ul class="waw-quote">
        ${cfg.catalog
          .map(
            (i) => `<li><label><input type="checkbox" data-act="q-toggle" data-id="${esc(i.id)}" ${q.selected[i.id] ? "checked" : ""}/><span>${esc(i.name)}</span></label>
            <input type="number" min="1" class="waw-qty" data-keep="qty-${esc(i.id)}" data-input="q-qty" data-id="${esc(i.id)}" value="${esc(q.qty[i.id] || 1)}" title="Quantidade"/>
            <b>${U.money(i.price)}</b></li>`,
          )
          .join("")}
        ${q.extras
          .map(
            (e, idx) => `<li class="waw-quote-extra"><input data-keep="qx-n-${idx}" data-input="q-extra-name" data-idx="${idx}" placeholder="Item avulso" value="${esc(e.name)}"/><input data-keep="qx-p-${idx}" data-input="q-extra-price" data-idx="${idx}" placeholder="R$" value="${esc(e.price)}"/><button type="button" class="waw-icon-btn" data-act="q-extra-del" data-idx="${idx}">${I("x")}</button></li>`,
          )
          .join("")}
      </ul>
      <button type="button" class="waw-link" data-act="q-extra-add">+ Item avulso</button>
      <div class="waw-quote-total">
        <div><span>Subtotal</span><b>${U.money(subtotal)}</b></div>
        <div><span>Desconto</span><input data-keep="q-disc" data-input="q-discount" placeholder="0,00" value="${esc(q.discount || "")}"/></div>
        <div class="is-total"><span>Total</span><b>${U.money(total)}</b></div>
      </div>
      <details class="waw-quote-client" ${q.client.name ? "" : "open"}>
        <summary>${I("user")} Cliente no PDF: <b>${esc(q.client.name || "—")}</b>${q.client.company ? ` · ${esc(q.client.company)}` : ""}</summary>
        <div class="waw-grid2">${cf("name", "Nome")}${cf("company", "Empresa")}${cf("doc", "CPF/CNPJ")}${cf("phone", "Telefone")}${cf("email", "E-mail")}${cf("address", "Endereço")}${cf("city", "Cidade")}</div>
      </details>
      <div class="waw-grid2" style="margin-top:8px">
        <label class="waw-field"><span>Validade (dias)</span><input type="number" min="0" data-keep="q-val" data-input="q-validity" value="${esc(q.validity)}"/></label>
        <label class="waw-field"><span>Próximo número</span><input disabled value="${esc(WAW.pdf ? WAW.pdf.quoteNumber(cfg.pdf, cfg.pdf.nextNumber) : `${cfg.pdf.numberPrefix}${String(cfg.pdf.nextNumber).padStart(cfg.pdf.numberPad, "0")}`)}"/></label>
      </div>
      <label class="waw-field" style="margin-top:8px"><span>Observações deste orçamento (opcional)</span><textarea rows="2" data-keep="q-notes" data-input="q-notes" placeholder="Ex.: prazo de entrega de 15 dias úteis.">${esc(q.notes || "")}</textarea></label>
      <div class="waw-quote-actions">
        <button type="button" class="waw-btn waw-btn-primary" data-act="q-pdf" ${lines.length ? "" : "disabled"}>${I("note")}Gerar PDF</button>
        <button type="button" class="waw-btn" data-act="q-contract" ${lines.length ? "" : "disabled"}>${I("briefcase")}Gerar contrato</button>
        <button type="button" class="waw-btn" data-act="q-build" ${lines.length ? "" : "disabled"}>${I("message")}Como texto</button>
      </div>
      <p class="waw-muted waw-small">Layout, logo, assinatura e cores: Configurações › Orçamento PDF.</p>
      ${recent.length ? section(`Documentos ${mine.length ? "deste contato" : "recentes"}`, `<ul class="waw-qhist">${recent
        .map((r) => `<li data-quote="${esc(r.id)}"><div><b>${r.type === "contract" ? "📝 " : "📄 "}${esc(r.number)}</b><small>${esc(r.clientName || "—")} · ${U.fmtDateTime(r.createdAt)}</small></div><strong>${U.money(r.total)}</strong>
          <span class="waw-row-acts"><button type="button" class="waw-icon-btn" data-act="qh-view" title="Visualizar">${I("eye")}</button><button type="button" class="waw-icon-btn" data-act="qh-download" title="Baixar">${I("download")}</button><button type="button" class="waw-icon-btn" data-act="qh-attach" title="Anexar na conversa">${I("insert")}</button>${r.type === "contract" ? "" : `<button type="button" class="waw-icon-btn" data-act="qh-contract" title="Gerar contrato a partir deste orçamento">${I("briefcase")}</button>`}</span></li>`)
        .join("")}</ul>`) : ""}`;
  }

  async function loadTabs() {
    view.tabsLoading = true;
    const r = await actions.send({ type: "waw:list-tabs", hosts: store.config.links.map((l) => l.url) });
    view.tabs = r.ok ? r.tabs : [];
    view.tabsLoading = false;
    render();
  }

  /* ------------------------------------------------------------------ */
  /* eventos                                                            */
  /* ------------------------------------------------------------------ */
  function currentContactOrWarn() {
    return WAW.currentChat.require();
  }

  function findMessage(id) {
    return store.config.quickMessages.find((m) => m.id === id);
  }

  function resultText(li) {
    return li?.querySelector(".waw-pre")?.textContent || "";
  }

  async function onClick(e) {
    const el = document.getElementById(PANEL_ID);
    const t = e.target.closest("[data-act], [data-tab]");
    if (!t || !el.contains(t)) return;
    if (t.tagName === "INPUT" && t.type === "checkbox") return; // tratado em change
    e.preventDefault();
    const act = t.dataset.act;
    const cfg = store.config;
    const c = WAW.current.contact;
    const key = t.dataset.key || t.closest("[data-key]")?.dataset.key;

    if (!act && t.dataset.tab) {
      store.patchConfig((x) => (x.panel.tab = t.dataset.tab));
      return render();
    }

    switch (act) {
      case "close":
        return close();
      case "minimize":
        store.patchConfig((x) => (x.panel.minimized = true));
        return render();
      case "restore":
        store.patchConfig((x) => (x.panel.minimized = false));
        return render();
      case "palette":
        return WAW.palette.open();
      case "mode-menu":
        return ui.popover(
          t,
          Object.entries(store.MODES).map(([id, label]) => ({ label, icon: modeIcon(id), checked: cfg.mode === id, onClick: () => actions.setMode(id) })),
        );
      case "sub":
        view.sub[t.dataset.tab] = t.dataset.id;
        return render();
      case "filter-status":
        view.contactsFilters = [`status:${t.dataset.id}`];
        view.contactsQuery = "";
        store.patchConfig((x) => (x.panel.tab = "contacts"));
        return render();
      case "goto-history":
        view.sub.tools = "history";
        store.patchConfig((x) => (x.panel.tab = "tools"));
        return render();
      case "goto-quote":
        view.sub.tools = "quote";
        store.patchConfig((x) => (x.panel.tab = "tools"));
        return render();
      case "goto-library":
        view.sub.messages = "library";
        view.msgCategory = t.dataset.cat || "";
        store.patchConfig((x) => (x.panel.tab = "messages"));
        return render();
      case "goto-suggest":
        view.sub.messages = "suggest";
        store.patchConfig((x) => (x.panel.tab = "messages"));
        return render();
      case "msg-cat":
        view.sub.messages = "library";
        view.msgCategory = t.dataset.cat;
        store.patchConfig((x) => (x.panel.tab = "messages"));
        return render();
      case "gen":
        view.gen = { ...(view.gen || cfg.genDefaults), objective: t.dataset.obj || "primeiro-contato", context: view.gen?.context || "", results: [] };
        view.gen.results = writer.generate({ ...view.gen, contact: c });
        crm.bump("generated");
        view.sub.messages = "generate";
        store.patchConfig((x) => (x.panel.tab = "messages"));
        return render();

      /* timer */
      case "timer-start":
        if (c) crm.timerStart(c.key);
        return render();
      case "timer-pause":
        crm.timerPause();
        return render();
      case "timer-resume":
        crm.timerStart(crm.timerState()?.key);
        return render();
      case "timer-finish":
        crm.timerFinish();
        ui.toast("Atendimento finalizado");
        return render();

      /* contato */
      case "c-fav":
        return c && crm.setFlag(c.key, "favorite", !c.favorite);
      case "c-follow":
        return c && WAW.follow.toggle(c);
      case "panel-look":
        return panelLook(t);
      case "c-prio":
        return c && crm.setFlag(c.key, "priority", !c.priority);
      case "c-edit":
        return WAW.dialogs.editProfile(c);
      case "c-status":
        return WAW.dialogs.statusMenu(t, c);
      case "c-state":
        return c && WAW.dialogs.stateMenu(t, c);
      case "c-tags":
        return WAW.dialogs.tagMenu(t, c);
      case "c-note":
        return WAW.dialogs.addNote(currentContactOrWarn());
      case "c-reminder":
        return WAW.dialogs.addReminder(currentContactOrWarn());
      case "c-followup":
        return WAW.dialogs.addReminder(currentContactOrWarn(), { text: "Follow-up", due: ui.quickTime(2880) });
      case "c-task":
        return WAW.dialogs.addTask(currentContactOrWarn());
      case "c-archive":
        return c && crm.setState(c.key, "archived");
      case "c-set-status":
        if (c) {
          crm.setStatus(c.key, t.dataset.id);
          ui.toast(`Status: ${crm.statusById(t.dataset.id)?.label || t.dataset.id}`);
        }
        return;
      case "open-demo": {
        const demo = cfg.links.find((l) => /demo/i.test(l.label));
        return demo && actions.openUrl(demo.url);
      }
      case "note-pin": {
        const id = t.closest("[data-note]").dataset.note;
        const n = c?.notes.find((x) => x.id === id);
        return n && crm.updateNote(c.key, id, { pinned: !n.pinned });
      }
      case "note-edit": {
        const n = c?.notes.find((x) => x.id === t.closest("[data-note]").dataset.note);
        return n && WAW.dialogs.editNote(c, n);
      }
      case "note-del":
        if (c && (await ui.confirm("Excluir nota", "Esta nota será removida."))) crm.deleteNote(c.key, t.closest("[data-note]").dataset.note);
        return;
      case "rem-done":
        return c && crm.updateReminder(c.key, t.closest("[data-rem]").dataset.rem, { done: true });
      case "rem-snooze": {
        const r = c?.reminders.find((x) => x.id === t.closest("[data-rem]").dataset.rem);
        return r && WAW.dialogs.snoozeMenu(t, c, r);
      }
      case "rem-edit": {
        const r = c?.reminders.find((x) => x.id === t.closest("[data-rem]").dataset.rem);
        return r && WAW.dialogs.editReminder(c, r);
      }
      case "rem-del":
        return c && crm.deleteReminder(c.key, t.closest("[data-rem]").dataset.rem);
      case "task-cycle": {
        const id = t.closest("[data-task]").dataset.task;
        const task = c?.tasks.find((x) => x.id === id);
        if (!task) return;
        const next = { pending: "doing", doing: "done", done: "pending" }[task.status];
        return crm.updateTask(c.key, id, { status: next });
      }
      case "task-del":
        return c && crm.deleteTask(c.key, t.closest("[data-task]").dataset.task);

      /* follow-up */
      case "open-contact":
        return actions.openContact(crm.get(key));
      case "fu-done": {
        const item = t.closest("[data-kind]");
        if (item.dataset.kind === "task") crm.updateTask(item.dataset.key, item.dataset.id, { status: "done" });
        else crm.updateReminder(item.dataset.key, item.dataset.id, { done: true });
        return;
      }
      case "fu-snooze": {
        const item = t.closest("[data-kind]");
        const contact = crm.get(item.dataset.key);
        const r = contact?.reminders.find((x) => x.id === item.dataset.id);
        return r && WAW.dialogs.snoozeMenu(t, contact, r);
      }

      /* contatos */
      case "cf": {
        const id = t.dataset.id;
        if (id === "all") view.contactsFilters = [];
        else view.contactsFilters = view.contactsFilters.includes(id) ? view.contactsFilters.filter((x) => x !== id) : [...view.contactsFilters, id];
        return render();
      }
      case "row-fav": {
        const contact = crm.get(key);
        return contact && crm.setFlag(key, "favorite", !contact.favorite);
      }
      case "run-btn":
        return actions.runButton(cfg.buttons.find((b) => b.id === t.dataset.id));
      case "open-link": {
        const l = cfg.links.find((x) => x.id === t.dataset.id);
        return l && actions.openUrl(l.url);
      }

      /* mensagens */
      case "msg-cat-filter":
        view.msgCategory = t.dataset.cat;
        return render();
      case "msg-fav": {
        const id = t.closest("[data-msg]").dataset.msg;
        store.patchConfig((x) => {
          const m = x.quickMessages.find((y) => y.id === id);
          if (m) m.favorite = !m.favorite;
        });
        return render();
      }
      case "msg-copy": {
        const m = findMessage(t.closest("[data-msg]").dataset.msg);
        if (!m) return;
        await ui.copy(writer.fillVariables(m.text, c).text);
        crm.bump("copies");
        return ui.toast("Copiado");
      }
      case "msg-insert": {
        const m = findMessage(t.closest("[data-msg]").dataset.msg);
        return m && actions.insertTemplate(m.text);
      }
      case "gen-run": {
        view.gen.results = writer.generate({ ...view.gen, contact: c });
        crm.bump("generated");
        store.patchConfig((x) => (x.genDefaults = { objective: view.gen.objective, tone: view.gen.tone, size: view.gen.size }));
        return render();
      }
      case "rw-from-composer":
        view.rewrite.text = WAW.wa.composerText();
        if (!view.rewrite.text) ui.toast("O campo de mensagem está vazio", { kind: "warn" });
        return render();
      case "rw-from-selection":
      case "sg-from-selection": {
        const sel = String(window.getSelection() || "").trim() || lastSelection;
        if (!sel) return ui.toast("Selecione um texto na conversa primeiro", { kind: "warn" });
        if (act === "rw-from-selection") view.rewrite.text = sel;
        else view.suggest.text = sel;
        return render();
      }
      case "rw-run":
        view.rewrite.style = t.dataset.id;
        if (!view.rewrite.text.trim()) return ui.toast("Informe o texto a reescrever", { kind: "warn" });
        view.rewrite.result = writer.rewrite(view.rewrite.text, t.dataset.id);
        return render();
      case "sg-from-last":
        view.suggest.text = WAW.wa.lastIncomingText();
        if (!view.suggest.text) ui.toast("Não encontrei mensagem recebida visível", { kind: "warn" });
        return render();
      case "sg-run":
        if (!view.suggest.text.trim()) return ui.toast("Informe a mensagem do cliente", { kind: "warn" });
        view.suggest.result = writer.suggestReplies(view.suggest.text, c);
        return render();
      case "res-copy":
        await ui.copy(resultText(t.closest("[data-result]")));
        crm.bump("copies");
        return ui.toast("Copiado");
      case "res-insert":
        return ui.review(resultText(t.closest("[data-result]")), { contact: c });
      case "res-save": {
        const text = resultText(t.closest("[data-result]"));
        const r = await ui.form({
          title: "Salvar como mensagem rápida",
          fields: [
            { name: "title", label: "Título", required: true, autofocus: true },
            { name: "category", label: "Categoria", type: "select", value: cfg.categories[0], options: cfg.categories.map((x) => ({ value: x, label: x })) },
            { name: "text", label: "Texto (use {{nome}} para personalizar)", type: "textarea", value: c?.name ? text.replaceAll(writer.firstName(c.name), "{{nome}}") : text, rows: 6 },
          ],
        });
        if (!r) return;
        store.patchConfig((x) => x.quickMessages.push({ id: U.uid("msg"), title: r.title, category: r.category, text: r.text, favorite: false }));
        return ui.toast("Mensagem salva");
      }

      /* ferramentas */
      case "cat-open": {
        const i = cfg.catalog.find((x) => x.id === t.closest("[data-cat-item]").dataset.catItem);
        return i && actions.openUrl(i.link);
      }
      case "cat-insert": {
        const i = cfg.catalog.find((x) => x.id === t.closest("[data-cat-item]").dataset.catItem);
        if (!i) return;
        const text = [`*${i.name}*`, i.description, `Valor: ${U.money(i.price)}`, i.link].filter(Boolean).join("\n");
        return ui.review(text, { contact: c, title: "Inserir item do catálogo" });
      }
      case "q-extra-add":
        view.quote.extras.push({ name: "", price: "" });
        return render();
      case "q-extra-del":
        view.quote.extras.splice(Number(t.dataset.idx), 1);
        return render();
      case "q-build": {
        const q = view.quote;
        const items = [
          ...cfg.catalog.filter((i) => q.selected[i.id]).map((i) => ({ name: i.name, price: i.price, qty: Number(q.qty[i.id]) || 1 })),
          ...q.extras.filter((x) => x.name && x.price).map((x) => ({ name: x.name, price: U.parseMoney(x.price), qty: 1 })),
        ];
        const disc = U.parseMoney(q.discount);
        if (disc) items.push({ name: "Desconto", price: -disc, qty: 1 });
        return ui.review(writer.buildQuote(items, c), { contact: c, title: "Revisar proposta" });
      }
      case "q-pdf": {
        t.disabled = true;
        try {
          const { record, doc, file } = await WAW.quotes.create(view.quote);
          render();
          await pdfActions(record, doc, file);
        } catch (error) {
          ui.toast(error.message, { kind: "warn" });
        } finally {
          t.disabled = false;
        }
        return;
      }
      case "q-contract":
      case "qh-contract": {
        let data;
        if (act === "qh-contract") {
          const rec = store.state.quotes.find((x) => x.id === t.closest("[data-quote]").dataset.quote);
          if (!rec) return;
          data = { ...U.clone(rec.data), quoteNumber: rec.number };
        } else {
          data = WAW.quotes.collect(view.quote);
          if (!data.items.length) return ui.toast("Selecione pelo menos um item", { kind: "warn" });
          const lastQuote = store.state.quotes.find((x) => x.type !== "contract" && x.contactKey && x.contactKey === WAW.current.contact?.key);
          if (lastQuote) data.quoteNumber = lastQuote.number;
        }
        try {
          const edited = await contractEditor(data);
          if (!edited) return;
          const { record, doc, file } = await WAW.quotes.createContract(edited);
          render();
          await pdfActions(record, doc, file);
        } catch (error) {
          ui.toast(error.message, { kind: "warn" });
        }
        return;
      }
      case "qh-view":
      case "qh-download":
      case "qh-attach": {
        const rec = store.state.quotes.find((x) => x.id === t.closest("[data-quote]").dataset.quote);
        if (!rec) return;
        try {
          const { doc, file } = await WAW.quotes.regenerate(rec);
          if (act === "qh-view") return WAW.quotes.preview(doc, file.name);
          if (act === "qh-download") return WAW.quotes.download(file);
          return WAW.quotes.attachOrDownload(file);
        } catch (error) {
          return ui.toast(error.message, { kind: "warn" });
        }
      }
      case "tabs-refresh":
        view.tabs = null;
        return loadTabs();
      case "tab-activate":
        actions.send({ type: "waw:activate-tab", tabId: Number(t.dataset.id), windowId: Number(t.dataset.win) });
        return;
      case "diag-capture":
        return captureElement();
      case "diag-test-lists": {
        const r = WAW.lists.findMoreListsButton();
        ui.toast(r ? `“Mais listas” encontrado (pontuação ${Math.round(r.score)})` : "“Mais listas” não encontrado com segurança", { kind: r ? "info" : "warn" });
        if (r) {
          const box = r.el.getBoundingClientRect();
          flash(box);
        }
        return render();
      }
      case "diag-report":
        await ui.copy(JSON.stringify(WAW.diagnostic.report(), null, 2));
        return ui.toast("Relatório copiado");
      case "diag-copy": {
        const d = store.state.diag.find((x) => x.id === t.dataset.id);
        await ui.copy(JSON.stringify(d, null, 2));
        return ui.toast("JSON copiado");
      }
      case "diag-clear":
        store.state.diag.length = 0;
        store.persist("diag");
        return render();
      default:
    }
  }

  function flash(rect) {
    const f = U.h(`<div class="waw-flash" style="left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px"></div>`);
    document.documentElement.appendChild(f);
    setTimeout(() => f.remove(), 1600);
  }

  async function captureElement() {
    if (!store.config.features.diagnostic && store.config.mode !== "admin") return ui.toast("Ative o modo diagnóstico nas configurações", { kind: "warn" });
    const rec = await WAW.diagnostic.capture({ block: true });
    if (rec) {
      ui.toast(`Capturado: ${rec.tag}${rec.ariaLabel ? ` “${rec.ariaLabel}”` : ""}`);
      view.sub.tools = "diag";
      open("tools");
    }
  }

  function onInput(e) {
    const t = e.target;
    const k = t.dataset.input;
    if (!k) return;
    e.stopPropagation();
    switch (k) {
      case "contacts-q":
        view.contactsQuery = t.value;
        return renderSoon();
      case "msg-q":
        view.msgQuery = t.value;
        return renderSoon();
      case "hist-q":
        view.historyFilter = t.value;
        return renderSoon();
      case "gen-context":
        view.gen.context = t.value;
        return;
      case "rw-text":
        view.rewrite.text = t.value;
        return;
      case "sg-text":
        view.suggest.text = t.value;
        return;
      case "q-qty":
        view.quote.qty[t.dataset.id] = Math.max(1, Number(t.value) || 1);
        return renderSoon();
      case "q-extra-name":
        view.quote.extras[Number(t.dataset.idx)].name = t.value;
        return renderSoon();
      case "q-extra-price":
        view.quote.extras[Number(t.dataset.idx)].price = t.value;
        return renderSoon();
      case "q-discount":
        view.quote.discount = t.value;
        return renderSoon();
      case "q-client":
        view.quote.client[t.dataset.k] = t.value;
        return;
      case "q-validity":
        view.quote.validity = Math.max(0, Number(t.value) || 0);
        return;
      case "q-notes":
        view.quote.notes = t.value;
        return;
      default:
    }
  }
  const renderSoon = U.debounce(render, 180);

  function onChange(e) {
    const t = e.target;
    const cfg = store.config;
    const c = WAW.current.contact;
    if (t.dataset.change) {
      const v = t.value;
      switch (t.dataset.change) {
        case "cf-status":
        case "cf-tag": {
          const prefix = t.dataset.change === "cf-status" ? "status:" : "tag:";
          view.contactsFilters = view.contactsFilters.filter((f) => !f.startsWith(prefix));
          if (v) view.contactsFilters.push(v);
          return render();
        }
        case "gen-objective":
          view.gen.objective = v;
          return;
        case "gen-tone":
          view.gen.tone = v;
          return;
        case "gen-size":
          view.gen.size = v;
          return;
        default:
          return;
      }
    }
    switch (t.dataset.act) {
      case "ck":
        return c && crm.toggleChecklist(c.key, t.dataset.id);
      case "q-toggle":
        view.quote.selected[t.dataset.id] = t.checked;
        return render();
      case "toggle-reuse":
        store.patchConfig((x) => (x.features.reuseWhatsAppTab = t.checked));
        return;
      default:
        void cfg;
    }
  }

  let lastSelection = "";
  document.addEventListener("selectionchange", U.debounce(() => {
    const s = String(window.getSelection() || "").trim();
    const panel = document.getElementById(PANEL_ID);
    const node = window.getSelection()?.anchorNode;
    if (s && !(panel && node && panel.contains(node))) lastSelection = s.slice(0, 2000);
  }, 200));

  /** Editor do contrato antes de gerar: dados do contratante + cláusulas editáveis. */
  async function contractEditor(data) {
    ui.toast("Preparando contrato…", { sound: false, ms: 1200 });
    const clauses = await WAW.quotes.contractDraft(data);
    const cl = data.client || {};
    const clauseHtml = (c) => `<li class="waw-cl"><div class="waw-cl-head"><input data-cl="title" value="${esc(c.title)}" placeholder="Título da cláusula"/>
      <button type="button" class="waw-icon-btn" data-cl-act="up" title="Subir">↑</button><button type="button" class="waw-icon-btn" data-cl-act="down" title="Descer">↓</button><button type="button" class="waw-icon-btn" data-cl-act="del" title="Remover">${I("trash")}</button></div>
      <textarea data-cl="text" rows="4">${esc(c.text)}</textarea></li>`;
    const field = (k, label) => `<label class="waw-field"><span>${label}</span><input data-client="${k}" value="${esc(cl[k] || "")}"/></label>`;
    return ui.modal({
      title: "Contrato — revisar e editar",
      subtitle: `${cl.name || "Cliente"} · ${U.money(WAW.pdf.computeTotals(data).total)}${data.quoteNumber ? ` · ref. ${data.quoteNumber}` : ""}`,
      width: 720,
      body: `<p class="waw-muted waw-small">Edite livremente os dados e as cláusulas deste contrato. O modelo padrão fica em Configurações › Orçamento e contrato. Recomendamos revisão jurídica do modelo.</p>
        <h4 class="waw-modal-sub">Contratante</h4>
        <div class="waw-grid2">${field("name", "Nome / representante")}${field("company", "Empresa (se PJ)")}${field("doc", "CPF / CNPJ")}${field("email", "E-mail")}${field("address", "Endereço")}${field("city", "Cidade/UF")}</div>
        <h4 class="waw-modal-sub">Cláusulas</h4>
        <ol class="waw-cl-list">${clauses.map(clauseHtml).join("")}</ol>
        <button type="button" class="waw-link" data-cl-add="1">+ Adicionar cláusula</button>`,
      onMount: (root) => {
        const list = root.querySelector(".waw-cl-list");
        root.addEventListener("click", (e) => {
          if (e.target.closest("[data-cl-add]")) {
            list.insertAdjacentHTML("beforeend", clauseHtml({ title: "NOVA CLÁUSULA", text: "" }));
            list.lastElementChild.querySelector("textarea").focus();
            return;
          }
          const b = e.target.closest("[data-cl-act]");
          if (!b) return;
          const li = b.closest("li");
          if (b.dataset.clAct === "del") li.remove();
          if (b.dataset.clAct === "up" && li.previousElementSibling) li.parentElement.insertBefore(li, li.previousElementSibling);
          if (b.dataset.clAct === "down" && li.nextElementSibling) li.parentElement.insertBefore(li.nextElementSibling, li);
        });
      },
      actions: [
        { label: "Cancelar", value: null },
        {
          label: "Gerar contrato PDF",
          icon: "briefcase",
          primary: true,
          onClick: (root) => {
            const client = { ...cl };
            root.querySelectorAll("[data-client]").forEach((i) => (client[i.dataset.client] = i.value.trim()));
            const edited = [...root.querySelectorAll(".waw-cl")]
              .map((li) => ({ title: li.querySelector("[data-cl=title]").value.trim(), text: li.querySelector("[data-cl=text]").value.trim() }))
              .filter((c) => c.title || c.text);
            if (!client.name) {
              ui.toast("Informe o nome do contratante", { kind: "warn" });
              return false;
            }
            return { ...data, client, clauses: edited };
          },
        },
      ],
    });
  }

  /** Depois de gerar: visualizar, baixar ou anexar (o envio é sempre manual). */
  async function pdfActions(record, doc, file) {
    return ui.modal({
      title: `${record.type === "contract" ? "Contrato" : "Orçamento"} ${record.number} gerado`,
      subtitle: `${record.clientName || "Cliente"} · ${U.money(record.total)} · ${doc.getNumberOfPages()} página(s)`,
      body: `<p class="waw-muted">O PDF foi salvo no histórico de documentos. Anexar abre a janela de envio do próprio WhatsApp — você confere e envia.</p>`,
      actions: [
        { label: "Visualizar", icon: "eye", onClick: () => (WAW.quotes.preview(doc, file.name), false) },
        { label: "Baixar", icon: "download", onClick: () => (WAW.quotes.download(file), false) },
        { label: "Anexar na conversa", icon: "insert", primary: true, onClick: () => WAW.quotes.attachOrDownload(file).then(() => true) },
      ],
    });
  }

  /* ---------------- opacidade / soltar / arrastar ---------------- */
  function panelLook(anchor) {
    const d = store.config.display;
    document.getElementById("waw-panel-opts")?.remove();
    const pop = U.h(`<div id="waw-panel-opts" class="waw-popover" style="width:250px">
      <div class="waw-pop-head">Painel</div>
      <label class="waw-range"><span>Opacidade do fundo <b data-v>${Math.round(d.panelOpacity * 100)}%</b></span>
        <input type="range" min="40" max="100" step="5" value="${Math.round(d.panelOpacity * 100)}" data-opacity/></label>
      <div class="waw-pop-div"></div>
      <button type="button" class="waw-pop-item" data-float="0"><span></span><span class="waw-pop-label">Acoplado à direita</span><span class="waw-pop-check">${d.panelFloating ? "" : I("check")}</span></button>
      <button type="button" class="waw-pop-item" data-float="1"><span></span><span class="waw-pop-label">Solto (arrastar pelo topo)</span><span class="waw-pop-check">${d.panelFloating ? I("check") : ""}</span></button>
      <p class="waw-pop-hint">${I("hand")} Arraste o topo do painel para soltá-lo e movê-lo.</p>
    </div>`);
    document.documentElement.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.right - 250, innerWidth - 258))}px`;
    pop.style.top = `${r.bottom + 6}px`;
    const range = pop.querySelector("[data-opacity]");
    range.addEventListener("input", () => {
      pop.querySelector("[data-v]").textContent = `${range.value}%`;
      document.getElementById(PANEL_ID)?.style.setProperty("--waw-panel-alpha", String(Number(range.value) / 100));
    });
    range.addEventListener("change", () => store.patchConfig((cfg) => (cfg.display.panelOpacity = Number(range.value) / 100)));
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("[data-float]");
      if (!b) return;
      store.patchConfig((cfg) => (cfg.display.panelFloating = b.dataset.float === "1"));
      pop.remove();
    });
    const close = (e) => {
      if (!pop.contains(e.target)) {
        pop.remove();
        document.removeEventListener("pointerdown", close, true);
      }
    };
    setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
  }

  let panelDrag = null;
  function onHeadDown(e) {
    const head = e.target.closest?.(`#${PANEL_ID} [data-drag]`);
    if (!head || e.button !== 0 || e.target.closest("button, input, select")) return;
    const el = document.getElementById(PANEL_ID);
    const r = el.getBoundingClientRect();
    panelDrag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    e.preventDefault();
  }
  function onHeadMove(e) {
    if (!panelDrag) return;
    const dx = e.clientX - panelDrag.sx;
    const dy = e.clientY - panelDrag.sy;
    if (!panelDrag.moved && Math.hypot(dx, dy) < 5) return;
    const el = document.getElementById(PANEL_ID);
    if (!panelDrag.moved) {
      panelDrag.moved = true;
      document.documentElement.classList.add("waw-grabbing");
      if (!store.config.display.panelFloating) {
        // Solta o painel: vira janela flutuante com a altura atual (limitada).
        el.dataset.float = "1";
        document.documentElement.classList.remove("waw-dock");
        el.style.height = `${Math.min(store.config.display.panelHeight, innerHeight - 16)}px`;
        panelDrag.oy = Math.max(8, panelDrag.oy + 40);
      }
    }
    panelDrag.x = Math.min(Math.max(0, panelDrag.ox + dx), innerWidth - 120);
    panelDrag.y = Math.min(Math.max(0, panelDrag.oy + dy), innerHeight - 60);
    el.style.left = `${panelDrag.x}px`;
    el.style.top = `${panelDrag.y}px`;
  }
  function onHeadUp() {
    if (!panelDrag) return;
    const d = panelDrag;
    panelDrag = null;
    document.documentElement.classList.remove("waw-grabbing");
    if (!d.moved) return;
    store.patchConfig((cfg) => {
      cfg.display.panelFloating = true;
      cfg.display.panelX = Math.round(d.x);
      cfg.display.panelY = Math.round(d.y);
    });
  }
  document.addEventListener("pointerdown", onHeadDown, true);
  document.addEventListener("pointermove", onHeadMove, true);
  document.addEventListener("pointerup", onHeadUp, true);

  function bind(el) {
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    // Evita que atalhos do WhatsApp disparem enquanto digitamos no painel.
    ["keydown", "keypress", "keyup", "paste"].forEach((type) =>
      el.addEventListener(type, (e) => {
        if (e.target.matches?.("input, textarea, select")) e.stopPropagation();
      }),
    );
  }

  // Atualiza o cronômetro do painel sem re-render.
  setInterval(() => {
    const v = document.querySelector(`#${PANEL_ID} [data-timer-val]`);
    if (v && crm.timerState()?.running) v.textContent = U.fmtDuration(crm.timerElapsed());
  }, 1000);

  WAW.panel = { render, schedule, open, close, toggle, captureElement, view };
})();
