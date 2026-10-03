/* CDEV WhatsApp — esconder a coluna da lista de conversas para ampliar o chat.
 * Só aplica CSS (nada é removido do WhatsApp). Com a lista escondida, encostar
 * o mouse na borda esquerda do chat mostra a lista por cima (modo "espiar"). */
(() => {
  const { util: U, store } = WAW;
  const ZONE_ID = "waw-peek-zone";
  let leaveTimer = null;

  /** Coluna que contém #side (irmã da coluna do #main). */
  function findColumns() {
    const side = document.getElementById("side");
    const main = document.getElementById("main");
    if (!side) return {};
    let col = side;
    while (col.parentElement && col.parentElement !== document.body) {
      const parent = col.parentElement;
      // Para quando o pai também contém a área da conversa (ou o painel "sem conversa").
      if (main ? parent.contains(main) : parent.getBoundingClientRect().width > col.getBoundingClientRect().width + 200) break;
      col = parent;
    }
    let mainCol = null;
    if (main) {
      mainCol = main;
      while (mainCol.parentElement && mainCol.parentElement !== col.parentElement) mainCol = mainCol.parentElement;
      if (mainCol.parentElement !== col.parentElement) mainCol = null;
    } else {
      mainCol = col.nextElementSibling;
    }
    return { sideCol: col, mainCol };
  }

  function markColumns() {
    const { sideCol, mainCol } = findColumns();
    if (sideCol && !sideCol.classList.contains("waw-side-col")) {
      document.querySelectorAll(".waw-side-col").forEach((n) => n.classList.remove("waw-side-col"));
      sideCol.classList.add("waw-side-col");
    }
    if (mainCol && !mainCol.classList.contains("waw-main-col")) {
      document.querySelectorAll(".waw-main-col").forEach((n) => n.classList.remove("waw-main-col"));
      mainCol.classList.add("waw-main-col");
    }
    return { sideCol, mainCol };
  }

  function peekLeft(sideCol) {
    const prev = sideCol?.previousElementSibling;
    if (prev) {
      const r = prev.getBoundingClientRect();
      if (r.width > 0 && r.width < 160) return Math.round(r.right);
    }
    const main = document.querySelector(".waw-main-col")?.getBoundingClientRect();
    return main ? Math.max(0, Math.round(main.left)) : 0;
  }

  function apply() {
    const html = document.documentElement;
    const hidden = Boolean(store.config.display.listHidden);
    const { sideCol } = markColumns();
    html.classList.toggle("waw-list-hidden", hidden && Boolean(sideCol));
    html.style.setProperty("--waw-peek-w", `${store.config.display.listPeekWidth || 400}px`);
    let zone = document.getElementById(ZONE_ID);
    if (hidden && store.config.display.listPeek) {
      if (!zone) {
        zone = document.createElement("div");
        zone.id = ZONE_ID;
        zone.title = "Passe o mouse para ver as conversas";
        zone.addEventListener("mouseenter", () => peek(true));
        zone.addEventListener("click", () => peek(true));
        document.documentElement.appendChild(zone);
      }
      requestAnimationFrame(() => {
        const left = peekLeft(sideCol);
        html.style.setProperty("--waw-peek-left", `${left}px`);
      });
      // Fundo sólido ao espiar (usa a cor do próprio WhatsApp, clara ou escura).
      const bgOf = (el) => (el ? getComputedStyle(el).backgroundColor : "");
      const opaque = (c) => c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c);
      const bg = [document.getElementById("side"), sideCol, document.getElementById("app"), document.body].map(bgOf).find(opaque) || "#111b21";
      html.style.setProperty("--waw-peek-bg", bg);
    } else zone?.remove();
    if (!hidden) html.classList.remove("waw-list-peek");
  }

  function peek(on) {
    clearTimeout(leaveTimer);
    document.documentElement.classList.toggle("waw-list-peek", on && store.config.display.listHidden);
  }

  // Sai do modo "espiar" ao tirar o mouse da lista ou ao abrir uma conversa.
  document.addEventListener(
    "mouseleave",
    (e) => {
      if (!document.documentElement.classList.contains("waw-list-peek")) return;
      if (e.target?.classList?.contains?.("waw-side-col")) {
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => peek(false), 350);
      }
    },
    true,
  );
  document.addEventListener(
    "mouseenter",
    (e) => {
      if (e.target?.classList?.contains?.("waw-side-col")) clearTimeout(leaveTimer);
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (document.documentElement.classList.contains("waw-list-peek") && e.target.closest?.("#pane-side [role='listitem'], #pane-side [role='row']")) {
        setTimeout(() => peek(false), 250);
      }
    },
    true,
  );

  function toggle(force) {
    const next = typeof force === "boolean" ? force : !store.config.display.listHidden;
    store.patchConfig((cfg) => (cfg.display.listHidden = next));
    apply();
    WAW.ui.toast(next ? `Lista de conversas escondida — ${store.config.shortcuts.list || "Alt+L"} ou borda esquerda para ver` : "Lista de conversas visível", { ms: 2600 });
  }

  const ensure = U.throttle(() => {
    if (!store.config.display.listHidden) return;
    const col = document.querySelector(".waw-side-col");
    if (!col || !col.isConnected || !col.contains(document.getElementById("side"))) apply();
  }, 800);

  WAW.listToggle = { apply, toggle, ensure, peek, findColumns };
})();
