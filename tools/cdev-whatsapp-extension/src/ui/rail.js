/* CDEV WhatsApp — barra de botões (no rail nativo ou flutuante). */
(() => {
  const { util: U, store, actions } = WAW;
  const ROOT_ID = "waw-root";

  function ensureHost() {
    let host = document.getElementById(ROOT_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = ROOT_ID;
    }
    const pos = store.config.display.railPosition;
    const native = pos === "native" ? WAW.wa.findNativeRail() : null;
    if (native) {
      if (host.parentElement !== native) {
        host.className = "waw-rail waw-rail-native";
        native.appendChild(host);
      }
    } else {
      const side = pos === "free" ? "free" : pos === "right" ? "right" : "left";
      const cls = `waw-rail waw-rail-float waw-rail-${side}`;
      if (!dragging && (host.parentElement !== document.documentElement || host.className !== cls)) {
        host.className = cls;
        document.documentElement.appendChild(host);
      }
    }
    applyPosition(host);
    return host;
  }

  const btnHtml = (b) => `
    <button type="button" class="waw-rbtn" data-run="${U.esc(b.id)}" title="${U.esc(b.label)}${b.shortcut ? ` · ${U.esc(b.shortcut)}` : ""}" aria-label="${U.esc(b.label)}" ${b.color ? `style="color:${U.sanitizeHex(b.color)}"` : ""}>
      ${WAW.icon(b.icon)}
    </button>`;

  function applyPosition(host) {
    const d = store.config.display;
    host.style.setProperty("--waw-rail-alpha", String(d.railOpacity));
    if (dragging) return;
    if (d.railPosition === "free") {
      host.style.left = `${Math.min(Math.max(0, d.railX), innerWidth - 40)}px`;
      host.style.top = `${Math.min(Math.max(0, d.railY), innerHeight - 60)}px`;
    } else {
      host.style.removeProperty("left");
      host.style.removeProperty("top");
    }
  }

  function render() {
    const host = ensureHost();
    const cfg = store.config;
    host.style.setProperty("--waw-rail-size", `${cfg.display.railSize}px`);
    host.style.setProperty("--waw-rail-gap", `${cfg.display.railGap}px`);
    const buttons = actions.visibleButtons();
    const focus = cfg.mode === "focus";
    const favs = buttons.filter((b) => b.favorite);
    const rest = buttons.filter((b) => !b.favorite);
    const ungrouped = rest.filter((b) => !b.groupId);
    const parts = [];

    parts.push(`<div class="waw-grip" data-grip="1" title="Arraste para mover o menu · clique para opções (opacidade, posição)">${WAW.icon("grip")}</div>`);
    if (favs.length) parts.push(...favs.map(btnHtml));
    // Contatos favoritos (♥) viram atalhos que abrem a conversa.
    const favContacts = Object.values(store.state.contacts)
      .filter((c) => c.favorite && c.state !== "archived")
      .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
      .slice(0, 10);
    if (favContacts.length) {
      parts.push(
        ...favContacts.map((c) => {
          const st = WAW.crm.statusById(c.statusId);
          const initials = (c.name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
          return `<button type="button" class="waw-rbtn waw-rcontact" data-contact="${U.esc(c.key)}" title="Abrir conversa: ${U.esc(c.name)}" style="--c:${st ? st.color : "#8696a0"}"><span>${U.esc(initials)}</span></button>`;
        }),
      );
    }
    if (!focus) {
      if (ungrouped.length) {
        if (favs.length) parts.push('<div class="waw-rsep"></div>');
        parts.push(...ungrouped.map(btnHtml));
      }
      for (const g of cfg.groups) {
        const gb = rest.filter((b) => b.groupId === g.id);
        if (!gb.length) continue;
        parts.push(`<button type="button" class="waw-rgroup" data-group="${U.esc(g.id)}" title="${U.esc(g.label)} — ${g.collapsed ? "expandir" : "recolher"}" aria-expanded="${!g.collapsed}">
          <span>${U.esc(g.label.slice(0, 4))}</span>${WAW.icon(g.collapsed ? "chevronRight" : "chevronDown")}</button>`);
        if (!g.collapsed) parts.push(`<div class="waw-rgroup-body">${gb.map(btnHtml).join("")}</div>`);
      }
    }
    const profile = cfg.profiles.find((p) => p.id === cfg.activeProfileId);
    parts.push(
      '<div class="waw-rsep"></div>',
      `<button type="button" class="waw-rbtn ${cfg.display.listHidden ? "is-on" : ""}" data-sys="list" title="${cfg.display.listHidden ? "Mostrar" : "Esconder"} lista de conversas · ${U.esc(cfg.shortcuts.list || "")}">${WAW.icon(cfg.display.listHidden ? "sidebarOff" : "sidebar")}</button>`,
      `<button type="button" class="waw-rbtn ${cfg.panel.open ? "is-on" : ""}" data-sys="panel" title="Painel · ${U.esc(cfg.shortcuts.panel)}">${WAW.icon("panel")}</button>`,
      `<button type="button" class="waw-rbtn" data-sys="palette" title="O que você quer fazer? · ${U.esc(cfg.shortcuts.palette)}">${WAW.icon("command")}</button>`,
      `<button type="button" class="waw-rbtn waw-rbtn-profile ${profile?.id === "admin" ? "is-admin" : ""}" data-sys="profile" title="Workspace: ${U.esc(profile?.label || "Admin")}"><span>${U.esc((profile?.label || "Admin").slice(0, 2).toUpperCase())}</span></button>`,
      `<button type="button" class="waw-rbtn waw-rbtn-config" data-sys="settings" title="Configurações · ${U.esc(cfg.shortcuts.settings)}">${WAW.icon("gear")}</button>`,
    );
    host.innerHTML = `<div class="waw-rstack ${focus ? "is-focus" : ""}">${parts.join("")}</div>`;
    host.dataset.ready = "1";
  }

  function onClick(event) {
    const host = document.getElementById(ROOT_ID);
    if (!host || !host.contains(event.target)) return;
    const run = event.target.closest("[data-run]");
    const grp = event.target.closest("[data-group]");
    const sys = event.target.closest("[data-sys]");
    const fav = event.target.closest("[data-contact]");
    if (!run && !grp && !sys && !fav) return;
    event.preventDefault();
    event.stopPropagation();
    if (fav) actions.openContact(WAW.crm.get(fav.dataset.contact));
    else if (run) {
      const b = store.config.buttons.find((x) => x.id === run.dataset.run);
      actions.runButton(b);
    } else if (grp) {
      store.patchConfig((cfg) => {
        const g = cfg.groups.find((x) => x.id === grp.dataset.group);
        if (g) g.collapsed = !g.collapsed;
      });
    } else if (sys.dataset.sys === "panel") WAW.panel.toggle();
    else if (sys.dataset.sys === "palette") WAW.palette.open();
    else if (sys.dataset.sys === "list") WAW.listToggle.toggle();
    else if (sys.dataset.sys === "settings") actions.openSettings();
    else if (sys.dataset.sys === "profile") {
      WAW.ui.popover(sys, [
        { heading: "Workspace" },
        ...store.config.profiles.map((p) => ({ label: p.id === "admin" ? "Admin (todas as funções)" : p.label, icon: p.id === "admin" ? "shield" : "user", checked: p.id === store.config.activeProfileId, onClick: () => actions.setProfile(p.id) })),
      ]);
    }
  }

  document.addEventListener("click", onClick, true);

  /* ---------------- arrastar com a mão + opções ---------------- */
  let dragging = null;
  function onGripDown(e) {
    const grip = e.target.closest?.("#waw-root [data-grip]");
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const host = document.getElementById(ROOT_ID);
    const r = host.getBoundingClientRect();
    dragging = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false, grip, x: r.left, y: r.top };
    document.documentElement.classList.add("waw-grabbing");
  }
  function onGripMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragging.sx;
    const dy = e.clientY - dragging.sy;
    if (!dragging.moved && Math.hypot(dx, dy) < 4) return;
    e.preventDefault();
    const host = document.getElementById(ROOT_ID);
    if (!dragging.moved) {
      dragging.moved = true;
      // Solta o menu da barra nativa e passa a flutuar onde o usuário arrastar.
      host.className = "waw-rail waw-rail-float waw-rail-free";
      document.documentElement.appendChild(host);
    }
    const x = Math.min(Math.max(0, dragging.ox + dx), innerWidth - host.offsetWidth);
    const y = Math.min(Math.max(0, dragging.oy + dy), innerHeight - 40);
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    dragging.x = x;
    dragging.y = y;
  }
  function onGripUp(e) {
    if (!dragging) return;
    const d = dragging;
    dragging = null;
    document.documentElement.classList.remove("waw-grabbing");
    e.preventDefault();
    e.stopPropagation();
    if (d.moved) {
      store.patchConfig((cfg) => {
        cfg.display.railPosition = "free";
        cfg.display.railX = Math.round(d.x);
        cfg.display.railY = Math.round(d.y);
      });
    } else openRailOptions(d.grip);
  }
  document.addEventListener("pointerdown", onGripDown, true);
  document.addEventListener("pointermove", onGripMove, true);
  document.addEventListener("pointerup", onGripUp, true);

  function openRailOptions(anchor) {
    const d = store.config.display;
    document.getElementById("waw-rail-opts")?.remove();
    const pop = U.h(`<div id="waw-rail-opts" class="waw-popover" style="width:250px">
      <div class="waw-pop-head">Menu lateral</div>
      <label class="waw-range"><span>Opacidade do fundo <b data-v>${Math.round(d.railOpacity * 100)}%</b></span>
        <input type="range" min="10" max="100" step="5" value="${Math.round(d.railOpacity * 100)}" data-opacity/></label>
      <div class="waw-pop-div"></div>
      ${[["native", "Na barra do WhatsApp"], ["left", "Flutuante à esquerda"], ["right", "Flutuante à direita"], ["free", "Solto (onde arrastei)"]]
        .map(([k, l]) => `<button type="button" class="waw-pop-item" data-pos="${k}"><span></span><span class="waw-pop-label">${l}</span><span class="waw-pop-check">${d.railPosition === k ? WAW.icon("check") : ""}</span></button>`)
        .join("")}
      <p class="waw-pop-hint">${WAW.icon("hand")} Segure o ⠿ e arraste para mover.</p>
    </div>`);
    document.documentElement.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.right + 8, innerWidth - 260))}px`;
    pop.style.top = `${Math.max(8, Math.min(r.top, innerHeight - pop.offsetHeight - 8))}px`;
    const range = pop.querySelector("[data-opacity]");
    range.addEventListener("input", () => {
      pop.querySelector("[data-v]").textContent = `${range.value}%`;
      document.getElementById(ROOT_ID)?.style.setProperty("--waw-rail-alpha", String(Number(range.value) / 100));
    });
    range.addEventListener("change", () => store.patchConfig((cfg) => (cfg.display.railOpacity = Number(range.value) / 100)));
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pos]");
      if (!b) return;
      store.patchConfig((cfg) => (cfg.display.railPosition = b.dataset.pos));
      pop.remove();
    });
    ["keydown", "keypress", "keyup"].forEach((t) => pop.addEventListener(t, (e) => e.stopPropagation()));
    const close = (e) => {
      if (!pop.contains(e.target) && !e.target.closest?.("[data-grip]")) {
        pop.remove();
        document.removeEventListener("pointerdown", close, true);
      }
    };
    setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
  }

  WAW.rail = { render, ensureHost, ROOT_ID };
})();
