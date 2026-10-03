(() => {
  const { util: U, store, crm } = WAW;

  const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (res) => r(chrome.runtime.lastError ? { ok: false } : res)));

  async function waTab() {
    const r = await send({ type: "waw:open-whatsapp" });
    return r?.tabId;
  }

  async function toWhatsApp(message) {
    const tabId = await waTab();
    if (!tabId) return;
    // O content script pode ainda estar carregando: tenta algumas vezes.
    for (let i = 0; i < 20; i += 1) {
      try {
        await chrome.tabs.sendMessage(tabId, message);
        break;
      } catch {
        await U.sleep(500);
      }
    }
    window.close();
  }

  document.addEventListener("click", async (e) => {
    const go = e.target.closest("[data-go]")?.dataset.go;
    const li = e.target.closest("[data-key]");
    if (go === "wa") {
      await waTab();
      window.close();
    } else if (go === "panel") toWhatsApp({ type: "waw:panel", tab: "dashboard" });
    else if (go === "palette") toWhatsApp({ type: "waw:palette" });
    else if (go === "followup") toWhatsApp({ type: "waw:panel", tab: "followup" });
    else if (go === "options") {
      chrome.runtime.openOptionsPage();
      window.close();
    } else if (li) toWhatsApp({ type: "waw:open-contact", key: li.dataset.key, panel: true });
  });

  (async () => {
    await store.load();
    document.getElementById("ver").textContent = `v${chrome.runtime.getManifest().version}`;
    const fu = crm.followUpItems();
    const items = [...fu.overdue, ...fu.today];
    document.getElementById("count").textContent = fu.overdue.length ? `· ${fu.overdue.length} atrasado(s)` : "";
    document.getElementById("today").innerHTML = items.length
      ? items
          .slice(0, 20)
          .map((i) => `<li data-key="${U.esc(i.contact.key)}" class="${i.due < Date.now() ? "late" : ""}"><b>${U.esc(i.contact.name || U.formatPhone(i.contact.phone))}</b><small>${i.kind === "task" ? "☐" : "🔔"} ${U.esc(i.text)} — ${U.fmtWhen(i.due)}</small></li>`)
          .join("")
      : '<li class="empty">Nenhum retorno para hoje.</li>';
    const st = crm.todayStats();
    document.getElementById("stats").textContent = `Hoje: ${st.opened.length} contatos · ${st.followupsDone || 0} follow-ups · ${(st.inserts || 0) + (st.copies || 0)} mensagens`;
  })();
})();
