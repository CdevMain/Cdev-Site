/* CDEV WhatsApp — Listas nativas do WhatsApp ("Mais listas" → lista específica).
 * Estratégias, em ordem:
 *   1) lista pedida já visível como filtro na barra → clica nela;
 *   2) botão "Mais listas" por aria-label/title;
 *   3) botão sem texto (só ícone) na MESMA linha dos filtros, mais à direita
 *      (a linha é rolada até o fim — filtros de listas personalizadas empurram o botão);
 *   4) hit-test à direita do último filtro visível.
 * Candidatos são pontuados; com confiança baixa não clica e registra diagnóstico. */
(() => {
  const { util: U, wa } = WAW;

  const FILTER_NAMES = ["tudo", "todas", "all", "nao lidas", "unread", "favoritas", "favorites", "grupos", "groups", "rotulos", "labels"];
  const DANGEROUS = /(configura|settings|nova conversa|new chat|mais opcoes|more options|menu|comunidade|community|status|canais|channels|perfil|profile|arquivad|archived|pesquis|search|fechar|close|voltar|back)/;
  const MORE_LABEL = /(mais listas|more lists|ver listas|ver mais listas|todas as listas|all lists|mais filtros|more filters|filtros de conversa|chat filters|listas|lists)/;
  const CLICK = "button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], [tabindex]";
  const POPUP = "[role='menu'], [role='listbox'], [role='dialog'], [role='application'], [data-animate-dropdown-item], [data-animate-modal-popup], ul";

  let lastDiagnostic = null;

  const isFilterChipText = (text) => FILTER_NAMES.some((name) => text === name || new RegExp(`^${name}\\s+\\d+$`).test(text));
  const hasIcon = (el) => Boolean(el.querySelector("svg, [data-icon], img"));
  const inChatList = (el) => Boolean(el.closest("#pane-side"));

  function findFilterChips() {
    const root = document.getElementById("side") || document;
    return [...root.querySelectorAll(CLICK)]
      .filter((el) => wa.visible(el) && !inChatList(el))
      .map((el) => ({ el, rect: el.getBoundingClientRect(), text: U.norm(el.innerText || el.textContent || "") }))
      .filter(({ rect, text }) => rect.top >= 30 && rect.top <= 320 && rect.height >= 20 && rect.height <= 90 && isFilterChipText(text))
      .filter((c, i, a) => a.findIndex((x) => x.el === c.el || x.el.contains(c.el)) === i)
      .sort((a, b) => a.rect.left - b.rect.left);
  }

  /** Contêiner da linha de filtros (ancestral comum dos filtros conhecidos). */
  function findChipRow(chips = findFilterChips()) {
    if (!chips.length) return null;
    const first = chips[0].el;
    const last = chips[chips.length - 1].el;
    let node = first.parentElement;
    for (let i = 0; i < 8 && node; i += 1, node = node.parentElement) {
      if (node.contains(last) && node.getBoundingClientRect().height < 140) {
        // sobe mais um nível se o botão de listas estiver como irmão do contêiner rolável
        const parent = node.parentElement;
        if (parent && parent.getBoundingClientRect().height < 140 && !inChatList(parent)) return { row: node, outer: parent };
        return { row: node, outer: node };
      }
    }
    return null;
  }

  function scrollRowToEnd(row) {
    let n = row;
    for (let i = 0; i < 4 && n; i += 1, n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 4) n.scrollLeft = n.scrollWidth;
    }
  }

  function textOwn(el) {
    const direct = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent || "").join(" ");
    return U.norm(direct || el.innerText || el.textContent || "");
  }

  /** Filtro de lista já visível na barra, com o nome exato. */
  function findVisibleListChip(listName) {
    const wanted = U.norm(listName);
    const info = findChipRow();
    if (!wanted || !info) return null;
    scrollRowToEnd(info.row);
    const found = [...info.outer.querySelectorAll(CLICK)].filter((el) => wa.visible(el) && U.norm(el.innerText || el.textContent || "") === wanted);
    return found.length === 1 ? found[0] : null;
  }

  function findMoreListsButton() {
    const diag = { at: Date.now(), strategy: "", chips: [], candidates: [], decision: "" };
    lastDiagnostic = diag;
    const chips = findFilterChips();
    diag.chips = chips.map((c) => c.text);
    const info = findChipRow(chips);
    const scored = new Map();
    const add = (el, score, reason) => {
      if (!el || !wa.visible(el) || inChatList(el)) return;
      const label = U.norm(wa.labelOf(el));
      if (label && DANGEROUS.test(label) && !MORE_LABEL.test(label)) return;
      const prev = scored.get(el) || { el, score: 0, reasons: [] };
      prev.score += score;
      prev.reasons.push(reason);
      scored.set(el, prev);
    };

    // 2) rótulo acessível
    const side = document.getElementById("side") || document;
    side.querySelectorAll(CLICK).forEach((el) => {
      if (inChatList(el)) return;
      const label = U.norm(wa.labelOf(el));
      if (label && MORE_LABEL.test(label) && !U.norm(el.innerText || "")) add(el, 160, `rótulo “${label}”`);
    });

    // 3) botão só-ícone na linha dos filtros
    if (info) {
      scrollRowToEnd(info.row);
      const rowRect = info.row.getBoundingClientRect();
      const cy = rowRect.top + rowRect.height / 2;
      const iconOnly = [...info.outer.querySelectorAll(CLICK)]
        .filter((el) => wa.visible(el) && !U.norm(el.innerText || el.textContent || "") && hasIcon(el))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return Math.abs(r.top + r.height / 2 - cy) < 26 && r.width <= 90 && r.height <= 90;
        })
        .filter((el, i, a) => !a.some((o) => o !== el && o.contains(el)))
        .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
      iconOnly.forEach((el, i) => {
        const icons = wa.iconsOf(el).join(" ");
        add(el, (i === 0 ? 110 : 40) + (/(chevron|arrow|down|expand|filter|more|list)/.test(icons) ? 40 : 0), i === 0 ? "botão de ícone mais à direita na linha dos filtros" : "botão de ícone na linha dos filtros");
      });
    }

    // 4) hit-test à direita do último elemento com texto na linha
    if (info && !scored.size) {
      const withText = [...info.outer.querySelectorAll(CLICK)].filter((el) => wa.visible(el) && U.norm(el.innerText || "")).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
      const last = withText[0];
      if (last) {
        const r = last.getBoundingClientRect();
        const y = r.top + r.height / 2;
        for (let x = Math.ceil(r.right + 4); x <= Math.min(r.right + 110, innerWidth - 2); x += 3) {
          for (const raw of document.elementsFromPoint(x, y)) {
            const el = raw.closest?.(CLICK);
            if (el && !U.norm(el.innerText || "") && el.getBoundingClientRect().width <= 90) add(el, 70, "hit-test à direita do último filtro");
          }
        }
      }
    }

    const choice = wa.chooseCandidate([...scored.values()], { min: 60, margin: 10 });
    diag.candidates = choice.candidates.map((c) => ({ score: Math.round(c.score), reasons: c.reasons, el: wa.describe(c.el) }));
    if (!choice.ok) {
      diag.decision = choice.best ? `Confiança baixa (${Math.round(choice.best.score)}). Não cliquei.` : info ? "Nenhum botão de ícone na linha dos filtros." : "Linha de filtros (Tudo/Não lidas/Favoritas/Grupos) não encontrada.";
      U.log("[listas]", diag.decision);
      return null;
    }
    diag.decision = `Escolhido com pontuação ${Math.round(choice.best.score)}.`;
    const r = choice.best.el.getBoundingClientRect();
    return { el: choice.best.el, score: choice.best.score, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  const popups = () => [...document.querySelectorAll(POPUP)].filter((el) => wa.visible(el) && !inChatList(el) && !el.closest("#waw-panel, #waw-root, #waw-modal, #waw-palette"));

  async function waitNewPopup(before, timeout = 1600) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const fresh = popups().filter((p) => !before.has(p) && (p.querySelector("li, [role='menuitem'], [role='option'], [role='button'], button") || U.norm(p.innerText)));
      if (fresh.length) return fresh;
      await U.sleep(70);
    }
    return [];
  }

  function findListItem(listName, roots) {
    const wanted = U.norm(listName);
    const hits = [];
    const seen = new Set();
    for (const root of roots) {
      for (const node of [root, ...root.querySelectorAll("li, button, [role='button'], [role='menuitem'], [role='option'], [tabindex], span, div")]) {
        if (seen.has(node) || !wa.visible(node) || inChatList(node)) continue;
        seen.add(node);
        if (textOwn(node) !== wanted) continue;
        const r = node.getBoundingClientRect();
        if (r.height > 110 || r.width > 560) continue;
        hits.push(node);
      }
    }
    const inner = hits.filter((h) => !hits.some((o) => o !== h && h.contains(o)));
    const targets = [...new Set(inner.map((n) => n.closest("li, [role='menuitem'], [role='option'], [role='button'], button") || n))];
    if (targets.length > 1) {
      lastDiagnostic = { ...(lastDiagnostic || {}), listDecision: `Mais de um item com o nome “${listName}”. Não cliquei.` };
      return null;
    }
    return inner[0] || null;
  }

  function clickLikeUser(el, point) {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, view: window, clientX: point?.x ?? r.left + r.width / 2, clientY: point?.y ?? r.top + r.height / 2, button: 0, buttons: 1 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", init));
    el.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("click", { ...init, buttons: 0 }));
  }

  function menuIsOpen() {
    return popups().some((p) => /nova lista|new list|criar lista|create list/.test(U.norm(p.innerText || "")));
  }

  async function openMenu() {
    if (menuIsOpen()) return { ok: true, popups: popups() };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const btn = findMoreListsButton();
      if (!btn) return { ok: false };
      const before = new Set(popups());
      clickLikeUser(btn.el, { x: btn.x, y: btn.y });
      const fresh = await waitNewPopup(before, 1400);
      if (fresh.length) return { ok: true, popups: fresh };
      // Algumas versões só respondem ao .click() nativo.
      if (attempt === 0) {
        HTMLElement.prototype.click.call(btn.el);
        const again = await waitNewPopup(before, 900);
        if (again.length) return { ok: true, popups: again };
      }
    }
    return { ok: false, clicked: true };
  }

  /** Abre o menu "Mais listas" e, se informado, a lista pelo nome exato. */
  async function openLists(listName = "") {
    return wa.withListVisible(async () => {
      const wanted = String(listName || "").trim();
      if (wanted) {
        const chip = findVisibleListChip(wanted);
        if (chip) {
          clickLikeUser(chip);
          return { ok: true, method: "chip" };
        }
      }
      const menu = await openMenu();
      if (!menu.ok && !menu.clicked) return { ok: false, reason: "menu", diagnostic: lastDiagnostic };
      if (!wanted) return menu.ok ? { ok: true } : { ok: false, reason: "menu-not-detected", diagnostic: lastDiagnostic };
      await U.sleep(150);
      const roots = menu.ok ? menu.popups : [document.getElementById("app") || document.body];
      let item = findListItem(wanted, roots) || findListItem(wanted, [document.getElementById("app") || document.body]);
      if (!item) {
        await U.sleep(350);
        item = findListItem(wanted, menu.ok ? popups() : [document.body]);
      }
      if (!item) {
        lastDiagnostic = { ...(lastDiagnostic || {}), listDecision: `Lista “${wanted}” não encontrada no menu.`, menuText: popups().map((p) => (p.innerText || "").slice(0, 300)) };
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
        return { ok: false, reason: "item", diagnostic: lastDiagnostic };
      }
      clickLikeUser(item.closest("li, [role='menuitem'], [role='option'], [role='button'], button") || item);
      await U.sleep(250);
      return { ok: true, method: "menu" };
    });
  }

  WAW.lists = { openLists, findMoreListsButton, findFilterChips, findVisibleListChip, isMenuOpen: menuIsOpen, getLastDiagnostic: () => lastDiagnostic };
})();
