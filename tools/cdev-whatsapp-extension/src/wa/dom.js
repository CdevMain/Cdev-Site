/* CDEV WhatsApp — adaptadores para o DOM do WhatsApp Web.
 * Regra geral: preferir id/role/aria/data-* e estrutura; nunca depender só de
 * classes geradas; nunca "clicar no primeiro encontrado" — candidatos são
 * pontuados e só clicamos acima de um limiar de confiança. */
(() => {
  const { util: U } = WAW;

  /* ---------------- básicos ---------------- */
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  const CLICKABLE = "button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], [role='listitem'], [role='row'], [tabindex]";

  function labelOf(el) {
    return [el?.getAttribute?.("aria-label"), el?.getAttribute?.("title"), el?.getAttribute?.("data-tooltip"), el?.getAttribute?.("data-testid")]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const iconsOf = (el) =>
    [...(el?.querySelectorAll?.("[data-icon]") || [])].map((n) => String(n.getAttribute("data-icon") || "").toLowerCase()).filter(Boolean);
  const textOf = (el) => U.norm(el?.innerText || el?.textContent || "");

  /** Clique "como usuário": sequência pointer/mouse + click nativo. */
  function realClick(el, point) {
    if (!el || !visible(el)) return false;
    const target = el;
    const rect = target.getBoundingClientRect();
    const cx = point?.x ?? rect.left + rect.width / 2;
    const cy = point?.y ?? rect.top + rect.height / 2;
    const init = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
    try {
      target.focus?.({ preventScroll: true });
    } catch {
      /* ignore */
    }
    try {
      target.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, isPrimary: true }));
      target.dispatchEvent(new MouseEvent("mousedown", init));
      target.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, isPrimary: true }));
      target.dispatchEvent(new MouseEvent("mouseup", init));
    } catch {
      /* PointerEvent indisponível */
    }
    try {
      HTMLElement.prototype.click.call(target);
      return true;
    } catch {
      try {
        target.dispatchEvent(new MouseEvent("click", init));
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Escolhe um candidato com segurança.
   * scored: [{el, score, reasons}] ; retorna {best, confidence, ok, runnerUp}
   * ok = best.score >= min && (sem empate próximo).
   */
  function chooseCandidate(scored, { min = 60, margin = 15 } = {}) {
    const sorted = scored.filter((c) => Number.isFinite(c.score)).sort((a, b) => b.score - a.score);
    const best = sorted[0] || null;
    const runnerUp = sorted[1] || null;
    const ok = Boolean(best) && best.score >= min && (!runnerUp || best.score - runnerUp.score >= margin || runnerUp.el === best.el || best.el.contains(runnerUp.el) || runnerUp.el.contains(best.el));
    return { best, runnerUp, ok, candidates: sorted.slice(0, 8) };
  }

  function describe(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName?.toLowerCase(),
      role: el.getAttribute?.("role") || "",
      label: labelOf(el),
      text: (el.innerText || "").trim().slice(0, 80),
      icons: iconsOf(el).slice(0, 5),
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    };
  }

  /* ---------------- lista de conversas ---------------- */
  const sidePane = () => document.getElementById("pane-side");

  /**
   * Cards da lista de conversas. O WhatsApp aninha vários elementos com papel de
   * "linha" (listitem > row > cell-frame…); ficamos só com o mais externo de cada
   * card para não duplicar marcadores.
   */
  function getChatRows() {
    const root = sidePane() || document;
    const found = [];
    root.querySelectorAll('[role="listitem"], [role="row"], [data-testid="cell-frame-container"]').forEach((row) => {
      const rect = row.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 38 || rect.height > 130) return;
      if (!root.contains(row) && rect.left > 760) return;
      if (!row.querySelector("span[title], [dir='auto']")) return;
      found.push(row);
    });
    const outer = found.filter((row) => !found.some((other) => other !== row && other.contains(row)));
    // Remove marcadores que ficaram em elementos internos (versões anteriores/re-render).
    for (const row of found) {
      if (outer.includes(row)) continue;
      row.querySelectorAll(":scope > .waw-sdot, :scope > .waw-strip").forEach((n) => n.remove());
      row.classList.remove("waw-row", "waw-rel");
      delete row.dataset.wawStyle;
      delete row.dataset.wawSig;
    }
    return outer;
  }

  /** Metadados visíveis do card: prévia da última mensagem, hora, não lidas, fixada. */
  function rowMeta(row, name = "") {
    const n = U.norm(name);
    const texts = [...row.querySelectorAll("span[title], span[dir='ltr'], span[dir='auto']")]
      .filter((x) => !x.closest(".waw-strip, .waw-sdot"))
      .map((x) => (x.getAttribute("title") || x.textContent || "").trim())
      .filter((t) => t && U.norm(t) !== n);
    const time = texts.find((t) => /^(\d{1,2}:\d{2}(\s?[ap]m)?|ontem|yesterday|\d{1,2}\/\d{1,2}\/\d{2,4}|segunda|terça|quarta|quinta|sexta|sábado|domingo)$/i.test(t)) || "";
    const preview = texts.filter((t) => t !== time && !/^\d+$/.test(t)).slice(-1)[0] || "";
    let unread = 0;
    const badge = [...row.querySelectorAll("[aria-label]")].filter((x) => !x.closest(".waw-strip, .waw-sdot")).find((x) => /(n[aã]o lida|unread)/i.test(x.getAttribute("aria-label") || ""));
    if (badge) unread = Number(U.digits(badge.getAttribute("aria-label")) || U.digits(badge.textContent)) || 1;
    const pinned = Boolean(row.querySelector("[data-icon^='pinned'], [data-icon='pin'], [aria-label*='ixada' i], [aria-label*='pinned' i]"));
    return { preview, time, unread, pinned };
  }

  const NOT_NAME = /^(mensagem|message|reagiu|reacted|digitando|typing|online|visto por último|last seen|foto|photo|vídeo|video|áudio|audio|figurinha|sticker|documento|document)/i;

  function rowInfo(row) {
    const titled = [...row.querySelectorAll("span[title], div[title]")]
      .filter((n) => !n.closest(".waw-strip, .waw-sdot"))
      .map((n) => (n.getAttribute("title") || "").trim())
      .filter((v) => v && v.length < 120 && !NOT_NAME.test(v));
    const texts = [...row.querySelectorAll("span[dir='auto']")].map((n) => (n.textContent || "").trim()).filter((v) => v && v.length < 120);
    const name = titled[0] || texts[0] || "";
    const idNode = row.querySelector("[data-id]");
    const rawId = idNode?.getAttribute("data-id") || "";
    const jid = parseJid(rawId) || (/@(c|g)\.us$/.test(rawId) ? rawId : "");
    const isGroup = Boolean(row.querySelector("[data-icon^='default-group'], [data-icon='group']"));
    return { name, jid, isGroup, phone: /^\+?[\d\s()-]{8,}$/.test(name) ? U.digits(name) : "" };
  }

  /* ---------------- conversa aberta ---------------- */
  const mainPane = () => document.getElementById("main");

  const JID_RE = /^(?:true|false)_([^_]+@(?:c\.us|g\.us|lid|s\.whatsapp\.net|newsletter))(?:_|$)/;
  function parseJid(dataId) {
    const m = JID_RE.exec(String(dataId || ""));
    return m ? m[1] : "";
  }

  function currentHeaderName() {
    const main = mainPane();
    if (!main) return "";
    const header = main.querySelector("header");
    if (!header) return "";
    const byTestId = header.querySelector('[data-testid="conversation-info-header-chat-title"]');
    if (byTestId) return byTestId.textContent.trim();
    const titled = [...header.querySelectorAll("span[dir='auto'], span[title], div[title]")]
      .map((n) => (n.getAttribute("title") || n.textContent || "").trim())
      .filter((v) => v && v.length < 120 && !NOT_NAME.test(v) && !/^(clique|click|toque|tap)/i.test(v));
    return titled[0] || "";
  }

  /** "online" / "digitando…" no cabeçalho da conversa aberta (só existe para a conversa aberta). */
  function currentPresence() {
    const header = mainPane()?.querySelector("header");
    if (!header) return "";
    for (const n of header.querySelectorAll("span[title], span[dir='auto'], span")) {
      const t = U.norm(n.getAttribute("title") || n.textContent || "");
      if (/^(online|digitando|typing|gravando|recording)/.test(t)) return t.startsWith("online") ? "online" : "typing";
    }
    return "";
  }

  /** Ids das mensagens recebidas visíveis na conversa aberta. */
  function incomingIds() {
    const main = mainPane();
    if (!main) return [];
    return [...main.querySelectorAll("[data-id^='false_']")].map((n) => n.getAttribute("data-id"));
  }

  function currentJid() {
    const main = mainPane();
    if (!main) return "";
    const nodes = main.querySelectorAll("[data-id]");
    // Percorre do fim (mensagens mais recentes) até achar um id válido.
    for (let i = nodes.length - 1, n = 0; i >= 0 && n < 60; i -= 1, n += 1) {
      const jid = parseJid(nodes[i].getAttribute("data-id"));
      if (jid) return jid;
    }
    return "";
  }

  function currentChat() {
    const main = mainPane();
    if (!main) return null;
    const name = currentHeaderName();
    if (!name) return null;
    const jid = currentJid();
    const isGroup = /@g\.us$/.test(jid) || Boolean(main.querySelector("header [data-icon^='default-group']"));
    const phone = /@c\.us$/.test(jid) ? U.digits(jid.split("@")[0]) : /^\+?[\d\s()-]{8,}$/.test(name) ? U.digits(name) : "";
    return { name, jid, phone, isGroup };
  }

  /* Datas em data-pre-plain-text: "[14:32, 29/09/2026] Nome: " */
  function parsePrePlain(value) {
    const m = /^\[(\d{1,2}):(\d{2})(?:\s*([AP]M))?,\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]/i.exec(String(value || ""));
    if (!m) return 0;
    let [, hh, mm, ampm, a, b, y] = m;
    let h = Number(hh);
    if (ampm) h = (h % 12) + (/pm/i.test(ampm) ? 12 : 0);
    const year = Number(y.length === 2 ? `20${y}` : y);
    const build = (day, month) => {
      if (month < 1 || month > 12 || day < 1 || day > 31) return 0;
      const t = new Date(year, month - 1, day, h, Number(mm)).getTime();
      // Rejeita datas no futuro (formato interpretado errado).
      return Number.isFinite(t) && t <= Date.now() + 5 * 60000 ? t : 0;
    };
    // O formato segue o idioma do WhatsApp: tenta dia/mês e mês/dia, priorizando o idioma provável.
    const monthFirst = Boolean(ampm) || /^en-us/i.test(document.documentElement.lang || navigator.language);
    const first = monthFirst ? build(Number(b), Number(a)) : build(Number(a), Number(b));
    const second = monthFirst ? build(Number(a), Number(b)) : build(Number(b), Number(a));
    return first || second;
  }

  /** Últimas mensagens de entrada/saída visíveis na conversa aberta. */
  function messageTimes() {
    const main = mainPane();
    if (!main) return { lastIn: 0, lastOut: 0 };
    let lastIn = 0;
    let lastOut = 0;
    const nodes = main.querySelectorAll("[data-pre-plain-text]");
    for (let i = nodes.length - 1, n = 0; i >= 0 && n < 80; i -= 1, n += 1) {
      const node = nodes[i];
      const t = parsePrePlain(node.getAttribute("data-pre-plain-text"));
      if (!t) continue;
      const holder = node.closest("[data-id]");
      const id = holder?.getAttribute("data-id") || "";
      const out = id.startsWith("true_") || Boolean(node.closest(".message-out"));
      const inn = id.startsWith("false_") || Boolean(node.closest(".message-in"));
      if (out && t > lastOut) lastOut = t;
      else if (inn && t > lastIn) lastIn = t;
      if (lastIn && lastOut) break;
    }
    return { lastIn, lastOut };
  }

  /** Último texto recebido visível (usado só quando o usuário pede sugestão). */
  function lastIncomingText() {
    const main = mainPane();
    if (!main) return "";
    const nodes = [...main.querySelectorAll(".message-in, [data-id^='false_']")];
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const txt = nodes[i].querySelector(".copyable-text span[dir], .selectable-text")?.innerText?.trim();
      if (txt) return txt;
    }
    return "";
  }

  /* ---------------- composição ---------------- */
  function findComposer() {
    const main = mainPane();
    if (!main) return null;
    const candidates = [
      ...main.querySelectorAll('footer [contenteditable="true"]'),
      ...main.querySelectorAll('[data-testid="conversation-compose-box-input"]'),
      ...main.querySelectorAll('div[contenteditable="true"][data-tab="10"]'),
      ...main.querySelectorAll('[contenteditable="true"][role="textbox"]'),
    ].filter(visible);
    return candidates[0] || null;
  }

  function composerText() {
    return (findComposer()?.innerText || "").replace(/​/g, "").trim();
  }

  function placeCaretAtEnd(el) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Insere texto no campo de mensagem da conversa atual.
   * NUNCA pressiona Enter nem clica em enviar.
   * mode: "append" (padrão) | "replace"
   */
  async function insertIntoComposer(text, { mode = "append" } = {}) {
    const box = findComposer();
    if (!box) return { ok: false, reason: "no-composer" };
    const value = String(text || "");
    box.focus();
    await U.sleep(20);
    if (mode === "replace") {
      document.execCommand("selectAll", false, null);
    } else {
      placeCaretAtEnd(box);
      if (composerText()) {
        // separa do texto já digitado com uma quebra de linha suave (não envia)
        try {
          document.execCommand("insertLineBreak");
        } catch {
          /* ignore */
        }
      }
    }
    const before = composerText();

    // 1) Colar via ClipboardEvent sintético — o editor (Lexical) trata quebras de linha.
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", value);
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch {
      /* ignore */
    }
    await U.sleep(60);
    const probe = U.norm(value).slice(0, 24);
    if (U.norm(composerText()).includes(probe) && composerText() !== before) return { ok: true, method: "paste" };

    // 2) Fallback: insertText linha a linha com quebra suave.
    const lines = value.split("\n");
    lines.forEach((line, i) => {
      if (line) document.execCommand("insertText", false, line);
      if (i < lines.length - 1) document.execCommand("insertLineBreak");
    });
    await U.sleep(60);
    if (U.norm(composerText()).includes(probe)) return { ok: true, method: "execCommand" };
    return { ok: false, reason: "not-inserted" };
  }

  /* ---------------- busca lateral / abrir contato ---------------- */
  function findSideSearch() {
    const side = document.getElementById("side") || document;
    const candidates = [
      ...side.querySelectorAll('[contenteditable="true"][data-tab="3"]'),
      ...side.querySelectorAll('div[contenteditable="true"][role="textbox"]'),
      ...side.querySelectorAll('input[type="text"], input[role="textbox"], input:not([type])'),
    ].filter(visible);
    return candidates[0] || null;
  }

  async function setSideSearch(query) {
    const box = findSideSearch();
    if (!box) return false;
    box.focus();
    await U.sleep(30);
    if (box.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(box, query);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, query);
    }
    return true;
  }

  async function clearSideSearch() {
    const box = findSideSearch();
    if (!box) return;
    if (box.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(box, "");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      box.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("delete");
    }
  }

  /** Verdadeiro quando a conversa aberta corresponde ao alvo. */
  function isOpen(wanted, jid) {
    if (jid && currentJid() === jid) return true;
    return U.norm(currentHeaderName()) === wanted;
  }

  async function waitOpen(wanted, jid, ms = 900) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (isOpen(wanted, jid)) return true;
      await U.sleep(60);
    }
    return false;
  }

  /**
   * Ativa um card de conversa tentando, em ordem, os gestos que o WhatsApp
   * reconhece: mousedown no título, clique completo no card e Enter com foco.
   * Para assim que a conversa certa aparece no cabeçalho.
   */
  async function activateRow(row, wanted, jid) {
    const title = [...row.querySelectorAll("span[title]")].find((n) => U.norm(n.getAttribute("title")) === wanted) || row.querySelector("span[title], span[dir='auto']");
    const cell = row.querySelector("[role='gridcell']") || row.querySelector("[tabindex='-1'], [tabindex='0']") || row;
    row.scrollIntoView?.({ block: "nearest" });
    const r = (title || cell).getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, view: window, clientX: r.left + Math.min(20, r.width / 2), clientY: r.top + r.height / 2, button: 0, buttons: 1 };
    const attempts = [
      () => title && title.dispatchEvent(new MouseEvent("mousedown", init)),
      () => {
        for (const el of [title, cell]) {
          if (!el) continue;
          el.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new MouseEvent("mousedown", init));
          el.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          el.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
          el.dispatchEvent(new MouseEvent("click", { ...init, buttons: 0 }));
        }
      },
      () => {
        const target = row.matches("[tabindex]") ? row : cell;
        target.focus?.();
        for (const type of ["keydown", "keyup"]) target.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      },
    ];
    for (const [i, attempt] of attempts.entries()) {
      try {
        attempt();
      } catch {
        /* segue para a próxima estratégia */
      }
      if (await waitOpen(wanted, jid, 700)) {
        U.log("[abrir] conversa aberta pela estratégia", i + 1);
        return true;
      }
    }
    return false;
  }

  function findRowsByName(wanted, jid) {
    const rows = getChatRows();
    const exact = rows.filter((row) => {
      const info = rowInfo(row);
      return (jid && info.jid === jid) || U.norm(info.name) === wanted;
    });
    return exact;
  }

  /** Enquanto roda fn, garante a coluna de conversas visível (se estiver recolhida). */
  async function withListVisible(fn) {
    const html = document.documentElement;
    const hidden = html.classList.contains("waw-list-hidden");
    if (hidden) {
      html.classList.add("waw-list-work");
      await U.sleep(80);
    }
    try {
      return await fn();
    } finally {
      if (hidden) setTimeout(() => html.classList.remove("waw-list-work"), 250);
    }
  }

  /**
   * Abre uma conversa pelo nome (ou número) usando a lista e, se preciso, a
   * busca do WhatsApp. Só abre sozinho se houver UM resultado com nome exato,
   * e confere no cabeçalho se a conversa certa abriu.
   */
  async function openChatByName(name, { phone = "", jid = "" } = {}) {
    const wanted = U.norm(name);
    if (!wanted && !phone) return { ok: false, reason: "empty" };
    if (isOpen(wanted, jid)) return { ok: true, already: true };
    return withListVisible(async () => {
      let rows = findRowsByName(wanted, jid);
      if (rows.length > 1 && !jid) return { ok: false, reason: "ambiguous", candidates: rows.length };
      if (rows.length === 1 && (await activateRow(rows[0], wanted, jid))) return { ok: true, method: "list" };

      const queries = [...new Set([name, phone ? U.digits(phone).slice(-11) : ""].filter(Boolean))];
      for (const q of queries) {
        if (!(await setSideSearch(q))) return { ok: false, reason: "no-search" };
        for (let i = 0; i < 14; i += 1) {
          await U.sleep(160);
          rows = findRowsByName(wanted, jid);
          if (rows.length > 1 && !jid) {
            await clearSideSearch();
            return { ok: false, reason: "ambiguous", candidates: rows.length };
          }
          if (rows.length === 1) {
            const ok = await activateRow(rows[0], wanted, jid);
            await U.sleep(150);
            await clearSideSearch();
            if (ok) return { ok: true, method: "search" };
            return { ok: false, reason: "click-failed" };
          }
        }
        await clearSideSearch();
      }
      return { ok: false, reason: "not-found" };
    });
  }

  /**
   * CDEV: abre a conversa de um numero SEM recarregar a pagina, pela busca do WhatsApp.
   * So clica se a busca retornar exatamente UMA conversa individual. Retorna {ok, reason}.
   */
  async function openChatByPhoneSearch(phone) {
    const d = U.digits(phone);
    if (d.length < 10) return { ok: false, reason: "phone" };
    const local = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
    const before = currentHeaderName();
    return withListVisible(async () => {
      for (const q of [local, local.length === 11 ? local.slice(0, 2) + local.slice(3) : ""].filter(Boolean)) {
        if (!(await setSideSearch(q))) return { ok: false, reason: "no-search" };
        let rows = [];
        for (let i = 0; i < 16; i += 1) {
          await U.sleep(170);
          rows = getChatRows().filter((r) => !rowInfo(r).isGroup && rowInfo(r).name);
          if (rows.length === 1) break;
        }
        if (rows.length === 1) {
          const info = rowInfo(rows[0]);
          const ok = await activateRow(rows[0], U.norm(info.name), info.jid);
          await U.sleep(150);
          await clearSideSearch();
          if (ok || (currentHeaderName() && currentHeaderName() !== before)) return { ok: true, method: "search", name: info.name };
          return { ok: false, reason: "click-failed" };
        }
        await clearSideSearch();
        if (rows.length > 1) return { ok: false, reason: "ambiguous" };
      }
      return { ok: false, reason: "not-found" };
    });
  }

  /** Ids das mensagens enviadas visiveis na conversa aberta. */
  function outgoingIds() {
    const main = mainPane();
    if (!main) return [];
    return [...main.querySelectorAll("[data-id^='true_']")].map((n) => n.getAttribute("data-id"));
  }

  /** Texto de uma mensagem pelo data-id. */
  function messageText(dataId) {
    const main = mainPane();
    if (!main || !dataId) return "";
    const node = main.querySelector(`[data-id="${CSS.escape(dataId)}"]`);
    return (node?.querySelector(".copyable-text span[dir], .selectable-text")?.innerText || "").trim();
  }

  /* ---------------- rail nativo ---------------- */
  function findNativeRail() {
    const iconNames = ["chat", "chats-outline", "chats-filled", "chat-outline", "status-v3", "status-v3-unread", "status-outline", "newsletter-outline", "newsletter", "community-outline"];
    const icons = [...document.querySelectorAll("[data-icon]")].filter((el) => iconNames.includes(el.getAttribute("data-icon") || ""));
    for (const icon of icons) {
      let node = icon.parentElement;
      for (let i = 0; i < 10 && node; i += 1) {
        const rect = node.getBoundingClientRect();
        if (node.querySelectorAll("button, [role='button']").length >= 3 && rect.width > 36 && rect.width < 120 && rect.height > 180) return node;
        node = node.parentElement;
      }
    }
    const nav = document.querySelector("header [role='tablist'], nav");
    if (nav) {
      const rect = nav.getBoundingClientRect();
      if (rect.width < 140 && rect.height > 180) return nav;
    }
    return null;
  }

  WAW.wa = {
    visible,
    CLICKABLE,
    labelOf,
    iconsOf,
    textOf,
    realClick,
    chooseCandidate,
    describe,
    sidePane,
    mainPane,
    getChatRows,
    rowInfo,
    rowMeta,
    currentPresence,
    incomingIds,
    parseJid,
    currentChat,
    currentHeaderName,
    currentJid,
    parsePrePlain,
    messageTimes,
    lastIncomingText,
    findComposer,
    composerText,
    insertIntoComposer,
    findSideSearch,
    setSideSearch,
    clearSideSearch,
    openChatByName,
    openChatByPhoneSearch,
    outgoingIds,
    messageText,
    withListVisible,
    findNativeRail,
  };
})();
