/* CDEV WhatsApp — ponte na pagina do CRM (cdev.com.br/control).
 * Pagina <-> (window.postMessage) <-> este content script <-> (runtime) <-> service worker.
 * Nao le nada da pagina alem das mensagens com source "cdev-crm". */
(() => {
  if (window.__cdevBridge) return;
  window.__cdevBridge = true;
  const SRC_PAGE = "cdev-crm";
  const SRC_EXT = "cdev-ext";
  const VERSION = chrome.runtime.getManifest().version;
  let alive = true;

  const toPage = (type, payload = {}) => window.postMessage({ source: SRC_EXT, type, payload }, window.location.origin);

  function toBackground(message) {
    return new Promise((resolve) => {
      if (!alive) return resolve({ ok: false, error: "context" });
      try {
        chrome.runtime.sendMessage(message, (r) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(r || { ok: false });
        });
      } catch (error) {
        // Extensao recarregada/atualizada: esta aba precisa ser recarregada.
        alive = false;
        toPage("gone", { reason: "Extensão atualizada — recarregue a página do CRM." });
        resolve({ ok: false, error: String(error) });
      }
    });
  }

  const ROUTES = {
    hello: "cdev:crm-hello",
    "leads-sync": "cdev:crm-leads",
    "open-chat": "cdev:crm-open",
    "lead-status": "cdev:crm-lead-status",
    ack: "cdev:crm-ack",
    flush: "cdev:crm-flush",
    schedule: "cdev:crm-schedule",
    "schedule-cancel": "cdev:crm-schedule-cancel",
    "schedules-sync": "cdev:crm-schedules",
  };

  window.addEventListener("message", async (e) => {
    if (e.source !== window || !e.data || e.data.source !== SRC_PAGE) return;
    const { type, payload = {} } = e.data;
    const route = ROUTES[type];
    if (!route) return;
    const r = await toBackground({ type: route, payload });
    if (type === "hello") toPage("ready", { version: r.version || VERSION, ok: r.ok });
    else if (type === "open-chat") toPage("open-result", { ok: r.ok !== false, mode: r.mode, message: r.message || r.error || "" });
    else if (type === "schedule" || type === "schedule-cancel") toPage(`${type}-result`, { id: payload.id, ok: r.ok !== false, message: r.message || r.error || "" });
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "cdev:deliver") {
      toPage("event", msg.event || {});
      sendResponse({ ok: true });
    } else if (msg.type === "cdev:open-result") {
      toPage("open-result", msg.payload || {});
      sendResponse({ ok: true });
    } else if (msg.type === "cdev:ping-crm") {
      toPage("ready", { version: VERSION });
      sendResponse({ ok: true });
    }
  });

  // Anuncia a extensao mesmo que a pagina ainda nao tenha mandado "hello".
  const announce = () => toPage("ready", { version: VERSION });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(announce, 50), { once: true });
  else announce();
})();
