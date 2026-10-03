/* CDEV WhatsApp — fixar/desafixar conversa pelo menu nativo do WhatsApp.
 * Reproduz o gesto do usuário (menu da conversa → "Fixar conversa").
 * Só clica em item com texto EXATO dentro do menu que acabou de abrir. */
(() => {
  const { util: U, wa, crm } = WAW;

  const PIN = ["fixar conversa", "pin chat", "fixar", "pin"];
  const UNPIN = ["desafixar conversa", "unpin chat", "desafixar", "unpin"];

  function findRowFor(contact) {
    for (const row of wa.getChatRows()) {
      const info = wa.rowInfo(row);
      if (info.jid && contact.jid && info.jid === contact.jid) return row;
      if (U.norm(info.name) === U.norm(contact.name)) {
        const r = crm.resolveByName(info.name);
        if (r.contact?.key === contact.key) return row;
      }
    }
    return null;
  }

  function visibleMenuItems(exclude) {
    const roots = [...document.querySelectorAll("[role='application'], [role='menu'], ul")].filter(
      (r) => wa.visible(r) && !exclude.contains(r) && !r.closest("#pane-side, #waw-panel, #waw-root"),
    );
    const items = [];
    const seen = new Set();
    for (const root of roots) {
      root.querySelectorAll("li, [role='button'], [role='menuitem'], div").forEach((el) => {
        if (seen.has(el) || !wa.visible(el)) return;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.height < 20 || r.height > 70 || r.width < 60 || r.width > 420) return;
        items.push({ el, text: U.norm(el.innerText || el.textContent || "") });
      });
    }
    return items;
  }

  async function waitItems(row, timeout = 1500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const items = visibleMenuItems(row);
      if (items.some((i) => [...PIN, ...UNPIN].includes(i.text))) return items;
      await U.sleep(60);
    }
    return [];
  }

  function closeMenu() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  }

  async function openRowMenu(row) {
    const r = row.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    // 1) Seta do menu que aparece ao passar o mouse.
    row.dispatchEvent(new MouseEvent("mouseover", init));
    row.dispatchEvent(new MouseEvent("mouseenter", { ...init, bubbles: false }));
    await U.sleep(120);
    const chevron = [...row.querySelectorAll("button, [role='button'], span[data-icon]")].find((b) => {
      const label = U.norm(wa.labelOf(b));
      const icon = b.getAttribute("data-icon") || b.querySelector("[data-icon]")?.getAttribute("data-icon") || "";
      return /(menu da conversa|chat menu|abrir o menu|open chat context|mais opcoes)/.test(label) || /^(down|ic-expand-more|chevron-down)/.test(icon);
    });
    if (chevron) {
      wa.realClick(chevron.closest("button, [role='button']") || chevron);
      const items = await waitItems(row, 900);
      if (items.length) return items;
    }
    // 2) Clique com o botão direito (menu de contexto do WhatsApp).
    const target = row.querySelector("[role='gridcell'], [tabindex]") || row;
    target.dispatchEvent(new MouseEvent("contextmenu", { ...init, button: 2 }));
    return waitItems(row, 1200);
  }

  /** pin=true fixa, false desafixa. Retorna {ok, reason}. */
  async function setPinned(contact, pin = true) {
    if (!contact) return { ok: false, reason: "no-contact" };
    let row = findRowFor(contact);
    let searched = false;
    if (!row && contact.name) {
      await wa.setSideSearch(contact.phone || contact.name);
      searched = true;
      for (let i = 0; i < 10 && !row; i += 1) {
        await U.sleep(150);
        row = findRowFor(contact);
      }
    }
    const finish = async (res) => {
      if (searched) await wa.clearSideSearch();
      return res;
    };
    if (!row) return finish({ ok: false, reason: "row-not-found" });
    if (wa.rowMeta(row, contact.name).pinned === pin) return finish({ ok: true, already: true });

    const items = await openRowMenu(row);
    const wanted = pin ? PIN : UNPIN;
    const opposite = pin ? UNPIN : PIN;
    const hit = items.filter((i) => wanted.includes(i.text));
    if (!hit.length) {
      const already = items.some((i) => opposite.includes(i.text));
      closeMenu();
      return finish({ ok: already, already, reason: already ? "" : "menu-item-not-found" });
    }
    // Elemento mais interno com o texto exato; o clique sobe até o item do menu.
    const inner = hit.filter((h) => !hit.some((o) => o.el !== h.el && h.el.contains(o.el)));
    const el = (inner[0] || hit[0]).el.closest("[role='button'], [role='menuitem']") || inner[0].el;
    wa.realClick(el);
    await U.sleep(250);
    crm.log("pin", `${contact.name}: conversa ${pin ? "fixada" : "desafixada"} no WhatsApp`, contact.key);
    return finish({ ok: true });
  }

  WAW.chatmenu = { setPinned, findRowFor };
})();
