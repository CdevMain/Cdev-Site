/* CDEV WhatsApp — componentes de interface: toast, modal, formulário,
 * revisão de mensagem, popover e utilidades. */
(() => {
  const { util: U } = WAW;
  const I = (n) => WAW.icon(n);

  let toastTimer = null;
  function toast(message, { kind = "info", ms = 2400, sound = true } = {}) {
    let el = document.getElementById("waw-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "waw-toast";
      el.setAttribute("role", "status");
      document.documentElement.appendChild(el);
    }
    el.textContent = message;
    el.dataset.kind = kind;
    el.dataset.show = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.dataset.show = "0"), ms);
    if (sound) WAW.sound?.play(kind === "warn" ? "warn" : "toast");
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  /* ---------------- modal ---------------- */
  let modalStack = [];
  function closeModal(result) {
    const top = modalStack.pop();
    if (!top) return;
    top.el.remove();
    top.resolve(result);
    if (top.prevFocus?.isConnected) top.prevFocus.focus?.();
  }

  /**
   * modal({ title, body, actions:[{label, value, primary, danger, onClick(root)}], width, onMount })
   * Resolve com o value da ação (ou retorno do onClick). onClick pode retornar
   * undefined para fechar com value, ou false para manter aberto.
   */
  function modal({ title = "", subtitle = "", body = "", actions = [{ label: "Fechar", value: null }], width = 460, onMount } = {}) {
    return new Promise((resolve) => {
      const el = U.h(`
        <div class="waw-modal" id="waw-modal">
          <div class="waw-modal-backdrop" data-dismiss="1"></div>
          <div class="waw-modal-sheet" role="dialog" aria-modal="true" style="width:min(${width}px, calc(100vw - 32px))">
            <header class="waw-modal-head">
              <div>
                <h3>${U.esc(title)}</h3>
                ${subtitle ? `<p>${U.esc(subtitle)}</p>` : ""}
              </div>
              <button type="button" class="waw-icon-btn" data-dismiss="1" aria-label="Fechar">${I("x")}</button>
            </header>
            <div class="waw-modal-body"></div>
            <footer class="waw-modal-foot"></footer>
          </div>
        </div>`);
      const bodyEl = el.querySelector(".waw-modal-body");
      if (typeof body === "string") bodyEl.innerHTML = body;
      else if (body instanceof Node) bodyEl.appendChild(body);
      const foot = el.querySelector(".waw-modal-foot");
      actions.forEach((a) => {
        const b = U.h(`<button type="button" class="waw-btn ${a.primary ? "waw-btn-primary" : a.danger ? "waw-btn-danger" : "waw-btn-ghost"}">${a.icon ? I(a.icon) : ""}<span>${U.esc(a.label)}</span></button>`);
        b.addEventListener("click", async () => {
          if (a.onClick) {
            const r = await a.onClick(el);
            if (r === false) return;
            closeModal(r === undefined ? a.value : r);
          } else closeModal(a.value);
        });
        foot.appendChild(b);
      });
      el.querySelectorAll("[data-dismiss]").forEach((d) => d.addEventListener("click", () => closeModal(null)));
      el.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal(null);
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          foot.querySelector(".waw-btn-primary")?.click();
        }
      });
      // Impede que o WhatsApp capture teclas digitadas nos nossos campos.
      el.addEventListener("keypress", (e) => e.stopPropagation());
      el.addEventListener("keyup", (e) => e.stopPropagation());
      el.addEventListener("paste", (e) => e.stopPropagation());
      document.documentElement.appendChild(el);
      modalStack.push({ el, resolve, prevFocus: document.activeElement });
      onMount?.(el);
      setTimeout(() => (el.querySelector("[autofocus], input, textarea, select") || el.querySelector(".waw-btn-primary"))?.focus(), 30);
    });
  }

  /* ---------------- formulário ---------------- */
  function fieldHtml(f) {
    const id = `waw-f-${f.name}`;
    const v = f.value ?? "";
    switch (f.type) {
      case "textarea":
        return `<label class="waw-field"><span>${U.esc(f.label)}</span><textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" placeholder="${U.esc(f.placeholder || "")}" ${f.autofocus ? "autofocus" : ""}>${U.esc(v)}</textarea>${f.help ? `<small>${U.esc(f.help)}</small>` : ""}</label>`;
      case "select":
        return `<label class="waw-field"><span>${U.esc(f.label)}</span><select id="${id}" name="${f.name}">${f.options
          .map((o) => `<option value="${U.esc(o.value)}" ${String(o.value) === String(v) ? "selected" : ""}>${U.esc(o.label)}</option>`)
          .join("")}</select></label>`;
      case "checkbox":
        return `<label class="waw-check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? "checked" : ""}/><span>${U.esc(f.label)}</span></label>`;
      case "datetime":
        return `<label class="waw-field"><span>${U.esc(f.label)}</span><input type="datetime-local" id="${id}" name="${f.name}" value="${U.esc(v ? U.toLocalInput(v) : "")}"/>${
          f.quick ? `<div class="waw-chips">${f.quick.map((q) => `<button type="button" class="waw-chip" data-quick="${q.minutes}" data-target="${id}">${U.esc(q.label)}</button>`).join("")}</div>` : ""
        }</label>`;
      default:
        return `<label class="waw-field"><span>${U.esc(f.label)}</span><input type="${f.type || "text"}" id="${id}" name="${f.name}" value="${U.esc(v)}" placeholder="${U.esc(f.placeholder || "")}" ${f.autofocus ? "autofocus" : ""}/>${f.help ? `<small>${U.esc(f.help)}</small>` : ""}</label>`;
    }
  }

  /** Atalhos de data para lembretes: minutos a partir de agora, ou "t9" = amanhã 9h. */
  function quickTime(spec) {
    if (String(spec).startsWith("t")) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(Number(String(spec).slice(1)) || 9, 0, 0, 0);
      return d.getTime();
    }
    return Date.now() + Number(spec) * 60000;
  }

  function form({ title, subtitle, fields, submitLabel = "Salvar", width }) {
    return modal({
      title,
      subtitle,
      width,
      body: `<form class="waw-form" onsubmit="return false">${fields.map(fieldHtml).join("")}</form>`,
      onMount: (root) => {
        root.querySelectorAll("[data-quick]").forEach((b) =>
          b.addEventListener("click", () => {
            const input = root.querySelector(`#${b.dataset.target}`);
            input.value = U.toLocalInput(quickTime(b.dataset.quick));
          }),
        );
      },
      actions: [
        { label: "Cancelar", value: null },
        {
          label: submitLabel,
          primary: true,
          onClick: (root) => {
            const out = {};
            for (const f of fields) {
              const input = root.querySelector(`[name="${f.name}"]`);
              if (!input) continue;
              if (f.type === "checkbox") out[f.name] = input.checked;
              else if (f.type === "datetime") out[f.name] = U.fromLocalInput(input.value);
              else out[f.name] = input.value;
              if (f.required && (out[f.name] === "" || out[f.name] == null)) {
                input.focus();
                toast(`Preencha: ${f.label}`, { kind: "warn" });
                return false;
              }
            }
            return out;
          },
        },
      ],
    });
  }

  const confirm = (title, message, { danger = true, okLabel = "Confirmar" } = {}) =>
    modal({ title, body: `<p class="waw-muted">${U.esc(message)}</p>`, actions: [{ label: "Cancelar", value: false }, { label: okLabel, value: true, primary: !danger, danger }] });

  /**
   * Revisão obrigatória antes de inserir: o texto é editável.
   * Retorna true se inserido/copiado.
   */
  async function review(text, { title = "Revisar mensagem", subtitle = "", contact = null, missing = [] } = {}) {
    const vars = missing.length ? `<p class="waw-warn">${I("alert")} Sem valor para: ${missing.map((m) => `<code>{{${U.esc(m)}}}</code>`).join(", ")} — edite antes de inserir.</p>` : "";
    const result = await modal({
      title,
      subtitle: subtitle || (contact ? `Para: ${contact.name || U.formatPhone(contact.phone)}` : ""),
      width: 520,
      body: `${vars}<textarea class="waw-review" rows="9" autofocus>${U.esc(text)}</textarea><p class="waw-muted waw-small">A mensagem será colocada no campo de texto. Você revisa e envia manualmente.</p>`,
      actions: [
        { label: "Cancelar", value: null },
        { label: "Copiar", icon: "copy", onClick: (root) => ({ action: "copy", text: root.querySelector(".waw-review").value }) },
        { label: "Inserir no WhatsApp", icon: "insert", primary: true, onClick: (root) => ({ action: "insert", text: root.querySelector(".waw-review").value }) },
      ],
    });
    if (!result) return false;
    if (result.action === "copy") {
      await copy(result.text);
      toast("Copiado");
      WAW.crm.bump("copies");
      return true;
    }
    return insertText(result.text);
  }

  async function insertText(text) {
    const r = await WAW.wa.insertIntoComposer(text);
    if (r.ok) {
      toast("Mensagem inserida — revise e envie");
      WAW.crm.bump("inserts");
      WAW.crm.log("insert", `Inseriu mensagem${WAW.current?.contact ? ` para ${WAW.current.contact.name}` : ""}`, WAW.current?.contact?.key || "");
      return true;
    }
    await copy(text);
    toast(r.reason === "no-composer" ? "Abra uma conversa primeiro — texto copiado" : "Não consegui inserir — texto copiado", { kind: "warn", ms: 3200 });
    return false;
  }

  /* ---------------- popover (menu flutuante) ---------------- */
  let pop = null;
  function closePopover() {
    pop?.remove();
    pop = null;
  }
  /** items: [{label, icon, color, checked, onClick, divider}] */
  function popover(anchor, items, { width = 210 } = {}) {
    closePopover();
    pop = U.h(`<div class="waw-popover" style="width:${width}px"></div>`);
    items.forEach((it) => {
      if (it.divider) return pop.appendChild(U.h('<div class="waw-pop-div"></div>'));
      if (it.heading) return pop.appendChild(U.h(`<div class="waw-pop-head">${U.esc(it.heading)}</div>`));
      const b = U.h(`<button type="button" class="waw-pop-item">
          ${it.color ? `<span class="waw-dot" style="background:${U.sanitizeHex(it.color, "#8696a0")}"></span>` : it.icon ? `<span class="waw-pop-ic">${I(it.icon)}</span>` : "<span></span>"}
          <span class="waw-pop-label">${U.esc(it.label)}</span>
          ${it.checked ? `<span class="waw-pop-check">${I("check")}</span>` : "<span></span>"}
        </button>`);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!it.keepOpen) closePopover();
        it.onClick?.();
      });
      pop.appendChild(b);
    });
    document.documentElement.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const h = pop.offsetHeight;
    const left = Math.min(Math.max(8, r.right - width), innerWidth - width - 8);
    const top = r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    return pop;
  }
  document.addEventListener(
    "mousedown",
    (e) => {
      if (pop && !pop.contains(e.target)) closePopover();
    },
    true,
  );

  const chip = (label, color, extra = "") =>
    `<span class="waw-tag" style="--c:${U.sanitizeHex(color, "#64748b")}" ${extra}>${U.esc(label)}</span>`;

  const empty = (text) => `<div class="waw-empty">${U.esc(text)}</div>`;

  WAW.ui = { toast, copy, modal, closeModal, form, confirm, review, insertText, popover, closePopover, chip, empty, quickTime, I };
})();
