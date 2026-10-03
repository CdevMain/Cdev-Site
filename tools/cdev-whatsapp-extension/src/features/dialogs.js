/* CDEV WhatsApp — diálogos de contato (nota, lembrete, tarefa, perfil). */
(() => {
  const { util: U, crm, store, ui } = WAW;

  const REMINDER_QUICK = [
    { label: "+30 min", minutes: 30 },
    { label: "+1 h", minutes: 60 },
    { label: "+3 h", minutes: 180 },
    { label: "Amanhã 9h", minutes: "t9" },
    { label: "Amanhã 14h", minutes: "t14" },
    { label: "+3 dias", minutes: 4320 },
    { label: "+7 dias", minutes: 10080 },
  ];

  async function addNote(contact, { pinned = false } = {}) {
    if (!contact) return;
    const r = await ui.form({
      title: "Nova nota",
      subtitle: contact.name,
      fields: [
        { name: "text", label: "Nota", type: "textarea", rows: 5, autofocus: true, required: true, placeholder: "Ex.: Cliente pediu orçamento para 10/10." },
        { name: "pinned", label: "📌 Fixar (aparece ao abrir a conversa)", type: "checkbox", value: pinned },
      ],
    });
    if (!r) return;
    crm.addNote(contact.key, r.text, r.pinned);
    ui.toast("Nota salva");
  }

  async function editNote(contact, note) {
    const r = await ui.form({
      title: "Editar nota",
      subtitle: contact.name,
      fields: [
        { name: "text", label: "Nota", type: "textarea", rows: 5, value: note.text, autofocus: true, required: true },
        { name: "pinned", label: "📌 Fixada", type: "checkbox", value: note.pinned },
      ],
    });
    if (!r) return;
    crm.updateNote(contact.key, note.id, { text: r.text.trim(), pinned: r.pinned });
  }

  async function addReminder(contact, { text = "", due = null } = {}) {
    if (!contact) return;
    const r = await ui.form({
      title: "Criar lembrete",
      subtitle: contact.name,
      fields: [
        { name: "text", label: "Descrição", value: text || "Retornar", autofocus: true, required: true },
        { name: "due", label: "Data e hora", type: "datetime", value: due || ui.quickTime(60), quick: REMINDER_QUICK, required: true },
      ],
    });
    if (!r) return;
    if (!r.due) return ui.toast("Data inválida", { kind: "warn" });
    crm.addReminder(contact.key, r.due, r.text);
    ui.toast(`Lembrete: ${U.fmtWhen(r.due)}`);
  }

  async function editReminder(contact, rem) {
    const r = await ui.form({
      title: "Editar lembrete",
      subtitle: contact.name,
      fields: [
        { name: "text", label: "Descrição", value: rem.text, required: true },
        { name: "due", label: "Data e hora", type: "datetime", value: rem.due, quick: REMINDER_QUICK, required: true },
      ],
    });
    if (!r || !r.due) return;
    crm.updateReminder(contact.key, rem.id, { text: r.text.trim(), due: r.due });
  }

  async function snoozeMenu(anchor, contact, rem) {
    ui.popover(anchor, [
      { heading: "Adiar" },
      ...[
        ["15 minutos", 15],
        ["1 hora", 60],
        ["3 horas", 180],
        ["Amanhã", 1440],
        ["3 dias", 4320],
        ["1 semana", 10080],
      ].map(([label, m]) => ({ label, icon: "clock", onClick: () => crm.snoozeReminder(contact.key, rem.id, m) })),
    ]);
  }

  async function addTask(contact) {
    if (!contact) return;
    const r = await ui.form({
      title: "Nova tarefa",
      subtitle: contact.name,
      fields: [
        { name: "text", label: "Tarefa", autofocus: true, required: true, placeholder: "Ex.: Enviar orçamento" },
        { name: "due", label: "Prazo (opcional)", type: "datetime", value: null, quick: REMINDER_QUICK },
      ],
    });
    if (!r) return;
    crm.addTask(contact.key, r.text, r.due);
    ui.toast("Tarefa criada");
  }

  async function editProfile(contact) {
    if (!contact) return;
    const r = await ui.form({
      title: "Perfil do contato",
      subtitle: contact.jid ? `ID: ${contact.jid}` : "Identificado pelo nome (sem ID estável ainda)",
      fields: [
        { name: "name", label: "Nome", value: contact.name, required: true },
        { name: "phone", label: "Telefone", value: contact.phone ? U.formatPhone(contact.phone) : "" },
        { name: "company", label: "Empresa", value: contact.company },
        { name: "segment", label: "Segmento", value: contact.segment },
        { name: "city", label: "Cidade", value: contact.city },
        { name: "email", label: "E-mail", value: contact.email },
      ],
    });
    if (!r) return;
    crm.update(contact.key, { name: r.name.trim(), phone: U.digits(r.phone), company: r.company.trim(), segment: r.segment.trim(), city: r.city.trim(), email: r.email.trim() }, `${r.name}: perfil atualizado`);
    ui.toast("Perfil salvo");
  }

  function statusMenu(anchor, contact) {
    if (!contact) return;
    ui.popover(anchor, [
      { label: "Sem status", color: "#8696a0", checked: !contact.statusId, onClick: () => crm.setStatus(contact.key, "") },
      ...store.config.statuses.map((s) => ({ label: s.label, color: s.color, checked: contact.statusId === s.id, onClick: () => crm.setStatus(contact.key, s.id) })),
    ]);
  }

  function tagMenu(anchor, contact) {
    if (!contact) return;
    if (!store.config.tags.length) return ui.toast("Crie tags nas configurações");
    ui.popover(
      anchor,
      store.config.tags.map((t) => ({
        label: t.label,
        color: t.color,
        checked: contact.tags.includes(t.id),
        keepOpen: false,
        onClick: () => crm.toggleTag(contact.key, t.id),
      })),
    );
  }

  function stateMenu(anchor, contact) {
    const states = { active: "Ativo", follow: "Acompanhamento", archived: "Arquivado" };
    ui.popover(
      anchor,
      Object.entries(states).map(([id, label]) => ({ label, icon: id === "archived" ? "archive" : id === "follow" ? "bell" : "user", checked: contact.state === id, onClick: () => crm.setState(contact.key, id) })),
    );
  }

  WAW.dialogs = { addNote, editNote, addReminder, editReminder, snoozeMenu, addTask, editProfile, statusMenu, tagMenu, stateMenu, REMINDER_QUICK };
})();
