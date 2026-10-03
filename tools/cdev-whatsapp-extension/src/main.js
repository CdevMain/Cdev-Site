/* CDEV WhatsApp — inicialização do content script. */
(() => {
  const { util: U, store, crm, ui } = WAW;
  let observer = null;

  function isTyping(target) {
    return Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable));
  }

  function onKeydown(event) {
    if (event.repeat || !event.key) return;
    if (document.getElementById("waw-modal") || WAW.palette.isOpen()) return;
    const typing = isTyping(event.target);
    const hasMod = event.ctrlKey || event.altKey || event.metaKey;
    if (typing && !hasMod) return;
    const cfg = store.config;
    const sc = cfg.shortcuts;
    const handlers = [
      [sc.palette, () => WAW.palette.open()],
      [sc.panel, () => WAW.panel.toggle()],
      [sc.settings, () => WAW.actions.openSettings()],
      [sc.note, () => WAW.dialogs.addNote(WAW.currentChat.require())],
      [sc.reminder, () => WAW.dialogs.addReminder(WAW.currentChat.require())],
      [sc.messages, () => WAW.panel.open("messages", { sub: "library" })],
      [sc.focus, () => WAW.actions.setMode("focus")],
      [sc.list, () => WAW.listToggle.toggle()],
    ];
    for (const [shortcut, fn] of handlers) {
      if (shortcut && U.eventMatches(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();
        fn();
        return;
      }
    }
    for (const b of WAW.actions.visibleButtons()) {
      if (b.shortcut && U.eventMatches(event, b.shortcut)) {
        event.preventDefault();
        event.stopPropagation();
        WAW.actions.runButton(b);
        return;
      }
    }
  }

  const refreshCurrent = U.throttle(() => {
    WAW.currentChat.refresh();
    WAW.follow.checkCurrent();
    WAW.cdev?.checkCurrent();
  }, 300);
  const ensureRail = U.throttle(() => {
    const host = document.getElementById(WAW.rail.ROOT_ID);
    if (!host || !host.isConnected || !host.dataset.ready) WAW.rail.render();
    else WAW.rail.ensureHost();
  }, 400);

  function onMutations() {
    ensureRail();
    WAW.listToggle.ensure();
    WAW.chatlist.schedule();
    refreshCurrent();
    WAW.conversation.schedule();
  }

  function wireEvents() {
    WAW.on("config", () => {
      WAW.listToggle.apply();
      WAW.rail.render();
      WAW.chatlist.scan();
      WAW.conversation.render();
      WAW.panel.schedule();
    });
    const onData = () => {
      WAW.chatlist.schedule();
      WAW.conversation.schedule();
      WAW.panel.schedule();
    };
    ["contacts", "contact-updated", "timer", "stats", "diag", "quotes"].forEach((e) => WAW.on(e, onData));
    let favSig = "";
    const railIfFavsChanged = () => {
      const sig = Object.values(store.state.contacts).filter((c) => c.favorite).map((c) => `${c.key}:${c.statusId}:${c.name}`).join("|");
      if (sig !== favSig) {
        favSig = sig;
        WAW.rail.render();
      }
    };
    ["contacts", "contact-updated"].forEach((e) => WAW.on(e, railIfFavsChanged));
    WAW.on("history", () => {
      const tab = store.config.panel.tab;
      if (tab === "dashboard" || tab === "tools" || tab === "contact") WAW.panel.schedule();
    });
    WAW.on("priority-changed", async (c) => {
      WAW.chatlist.scan();
      if (!store.config.features.autoPinPriority) return;
      const r = await WAW.chatmenu.setPinned(c, c.priority);
      if (r.ok && !r.already) ui.toast(c.priority ? `★ ${c.name} fixada no topo` : `${c.name} desafixada`);
      else if (!r.ok) {
        const why = { "row-not-found": "conversa não encontrada na lista", "menu-item-not-found": "opção “Fixar” não encontrada (o WhatsApp permite até 3 fixadas)" }[r.reason] || r.reason;
        ui.toast(`Prioridade salva e fixada na barra ★ — não fixei no WhatsApp: ${why}`, { kind: "warn", ms: 4200 });
      }
    });
    WAW.on("current", () => {
      WAW.conversation.render();
      WAW.panel.schedule();
    });
  }

  function listenBackground() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "waw:open-contact") {
        const c = crm.get(msg.key);
        if (c) WAW.actions.openContact(c);
        if (msg.panel) WAW.panel.open("contact");
        sendResponse({ ok: Boolean(c) });
      } else if (msg.type === "waw:reminder-fired") {
        const c = crm.get(msg.key);
        const r = c?.reminders.find((x) => x.id === msg.id);
        if (r) {
          ui.toast(`🔔 ${c.name}: ${r.text}`, { ms: 6000, sound: false });
          WAW.sound.play("reminder");
        }
        WAW.panel.schedule();
        sendResponse({ ok: true });
      } else if (msg.type === "waw:snooze") {
        crm.snoozeReminder(msg.key, msg.id, Number(msg.minutes) || 60);
        ui.toast("Lembrete adiado");
        sendResponse({ ok: true });
      } else if (msg.type === "waw:ping") {
        sendResponse({ ok: true, current: WAW.current.contact?.key || "" });
      } else if (msg.type === "waw:palette") {
        WAW.palette.open();
        sendResponse({ ok: true });
      } else if (msg.type === "waw:panel") {
        WAW.panel.open(msg.tab || "dashboard");
        sendResponse({ ok: true });
      }
    });
  }

  async function boot() {
    if (window.__wawBooted) return;
    window.__wawBooted = true;
    await store.load();
    store.listenExternalChanges();
    wireEvents();
    WAW.rail.render();
    WAW.listToggle.apply();
    setTimeout(() => WAW.listToggle.apply(), 2500); // o WhatsApp termina de montar a tela depois
    WAW.panel.render();
    WAW.currentChat.refresh(true);
    WAW.chatlist.scan();
    WAW.conversation.render();
    WAW.follow.renderAlerts();

    document.addEventListener("keydown", onKeydown, true);
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { childList: true, subtree: true });
    listenBackground();

    // Relógio leve: atualiza "há X min", lembretes que venceram, etc.
    setInterval(() => {
      if (document.hidden) return;
      WAW.conversation.render();
      WAW.chatlist.scan();
      const tab = store.config.panel.tab;
      if (store.config.panel.open && (tab === "dashboard" || tab === "followup")) WAW.panel.schedule();
    }, 60000);

    U.log(`CDEV WhatsApp ${WAW.VERSION} iniciado`);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
