/* CDEV WhatsApp — página de configurações. */
(() => {
  const { util: U, store, crm, writer } = WAW;
  const I = (n) => WAW.icon(n);
  const esc = U.esc;

  const SECTIONS = [
    { group: "Geral" },
    { id: "prefs", label: "Preferências", icon: "gear" },
    { id: "cdev", label: "CRM CDEV", icon: "briefcase" },
    { group: "Atalhos" },
    { id: "buttons", label: "Botões e grupos", icon: "zap" },
    { id: "profiles", label: "Perfis", icon: "user" },
    { id: "shortcuts", label: "Teclado", icon: "command" },
    { group: "Organização" },
    { id: "statuses", label: "Status", icon: "flag" },
    { id: "tags", label: "Tags", icon: "tag" },
    { id: "display", label: "Aparência", icon: "panel" },
    { group: "Trabalho" },
    { id: "messages", label: "Mensagens rápidas", icon: "message" },
    { id: "catalog", label: "Catálogo e preços", icon: "box" },
    { id: "pdf", label: "Orçamento e contrato", icon: "note" },
    { id: "links", label: "Links rápidos", icon: "link" },
    { id: "checklist", label: "Checklist", icon: "checklist" },
    { group: "Dados" },
    { id: "contacts", label: "Contatos", icon: "contacts" },
    { id: "backup", label: "Backup", icon: "download" },
    { id: "diagnostic", label: "Diagnóstico", icon: "crosshair" },
  ];

  let draft = null;
  let dirty = false;
  let section = (location.hash || "#prefs").slice(1);
  const ui = { contactsQuery: "", openIcon: "", importPayload: null, importSections: [], importMerge: true };

  /* ---------------- util ---------------- */
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
  }
  const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  function setPath(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
  }
  function markDirty(v = true) {
    if (v && section === "pdf") WAW.pdfEditor?.schedulePreview();
    dirty = v;
    document.getElementById("dirty").hidden = !dirty;
    document.getElementById("discard").hidden = !dirty;
    renderConflicts();
  }
  const opt = (value, label, selected) => `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
  const input = (path, label, { type = "text", placeholder = "", help = "", attrs = "" } = {}) =>
    `<label class="f"><span>${esc(label)}</span><input type="${type}" data-bind="${path}" value="${esc(getPath(draft, path) ?? "")}" placeholder="${esc(placeholder)}" ${attrs}/>${help ? `<small>${esc(help)}</small>` : ""}</label>`;
  const check = (path, label) => `<label class="check"><input type="checkbox" data-bind="${path}" ${getPath(draft, path) ? "checked" : ""}/><span>${esc(label)}</span></label>`;
  const color = (path) => `<input type="color" data-bind="${path}" value="${esc(U.sanitizeHex(getPath(draft, path), "#64748b"))}"/>`;
  const shortcutInput = (path, label) =>
    `<label class="f"><span>${esc(label)}</span><input class="kbd-input" readonly data-shortcut="${path}" value="${esc(getPath(draft, path) || "")}" placeholder="Clique e pressione as teclas"/></label>`;

  function iconPicker(path) {
    const current = getPath(draft, path) || "";
    const open = ui.openIcon === path;
    return `<div class="f"><span class="muted small">Ícone</span>
      <div class="icons-collapsed"><button type="button" class="icon-btn" data-do="icon-toggle" data-path="${path}" title="Escolher ícone" style="border:1px solid var(--line)">${current ? I(current) : "—"}</button>
      ${open ? `<div class="icons">${WAW.PICKABLE_ICONS.map((n) => `<button type="button" data-do="icon-set" data-path="${path}" data-icon="${n}" class="${n === current ? "is-on" : ""}" title="${n}">${I(n)}</button>`).join("")}</div>` : ""}</div></div>`;
  }

  function download(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function move(list, index, delta) {
    const j = index + delta;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
  }

  /* ---------------- conflitos ---------------- */
  function renderConflicts() {
    const box = document.getElementById("conflicts");
    const conflicts = store.findShortcutConflicts(draft);
    box.hidden = !conflicts.length;
    box.innerHTML = conflicts.length
      ? `<b>Conflito de atalhos:</b> ${conflicts.map((c) => `<code>${esc(c.shortcut)}</code> usado por ${c.owners.map(esc).join(" e ")}`).join("; ")}. Corrija antes de salvar.`
      : "";
    const bad = new Set(conflicts.map((c) => c.shortcut));
    document.querySelectorAll("[data-shortcut]").forEach((el) => el.classList.toggle("conflict", bad.has(U.normalizeShortcut(el.value))));
    return conflicts;
  }

  /* ---------------- seções ---------------- */
  const R = {};

  R.prefs = () => `
    <p class="lead">Seus dados para as variáveis <code>{{meunome}}</code> e <code>{{minhaempresa}}</code>, e o comportamento geral da extensão.</p>
    <div class="card"><div class="grid g2">${input("me.name", "Seu nome", { placeholder: "Ex.: Carlos" })}${input("me.company", "Sua empresa", { placeholder: "Ex.: CDEV" })}</div></div>
    <div class="card grid">
      ${check("features.reuseWhatsAppTab", "Reutilizar aba existente do WhatsApp Web (não duplicar abas)")}
      ${check("features.dockPanel", "Painel lateral empurra o WhatsApp (não cobre as mensagens)")}
      ${check("features.pinnedBanner", "Mostrar notas fixadas automaticamente ao abrir a conversa")}
      ${check("features.notifications", "Notificações do Chrome para lembretes")}
      ${check("features.trackMessages", "Registrar horário da última mensagem enviada/recebida (a partir do que estiver visível na conversa)")}
      ${check("features.diagnostic", "Modo diagnóstico (captura de elementos do WhatsApp)")}
      ${check("features.debugLogs", "Logs de diagnóstico no console (F12)")}
      ${check("features.autoPinPriority", "Ao marcar ★ prioridade, fixar a conversa no WhatsApp (limite do WhatsApp: 3 fixadas)")}
      ${check("features.priorityBar", "Mostrar barra ★ Prioridades fixa no topo da lista de conversas")}
    </div>
    <div class="card grid">
      <div class="card-head"><div class="title">${I("volume")}Sons dos avisos</div><button class="btn sm" data-do="test-sound">Testar</button></div>
      ${check("features.sounds", "Avisos sonoros (lembretes, seguir contato, alertas)")}
      ${check("features.soundToasts", "Som curto também nos avisos rápidos (salvo, copiado…)")}
      <label class="f"><span>Volume <b id="vol-v">${Math.round((draft.features.soundVolume ?? 0.6) * 100)}%</b></span><input type="range" min="0" max="100" step="5" data-bind="features.soundVolume" data-type="percent" value="${Math.round((draft.features.soundVolume ?? 0.6) * 100)}"/></label>
    </div>
    <div class="card"><div class="grid g2">
      <label class="f"><span>Modo de trabalho ao abrir</span><select data-bind="mode">${Object.entries(store.MODES).map(([k, v]) => opt(k, v, draft.mode)).join("")}</select></label>
    </div></div>
    <p class="muted small">A extensão nunca clica em “enviar”: ela abre conversas, preenche o campo de mensagem ou copia o texto — o envio é sempre seu.</p>`;

  function actionParams(b, i) {
    const p = `buttons.${i}.params`;
    switch (b.action) {
      case "list":
        return input(`${p}.listName`, "Nome EXATO da lista no WhatsApp", { placeholder: "Ex.: 💼 - Clientes", help: "Maiúsculas/acentos não importam." });
      case "chat":
        return input(`${p}.phone`, "Telefone com DDI e DDD", { placeholder: "5551999999999", help: "Abre a conversa pelo número (recarrega o WhatsApp Web)." });
      case "contact":
      case "group":
        return input(`${p}.query`, b.action === "group" ? "Nome exato do grupo" : "Nome exato do contato", { help: "Usa a busca do WhatsApp. Só abre sozinho se houver um único resultado com esse nome." });
      case "url":
      case "crm":
      case "page":
        return `${input(`${p}.url`, "Link", { placeholder: "https://…" })}${b.action !== "page" ? check(`buttons.${i}.reuseExistingTab`, "Usar a aba existente quando o link já estiver aberto") : ""}`;
      case "copy":
      case "insert":
        return `<label class="f"><span>Texto ${b.action === "insert" ? "(revisado antes de inserir; nunca enviado)" : ""}</span><textarea data-bind="${p}.text" rows="3">${esc(b.params.text || "")}</textarea><small>Aceita variáveis como {{nome}}, {{empresa}}, {{saudacao}}.</small></label>`;
      case "panel":
        return `<label class="f"><span>Aba do painel</span><select data-bind="${p}.panelTab">${Object.entries(store.PANEL_TABS).map(([k, v]) => opt(k, v, b.params.panelTab)).join("")}</select></label>`;
      case "status":
        return `<label class="f"><span>Status a aplicar</span><select data-bind="${p}.statusId">${opt("", "Sem status", b.params.statusId)}${draft.statuses.map((s) => opt(s.id, s.label, b.params.statusId)).join("")}</select></label>`;
      case "mode":
        return `<label class="f"><span>Modo</span><select data-bind="${p}.mode">${Object.entries(store.MODES).map(([k, v]) => opt(k, v, b.params.mode)).join("")}</select></label>`;
      default:
        return `<p class="muted small">Esta ação não precisa de configuração.</p>`;
    }
  }


  R.cdev = () => {
    const st = draft.statuses;
    const stOpt = (sel, none = "Não muda") => opt("", none, sel) + st.map((s) => opt(s.id, s.label, sel)).join("");
    const stages = store.CDEV_STAGES;
    return `
    <p class="lead">Integração com o CRM em <code>cdev.com.br/control</code>. Com o CRM aberto em uma aba, as duas pontas conversam na hora; com ele fechado, os eventos ficam na fila e são entregues quando você abrir o CRM.</p>
    <div class="card" id="cdev-live"><p class="muted">Carregando estado…</p></div>
    <div class="card grid">
      ${check("cdev.enabled", "Integração ligada")}
      ${check("cdev.trackManualSends", "Mensagem digitada direto no WhatsApp para um lead (etapa Lead) também conta como “Mensagem enviada”")}
      ${check("cdev.notifyReply", "Lead respondeu: aviso fixo + som + notificação (além da notificação no CRM)")}
      ${check("cdev.statusFromCrm", "Etapa mudou no CRM → muda o status/cor do contato aqui")}
      ${check("cdev.statusToCrm", "Status mudou aqui → muda a etapa no CRM (pelo mapa abaixo)")}
    </div>
    <div class="card grid g2">
      <label class="f"><span>Status ao enviar a mensagem do CRM</span><select data-bind="cdev.statusOnSent">${opt("", "Automático (“Novo contato” / Primeiro contato)", draft.cdev.statusOnSent)}${st.map((s) => opt(s.id, s.label, draft.cdev.statusOnSent)).join("")}</select><small>Substitui o passo manual de pintar o contato depois de enviar.</small></label>
      <label class="f"><span>Status quando o lead responde</span><select data-bind="cdev.statusOnReply">${stOpt(draft.cdev.statusOnReply)}</select></label>
    </div>
    <div class="card">
      <div class="card-head"><div class="title">${I("clock")}Mensagens agendadas</div></div>
      <div class="grid g3">
        ${check("cdev.scheduleEnabled", "Enviar agendadas no horário")}
        ${input("cdev.gapSec", "Intervalo mínimo entre envios (s)", { type: "number", attrs: 'min="10" max="600" data-type="number"' })}
        ${input("cdev.missedWindowMin", "Não enviar se atrasou mais de (min)", { type: "number", attrs: 'min="5" max="1440" data-type="number"', help: "Ex.: o PC ficou desligado no horário." })}
      </div>
      <p class="muted small">O envio acontece pelo WhatsApp Web: o Chrome precisa estar aberto (a extensão abre a aba do WhatsApp se ela estiver fechada). A extensão cola o texto e clica em enviar; se você estiver digitando, ela espera.</p>
      <div id="cdev-sched"></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="title">${I("flag")}Etapa do CRM → status aqui</div></div>
      <div class="grid g2">${Object.entries(stages).map(([k, label]) => `<label class="f"><span>${esc(label)}</span><select data-bind="cdev.fromCrm.${k}">${stOpt(draft.cdev.fromCrm[k], k === "LEAD" || k === "CONTATADO" ? "Automático / não muda" : "Não muda")}</select></label>`).join("")}</div>
    </div>
    <div class="card">
      <div class="card-head"><div class="title">${I("flag")}Status aqui → etapa do CRM</div></div>
      <div class="grid g2">${st.map((s) => `<label class="f"><span><span class="dot" style="background:${esc(s.color)};display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px"></span>${esc(s.label)}</span><select data-bind="cdev.toCrm.${s.id}">${opt("", "Não muda", draft.cdev.toCrm[s.id] || "")}${Object.entries(stages).filter(([k]) => k !== "CLIENTE").map(([k, l]) => opt(k, l, draft.cdev.toCrm[s.id] || "")).join("")}</select></label>`).join("")}</div>
      <p class="muted small">“Cliente” não é aplicado pelo WhatsApp: a conversão para cliente é feita no CRM.</p>
    </div>`;
  };

  const SCHED_ST = { scheduled: "Agendada", sent: "Enviada", failed: "Falhou", cancelled: "Cancelada" };
  function fillCdev() {
    chrome.runtime.sendMessage({ type: "cdev:status" }, (r) => {
      const el = document.getElementById("cdev-live");
      if (!el || !r) return;
      el.innerHTML = `<div class="grid g3">
        <div><b>${r.crmOpen ? "🟢 CRM aberto" : "⚪ CRM fechado"}</b><div class="muted small">${r.lastHello ? `último contato ${U.ago(r.lastHello)}` : "nunca conectado — abra o CRM"}</div></div>
        <div><b>${r.leads} leads</b><div class="muted small">${r.leadsAt ? `sincronizados ${U.ago(r.leadsAt)}` : "ainda não sincronizado"}</div></div>
        <div><b>${r.outbox} na fila</b><div class="muted small">eventos aguardando o CRM</div></div>
      </div><div class="row" style="margin-top:10px"><button class="btn sm" data-do="cdev-open-crm">Abrir CRM</button></div>`;
    });
    chrome.runtime.sendMessage({ type: "cdev:schedules-list" }, (r) => {
      const el = document.getElementById("cdev-sched");
      if (!el || !r) return;
      const items = (r.items || []).filter((x) => x.status === "scheduled" || Date.now() - (x.updatedAt || 0) < 7 * 86400000).slice(0, 60);
      el.innerHTML = items.length
        ? `<table class="tbl" style="width:100%;margin-top:10px;font-size:13px"><tbody>${items.map((x) => `<tr><td>${U.fmtDateTime(x.at)}</td><td><b>${esc(x.name || U.formatPhone(x.phone))}</b><div class="muted small">${esc(x.text.slice(0, 90))}</div>${x.error && x.status !== "sent" ? `<div class="small" style="color:#ef4444">${esc(x.error)}</div>` : ""}</td><td>${SCHED_ST[x.status] || x.status}${x.source === "crm" ? " · CRM" : ""}</td><td>${x.status === "scheduled" ? `<button class="btn sm" data-do="cdev-cancel" data-id="${esc(x.id)}">Cancelar</button>` : ""}</td></tr>`).join("")}</tbody></table>`
        : '<p class="muted small">Nenhum agendamento.</p>';
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-do^='cdev-']");
    if (!b) return;
    if (b.dataset.do === "cdev-open-crm") chrome.runtime.sendMessage({ type: "cdev:open-crm" });
    if (b.dataset.do === "cdev-cancel") chrome.runtime.sendMessage({ type: "cdev:wa-schedule-cancel", payload: { id: b.dataset.id } }, () => fillCdev());
  });

  R.buttons = () => `
    <p class="lead">Adicione quantos botões precisar. Eles aparecem na barra lateral do WhatsApp, na paleta de comandos (Ctrl+K) e podem ter atalho de teclado.</p>
    <div class="card">
      <div class="card-head"><div class="title">${I("folder")}Grupos</div></div>
      ${draft.groups.length ? draft.groups.map((g, i) => `<div class="row" style="margin-bottom:6px"><input data-bind="groups.${i}.label" value="${esc(g.label)}"/><label class="check" title="Começar recolhido"><input type="checkbox" data-bind="groups.${i}.collapsed" ${g.collapsed ? "checked" : ""}/>Recolhido</label><button class="icon-btn" data-do="move" data-list="groups" data-i="${i}" data-d="-1" title="Subir">↑</button><button class="icon-btn" data-do="move" data-list="groups" data-i="${i}" data-d="1" title="Descer">↓</button><button class="icon-btn danger" data-do="del" data-list="groups" data-i="${i}">${I("trash")}</button></div>`).join("") : '<p class="muted small">Sem grupos. Ex.: PROSPECÇÃO, ATENDIMENTO, ADMINISTRAÇÃO.</p>'}
      <button type="button" class="btn sm" data-do="add-group">+ Grupo</button>
    </div>
    ${draft.buttons
      .map(
        (b, i) => `
      <div class="card ${b.active ? "" : "is-off"}">
        <div class="card-head">
          <div class="title" ${b.color ? `style="color:${b.color}"` : ""}>${I(b.icon)}<span style="color:var(--text)">${esc(b.label)}</span><span class="muted small">${esc(store.ACTIONS[b.action]?.label || "")}</span></div>
          <button class="icon-btn ${b.favorite ? "is-on" : ""}" data-do="toggle" data-path="buttons.${i}.favorite" title="Favorito">${I("star")}</button>
          <button class="icon-btn" data-do="move" data-list="buttons" data-i="${i}" data-d="-1" title="Subir">↑</button>
          <button class="icon-btn" data-do="move" data-list="buttons" data-i="${i}" data-d="1" title="Descer">↓</button>
          <button class="icon-btn" data-do="dup-button" data-i="${i}" title="Duplicar">${I("copy")}</button>
          <button class="icon-btn danger" data-do="del" data-list="buttons" data-i="${i}" title="Excluir">${I("trash")}</button>
        </div>
        <div class="grid g3">
          ${input(`buttons.${i}.label`, "Nome", { attrs: 'maxlength="32"' })}
          <label class="f"><span>Ação</span><select data-bind="buttons.${i}.action" data-rerender="1">${Object.entries(store.ACTIONS).map(([k, v]) => opt(k, v.label, b.action)).join("")}</select></label>
          <label class="f"><span>Grupo</span><select data-bind="buttons.${i}.groupId" data-rerender="1">${opt("", "Sem grupo", b.groupId)}${draft.groups.map((g) => opt(g.id, g.label, b.groupId)).join("")}</select></label>
        </div>
        <div class="grid" style="margin-top:10px">${actionParams(b, i)}</div>
        <div class="grid g3" style="margin-top:10px;align-items:end">
          ${shortcutInput(`buttons.${i}.shortcut`, "Atalho de teclado")}
          <div class="f"><span class="muted small">Cor</span><div class="row">${color(`buttons.${i}.color`)}<button class="btn sm ghost" data-do="clear" data-path="buttons.${i}.color">Padrão</button></div></div>
          ${check(`buttons.${i}.active`, "Ativo")}
        </div>
        <div style="margin-top:10px">${iconPicker(`buttons.${i}.icon`)}</div>
      </div>`,
      )
      .join("")}
    <button type="button" class="btn add" data-do="add-button">+ Adicionar botão</button>`;

  R.profiles = () => `
    <p class="lead">Workspaces (perfis) mostram só os botões daquele contexto. Troque pelo botão de workspace na barra ou pela paleta. <b>Admin</b> é fixo e dá acesso a todas as funções: todos os botões, todas as abas, ficha completa e diagnóstico.</p>
    ${draft.profiles
      .map(
        (p, i) => p.id === "admin"
          ? `<div class="card"><div class="card-head"><div class="title">${I("shield")}Admin <span class="muted small">embutido · todas as funções · não pode ser removido</span></div></div></div>`
          : `<div class="card">
        <div class="card-head"><div class="title">${I("user")}${esc(p.label)}</div><button class="icon-btn danger" data-do="del" data-list="profiles" data-i="${i}">${I("trash")}</button></div>
        <div class="grid g2">${input(`profiles.${i}.label`, "Nome do perfil")}<label class="f"><span>Modo ao ativar</span><select data-bind="profiles.${i}.mode">${Object.entries(store.MODES).map(([k, v]) => opt(k, v, p.mode)).join("")}</select></label></div>
        <div class="profile-buttons">${draft.buttons.map((b) => `<label class="check"><input type="checkbox" data-do="profile-btn" data-i="${i}" data-id="${esc(b.id)}" ${p.buttonIds.includes(b.id) ? "checked" : ""}/>${esc(b.label)}</label>`).join("")}</div>
      </div>`,
      )
      .join("")}
    <button type="button" class="btn add" data-do="add-profile">+ Adicionar perfil</button>
    <div class="card"><label class="f"><span>Workspace ativo</span><select data-bind="activeProfileId">${draft.profiles.map((p) => opt(p.id, p.label, draft.activeProfileId)).join("")}</select></label></div>`;

  R.shortcuts = () => `
    <p class="lead">Clique no campo e pressione a combinação. <b>Backspace</b> remove. Conflitos entre atalhos são detectados e bloqueiam o salvamento.</p>
    <div class="card grid g2">${Object.entries(store.SHORTCUT_LABELS).map(([k, label]) => shortcutInput(`shortcuts.${k}`, label)).join("")}</div>
    <div class="card">
      <div class="card-head"><div class="title">${I("zap")}Botões</div></div>
      <div class="grid g2">${draft.buttons.map((b, i) => shortcutInput(`buttons.${i}.shortcut`, b.label)).join("")}</div>
    </div>
    <p class="muted small">Atalhos sem Ctrl/Alt/Meta não funcionam enquanto você digita no campo de mensagem.</p>`;

  const statusLike = (listName, withIcon) => `
    ${draft[listName]
      .map(
        (s, i) => `<div class="list-row ${withIcon ? "" : "tags"}">
        ${color(`${listName}.${i}.color`)}
        <input data-bind="${listName}.${i}.label" value="${esc(s.label)}" maxlength="32"/>
        ${withIcon ? `<select data-bind="${listName}.${i}.icon"><option value="">(sem ícone)</option>${WAW.PICKABLE_ICONS.map((n) => opt(n, n, s.icon)).join("")}</select>` : ""}
        <div class="row"><button class="icon-btn" data-do="move" data-list="${listName}" data-i="${i}" data-d="-1">↑</button><button class="icon-btn" data-do="move" data-list="${listName}" data-i="${i}" data-d="1">↓</button><button class="icon-btn danger" data-do="del" data-list="${listName}" data-i="${i}">${I("trash")}</button></div>
      </div>`,
      )
      .join("")}`;

  R.statuses = () => `
    <p class="lead">Status formam o funil (um por contato). Filtros prontos usam os IDs <code>interessado</code>, <code>proposta</code>, <code>negociacao</code>, <code>cliente</code>, <code>fechado</code> e <code>follow-up</code> — renomear não quebra nada.</p>
    <div class="card">${statusLike("statuses", true)}</div>
    <button type="button" class="btn add" data-do="add-status">+ Adicionar status</button>
    <p class="muted small">Excluir um status remove esse status dos contatos que o usavam (ao salvar).</p>`;

  R.tags = () => `
    <p class="lead">Tags são livres e um contato pode ter várias (ex.: Academia, Advogado, Energia Solar, Indicação, Urgente).</p>
    <div class="card">${draft.tags.length ? statusLike("tags", false) : '<p class="muted">Nenhuma tag.</p>'}</div>
    <button type="button" class="btn add" data-do="add-tag">+ Adicionar tag</button>`;

  R.display = () => `
    <p class="lead">Como o status aparece nos cards de conversa. Todas as opções são discretas e não mudam o layout do WhatsApp.</p>
    <div class="card"><div class="style-grid">${Object.entries(store.STATUS_STYLES)
      .map(([k, v]) => `<div class="style-opt ${draft.display.statusStyle === k ? "is-on" : ""}" data-do="style" data-id="${k}"><div class="mock-row" data-s="${k}"><i></i><b></b></div>${esc(v)}</div>`)
      .join("")}</div></div>
    <div class="card grid">${check("display.showTags", "Mostrar tags nos cards")}${check("display.showBadges", "Mostrar indicadores (📌 notas, 🔔 retorno hoje, ★ prioridade)")}</div>
    <div class="card grid g4">
      <label class="f"><span>Posição dos botões</span><select data-bind="display.railPosition">${opt("native", "Na barra do WhatsApp", draft.display.railPosition)}${opt("left", "Flutuante à esquerda", draft.display.railPosition)}${opt("right", "Flutuante à direita", draft.display.railPosition)}${opt("free", "Solto (arrastado com a mão)", draft.display.railPosition)}</select></label>
      ${input("display.railSize", "Tamanho (px)", { type: "number", attrs: 'min="28" max="56" data-type="number"' })}
      ${input("display.railGap", "Espaçamento (px)", { type: "number", attrs: 'min="0" max="20" data-type="number"' })}
      ${input("display.panelWidth", "Largura do painel (px)", { type: "number", attrs: 'min="300" max="560" data-type="number"' })}
    </div>
    <div class="card grid g2">
      <label class="f"><span>Opacidade do fundo do menu lateral <b data-pv="railOpacity">${Math.round(draft.display.railOpacity * 100)}%</b></span><input type="range" min="10" max="100" step="5" data-bind="display.railOpacity" data-type="percent" value="${Math.round(draft.display.railOpacity * 100)}"/></label>
      <label class="f"><span>Opacidade do fundo do painel <b data-pv="panelOpacity">${Math.round(draft.display.panelOpacity * 100)}%</b></span><input type="range" min="40" max="100" step="5" data-bind="display.panelOpacity" data-type="percent" value="${Math.round(draft.display.panelOpacity * 100)}"/></label>
      ${check("display.panelFloating", "Painel solto (flutuante, arrastável pelo topo)")}
    </div>
    <div class="card grid g2">
      ${check("display.listHidden", "Esconder a lista de conversas (ampliar o chat) — atalho " + (draft.shortcuts.list || "Alt+L"))}
      ${check("display.listPeek", "Com a lista escondida, mostrar ao passar o mouse na borda esquerda")}
      ${input("display.listPeekWidth", "Largura da lista ao espiar (px)", { type: "number", attrs: 'min="280" max="600" data-type="number"' })}
    </div>
    <p class="muted small">Dica: no WhatsApp, segure o ícone ⠿ no topo do menu lateral e arraste para movê-lo; clique nele para ajustar opacidade e posição.</p>`;

  R.messages = () => {
    const cats = draft.categories;
    return `
    <p class="lead">Biblioteca usada no painel, na paleta e nos botões. Variáveis disponíveis: ${Object.entries(writer.VARIABLES).map(([k, v]) => `<code title="${esc(v)}">{{${k}}}</code>`).join(" ")}</p>
    <div class="card"><label class="f"><span>Categorias (separadas por vírgula)</span><input data-do-input="categories" value="${esc(cats.join(", "))}"/></label></div>
    ${draft.quickMessages
      .map(
        (m, i) => `<div class="card">
        <div class="card-head"><div class="title">${I("message")}${esc(m.title)}</div>
          <button class="icon-btn ${m.favorite ? "is-on" : ""}" data-do="toggle" data-path="quickMessages.${i}.favorite">${I("star")}</button>
          <button class="icon-btn" data-do="move" data-list="quickMessages" data-i="${i}" data-d="-1">↑</button>
          <button class="icon-btn" data-do="move" data-list="quickMessages" data-i="${i}" data-d="1">↓</button>
          <button class="icon-btn danger" data-do="del" data-list="quickMessages" data-i="${i}">${I("trash")}</button></div>
        <div class="grid g2">${input(`quickMessages.${i}.title`, "Título")}<label class="f"><span>Categoria</span><select data-bind="quickMessages.${i}.category">${[...new Set([...cats, m.category])].map((c) => opt(c, c, m.category)).join("")}</select></label></div>
        <label class="f" style="margin-top:10px"><span>Texto</span><textarea data-bind="quickMessages.${i}.text" rows="4">${esc(m.text)}</textarea></label>
      </div>`,
      )
      .join("")}
    <button type="button" class="btn add" data-do="add-message">+ Adicionar mensagem</button>`;
  };

  R.catalog = () => `
    <p class="lead">Produtos e serviços para inserir no WhatsApp e montar orçamentos rápidos (com calculadora).</p>
    ${draft.catalog
      .map(
        (c, i) => `<div class="card"><div class="grid g3">${input(`catalog.${i}.name`, "Nome")}${input(`catalog.${i}.price`, "Preço (R$)", { attrs: 'data-type="money"' })}${input(`catalog.${i}.link`, "Link (opcional)", { placeholder: "https://…" })}</div>
        <div class="row" style="margin-top:10px;align-items:flex-end">${input(`catalog.${i}.description`, "Descrição")}<button class="icon-btn" data-do="move" data-list="catalog" data-i="${i}" data-d="-1">↑</button><button class="icon-btn" data-do="move" data-list="catalog" data-i="${i}" data-d="1">↓</button><button class="icon-btn danger" data-do="del" data-list="catalog" data-i="${i}">${I("trash")}</button></div></div>`,
      )
      .join("")}
    <button type="button" class="btn add" data-do="add-catalog">+ Adicionar item</button>`;

  R.links = () => `
    <p class="lead">CRM, Google Drive, sistema, painel, demonstração… Abrem reutilizando a aba se já estiver aberta. Um link com “demo” no nome vira o botão <i>Abrir demo</i> do modo Prospecção.</p>
    ${draft.links
      .map(
        (l, i) => `<div class="card"><div class="row" style="align-items:flex-end">${input(`links.${i}.label`, "Nome")}${input(`links.${i}.url`, "URL", { placeholder: "https://…" })}
          <button class="icon-btn ${l.favorite ? "is-on" : ""}" data-do="toggle" data-path="links.${i}.favorite" title="Favorito">${I("star")}</button>
          <button class="icon-btn danger" data-do="del" data-list="links" data-i="${i}">${I("trash")}</button></div></div>`,
      )
      .join("")}
    <button type="button" class="btn add" data-do="add-link">+ Adicionar link</button>`;

  R.checklist = () => `
    <p class="lead">Etapas marcadas por contato na ficha do painel.</p>
    <div class="card">${draft.checklist
      .map((c, i) => `<div class="row" style="margin-bottom:6px"><input data-bind="checklist.${i}.label" value="${esc(c.label)}"/><button class="icon-btn" data-do="move" data-list="checklist" data-i="${i}" data-d="-1">↑</button><button class="icon-btn" data-do="move" data-list="checklist" data-i="${i}" data-d="1">↓</button><button class="icon-btn danger" data-do="del" data-list="checklist" data-i="${i}">${I("trash")}</button></div>`)
      .join("")}
    <button type="button" class="btn sm" data-do="add-check">+ Etapa</button></div>`;

  R.pdf = () => WAW.pdfEditor.render();

  R.contacts = () => {
    const all = Object.values(store.state.contacts);
    const list = [...crm.search(ui.contactsQuery, []), ...crm.search(ui.contactsQuery, ["archived"])];
    const fu = crm.followUpItems();
    return `
      <div class="grid g4" style="margin-bottom:12px">
        <div class="stat"><b>${all.length}</b><span>Contatos registrados</span></div>
        <div class="stat"><b>${all.filter((c) => c.statusId).length}</b><span>Com status</span></div>
        <div class="stat"><b>${fu.all.length}</b><span>Retornos/tarefas pendentes</span></div>
        <div class="stat"><b>${all.reduce((n, c) => n + c.notes.length, 0)}</b><span>Notas</span></div>
      </div>
      <div class="card"><input type="search" id="contacts-q" placeholder="Buscar por nome, telefone, empresa, nota…" value="${esc(ui.contactsQuery)}"/></div>
      <div class="card" style="overflow-x:auto"><table>
        <thead><tr><th>Contato</th><th>Status</th><th>Tags</th><th>Notas</th><th>Lembretes</th><th></th></tr></thead>
        <tbody>${list
          .slice(0, 300)
          .map((c) => {
            const st = crm.statusById(c.statusId);
            return `<tr>
              <td><b>${c.priority ? "★ " : ""}${esc(c.name || "—")}</b><br/><span class="muted small">${esc([c.phone ? U.formatPhone(c.phone) : "", c.company].filter(Boolean).join(" · "))}${c.jid ? "" : ' <span title="Sem ID estável">~nome</span>'}${c.state === "archived" ? " · arquivado" : ""}</span></td>
              <td>${st ? `<span class="dot" style="background:${st.color}"></span>${esc(st.label)}` : '<span class="muted">—</span>'}</td>
              <td>${c.tags.map((t) => crm.tagById(t)).filter(Boolean).map((t) => `<span class="tag" style="color:${t.color};background:${U.hexToRgba(t.color, 0.15)}">${esc(t.label)}</span>`).join("")}</td>
              <td>${c.notes.length || ""}</td>
              <td>${crm.pendingReminders(c).map((r) => `<span class="small">${U.fmtDateTime(r.due)} ${esc(r.text)}</span>`).join("<br/>")}</td>
              <td><button class="icon-btn danger" data-do="del-contact" data-key="${esc(c.key)}" title="Excluir dados deste contato">${I("trash")}</button></td>
            </tr>`;
          })
          .join("")}</tbody></table>
        ${list.length ? "" : '<p class="muted">Nenhum contato. Eles são registrados quando você abre conversas no WhatsApp Web.</p>'}
      </div>`;
  };

  R.backup = () => {
    const secs = Object.entries(store.EXPORT_SECTIONS);
    const p = ui.importPayload;
    return `
      <p class="lead">Exporte e importe em JSON: para backup ou para duplicar a configuração em outro computador.</p>
      <div class="card">
        <div class="card-head"><div class="title">${I("download")}Exportar</div></div>
        <div class="grid g2">${secs.map(([k, v]) => `<label class="check"><input type="checkbox" data-export="${k}" checked/>${esc(v)}</label>`).join("")}</div>
        <div class="row" style="margin-top:12px"><button class="btn primary" data-do="export">Exportar selecionados</button><button class="btn" data-do="export-config">Só configuração (sem contatos)</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="title">${I("upload")}Importar</div></div>
        <input type="file" id="import-file" accept="application/json,.json"/>
        ${
          p
            ? `<p class="small muted" style="margin:10px 0">Backup de ${esc(p.exportedAt || "?")} (v${esc(p.version || "?")}). Escolha o que restaurar:</p>
              <div class="grid g2">${secs.filter(([k]) => p.sections?.[k] != null).map(([k, v]) => `<label class="check"><input type="checkbox" data-import="${k}" ${ui.importSections.includes(k) ? "checked" : ""}/>${esc(v)}</label>`).join("")}</div>
              ${p.sections?.contacts ? `<div class="row" style="margin-top:10px"><label class="check"><input type="radio" name="merge" data-do="merge" value="1" ${ui.importMerge ? "checked" : ""}/>Mesclar contatos</label><label class="check"><input type="radio" name="merge" data-do="merge" value="0" ${ui.importMerge ? "" : "checked"}/>Substituir contatos</label></div>` : ""}
              <div class="row" style="margin-top:12px"><button class="btn primary" data-do="import">Restaurar selecionados</button><button class="btn ghost" data-do="import-cancel">Cancelar</button></div>`
            : ""
        }
      </div>
      <div class="card"><div class="card-head"><div class="title">${I("trash")}Limpar dados</div></div>
        <p class="muted small">Apaga contatos, notas, lembretes, histórico e contadores (a configuração permanece). Faça um backup antes.</p>
        <button class="btn danger" data-do="wipe">Apagar dados de contatos</button></div>`;
  };

  R.diagnostic = () => {
    const caps = store.state.diag;
    return `
      <p class="lead">Quando o WhatsApp muda a interface, use <b>Ferramentas › Diagnóstico › Capturar elemento</b> no painel (com o modo diagnóstico ligado em Preferências) e clique no elemento. Aqui ficam os registros para ajustar a extensão.</p>
      <div class="card row wrap">${check("features.diagnostic", "Modo diagnóstico ativo")}<span style="flex:1"></span><button class="btn" data-do="diag-export" ${caps.length ? "" : "disabled"}>Exportar capturas</button><button class="btn danger" data-do="diag-clear" ${caps.length ? "" : "disabled"}>Limpar</button></div>
      ${caps.length ? caps.map((d) => `<details><summary><b>${esc(d.tag)}</b> ${esc(d.ariaLabel || d.title || d.text?.slice(0, 50) || d.dataTestid || "")} <span class="muted small">${U.fmtDateTime(d.at)} · seletores: ${esc((d.selectors || []).slice(0, 2).join("  "))}</span></summary><pre>${esc(JSON.stringify(d, null, 2))}</pre></details>`).join("") : '<p class="muted">Nenhuma captura.</p>'}`;
  };

  /* ---------------- render ---------------- */
  function renderNav() {
    document.getElementById("nav").innerHTML = SECTIONS.map((s) =>
      s.group ? `<div class="nav-group">${esc(s.group)}</div>` : `<button type="button" data-section="${s.id}" class="${s.id === section ? "is-on" : ""}">${I(s.icon)}${esc(s.label)}</button>`,
    ).join("");
  }

  function render() {
    if (!R[section]) section = "prefs";
    renderNav();
    const meta = SECTIONS.find((s) => s.id === section);
    document.getElementById("section-title").textContent = meta.label;
    const content = document.getElementById("content");
    const y = window.scrollY;
    content.classList.toggle("wide", section === "pdf");
    content.innerHTML = R[section]();
    if (section === "pdf") WAW.pdfEditor.afterRender();
    if (section === "cdev") fillCdev();
    window.scrollTo(0, y);
    const dataSections = ["contacts", "backup", "diagnostic"];
    document.getElementById("save").hidden = dataSections.includes(section) && section !== "diagnostic";
    renderConflicts();
  }

  /* ---------------- eventos ---------------- */
  function parseValue(el) {
    if (el.type === "checkbox") return el.checked;
    if (el.dataset.type === "number") return Number(el.value);
    if (el.dataset.type === "money") return U.parseMoney(el.value);
    if (el.dataset.type === "percent") return Number(el.value) / 100;
    if (el.type === "color") return el.value;
    return el.value;
  }

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "contacts-q") {
      ui.contactsQuery = el.value;
      clearTimeout(render.t);
      render.t = setTimeout(() => {
        render();
        const q = document.getElementById("contacts-q");
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
      }, 200);
      return;
    }
    if (el.dataset.doInput === "categories") {
      draft.categories = [...new Set(el.value.split(",").map((s) => s.trim()).filter(Boolean))];
      return markDirty();
    }
    if (!el.dataset.bind || el.tagName === "SELECT") return;
    setPath(draft, el.dataset.bind, parseValue(el));
    if (el.type === "range") {
      const lbl = el.closest("label")?.querySelector("b");
      if (lbl) lbl.textContent = el.dataset.type === "percent" ? `${el.value}%` : `${el.value} mm`;
    }
    markDirty();
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.img) return WAW.pdfEditor.onChange(el);
    if (el.dataset.bind && (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "color")) {
      setPath(draft, el.dataset.bind, parseValue(el));
      if (el.dataset.bind.endsWith(".action")) {
        const i = Number(el.dataset.bind.split(".")[1]);
        if (!draft.buttons[i].params) draft.buttons[i].params = store.makeButton().params;
      }
      markDirty();
      if (el.dataset.rerender || el.dataset.pdfRerender || el.dataset.bind === "features.diagnostic") render();
      return;
    }
    if (el.dataset.do === "profile-btn") {
      const p = draft.profiles[Number(el.dataset.i)];
      p.buttonIds = el.checked ? [...new Set([...p.buttonIds, el.dataset.id])] : p.buttonIds.filter((x) => x !== el.dataset.id);
      return markDirty();
    }
    if (el.dataset.import) {
      ui.importSections = el.checked ? [...new Set([...ui.importSections, el.dataset.import])] : ui.importSections.filter((x) => x !== el.dataset.import);
      return;
    }
    if (el.dataset.do === "merge") {
      ui.importMerge = el.value === "1";
      return;
    }
    if (el.id === "import-file" && el.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          if (!payload?.sections) throw new Error("formato");
          ui.importPayload = payload;
          ui.importSections = Object.keys(payload.sections).filter((k) => payload.sections[k] != null);
          render();
        } catch {
          toast("Arquivo inválido");
        }
      };
      reader.readAsText(el.files[0]);
    }
  });

  // Captura de atalhos
  document.addEventListener("focusin", (e) => e.target.dataset?.shortcut && e.target.classList.add("is-capturing"));
  document.addEventListener("focusout", (e) => e.target.dataset?.shortcut && e.target.classList.remove("is-capturing"));
  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.dataset?.shortcut) return;
    if (e.key === "Tab") return;
    e.preventDefault();
    if (e.key === "Escape") return el.blur();
    let value = "";
    if (e.key === "Backspace" || e.key === "Delete") value = "";
    else {
      value = U.shortcutFromEvent(e);
      if (!value) return; // só modificador
      if (!/(Ctrl|Alt|Meta)\+/.test(value) && !/^F\d{1,2}$/.test(value)) {
        toast("Use Ctrl, Alt ou Meta na combinação");
        return;
      }
    }
    el.value = value;
    setPath(draft, el.dataset.shortcut, value);
    markDirty();
  });

  document.addEventListener("click", async (e) => {
    const nav = e.target.closest("[data-section]");
    if (nav) {
      section = nav.dataset.section;
      history.replaceState(null, "", `#${section}`);
      window.scrollTo(0, 0);
      return render();
    }
    const t = e.target.closest("[data-do]");
    if (!t || t.tagName === "INPUT") return;
    if (section === "pdf" && (await WAW.pdfEditor.onClick(t)) !== false) return;
    const d = t.dataset;
    switch (d.do) {
      case "icon-toggle":
        ui.openIcon = ui.openIcon === d.path ? "" : d.path;
        return render();
      case "icon-set":
        setPath(draft, d.path, d.icon);
        ui.openIcon = "";
        markDirty();
        return render();
      case "toggle":
        setPath(draft, d.path, !getPath(draft, d.path));
        markDirty();
        return render();
      case "clear":
        setPath(draft, d.path, "");
        markDirty();
        return render();
      case "move":
        move(draft[d.list], Number(d.i), Number(d.d));
        markDirty();
        return render();
      case "del": {
        const list = draft[d.list];
        if (d.list === "buttons" && list.length <= 1) return toast("Mantenha pelo menos um botão");
        if (d.list === "statuses" && list.length <= 1) return toast("Mantenha pelo menos um status");
        const removed = list.splice(Number(d.i), 1)[0];
        if (d.list === "groups") draft.buttons.forEach((b) => b.groupId === removed.id && (b.groupId = ""));
        markDirty();
        return render();
      }
      case "add-button":
        draft.buttons.push(store.makeButton({ label: `Atalho ${draft.buttons.length + 1}` }));
        markDirty();
        render();
        return window.scrollTo(0, document.body.scrollHeight);
      case "dup-button": {
        const src = draft.buttons[Number(d.i)];
        draft.buttons.splice(Number(d.i) + 1, 0, { ...U.clone(src), id: U.uid("btn"), label: `${src.label} (cópia)`, shortcut: "" });
        markDirty();
        return render();
      }
      case "add-group":
        draft.groups.push({ id: U.uid("grp"), label: "NOVO GRUPO", collapsed: false });
        markDirty();
        return render();
      case "add-profile":
        draft.profiles.push({ id: U.uid("prf"), label: `Perfil ${draft.profiles.length + 1}`, buttonIds: [], mode: "normal" });
        markDirty();
        return render();
      case "add-status":
        draft.statuses.push({ id: U.uid("st"), label: `Status ${draft.statuses.length + 1}`, color: "#6366f1", icon: "" });
        markDirty();
        return render();
      case "add-tag":
        draft.tags.push({ id: U.uid("tag"), label: "Nova tag", color: "#0ea5e9", icon: "" });
        markDirty();
        return render();
      case "style":
        draft.display.statusStyle = d.id;
        markDirty();
        return render();
      case "add-message":
        draft.quickMessages.push({ id: U.uid("msg"), title: "Nova mensagem", category: draft.categories[0] || "Geral", text: "{{saudacao}}, {{nome}}! ", favorite: false });
        markDirty();
        render();
        return window.scrollTo(0, document.body.scrollHeight);
      case "add-catalog":
        draft.catalog.push({ id: U.uid("cat"), name: "Novo item", description: "", price: 0, link: "" });
        markDirty();
        return render();
      case "add-link":
        draft.links.push({ id: U.uid("lnk"), label: "Novo link", url: "", favorite: false });
        markDirty();
        return render();
      case "add-check":
        draft.checklist.push({ id: U.uid("ck"), label: "Nova etapa" });
        markDirty();
        return render();
      case "del-contact":
        if (!confirm("Excluir status, notas, lembretes e tarefas deste contato?")) return;
        crm.remove(d.key);
        await store.persist("contacts", true);
        return render();
      case "test-sound":
        WAW.sound.play("reminder", { force: true, volume: draft.features.soundVolume });
        setTimeout(() => WAW.sound.play("alert", { force: true, volume: draft.features.soundVolume }), 900);
        return;
      case "export": {
        const secs = [...document.querySelectorAll("[data-export]:checked")].map((x) => x.dataset.export);
        if (!secs.length) return toast("Selecione ao menos um item");
        download(`wa-workspace-backup-${U.dayKey()}.json`, store.exportData(secs));
        return toast("Backup exportado");
      }
      case "export-config":
        download(`cdev-whatsapp-config-${U.dayKey()}.json`, store.exportData(Object.keys(store.EXPORT_SECTIONS).filter((k) => k !== "contacts" && k !== "history")));
        return toast("Configuração exportada");
      case "import":
        if (!ui.importSections.length) return toast("Selecione o que restaurar");
        try {
          await store.importData(ui.importPayload, ui.importSections, { mergeContacts: ui.importMerge });
          draft = U.clone(store.config);
          ui.importPayload = null;
          markDirty(false);
          render();
          return toast("Restaurado com sucesso");
        } catch (error) {
          return toast(error.message);
        }
      case "import-cancel":
        ui.importPayload = null;
        return render();
      case "wipe":
        if (!confirm("Apagar todos os dados de contatos, histórico e contadores? Isso não pode ser desfeito.")) return;
        store.state.contacts = {};
        store.state.history = [];
        store.state.stats = {};
        store.state.recents = [];
        await Promise.all(["contacts", "history", "stats", "recents"].map((n) => store.persist(n, true)));
        toast("Dados apagados");
        return render();
      case "diag-export":
        return download(`wa-workspace-diagnostico-${U.dayKey()}.json`, store.state.diag);
      case "diag-clear":
        store.state.diag = [];
        await store.persist("diag", true);
        return render();
      default:
    }
  });

  async function save() {
    const conflicts = renderConflicts();
    if (conflicts.length) return toast("Resolva os conflitos de atalhos");
    for (const b of draft.buttons) {
      if (["url", "crm", "page"].includes(b.action) && b.params.url && !/^https?:\/\/|^[\w-]+\.[\w.-]+/i.test(b.params.url)) return toast(`Link inválido no botão “${b.label}”`);
      if (b.action === "list" && !b.params.listName.trim()) return toast(`Informe o nome da lista no botão “${b.label}”`);
    }
    // Remove status excluídos dos contatos.
    const valid = new Set(draft.statuses.map((s) => s.id));
    const validTags = new Set(draft.tags.map((t) => t.id));
    let touched = false;
    for (const c of Object.values(store.state.contacts)) {
      if (c.statusId && !valid.has(c.statusId)) {
        c.statusId = "";
        touched = true;
      }
      const tags = c.tags.filter((t) => validTags.has(t));
      if (tags.length !== c.tags.length) {
        c.tags = tags;
        touched = true;
      }
    }
    if (touched) await store.persist("contacts", true);
    await store.setConfig(draft);
    draft = U.clone(store.config);
    markDirty(false);
    render();
    toast("Configuração salva — o WhatsApp Web já foi atualizado");
  }

  document.getElementById("save").addEventListener("click", save);
  document.getElementById("discard").addEventListener("click", () => {
    draft = U.clone(store.config);
    markDirty(false);
    render();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
  });

  (async () => {
    await store.load();
    store.listenExternalChanges();
    draft = U.clone(store.config);
    WAW.pdfEditor.init({ draft: () => draft, markDirty, render, toast });
    document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
    WAW.on("external-change", (name) => {
      if (name === "config" && !dirty) draft = U.clone(store.config);
      if (["contacts", "diag", "config"].includes(name) && !(name === "config" && dirty)) render();
    });
    render();
  })();
})();
