/* CDEV WhatsApp — registro de ações (botões, atalhos, paleta). */
(() => {
  const { util: U, store, crm, ui, wa } = WAW;

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(response || { ok: false });
        });
      } catch (error) {
        resolve({ ok: false, error: String(error) });
      }
    });
  }

  function normalizeUrl(value) {
    const t = String(value || "").trim();
    if (!t) return null;
    try {
      const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  }

  async function openUrl(raw, { reuse = true, newTab = false } = {}) {
    const url = normalizeUrl(raw);
    if (!url) {
      ui.toast("Configure o link deste botão", { kind: "warn" });
      return false;
    }
    const r = await send({ type: "waw:open-url", url, reuseExistingTab: newTab ? false : reuse });
    if (!r.ok) ui.toast("Não foi possível abrir o link", { kind: "warn" });
    else ui.toast(r.reused ? "Aba existente ativada" : "Abrindo link");
    crm.log("link", `Abriu ${new URL(url).hostname}`);
    return r.ok;
  }

  /** Abre a conversa de um contato salvo na extensão. */
  async function openContact(contact) {
    if (!contact) return;
    ui.toast(`Abrindo ${contact.name || U.formatPhone(contact.phone)}…`);
    const res = await wa.openChatByName(contact.name, { phone: contact.phone, jid: contact.jid });
    if (res.ok) return true;
    U.log("[abrir] falhou", res.reason);
    if (contact.phone && !contact.isGroup) {
      if (res.reason === "ambiguous") ui.toast("Nome duplicado na lista — abrindo pelo número", { kind: "warn" });
      openChatByPhone(contact.phone);
      return true;
    }
    ui.toast(res.reason === "ambiguous" ? "Há mais de uma conversa com esse nome — escolha na lista" : "Não encontrei a conversa na lista", { kind: "warn", ms: 3500 });
    return false;
  }

  /** Abre por telefone (recarrega o WhatsApp Web na conversa; não envia nada). */
  function openChatByPhone(phone) {
    const digits = U.digits(phone);
    if (digits.length < 8) return ui.toast("Telefone inválido", { kind: "warn" });
    crm.log("open", `Abriu conversa com ${U.formatPhone(digits)}`);
    location.href = `https://web.whatsapp.com/send?phone=${digits}`;
  }

  async function openByQuery(query, kind) {
    if (!query) return ui.toast("Configure o nome no botão", { kind: "warn" });
    const digits = U.digits(query);
    const res = await wa.openChatByName(query, { phone: digits.length >= 8 ? digits : "" });
    if (!res.ok && kind !== "grupo" && digits.length >= 10) return openChatByPhone(digits);
    if (!res.ok) {
      const msg = { ambiguous: `Mais de um ${kind} com esse nome — escolha na lista`, "no-search": "Campo de busca do WhatsApp não encontrado", "not-found": `${kind === "grupo" ? "Grupo" : "Contato"} não encontrado`, "click-failed": "Achei a conversa mas o WhatsApp não abriu — veja Diagnóstico" }[res.reason];
      ui.toast(msg || "Não consegui abrir", { kind: "warn", ms: 3500 });
    }
  }

  async function openLists(listName) {
    const r = await WAW.lists.openLists(listName);
    if (r.ok) {
      ui.toast(listName ? `Lista aberta: ${listName}` : "Listas abertas");
      crm.log("list", listName ? `Abriu a lista ${listName}` : "Abriu o menu de listas");
      return;
    }
    const why = { menu: "Não encontrei o botão “Mais listas” com segurança", "menu-not-detected": "Cliquei em “Mais listas”, mas o menu não apareceu" }[r.reason] || `Lista não encontrada: ${listName}`;
    ui.toast(store.config.features.diagnostic ? `${why} — veja Ferramentas › Diagnóstico` : why, { kind: "warn", ms: 3600 });
  }

  async function insertTemplate(text) {
    const c = WAW.current.contact;
    const filled = WAW.writer.fillVariables(text, c);
    return ui.review(filled.text, { contact: c, missing: filled.missing });
  }

  async function runAction(action, params = {}, button = null) {
    const c = WAW.current.contact;
    switch (action) {
      case "lists":
        return openLists("");
      case "list":
        if (!params.listName) return ui.toast("Informe o nome exato da lista no botão", { kind: "warn" });
        return openLists(params.listName);
      case "chat":
        return openChatByPhone(params.phone);
      case "contact":
        return openByQuery(params.query, "contato");
      case "group":
        return openByQuery(params.query, "grupo");
      case "url":
      case "crm":
        return openUrl(params.url, { reuse: button ? button.reuseExistingTab : true });
      case "page":
        return openUrl(params.url, { newTab: true });
      case "copy": {
        const t = WAW.writer.fillVariables(params.text || "", c).text;
        await ui.copy(t);
        crm.bump("copies");
        return ui.toast("Copiado");
      }
      case "insert":
        if (!params.text) return ui.toast("Configure o texto do botão", { kind: "warn" });
        return insertTemplate(params.text);
      case "generate":
        return WAW.panel.open("messages", { sub: "generate" });
      case "panel":
        return WAW.panel.toggle(params.panelTab || "dashboard");
      case "status": {
        const contact = WAW.currentChat.require();
        if (!contact) return;
        crm.setStatus(contact.key, params.statusId);
        return ui.toast(`Status: ${crm.statusById(params.statusId)?.label || "sem status"}`);
      }
      case "note":
        return WAW.dialogs.addNote(WAW.currentChat.require());
      case "reminder":
        return WAW.dialogs.addReminder(WAW.currentChat.require());
      case "palette":
        return WAW.palette.open();
      case "mode":
        return setMode(params.mode || "admin");
      case "togglelist":
        return WAW.listToggle.toggle();
      case "follow":
        return WAW.follow.toggle(WAW.currentChat.require());
      case "priority": {
        const contact = WAW.currentChat.require();
        return contact && crm.setFlag(contact.key, "priority", !contact.priority);
      }
      default:
        return ui.toast(`Ação desconhecida: ${action}`, { kind: "warn" });
    }
  }

  function runButton(button) {
    if (!button || button.active === false) return;
    U.log("botão", button.label, button.action);
    return runAction(button.action, button.params || {}, button);
  }

  function setMode(mode) {
    if (!store.MODES[mode]) return;
    store.patchConfig((cfg) => {
      cfg.mode = cfg.mode === mode && mode !== "admin" ? "admin" : mode;
      if (!["normal", "admin"].includes(cfg.mode)) {
        cfg.panel.open = true;
        cfg.panel.minimized = false;
        cfg.panel.tab = "contact";
      }
    });
    ui.toast(`Modo: ${store.MODES[store.config.mode]}`);
    crm.log("mode", `Modo ${store.MODES[store.config.mode]}`);
  }

  function setProfile(profileId) {
    store.patchConfig((cfg) => {
      cfg.activeProfileId = profileId;
      const p = cfg.profiles.find((x) => x.id === profileId);
      if (p && p.mode) cfg.mode = p.mode;
    });
    const p = store.config.profiles.find((x) => x.id === profileId);
    ui.toast(`Workspace: ${p ? p.label : "Admin"}`);
  }

  /** Botões visíveis considerando perfil ativo. */
  function visibleButtons() {
    const cfg = store.config;
    const profile = cfg.profiles.find((p) => p.id === cfg.activeProfileId);
    const allowed = profile && profile.id !== "admin" && profile.buttonIds.length ? new Set(profile.buttonIds) : null;
    return cfg.buttons.filter((b) => b.active !== false && (!allowed || allowed.has(b.id)));
  }

  /** Comandos da paleta (gerados sob demanda). */
  function commands() {
    const cfg = store.config;
    const cmds = [];
    const add = (group, label, icon, run, hint = "", keywords = "") => cmds.push({ group, label, icon, run, hint, keywords });

    add("Painel", "Abrir painel", "panel", () => WAW.panel.open("dashboard"), cfg.shortcuts.panel);
    Object.entries(store.PANEL_TABS).forEach(([id, label]) => add("Painel", `Ir para ${label}`, "chevronRight", () => WAW.panel.open(id)));
    add("Contato", "Adicionar nota", "note", () => runAction("note"), cfg.shortcuts.note, "anotar");
    add("Contato", "Criar lembrete", "bell", () => runAction("reminder"), cfg.shortcuts.reminder, "follow-up retorno");
    add("CRM CDEV", "Agendar mensagem (conversa atual)", "clock", () => WAW.cdev.scheduleDialog(WAW.currentChat.require()), "", "agendar programar envio depois horario");
    add("CRM CDEV", "Mensagens agendadas", "clock", () => WAW.cdev.listDialog(), "", "agendadas fila programadas");
    add("CRM CDEV", "Abrir CRM CDEV", "briefcase", () => send({ type: "cdev:open-crm" }), "", "crm leads control");
    add("Contato", "Nova tarefa", "checklist", () => WAW.dialogs.addTask(WAW.currentChat.require()));
    add("Contato", "Editar perfil do contato", "user", () => WAW.dialogs.editProfile(WAW.currentChat.require()), "", "empresa cidade segmento");
    add("Contato", "Alternar prioridade (fixar conversa)", "star", () => runAction("priority"), "", "fixar pin");
    add("Contato", "Seguir / deixar de seguir contato", "eye", () => runAction("follow"), "", "online notificar avisar mensagem");
    add("Contato", "Confirmar todos os avisos fixos", "check", () => [...store.state.alerts].forEach((a) => WAW.follow.confirm(a.id)));
    add("Contato", "Arquivar internamente", "archive", () => {
      const c = WAW.currentChat.require();
      if (c) crm.setState(c.key, c.state === "archived" ? "active" : "archived");
    });
    cfg.statuses.forEach((s) => add("Status", `Status → ${s.label}`, s.icon || "flag", () => runAction("status", { statusId: s.id })));
    cfg.tags.forEach((t) =>
      add("Tags", `Tag ${t.label}`, "tag", () => {
        const c = WAW.currentChat.require();
        if (c) crm.toggleTag(c.key, t.id);
      }),
    );
    add("Painel", store.config.display.listHidden ? "Mostrar lista de conversas" : "Esconder lista de conversas (ampliar o chat)", "sidebar", () => WAW.listToggle.toggle(), cfg.shortcuts.list, "lista conversas coluna esconder ocultar ampliar");
    add("Mensagens", "Gerar mensagem", "sparkles", () => WAW.panel.open("messages", { sub: "generate" }));
    add("Mensagens", "Sugerir resposta", "sparkles", () => WAW.panel.open("messages", { sub: "suggest" }));
    add("Mensagens", "Reescrever texto", "edit", () => WAW.panel.open("messages", { sub: "rewrite" }));
    add("Mensagens", "Mensagens rápidas", "message", () => WAW.panel.open("messages", { sub: "library" }), cfg.shortcuts.messages);
    cfg.quickMessages.forEach((m) => add("Mensagens", `Inserir: ${m.title}`, "insert", () => insertTemplate(m.text), m.category, m.text.slice(0, 80)));
    add("Ferramentas", "Orçamento rápido", "calc", () => WAW.panel.open("tools", { sub: "quote" }), "", "calculadora catalogo preço");
    add("Ferramentas", "Abas do WhatsApp", "tabs", () => WAW.panel.open("tools", { sub: "tabs" }));
    add("Ferramentas", "Histórico de ações", "history", () => WAW.panel.open("tools", { sub: "history" }));
    add("Ferramentas", "Timer de atendimento", "clock", () => WAW.panel.open("contact"));
    add("Ferramentas", "Configurações", "gear", openSettings, cfg.shortcuts.settings);
    if (cfg.features.diagnostic) add("Ferramentas", "Capturar elemento (diagnóstico)", "crosshair", () => WAW.panel.captureElement());
    Object.entries(store.MODES).forEach(([id, label]) => add("Modo", `Modo ${label}`, id === "focus" ? "focus" : id === "prospect" ? "target" : id === "support" ? "headset" : id === "billing" ? "dollar" : id === "admin" ? "shield" : "home", () => setMode(id)));
    cfg.profiles.forEach((p) => add("Workspace", `Workspace ${p.label}`, p.id === "admin" ? "shield" : "user", () => setProfile(p.id), "", "perfil"));
    cfg.buttons.filter((b) => b.active !== false).forEach((b) => add("Botões", b.label, b.icon, () => runButton(b), b.shortcut, store.ACTIONS[b.action]?.label || ""));
    cfg.links.forEach((l) => add("Links", l.label, "link", () => openUrl(l.url), "", l.url));
    return cmds;
  }

  function openSettings() {
    send({ type: "waw:open-options" });
  }

  WAW.actions = { send, runAction, runButton, openUrl, openContact, openChatByPhone, openLists, insertTemplate, setMode, setProfile, visibleButtons, commands, openSettings, normalizeUrl };
})();
