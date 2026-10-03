/* CDEV WhatsApp — decoração discreta dos cards da lista de conversas. */
(() => {
  const { util: U, store, crm, wa } = WAW;

  function resolveRow(row) {
    const info = wa.rowInfo(row);
    if (!info.name) return { info, contact: null, ambiguous: false };
    if (info.jid) {
      const c = crm.get(`jid:${info.jid}`);
      if (c) return { info, contact: c, ambiguous: false };
    }
    const r = crm.resolveByName(info.name);
    return { info, contact: r.contact, ambiguous: r.ambiguous };
  }

  function badgesFor(c) {
    const cfg = store.config;
    const out = [];
    if (!c) return out;
    const cdevBadge = WAW.cdev?.badge(c);
    if (cdevBadge) out.push(cdevBadge);
    if (c.priority) out.push('<span class="waw-mini waw-mini-prio" title="Prioridade (fixada)">★</span>');
    if (c.following) out.push('<span class="waw-mini waw-mini-follow" title="Seguindo: avisa online e mensagens">👁</span>');
    if (cfg.display.showTags) {
      c.tags.slice(0, 3).forEach((id) => {
        const t = crm.tagById(id);
        if (t) out.push(`<span class="waw-mini waw-mini-tag" style="--c:${t.color}" title="Tag: ${U.esc(t.label)}">${U.esc(t.label)}</span>`);
      });
      if (c.tags.length > 3) out.push(`<span class="waw-mini">+${c.tags.length - 3}</span>`);
    }
    if (cfg.display.showBadges) {
      if (c.notes.length) out.push(`<span class="waw-mini" title="${c.notes.length} nota(s)">📌${c.notes.length}</span>`);
      const rem = crm.pendingReminders(c)[0];
      if (rem) {
        const today = U.startOfDay();
        const late = rem.due < Date.now();
        const isToday = rem.due >= today && rem.due < today + 86400000;
        if (late || isToday) out.push(`<span class="waw-mini ${late ? "waw-mini-late" : ""}" title="Lembrete: ${U.esc(rem.text)} — ${U.fmtWhen(rem.due)}">🔔${late ? "!" : ` ${U.fmtTime(rem.due)}`}</span>`);
      }
      if (c.state === "archived") out.push('<span class="waw-mini" title="Arquivado internamente">🗄</span>');
    }
    return out;
  }

  function decorate(row) {
    const { info, contact, ambiguous } = resolveRow(row);
    if (contact?.following) WAW.follow.checkRow(row, info, contact);
    if (contact) WAW.cdev?.checkRow(row, info, contact);
    const status = contact ? crm.statusById(contact.statusId) : null;
    const style = store.config.display.statusStyle;
    const badges = badgesFor(contact);
    const sig = [info.name, contact?.key, contact?.updatedAt, status?.id, status?.color, style, ambiguous, badges.join("")].join("|");
    if (row.dataset.wawSig === sig && row.querySelector(":scope > .waw-sdot")) return;
    row.dataset.wawSig = sig;

    if (getComputedStyle(row).position === "static") row.classList.add("waw-rel");
    row.classList.add("waw-row");
    row.dataset.wawStyle = status ? style : "";
    if (status) {
      row.style.setProperty("--waw-sc", status.color);
      row.style.setProperty("--waw-sbg", U.hexToRgba(status.color, 0.1));
    } else {
      row.style.removeProperty("--waw-sc");
      row.style.removeProperty("--waw-sbg");
    }

    let dot = row.querySelector(":scope > .waw-sdot");
    if (!dot) {
      dot = document.createElement("button");
      dot.type = "button";
      dot.className = "waw-sdot";
      row.appendChild(dot);
    }
    dot.dataset.has = status ? "1" : ambiguous ? "?" : "0";
    dot.style.background = status ? status.color : "";
    dot.textContent = ambiguous && !status ? "?" : "";
    dot.title = ambiguous
      ? `Há mais de um contato chamado “${info.name}”. Abra a conversa para identificar.`
      : status
        ? `Status: ${status.label} — clique para alterar`
        : `Definir status: ${info.name}`;

    let strip = row.querySelector(":scope > .waw-strip");
    if (badges.length) {
      if (!strip) {
        strip = document.createElement("div");
        strip.className = "waw-strip";
        row.appendChild(strip);
      }
      strip.innerHTML = badges.join("");
    } else strip?.remove();
  }

  /* Barra "Prioridades" fixa no topo da lista (vale mesmo além do limite de 3 fixadas do WhatsApp). */
  function renderPriorityBar() {
    const pane = wa.sidePane();
    let bar = document.getElementById("waw-prio-bar");
    const list = store.config.features.priorityBar
      ? Object.values(store.state.contacts).filter((c) => c.priority && c.state !== "archived").sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
      : [];
    const listHidden = document.documentElement.classList.contains("waw-list-hidden");
    const main = wa.mainPane();
    if (!pane || !list.length || (listHidden && !main)) {
      bar?.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "waw-prio-bar";
      bar.addEventListener("click", (e) => {
        const b = e.target.closest("[data-key]");
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        WAW.actions.openContact(crm.get(b.dataset.key));
      });
    }
    // Com a lista escondida, a barra vai para o topo da conversa.
    if (listHidden) {
      if (bar.parentElement !== main || main.firstElementChild !== bar) main.insertBefore(bar, main.firstElementChild);
    } else if (bar.nextElementSibling !== pane) pane.parentElement.insertBefore(bar, pane);
    const html = `<span class="waw-prio-title" title="Contatos prioritários">★</span>${list
      .map((c) => {
        const s = crm.statusById(c.statusId);
        return `<button type="button" data-key="${U.esc(c.key)}" title="${U.esc(c.name)}${s ? ` · ${U.esc(s.label)}` : ""}"><span class="waw-dot" style="background:${s ? s.color : "#8696a0"}"></span>${U.esc(c.name || U.formatPhone(c.phone))}</button>`;
      })
      .join("")}`;
    if (bar.dataset.html !== html) {
      bar.innerHTML = html;
      bar.dataset.html = html;
    }
  }

  function scan() {
    renderPriorityBar();
    for (const row of wa.getChatRows()) {
      try {
        decorate(row);
      } catch (error) {
        U.log("decorate erro", String(error));
      }
    }
  }

  const schedule = U.debounce(scan, 140);

  // Clique no ponto de status (delegação: um único listener).
  function onPointer(event) {
    const dot = event.target.closest?.(".waw-sdot");
    if (!dot) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== "click") return;
    const row = dot.parentElement;
    let { info, contact, ambiguous } = resolveRow(row);
    if (ambiguous) return WAW.ui.toast("Nome duplicado — abra a conversa para definir o status do contato certo.", { kind: "warn", ms: 3600 });
    if (!contact) contact = crm.ensureForChat({ name: info.name, jid: info.jid, phone: info.phone, isGroup: info.isGroup }).contact;
    if (!contact) return;
    WAW.dialogs.statusMenu(dot, contact);
  }
  ["pointerdown", "mousedown", "click"].forEach((t) => document.addEventListener(t, onPointer, true));

  WAW.chatlist = { scan, schedule, resolveRow };
})();
