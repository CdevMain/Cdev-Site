/* CDEV WhatsApp — paleta de comandos (Ctrl+K). */
(() => {
  const { util: U, store, crm, actions } = WAW;
  const ID = "waw-palette";
  let state = null;

  function score(cmd, tokens) {
    if (!tokens.length) return 1;
    const label = U.norm(cmd.label);
    const hay = `${label} ${U.norm(cmd.group)} ${U.norm(cmd.keywords)}`;
    let s = 0;
    for (const t of tokens) {
      if (!hay.includes(t)) return 0;
      s += label.startsWith(t) ? 6 : label.includes(` ${t}`) ? 4 : label.includes(t) ? 3 : 1;
    }
    return s;
  }

  function contactCommands(query) {
    if (U.norm(query).length < 2) return [];
    return crm.search(query, []).slice(0, 8).map((c) => ({
      group: "Contatos",
      label: `Abrir ${c.name || U.formatPhone(c.phone)}`,
      icon: "user",
      hint: crm.statusById(c.statusId)?.label || c.company || "",
      keywords: "",
      run: () => actions.openContact(c),
    }));
  }

  function results() {
    const tokens = U.norm(state.query).split(" ").filter(Boolean);
    const base = state.commands
      .map((c) => ({ c, s: score(c, tokens) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    const contacts = contactCommands(state.query);
    const recent = !tokens.length ? recentCommands() : [];
    return [...recent, ...contacts, ...base].slice(0, 60);
  }

  let recentLabels = [];
  function recentCommands() {
    return recentLabels.map((l) => state.commands.find((c) => c.label === l)).filter(Boolean).map((c) => ({ ...c, group: "Recentes" }));
  }

  function draw() {
    const list = state.el.querySelector(".waw-pal-list");
    state.items = results();
    if (state.index >= state.items.length) state.index = Math.max(0, state.items.length - 1);
    let group = "";
    list.innerHTML = state.items.length
      ? state.items
          .map((c, i) => {
            const head = c.group !== group ? `<li class="waw-pal-group">${U.esc(c.group)}</li>` : "";
            group = c.group;
            return `${head}<li class="waw-pal-item ${i === state.index ? "is-on" : ""}" data-i="${i}">${WAW.icon(c.icon || "chevronRight")}<span>${U.esc(c.label)}</span>${c.hint ? `<kbd>${U.esc(c.hint)}</kbd>` : ""}</li>`;
          })
          .join("")
      : `<li class="waw-pal-empty">Nada encontrado</li>`;
    list.querySelector(".is-on")?.scrollIntoView({ block: "nearest" });
  }

  function run(i) {
    const cmd = state?.items[i];
    if (!cmd) return;
    close();
    recentLabels = [cmd.label, ...recentLabels.filter((l) => l !== cmd.label)].slice(0, 5);
    setTimeout(() => cmd.run(), 10);
  }

  function close() {
    state?.el.remove();
    state?.prevFocus?.focus?.();
    state = null;
  }

  function open(initial = "") {
    if (state) return close();
    const el = U.h(`
      <div id="${ID}">
        <div class="waw-pal-backdrop"></div>
        <div class="waw-pal-box" role="dialog" aria-label="Paleta de comandos">
          <div class="waw-pal-input">${WAW.icon("search")}<input type="text" placeholder="O que você quer fazer?" spellcheck="false"/><kbd>Esc</kbd></div>
          <ul class="waw-pal-list" role="listbox"></ul>
          <footer><span>↑↓ navegar</span><span>Enter executar</span><span>${U.esc(store.config.shortcuts.palette)} abrir/fechar</span></footer>
        </div>
      </div>`);
    document.documentElement.appendChild(el);
    state = { el, query: initial, index: 0, items: [], commands: actions.commands(), prevFocus: document.activeElement };
    const input = el.querySelector("input");
    input.value = initial;
    input.focus();
    draw();
    input.addEventListener("input", () => {
      state.query = input.value;
      state.index = 0;
      draw();
    });
    el.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" || U.eventMatches(e, store.config.shortcuts.palette)) {
        e.preventDefault();
        return close();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.index = Math.min(state.items.length - 1, state.index + 1);
        draw();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        state.index = Math.max(0, state.index - 1);
        draw();
      } else if (e.key === "Enter") {
        e.preventDefault();
        run(state.index);
      }
    });
    ["keypress", "keyup", "paste"].forEach((t) => el.addEventListener(t, (e) => e.stopPropagation()));
    el.querySelector(".waw-pal-backdrop").addEventListener("click", close);
    el.querySelector(".waw-pal-list").addEventListener("click", (e) => {
      const li = e.target.closest("[data-i]");
      if (li) run(Number(li.dataset.i));
    });
    el.querySelector(".waw-pal-list").addEventListener("mousemove", (e) => {
      const li = e.target.closest("[data-i]");
      if (li && Number(li.dataset.i) !== state.index) {
        state.index = Number(li.dataset.i);
        state.el.querySelectorAll(".waw-pal-item").forEach((n) => n.classList.toggle("is-on", Number(n.dataset.i) === state.index));
      }
    });
  }

  WAW.palette = { open, close, isOpen: () => Boolean(state) };
})();
