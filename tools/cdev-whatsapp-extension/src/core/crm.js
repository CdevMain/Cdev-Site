/* CDEV WhatsApp — regras de negócio de contatos (sem DOM).
 * Identidade: "jid:<id@c.us>" quando conhecido; "name:<nome normalizado>" como
 * fallback. Um nome visível nunca é tratado como único: se dois contatos
 * compartilham o mesmo nome, a resolução por nome retorna "ambíguo". */
(() => {
  const { util: U, store } = WAW;
  const S = store.state;

  const HISTORY_CAP = 600;
  const RECENTS_CAP = 40;

  /* ---------------- identidade ---------------- */
  const phoneFromJid = (jid) => (/@c\.us$/.test(jid || "") ? U.digits(jid.split("@")[0]) : "");
  const isGroupJid = (jid) => /@g\.us$/.test(jid || "");

  function contactsByName(name) {
    const n = U.norm(name);
    if (!n) return [];
    return Object.values(S.contacts).filter((c) => U.norm(c.name) === n || c.aliases?.includes(n));
  }

  /** Resolve pelo nome visível. {contact, ambiguous} */
  function resolveByName(name) {
    const found = contactsByName(name);
    if (found.length === 1) return { contact: found[0], ambiguous: false };
    if (found.length > 1) {
      // Se só um deles tem JID e os outros são fallback por nome, ainda é ambíguo.
      return { contact: null, ambiguous: true, candidates: found };
    }
    return { contact: null, ambiguous: false };
  }

  function addAlias(c, name) {
    const n = U.norm(name);
    if (!n) return;
    c.aliases = [n, ...(c.aliases || []).filter((a) => a !== n)].slice(0, 12);
  }

  /** Mescla b em a (a mantém prioridade em campos simples). */
  function mergeInto(a, b) {
    for (const f of ["company", "city", "segment", "email", "statusId", "phone"]) if (!a[f] && b[f]) a[f] = b[f];
    a.tags = [...new Set([...(a.tags || []), ...(b.tags || [])])];
    a.notes = [...(a.notes || []), ...(b.notes || [])];
    a.reminders = [...(a.reminders || []), ...(b.reminders || [])];
    a.tasks = [...(a.tasks || []), ...(b.tasks || [])];
    a.checklist = { ...(b.checklist || {}), ...(a.checklist || {}) };
    a.priority = a.priority || b.priority;
    a.favorite = a.favorite || b.favorite;
    for (const f of ["lastOpenedAt", "lastInboundAt", "lastOutboundAt"]) a[f] = Math.max(a[f] || 0, b[f] || 0);
    a.timeSpentMs = (a.timeSpentMs || 0) + (b.timeSpentMs || 0);
    (b.aliases || []).forEach((al) => addAlias(a, al));
    a.createdAt = Math.min(a.createdAt || Date.now(), b.createdAt || Date.now());
  }

  /**
   * Garante um registro para a conversa aberta.
   * info = { jid, name, phone, isGroup }
   * Retorna { contact, ambiguous }.
   */
  function ensureForChat(info, { create = true } = {}) {
    const name = String(info.name || "").trim();
    const jid = String(info.jid || "").trim();
    if (jid) {
      const key = `jid:${jid}`;
      let c = S.contacts[key];
      if (!c) {
        // Promove um registro criado só pelo nome, se houver exatamente um e sem JID.
        const byName = contactsByName(name).filter((x) => !x.jid);
        const allByName = contactsByName(name);
        c = store.makeContact(key, { jid, phone: phoneFromJid(jid) || U.digits(info.phone), isGroup: isGroupJid(jid) });
        if (byName.length === 1 && allByName.length === 1) {
          mergeInto(c, byName[0]);
          delete S.contacts[byName[0].key];
          log("merge", `Registro de “${name}” vinculado ao identificador ${jid}`, key);
        }
        if (!create && !byName.length) return { contact: null, ambiguous: false };
        S.contacts[key] = c;
      }
      if (name && name !== c.name) {
        if (c.name) addAlias(c, c.name);
        c.name = name;
      }
      addAlias(c, name);
      if (!c.phone) c.phone = phoneFromJid(jid) || U.digits(info.phone);
      store.persist("contacts");
      return { contact: c, ambiguous: false };
    }

    const r = resolveByName(name);
    if (r.contact || r.ambiguous || !create || !name) return r;
    const key = `name:${U.norm(name)}`;
    const c = (S.contacts[key] = store.makeContact(key, { name, phone: U.digits(info.phone), isGroup: Boolean(info.isGroup) }));
    addAlias(c, name);
    store.persist("contacts");
    return { contact: c, ambiguous: false };
  }

  function get(key) {
    return S.contacts[key] || null;
  }

  function touch(c) {
    c.updatedAt = Date.now();
    store.persist("contacts");
    WAW.emit("contact-updated", c);
  }

  function update(key, patch, historyText) {
    const c = get(key);
    if (!c) return null;
    Object.assign(c, patch);
    touch(c);
    if (historyText) log("edit", historyText, key);
    return c;
  }

  function remove(key) {
    delete S.contacts[key];
    store.persist("contacts");
    WAW.emit("contacts", S.contacts);
  }

  /* ---------------- status / tags / flags ---------------- */
  const statusById = (id) => store.config.statuses.find((s) => s.id === id) || null;
  const tagById = (id) => store.config.tags.find((t) => t.id === id) || null;

  function setStatus(key, statusId) {
    const c = get(key);
    if (!c) return;
    c.statusId = statusId || "";
    touch(c);
    const s = statusById(statusId);
    log("status", `${c.name || "Contato"}: status → ${s ? s.label : "sem status"}`, key);
    bump("statusChanges");
    WAW.emit("status-set", { key, statusId: c.statusId });
  }

  function toggleTag(key, tagId) {
    const c = get(key);
    if (!c) return;
    c.tags = c.tags.includes(tagId) ? c.tags.filter((t) => t !== tagId) : [...c.tags, tagId];
    touch(c);
    const t = tagById(tagId);
    log("tag", `${c.name}: tag ${c.tags.includes(tagId) ? "+" : "−"} ${t?.label || tagId}`, key);
  }

  function setFlag(key, flag, value) {
    const c = get(key);
    if (!c) return;
    c[flag] = value;
    touch(c);
    const labels = {
      priority: value ? "marcado como prioridade" : "removido das prioridades",
      favorite: value ? "favoritado" : "removido dos favoritos",
      following: value ? "seguindo" : "deixou de seguir",
    };
    log(flag, `${c.name}: ${labels[flag] || `${flag}=${value}`}`, key);
    if (flag === "priority") WAW.emit("priority-changed", c);
  }

  function setState(key, value) {
    const labels = { active: "Ativo", follow: "Acompanhamento", archived: "Arquivado" };
    const c = get(key);
    if (!c) return;
    c.state = labels[value] ? value : "active";
    touch(c);
    log("state", `${c.name}: ${labels[c.state]}`, key);
  }

  /* ---------------- notas ---------------- */
  function addNote(key, text, pinned = false) {
    const c = get(key);
    const t = String(text || "").trim();
    if (!c || !t) return null;
    const note = { id: U.uid("note"), text: t.slice(0, 4000), pinned: Boolean(pinned), createdAt: Date.now(), updatedAt: Date.now() };
    c.notes.unshift(note);
    touch(c);
    log("note", `${c.name}: nota adicionada`, key);
    bump("notes");
    return note;
  }
  function updateNote(key, id, patch) {
    const c = get(key);
    const n = c?.notes.find((x) => x.id === id);
    if (!n) return;
    Object.assign(n, patch, { updatedAt: Date.now() });
    touch(c);
  }
  function deleteNote(key, id) {
    const c = get(key);
    if (!c) return;
    c.notes = c.notes.filter((x) => x.id !== id);
    touch(c);
  }
  const lastNote = (c) => c?.notes?.[0] || null;
  const pinnedNotes = (c) => (c?.notes || []).filter((n) => n.pinned);

  /* ---------------- lembretes ---------------- */
  function addReminder(key, due, text) {
    const c = get(key);
    if (!c || !Number.isFinite(due)) return null;
    const r = { id: U.uid("rem"), due, text: String(text || "Retornar").trim().slice(0, 300), done: false, createdAt: Date.now() };
    c.reminders.push(r);
    touch(c);
    log("reminder", `${c.name}: lembrete ${U.fmtWhen(due)} — ${r.text}`, key);
    bump("reminders");
    return r;
  }
  function updateReminder(key, id, patch) {
    const c = get(key);
    const r = c?.reminders.find((x) => x.id === id);
    if (!r) return;
    Object.assign(r, patch);
    if (patch.done) {
      r.doneAt = Date.now();
      log("followup", `${c.name}: lembrete concluído — ${r.text}`, key);
      bump("followupsDone");
    }
    if ("due" in patch) r.notified = false;
    touch(c);
  }
  function snoozeReminder(key, id, minutes) {
    const c = get(key);
    const r = c?.reminders.find((x) => x.id === id);
    if (!r) return;
    const base = Math.max(Date.now(), r.due);
    updateReminder(key, id, { due: base + minutes * 60000 });
    log("reminder", `${c.name}: lembrete adiado para ${U.fmtWhen(r.due)}`, key);
  }
  function deleteReminder(key, id) {
    const c = get(key);
    if (!c) return;
    c.reminders = c.reminders.filter((x) => x.id !== id);
    touch(c);
  }
  const pendingReminders = (c) => (c?.reminders || []).filter((r) => !r.done).sort((a, b) => a.due - b.due);

  /* ---------------- tarefas ---------------- */
  const TASK_STATUS = { pending: "Pendente", doing: "Em andamento", done: "Concluída" };
  function addTask(key, text, due = null) {
    const c = get(key);
    const t = String(text || "").trim();
    if (!c || !t) return null;
    const task = { id: U.uid("task"), text: t.slice(0, 300), due: Number.isFinite(due) ? due : null, status: "pending", createdAt: Date.now() };
    c.tasks.push(task);
    touch(c);
    log("task", `${c.name}: tarefa “${task.text}”`, key);
    return task;
  }
  function updateTask(key, id, patch) {
    const c = get(key);
    const t = c?.tasks.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    if (patch.status === "done") log("task", `${c.name}: tarefa concluída “${t.text}”`, key);
    touch(c);
  }
  function deleteTask(key, id) {
    const c = get(key);
    if (!c) return;
    c.tasks = c.tasks.filter((x) => x.id !== id);
    touch(c);
  }
  const openTasks = (c) => (c?.tasks || []).filter((t) => t.status !== "done");

  function toggleChecklist(key, itemId) {
    const c = get(key);
    if (!c) return;
    c.checklist[itemId] = !c.checklist[itemId];
    touch(c);
  }

  /* ---------------- follow-up ---------------- */
  /** Itens com prazo: lembretes pendentes + tarefas abertas com data. */
  function followUpItems() {
    const items = [];
    for (const c of Object.values(S.contacts)) {
      if (c.state === "archived") continue;
      for (const r of c.reminders || []) if (!r.done) items.push({ kind: "reminder", contact: c, id: r.id, due: r.due, text: r.text });
      for (const t of c.tasks || []) if (t.status !== "done" && t.due) items.push({ kind: "task", contact: c, id: t.id, due: t.due, text: t.text });
    }
    items.sort((a, b) => a.due - b.due);
    const today = U.startOfDay();
    const tomorrow = today + 86400000;
    return {
      overdue: items.filter((i) => i.due < today),
      today: items.filter((i) => i.due >= today && i.due < tomorrow),
      upcoming: items.filter((i) => i.due >= tomorrow),
      all: items,
    };
  }

  /* ---------------- tempo / mensagens ---------------- */
  /** Registra timestamps observados nas mensagens visíveis (nunca inventa). */
  function recordMessageTimes(key, { lastIn, lastOut }) {
    const c = get(key);
    if (!c) return;
    let changed = false;
    if (lastIn && lastIn > (c.lastInboundAt || 0)) {
      c.lastInboundAt = lastIn;
      changed = true;
    }
    if (lastOut && lastOut > (c.lastOutboundAt || 0)) {
      c.lastOutboundAt = lastOut;
      changed = true;
    }
    if (changed) touch(c);
  }

  /** Descrição honesta do tempo de contato, com base no que foi registrado. */
  function contactTiming(c) {
    const lastIn = c?.lastInboundAt || 0;
    const lastOut = c?.lastOutboundAt || 0;
    const last = Math.max(lastIn, lastOut);
    if (!last) return { known: false, text: "Sem histórico registrado ainda" };
    if (lastOut > lastIn) {
      return { known: true, waitingReply: true, since: lastOut, text: `Sem resposta ${U.ago(lastOut)}`, last };
    }
    return { known: true, waitingReply: false, since: last, text: `Último contato ${U.ago(last)}`, last };
  }

  /* ---------------- histórico / estatísticas / recentes ---------------- */
  function log(type, text, key = "") {
    S.history.unshift({ ts: Date.now(), type, text: String(text).slice(0, 240), key });
    if (S.history.length > HISTORY_CAP) S.history.length = HISTORY_CAP;
    store.persist("history");
    WAW.emit("history", S.history);
  }

  function todayStats() {
    const k = U.dayKey();
    if (!S.stats[k]) S.stats[k] = { opened: [], inserts: 0, copies: 0, statusChanges: 0, followupsDone: 0, notes: 0, reminders: 0, generated: 0 };
    return S.stats[k];
  }
  function bump(field, n = 1) {
    const st = todayStats();
    st[field] = (st[field] || 0) + n;
    // mantém ~60 dias
    const keys = Object.keys(S.stats).sort();
    while (keys.length > 60) delete S.stats[keys.shift()];
    store.persist("stats");
    WAW.emit("stats", st);
  }

  function markOpened(c) {
    if (!c) return;
    const st = todayStats();
    if (!st.opened.includes(c.key)) {
      st.opened.push(c.key);
      store.persist("stats");
      log("open", `Abriu ${c.name || c.phone || "contato"}`, c.key);
    }
    c.lastOpenedAt = Date.now();
    S.recents = [c.key, ...S.recents.filter((k) => k !== c.key)].slice(0, RECENTS_CAP);
    store.persist("recents");
    store.persist("contacts");
    WAW.emit("recents", S.recents);
  }

  /* ---------------- timer de atendimento ---------------- */
  function timerState() {
    return S.timer || null;
  }
  function timerElapsed(t = S.timer) {
    if (!t) return 0;
    return (t.accumulated || 0) + (t.running ? Date.now() - t.startedAt : 0);
  }
  function timerStart(key) {
    const c = get(key);
    if (S.timer && S.timer.key !== key) timerFinish();
    if (S.timer?.running) return;
    S.timer = S.timer && S.timer.key === key ? { ...S.timer, running: true, startedAt: Date.now() } : { key, name: c?.name || "", running: true, startedAt: Date.now(), accumulated: 0 };
    store.persist("timer", true);
    WAW.emit("timer", S.timer);
  }
  function timerPause() {
    if (!S.timer?.running) return;
    S.timer.accumulated = timerElapsed();
    S.timer.running = false;
    store.persist("timer", true);
    WAW.emit("timer", S.timer);
  }
  function timerFinish() {
    if (!S.timer) return;
    const total = timerElapsed();
    const c = get(S.timer.key);
    if (c) {
      c.timeSpentMs = (c.timeSpentMs || 0) + total;
      touch(c);
    }
    log("timer", `Atendimento ${S.timer.name || ""} finalizado: ${U.fmtDuration(total)}`, S.timer.key);
    S.timer = null;
    store.persist("timer", true);
    WAW.emit("timer", S.timer);
  }

  /* ---------------- busca e filtros ---------------- */
  const FILTERS = {
    all: "Todos",
    today: "Hoje",
    followup: "Follow-up",
    priority: "Prioridade",
    interested: "Interessados",
    proposals: "Propostas",
    clients: "Clientes",
    noreply: "Sem resposta",
    favorites: "Favoritos",
    archived: "Arquivados",
  };

  function matchesFilter(c, f) {
    const today = U.startOfDay();
    const tomorrow = today + 86400000;
    switch (f) {
      case "all":
        return true;
      case "today":
        return (c.lastOpenedAt >= today) || pendingReminders(c).some((r) => r.due < tomorrow) || openTasks(c).some((t) => t.due && t.due < tomorrow);
      case "followup":
        return c.statusId === "follow-up" || c.state === "follow" || pendingReminders(c).length > 0;
      case "priority":
        return Boolean(c.priority);
      case "interested":
        return c.statusId === "interessado";
      case "proposals":
        return c.statusId === "proposta" || c.statusId === "negociacao";
      case "clients":
        return c.statusId === "cliente" || c.statusId === "fechado" || c.tags.includes("cliente");
      case "noreply":
        return c.lastOutboundAt > c.lastInboundAt && Date.now() - c.lastOutboundAt > 3600000;
      case "favorites":
        return Boolean(c.favorite);
      case "archived":
        return c.state === "archived";
      default:
        if (f.startsWith("status:")) return c.statusId === f.slice(7);
        if (f.startsWith("tag:")) return c.tags.includes(f.slice(4));
        return true;
    }
  }

  function haystack(c) {
    const st = statusById(c.statusId);
    return U.norm(
      [
        c.name,
        c.phone,
        U.formatPhone(c.phone),
        c.company,
        c.city,
        c.segment,
        c.email,
        st?.label,
        ...(c.tags || []).map((t) => tagById(t)?.label || t),
        ...(c.notes || []).map((n) => n.text),
        ...(c.aliases || []),
      ].join(" "),
    );
  }

  /** filters: array de chaves (AND). "archived" só aparece quando filtrado. */
  function search(query = "", filters = []) {
    const tokens = U.norm(query).split(" ").filter(Boolean);
    const active = filters.filter((f) => f && f !== "all");
    return Object.values(S.contacts)
      .filter((c) => (active.includes("archived") ? true : c.state !== "archived"))
      .filter((c) => active.every((f) => matchesFilter(c, f)))
      .filter((c) => {
        if (!tokens.length) return true;
        const h = haystack(c);
        return tokens.every((t) => h.includes(t) || (U.digits(t) && U.digits(c.phone).includes(U.digits(t))));
      })
      .sort((a, b) => (b.priority - a.priority) || ((b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt)));
  }

  function statusCounts() {
    const counts = {};
    for (const c of Object.values(S.contacts)) {
      if (c.state === "archived" || !c.statusId) continue;
      counts[c.statusId] = (counts[c.statusId] || 0) + 1;
    }
    return counts;
  }

  WAW.crm = {
    FILTERS,
    TASK_STATUS,
    phoneFromJid,
    isGroupJid,
    resolveByName,
    contactsByName,
    ensureForChat,
    get,
    update,
    remove,
    statusById,
    tagById,
    setStatus,
    toggleTag,
    setFlag,
    setState,
    addNote,
    updateNote,
    deleteNote,
    lastNote,
    pinnedNotes,
    addReminder,
    updateReminder,
    snoozeReminder,
    deleteReminder,
    pendingReminders,
    addTask,
    updateTask,
    deleteTask,
    openTasks,
    toggleChecklist,
    followUpItems,
    recordMessageTimes,
    contactTiming,
    log,
    bump,
    todayStats,
    markOpened,
    timerState,
    timerElapsed,
    timerStart,
    timerPause,
    timerFinish,
    search,
    matchesFilter,
    statusCounts,
  };
})();
