/* CDEV WhatsApp — barra de contexto dentro da conversa aberta:
 * status, tags, tempo, nota fixada e lembretes do contato. */
(() => {
  const { util: U, store, crm, ui } = WAW;
  const BAR_ID = "waw-convbar";
  let lastHtml = "";

  function mount() {
    const main = WAW.wa.mainPane();
    const header = main?.querySelector("header");
    let bar = document.getElementById(BAR_ID);
    if (!header) {
      bar?.remove();
      return null;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = BAR_ID;
      lastHtml = "";
    }
    if (bar.previousElementSibling !== header) header.insertAdjacentElement("afterend", bar);
    return bar;
  }

  function html() {
    const cur = WAW.current;
    if (cur.ambiguous) {
      return `<div class="waw-cb-row"><span class="waw-cb-warn">${WAW.icon("alert")} Há mais de um contato chamado “${U.esc(cur.info?.name || "")}”. Role até uma mensagem para a extensão identificar o contato certo.</span></div>`;
    }
    const c = cur.contact;
    if (!c) return "";
    const st = crm.statusById(c.statusId);
    const timing = crm.contactTiming(c);
    const tags = c.tags.map((id) => crm.tagById(id)).filter(Boolean);
    const rems = crm.pendingReminders(c);
    const tomorrow = U.startOfDay() + 86400000;
    const dueRems = rems.filter((r) => r.due < tomorrow);
    const pinned = store.config.features.pinnedBanner ? crm.pinnedNotes(c) : [];
    const timer = crm.timerState();
    const timerOn = timer && timer.key === c.key;

    return `
      <div class="waw-cb-row">
        <button type="button" class="waw-pill" data-cb="status" style="--c:${st ? st.color : "#8696a0"}"><span class="waw-dot" style="background:${st ? st.color : "#8696a0"}"></span>${U.esc(st ? st.label : "Sem status")}${WAW.icon("chevronDown")}</button>
        ${tags.map((t) => ui.chip(t.label, t.color)).join("")}
        <button type="button" class="waw-cb-ghost" data-cb="tags" title="Tags">${WAW.icon("tag")}</button>
        <span class="waw-cb-meta ${timing.waitingReply ? "is-wait" : ""}" title="Baseado nas mensagens que a extensão conseguiu ver nesta conversa">${WAW.icon("clock")} ${U.esc(timing.text)}</span>
        ${cur.weak ? `<span class="waw-cb-meta" title="Sem identificador estável ainda — identificado pelo nome">~ pelo nome</span>` : ""}
        <span class="waw-cb-spacer"></span>
        ${WAW.cdev ? WAW.cdev.barHtml(c) : ""}
        ${timerOn ? `<span class="waw-cb-timer" data-timer>${WAW.icon("clock")} ${U.fmtDuration(crm.timerElapsed())}</span>` : ""}
        <button type="button" class="waw-cb-follow ${c.following ? "is-on" : ""}" data-cb="follow" title="${c.following ? "Seguindo: avisa quando ficar online e fixa aviso de mensagem nova — clique para parar" : "Seguir: avisar quando ficar online e fixar aviso de mensagem nova"}">${WAW.icon(c.following ? "eye" : "eye")}<span>${c.following ? "Seguindo" : "Seguir"}</span></button>
        <button type="button" class="waw-cb-ghost ${c.priority ? "is-on" : ""}" data-cb="priority" title="${c.priority ? "Prioridade (fixada) — clique para remover" : "Marcar prioridade e fixar a conversa"}">${WAW.icon("star")}</button>
        <button type="button" class="waw-cb-ghost" data-cb="note" title="Nota">${WAW.icon("note")}${c.notes.length ? `<small>${c.notes.length}</small>` : ""}</button>
        <button type="button" class="waw-cb-ghost" data-cb="reminder" title="Lembrete">${WAW.icon("bell")}${rems.length ? `<small>${rems.length}</small>` : ""}</button>
        <button type="button" class="waw-cb-ghost" data-cb="panel" title="Abrir ficha no painel">${WAW.icon("panel")}</button>
      </div>
      ${dueRems
        .map(
          (r) => `
        <div class="waw-cb-row waw-cb-rem ${r.due < Date.now() ? "is-late" : ""}" data-rem="${r.id}">
          <span>🔔 ${U.esc(r.text)} — <b>${U.fmtWhen(r.due)}</b></span>
          <span class="waw-cb-spacer"></span>
          <button type="button" data-rem-act="done">Concluir</button>
          <button type="button" data-rem-act="snooze">Adiar</button>
          <button type="button" data-rem-act="edit">Editar</button>
          <button type="button" data-rem-act="delete">Excluir</button>
        </div>`,
        )
        .join("")}
      ${pinned
        .map(
          (n) => `<div class="waw-cb-row waw-cb-pin" data-note="${n.id}"><span>📌 ${U.esc(n.text)}</span><span class="waw-cb-spacer"></span><button type="button" data-note-act="unpin" title="Desafixar">${WAW.icon("x")}</button></div>`,
        )
        .join("")}`;
  }

  function render() {
    const bar = mount();
    if (!bar) return;
    const content = html();
    if (content === lastHtml) return;
    lastHtml = content;
    bar.innerHTML = content;
    bar.hidden = !content;
  }

  function onClick(e) {
    const bar = document.getElementById(BAR_ID);
    if (!bar || !bar.contains(e.target)) return;
    const c = WAW.current.contact;
    if (!c) return;
    const btn = e.target.closest("[data-cb], [data-rem-act], [data-note-act]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const cb = btn.dataset.cb;
    if (cb === "status") return WAW.dialogs.statusMenu(btn, c);
    if (cb === "tags") return WAW.dialogs.tagMenu(btn, c);
    if (cb === "priority") return crm.setFlag(c.key, "priority", !c.priority);
    if (cb === "follow") return WAW.follow.toggle(c);
    if (cb === "note") return WAW.dialogs.addNote(c);
    if (cb === "reminder") return WAW.dialogs.addReminder(c);
    if (cb === "panel") return WAW.panel.open("contact");
    const remId = btn.closest("[data-rem]")?.dataset.rem;
    const rem = c.reminders.find((r) => r.id === remId);
    if (rem) {
      const act = btn.dataset.remAct;
      if (act === "done") crm.updateReminder(c.key, rem.id, { done: true });
      if (act === "snooze") WAW.dialogs.snoozeMenu(btn, c, rem);
      if (act === "edit") WAW.dialogs.editReminder(c, rem);
      if (act === "delete") crm.deleteReminder(c.key, rem.id);
      return;
    }
    const noteId = btn.closest("[data-note]")?.dataset.note;
    if (noteId && btn.dataset.noteAct === "unpin") crm.updateNote(c.key, noteId, { pinned: false });
  }
  document.addEventListener("click", onClick, true);

  // Atualiza o cronômetro visível sem re-renderizar tudo.
  setInterval(() => {
    const el = document.querySelector(`#${BAR_ID} [data-timer]`);
    if (el && crm.timerState()?.running) el.lastChild.textContent = ` ${U.fmtDuration(crm.timerElapsed())}`;
  }, 1000);

  WAW.conversation = { render, schedule: U.debounce(render, 80) };
})();
