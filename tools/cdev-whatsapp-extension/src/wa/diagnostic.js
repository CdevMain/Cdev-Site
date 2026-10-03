/* CDEV WhatsApp — Modo diagnóstico: captura de elementos do WhatsApp. */
(() => {
  const { util: U, store, wa } = WAW;
  const CAP = 50;
  let session = null;

  function attrs(el) {
    if (!el?.getAttribute) return {};
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      class: typeof el.className === "string" ? el.className.slice(0, 200) : "",
      role: el.getAttribute("role") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      title: el.getAttribute("title") || "",
      dataTestid: el.getAttribute("data-testid") || "",
      dataIcon: el.getAttribute("data-icon") || "",
      dataTab: el.getAttribute("data-tab") || "",
      tabindex: el.getAttribute("tabindex") || "",
    };
  }

  function suggestSelectors(el) {
    const out = [];
    const a = attrs(el);
    if (a.id && !/\d{3,}/.test(a.id)) out.push(`#${CSS.escape(a.id)}`);
    if (a.dataTestid) out.push(`[data-testid="${a.dataTestid}"]`);
    if (a.ariaLabel) out.push(`${a.tag}[aria-label="${a.ariaLabel}"]`);
    const icon = el.querySelector?.("[data-icon]")?.getAttribute("data-icon") || a.dataIcon;
    if (icon) out.push(`[data-icon="${icon}"]`);
    if (a.role && a.title) out.push(`[role="${a.role}"][title="${a.title}"]`);
    if (a.role) out.push(`[role="${a.role}"]`);
    return out;
  }

  function snapshot(el, events) {
    const r = el.getBoundingClientRect();
    const parents = [];
    let p = el.parentElement;
    for (let i = 0; i < 5 && p && p !== document.body; i += 1, p = p.parentElement) {
      const pa = attrs(p);
      parents.push({ tag: pa.tag, id: pa.id, role: pa.role, ariaLabel: pa.ariaLabel, dataTestid: pa.dataTestid });
    }
    const html = el.outerHTML.replace(/\s+/g, " ");
    return {
      id: U.uid("diag"),
      at: Date.now(),
      url: location.href,
      ...attrs(el),
      text: (el.innerText || "").trim().slice(0, 160),
      dataIcons: wa.iconsOf(el).slice(0, 8),
      rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      viewport: { width: innerWidth, height: innerHeight },
      clickableAncestor: attrs(el.closest(wa.CLICKABLE)),
      parents,
      htmlSummary: html.length > 700 ? `${html.slice(0, 700)}…` : html,
      selectors: suggestSelectors(el),
      events,
    };
  }

  function highlight(el) {
    let box = document.getElementById("waw-diag-hl");
    if (!box) {
      box = document.createElement("div");
      box.id = "waw-diag-hl";
      document.documentElement.appendChild(box);
    }
    if (!el) {
      box.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    box.dataset.label = `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""}${el.getAttribute("aria-label") ? ` “${el.getAttribute("aria-label")}”` : ""}`;
  }

  function stop() {
    if (!session) return;
    const s = session;
    session = null;
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((t) => window.removeEventListener(t, s.onEvent, true));
    window.removeEventListener("mousemove", s.onMove, true);
    window.removeEventListener("keydown", s.onKey, true);
    highlight(null);
    document.getElementById("waw-diag-hint")?.remove();
  }

  /** Inicia captura. Resolve com o registro capturado (ou null se cancelado). */
  function capture({ block = true } = {}) {
    stop();
    return new Promise((resolve) => {
      const hint = U.h(`<div id="waw-diag-hint">🔬 Modo diagnóstico — clique no elemento do WhatsApp que deseja registrar. <b>Esc</b> cancela.${block ? " (o clique não será repassado ao WhatsApp)" : ""}</div>`);
      document.documentElement.appendChild(hint);
      const events = [];
      let target = null;
      const isOurs = (el) => el?.closest?.("#waw-root, #waw-panel, #waw-palette, #waw-modal, #waw-diag-hint");
      const onMove = U.throttle((e) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!isOurs(el)) highlight(el);
      }, 40);
      const onEvent = (e) => {
        if (isOurs(e.target)) return;
        if (e.type === "pointerdown" || (!target && e.type === "mousedown")) target = e.target;
        events.push({ type: e.type, t: Math.round(performance.now()), x: e.clientX, y: e.clientY, target: e.target?.tagName?.toLowerCase(), button: e.button });
        if (block) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        if (e.type === "click") {
          const rec = snapshot(target || e.target, events);
          stop();
          store.state.diag.unshift(rec);
          if (store.state.diag.length > CAP) store.state.diag.length = CAP;
          store.persist("diag", true);
          U.log("[diagnóstico] elemento capturado", rec.selectors);
          resolve(rec);
        }
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          stop();
          resolve(null);
        }
      };
      session = { onEvent, onMove, onKey };
      ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((t) => window.addEventListener(t, onEvent, true));
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("keydown", onKey, true);
    });
  }

  /** Relatório do estado atual da detecção (para suporte/ajustes). */
  function report() {
    const chat = wa.currentChat();
    const more = WAW.lists.findMoreListsButton();
    return {
      at: new Date().toISOString(),
      version: WAW.VERSION,
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: { width: innerWidth, height: innerHeight },
      detected: {
        sidePane: Boolean(wa.sidePane()),
        mainPane: Boolean(wa.mainPane()),
        chatRows: wa.getChatRows().length,
        composer: Boolean(wa.findComposer()),
        sideSearch: Boolean(wa.findSideSearch()),
        nativeRail: Boolean(wa.findNativeRail()),
        currentChat: chat,
        filterChips: WAW.lists.findFilterChips().map((c) => c.text),
        moreListsButton: more ? wa.describe(more.el) : null,
      },
      listsDiagnostic: WAW.lists.getLastDiagnostic(),
      logs: U.getLogs().slice(-80),
    };
  }

  WAW.diagnostic = { capture, stop, report, isCapturing: () => Boolean(session) };
})();
