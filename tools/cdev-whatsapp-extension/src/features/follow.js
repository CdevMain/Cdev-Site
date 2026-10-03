/* CDEV WhatsApp — "Seguir" contato.
 * - Online: avisa quando o contato seguido aparece "online" (o WhatsApp só mostra
 *   presença da conversa ABERTA, então só funciona com ela aberta).
 * - Mensagem nova: detecta pelo card da lista (não lidas / prévia mudou) ou por
 *   mensagem recebida na conversa aberta, e FIXA um aviso na tela até você
 *   confirmar que viu (com som repetido). */
(() => {
  const { util: U, store, crm, wa, ui } = WAW;
  const S = store.state;
  const ALERTS_ID = "waw-alerts";
  const REPEAT_MS = 20000;
  const MAX_REPEATS = 15;

  const rowBaseline = new Map(); // key -> assinatura do card
  const presence = new Map(); // key -> "online" | "typing" | ""
  let mainBaseline = { key: "", ids: new Set() };

  /* ---------------- ações ---------------- */
  function toggle(contact) {
    if (!contact) return;
    const next = !contact.following;
    crm.setFlag(contact.key, "following", next);
    rowBaseline.delete(contact.key);
    ui.toast(next ? `Seguindo ${contact.name}: aviso quando ficar online ou mandar mensagem` : `Deixou de seguir ${contact.name}`, { ms: 3400 });
  }

  function notifyBackground(payload) {
    WAW.actions?.send({ type: "waw:notify", ...payload });
  }

  /* ---------------- avisos fixos ---------------- */
  function addAlert(contact, text, source) {
    // Um aviso por contato: atualiza o existente em vez de empilhar.
    const existing = S.alerts.find((a) => a.key === contact.key && !a.seen);
    if (existing) {
      existing.text = text || existing.text;
      existing.at = Date.now();
      existing.count = (existing.count || 1) + 1;
    } else {
      S.alerts.unshift({ id: U.uid("alert"), key: contact.key, name: contact.name, text, source, at: Date.now(), count: 1, repeats: 0 });
    }
    S.alerts = S.alerts.slice(0, 20);
    store.persist("alerts", true);
    crm.log("follow", `${contact.name}: nova mensagem (seguindo)`, contact.key);
    WAW.sound.play("alert");
    if (document.hidden) notifyBackground({ id: `follow|${contact.key}`, title: `💬 ${contact.name}`, message: text || "Nova mensagem", key: contact.key, sticky: true });
    renderAlerts();
  }

  function confirm(id) {
    S.alerts = S.alerts.filter((a) => a.id !== id);
    store.persist("alerts", true);
    renderAlerts();
  }

  function renderAlerts() {
    let box = document.getElementById(ALERTS_ID);
    const list = S.alerts.filter((a) => !a.seen);
    if (!list.length) {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.id = ALERTS_ID;
      box.setAttribute("role", "alert");
      document.documentElement.appendChild(box);
      box.addEventListener("click", onAlertClick);
    }
    box.innerHTML = list
      .map(
        (a) => `<div class="waw-alert" data-alert="${U.esc(a.id)}">
        <div class="waw-alert-ic">${WAW.icon("message")}</div>
        <div class="waw-alert-body">
          <strong>${U.esc(a.name)}${a.count > 1 ? ` <small>(${a.count})</small>` : ""}</strong>
          <p>${U.esc(a.text || "Nova mensagem")}</p>
          <time>${U.fmtWhen(a.at)}</time>
        </div>
        <div class="waw-alert-acts">
          <button type="button" class="waw-btn waw-btn-sm" data-alert-act="open">Abrir conversa</button>
          <button type="button" class="waw-btn waw-btn-sm waw-btn-primary" data-alert-act="seen">${WAW.icon("check")}Vi</button>
        </div></div>`,
      )
      .join("");
  }

  function onAlertClick(e) {
    const btn = e.target.closest("[data-alert-act]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.closest("[data-alert]").dataset.alert;
    const alert = S.alerts.find((a) => a.id === id);
    if (btn.dataset.alertAct === "open" && alert) WAW.actions.openContact(crm.get(alert.key));
    confirm(id);
  }

  // Repete o som enquanto houver aviso não confirmado.
  setInterval(() => {
    const pending = S.alerts.filter((a) => !a.seen && (a.repeats || 0) < MAX_REPEATS);
    if (!pending.length) return;
    pending.forEach((a) => (a.repeats = (a.repeats || 0) + 1));
    WAW.sound.play("alert");
  }, REPEAT_MS);

  /* ---------------- detecção ---------------- */
  /** Chamado pela varredura da lista com cada card resolvido. */
  function checkRow(row, info, contact) {
    if (!contact?.following) return;
    const meta = wa.rowMeta(row, info.name);
    const sig = `${meta.preview}|${meta.time}|${meta.unread}`;
    const prev = rowBaseline.get(contact.key);
    rowBaseline.set(contact.key, sig);
    if (prev === undefined || prev === sig) return;
    const isOpenNow = WAW.current.contact?.key === contact.key && !document.hidden;
    // Só alerta se houver indicação de mensagem recebida (não lidas).
    if (meta.unread > 0 && !isOpenNow) addAlert(contact, meta.preview, "list");
  }

  /** Chamado a cada atualização da conversa aberta. */
  function checkCurrent() {
    const c = WAW.current.contact;
    if (!c) {
      mainBaseline = { key: "", ids: new Set() };
      return;
    }
    // Mensagens recebidas na conversa aberta.
    const ids = wa.incomingIds();
    if (mainBaseline.key !== c.key) {
      mainBaseline = { key: c.key, ids: new Set(ids) };
    } else if (c.following) {
      const fresh = ids.filter((id) => !mainBaseline.ids.has(id));
      if (fresh.length) {
        const text = wa.lastIncomingText();
        if (document.hidden || !document.hasFocus()) addAlert(c, text, "chat");
        else {
          ui.toast(`💬 ${c.name}: ${text.slice(0, 80)}`, { ms: 4000, sound: false });
          WAW.sound.play("alert");
        }
      }
      fresh.forEach((id) => mainBaseline.ids.add(id));
    } else ids.forEach((id) => mainBaseline.ids.add(id));

    // Presença (online / digitando).
    const now = wa.currentPresence();
    const before = presence.get(c.key) || "";
    presence.set(c.key, now);
    if (c.following && now && !before) {
      const label = now === "online" ? "está online" : "está digitando…";
      ui.toast(`🟢 ${c.name} ${label}`, { ms: 4000, sound: false });
      WAW.sound.play("online");
      crm.log("follow", `${c.name} ${label}`, c.key);
      if (document.hidden) notifyBackground({ id: `online|${c.key}`, title: `🟢 ${c.name}`, message: `${c.name} ${label}`, key: c.key, sticky: false });
    }
  }

  WAW.on("alerts", renderAlerts);

  WAW.follow = { toggle, checkRow, checkCurrent, renderAlerts, confirm, alert: addAlert };
})();
