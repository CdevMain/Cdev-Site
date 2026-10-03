/* CDEV WhatsApp — service worker (MV3).
 * Responsável por: abas (abrir/reutilizar/listar/ativar), lembretes com
 * chrome.alarms + notificações, badge de pendências e abertura das opções. */

const KEYS = { config: "waw:config", contacts: "waw:contacts" };
const WA_URL = "https://web.whatsapp.com/";
const unwrap = (v) => (v && typeof v === "object" && "data" in v && "w" in v ? v.data : v);

/* ------------------------------------------------------------------ */
/* Abas                                                               */
/* ------------------------------------------------------------------ */
function normalizeComparableUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return String(rawUrl || "");
  }
}

function isWhatsAppWebUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "") === "web.whatsapp.com";
  } catch {
    return false;
  }
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
}

async function getConfig() {
  const r = await chrome.storage.local.get(KEYS.config);
  return unwrap(r[KEYS.config]) || {};
}

async function openOrReuseTab(url, reuseExistingTab, senderTabId) {
  const normalized = normalizeComparableUrl(url);
  const tabs = await chrome.tabs.query({});
  if (reuseExistingTab) {
    const exact = tabs.find((t) => t.id != null && normalizeComparableUrl(t.url || "") === normalized);
    if (exact) {
      await focusTab(exact);
      return { reused: true, tabId: exact.id, mode: "exact" };
    }
    if (isWhatsAppWebUrl(url)) {
      const wa = tabs.filter((t) => t.id != null && isWhatsAppWebUrl(t.url || ""));
      const preferred = wa.find((t) => t.id === senderTabId) || wa.find((t) => t.active) || wa[0];
      if (preferred) {
        await chrome.tabs.update(preferred.id, { active: true, url });
        if (preferred.windowId != null) await chrome.windows.update(preferred.windowId, { focused: true });
        return { reused: true, tabId: preferred.id, mode: "whatsapp" };
      }
    }
  }
  const created = await chrome.tabs.create({ url });
  if (created.windowId != null) await chrome.windows.update(created.windowId, { focused: true });
  return { reused: false, tabId: created.id ?? null, mode: "new" };
}

/** Garante uma aba do WhatsApp (sem duplicar, se configurado). */
async function ensureWhatsAppTab(url = WA_URL) {
  const cfg = await getConfig();
  const reuse = cfg.features?.reuseWhatsAppTab !== false;
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (reuse && tabs.length) {
    const t = tabs.find((x) => x.active) || tabs[0];
    if (url !== WA_URL) await chrome.tabs.update(t.id, { url });
    await focusTab(t);
    return t;
  }
  const t = await chrome.tabs.create({ url });
  if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
  return t;
}

async function listRelatedTabs(hosts = []) {
  const wanted = new Set(
    hosts
      .map((h) => {
        try {
          return new URL(/^https?:\/\//i.test(h) ? h : `https://${h}`).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => {
      if (!t.url) return false;
      if (isWhatsAppWebUrl(t.url)) return true;
      try {
        return wanted.has(new URL(t.url).hostname.replace(/^www\./, ""));
      } catch {
        return false;
      }
    })
    .map((t) => ({ id: t.id, windowId: t.windowId, title: t.title, url: t.url, active: t.active, favIconUrl: t.favIconUrl || "", isWhatsApp: isWhatsAppWebUrl(t.url) }))
    .sort((a, b) => Number(b.isWhatsApp) - Number(a.isWhatsApp));
}

async function sendToWhatsApp(message) {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  let delivered = false;
  for (const t of tabs) {
    try {
      await chrome.tabs.sendMessage(t.id, message);
      delivered = true;
    } catch {
      /* aba sem content script (carregando) */
    }
  }
  return { delivered, tabs };
}

/* ------------------------------------------------------------------ */
/* Lembretes                                                          */
/* ------------------------------------------------------------------ */
const ALARM_PREFIX = "waw-rem|";
const firedRecently = new Map(); // alarmName -> due (evita notificar duas vezes)

async function loadContacts() {
  const r = await chrome.storage.local.get(KEYS.contacts);
  return unwrap(r[KEYS.contacts]) || {};
}

async function rescheduleReminders() {
  const contacts = await loadContacts();
  const existing = await chrome.alarms.getAll();
  const wanted = new Map();
  const now = Date.now();
  for (const c of Object.values(contacts)) {
    if (!c || c.state === "archived") continue;
    for (const r of c.reminders || []) {
      if (r.done || !Number.isFinite(r.due)) continue;
      const name = `${ALARM_PREFIX}${c.key}|${r.id}`;
      // Lembretes já vencidos disparam em 5s (uma vez por sessão do worker).
      const when = r.due > now ? r.due : firedRecently.get(name) === r.due ? null : now + 5000;
      if (when) wanted.set(name, when);
    }
  }
  for (const a of existing) {
    if (!a.name.startsWith(ALARM_PREFIX)) continue;
    if (!wanted.has(a.name)) await chrome.alarms.clear(a.name);
    else if (Math.abs(a.scheduledTime - wanted.get(a.name)) < 1000) wanted.delete(a.name);
  }
  for (const [name, when] of [...wanted.entries()].slice(0, 400)) {
    await chrome.alarms.create(name, { when });
  }
  await updateBadge(contacts);
}

async function updateBadge(contacts) {
  const c = contacts || (await loadContacts());
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  let n = 0;
  for (const x of Object.values(c)) {
    if (!x || x.state === "archived") continue;
    for (const r of x.reminders || []) if (!r.done && r.due <= endOfToday.getTime()) n += 1;
  }
  await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  await chrome.action.setBadgeText({ text: n ? String(Math.min(n, 99)) : "" });
}

async function fireReminder(alarmName) {
  const [, key, id] = alarmName.split("|");
  const contacts = await loadContacts();
  const c = contacts[key];
  const r = c?.reminders?.find((x) => x.id === id);
  if (!r || r.done) return;
  firedRecently.set(alarmName, r.due);
  const cfg = await getConfig();
  if (cfg.features?.notifications !== false) {
    chrome.notifications.create(alarmName, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `🔔 ${c.name || "Lembrete"}`,
      message: `${r.text}${c.company ? ` — ${c.company}` : ""}`,
      buttons: [{ title: "Abrir conversa" }, { title: "Adiar 1 hora" }],
      priority: 2,
      requireInteraction: true,
    });
  }
  const { delivered } = await sendToWhatsApp({ type: "waw:reminder-fired", key, id });
  if (!delivered) playOffscreen("reminder", cfg);
  await updateBadge(contacts);
}

async function openContactFromNotification(key) {
  const contacts = await loadContacts();
  const c = contacts[key];
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length) {
    const t = tabs.find((x) => x.active) || tabs[0];
    await focusTab(t);
    try {
      await chrome.tabs.sendMessage(t.id, { type: "waw:open-contact", key, panel: true });
      return;
    } catch {
      /* segue para abrir por telefone */
    }
  }
  const phone = c?.phone && !c.isGroup ? String(c.phone).replace(/\D+/g, "") : "";
  await ensureWhatsAppTab(phone ? `https://web.whatsapp.com/send?phone=${phone}` : WA_URL);
}

async function snoozeFromNotification(key, id, minutes) {
  const { delivered } = await sendToWhatsApp({ type: "waw:snooze", key, id, minutes });
  if (delivered) return;
  // Nenhuma aba do WhatsApp aberta: edita o armazenamento diretamente.
  const raw = (await chrome.storage.local.get(KEYS.contacts))[KEYS.contacts];
  const contacts = unwrap(raw) || {};
  const r = contacts[key]?.reminders?.find((x) => x.id === id);
  if (!r) return;
  r.due = Math.max(Date.now(), r.due) + minutes * 60000;
  await chrome.storage.local.set({ [KEYS.contacts]: { w: "background", t: Date.now(), data: contacts } });
}

/* ------------------------------------------------------------------ */
/* Som fora do WhatsApp (documento offscreen)                         */
/* ------------------------------------------------------------------ */
async function playOffscreen(kind, cfg) {
  const c = cfg || (await getConfig());
  if (c.features?.sounds === false || !chrome.offscreen) return;
  try {
    const has = chrome.runtime.getContexts ? (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length > 0 : false;
    if (!has) await chrome.offscreen.createDocument({ url: "offscreen/offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Tocar o som dos lembretes quando o WhatsApp Web não está aberto." });
    await chrome.runtime.sendMessage({ type: "waw:offscreen-sound", kind, volume: c.features?.soundVolume ?? 0.6 });
  } catch (error) {
    console.warn("[CDEV WhatsApp] som offscreen", error);
  }
}

/** Notificação do Chrome pedida pelo content script (seguir contato). */
async function notify({ id, title, message, key, sticky }) {
  const cfg = await getConfig();
  if (cfg.features?.notifications === false) return;
  chrome.notifications.create(`waw-n|${key}|${id}|${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: String(title || "CDEV WhatsApp").slice(0, 80),
    message: String(message || "").slice(0, 200),
    requireInteraction: Boolean(sticky),
    priority: 2,
    silent: false,
  });
}


/* ------------------------------------------------------------------ */
/* CDEV CRM (cdev.com.br/control) <-> WhatsApp Web                    */
/* A aba do CRM fala com src/bridge/crm-bridge.js; o WhatsApp com      */
/* src/cdev/link.js. Eventos (enviada/resposta/status) ficam numa fila */
/* ate o CRM confirmar (ack) que gravou no banco.                      */
/* ------------------------------------------------------------------ */
const CDEV = { leads: "cdev:leads", pending: "cdev:pending", outbox: "cdev:outbox", meta: "cdev:meta" };
const CRM_PATTERNS = ["https://cdev.com.br/*", "https://www.cdev.com.br/*", "http://localhost/*", "http://127.0.0.1/*"];
const OUTBOX_CAP = 300;

const cdevGet = async (k, fallback) => (await chrome.storage.local.get(k))[k] ?? fallback;
const cdevSet = (k, v) => chrome.storage.local.set({ [k]: v });

async function crmTabs() {
  const tabs = await chrome.tabs.query({ url: CRM_PATTERNS });
  return tabs.filter((t) => /\/control/.test(t.url || ""));
}

async function sendToCrm(message) {
  let delivered = false;
  for (const t of await crmTabs()) {
    try {
      await chrome.tabs.sendMessage(t.id, message);
      delivered = true;
    } catch {
      /* aba sem a ponte (carregando ou recarregar) */
    }
  }
  return delivered;
}

/** Leads vindos do CRM, indexados pela chave do telefone (DDD + 8 ultimos digitos). */
async function cdevSaveLeads(payload) {
  const byKey = {};
  const byId = {};
  for (const l of payload.leads || []) {
    if (!l?.id) continue;
    byId[l.id] = l;
    if (l.key) byKey[l.key] = l.id;
    if (l.alt) byKey[l.alt] = byKey[l.alt] || l.id;
  }
  await cdevSet(CDEV.leads, { byKey, byId, at: payload.at || Date.now(), crmUrl: payload.crmUrl || "" });
  await sendToWhatsApp({ type: "cdev:leads-updated" });
  return { count: Object.keys(byId).length };
}

/** Abre a conversa pedida pelo CRM: sem recarregar se o WhatsApp Web ja estiver aberto. */
async function cdevOpen(p, senderTab) {
  const digits = String(p.phone || "").replace(/\D+/g, "");
  if (digits.length < 10) return { ok: false, message: "telefone inválido" };
  const pending = await cdevGet(CDEV.pending, {});
  for (const [k, v] of Object.entries(pending)) if (Date.now() - (v.at || 0) > 6 * 3600000) delete pending[k];
  const entry = { key: p.key || "", phone: digits, leadId: p.leadId || "", messageId: p.messageId || "", text: p.text || "", lead: p.lead || null, at: Date.now(), crmTabId: senderTab?.id ?? null };
  pending[entry.key || digits] = entry;
  await cdevSet(CDEV.pending, pending);

  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  const tab = tabs.find((t) => t.active) || tabs[0];
  if (tab) {
    try {
      await focusTab(tab);
      const r = await chrome.tabs.sendMessage(tab.id, { type: "cdev:open-chat", ...entry });
      if (r?.ok) return { ok: true, mode: "same-tab" };
      if (r && r.reason !== "need-reload") return { ok: false, message: r.message || "não consegui abrir a conversa" };
    } catch {
      /* content script ainda nao carregou: cai para a URL */
    }
  }
  entry.viaUrl = true;
  pending[entry.key || digits] = entry;
  await cdevSet(CDEV.pending, pending);
  const url = `https://web.whatsapp.com/send?phone=${digits}${entry.text ? `&text=${encodeURIComponent(entry.text)}` : ""}`;
  if (tab) {
    await chrome.tabs.update(tab.id, { url, active: true });
    await focusTab(tab);
  } else {
    const t = await chrome.tabs.create({ url });
    if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
  }
  return { ok: true, mode: "url" };
}

async function cdevEnqueue(ev) {
  const box = await cdevGet(CDEV.outbox, []);
  if (!box.some((x) => x.id === ev.id)) box.push({ ...ev, queuedAt: Date.now(), tries: 0 });
  await cdevSet(CDEV.outbox, box.slice(-OUTBOX_CAP));
  await cdevBadge(box.length);
  await cdevFlush();
}

let lastFlush = 0;
async function cdevFlush(force = false) {
  const box = await cdevGet(CDEV.outbox, []);
  if (!box.length) return { sent: 0 };
  const now = Date.now();
  if (!force && now - lastFlush < 400) return { sent: 0 };
  lastFlush = now;
  // Reentrega o que ainda nao teve ack depois de 60s.
  const due = box.filter((e) => force || !e.sentAt || now - e.sentAt > 60000);
  if (!due.length) return { sent: 0 };
  let sent = 0;
  for (const ev of due) {
    const ok = await sendToCrm({ type: "cdev:deliver", event: ev });
    if (!ok) break;
    ev.sentAt = now;
    ev.tries = (ev.tries || 0) + 1;
    sent += 1;
  }
  await cdevSet(CDEV.outbox, box);
  return { sent };
}

async function cdevAck(id) {
  if (/^sched:/.test(id || "")) {
    const sid = id.split(":")[1];
    const all = await cdevGet("cdev:schedules", {});
    if (all[sid]) {
      all[sid].crmConfirmed = true;
      await cdevSet("cdev:schedules", all);
    }
  }
  const box = (await cdevGet(CDEV.outbox, [])).filter((e) => e.id !== id);
  await cdevSet(CDEV.outbox, box);
  await cdevBadge(box.length);
}

async function cdevBadge(n) {
  // So mostra a fila do CRM quando nao ha lembretes no badge.
  const text = await chrome.action.getBadgeText({});
  if (n && !text) {
    await chrome.action.setBadgeBackgroundColor({ color: "#e07b24" });
    await chrome.action.setBadgeText({ text: "↑" });
  } else if (!n && text === "↑") await chrome.action.setBadgeText({ text: "" });
}

async function cdevStatus() {
  const [leads, box, pending, meta] = await Promise.all([cdevGet(CDEV.leads, null), cdevGet(CDEV.outbox, []), cdevGet(CDEV.pending, {}), cdevGet(CDEV.meta, {})]);
  const tabs = await crmTabs();
  return { leads: leads ? Object.keys(leads.byId || {}).length : 0, leadsAt: leads?.at || 0, crmUrl: leads?.crmUrl || "", outbox: box.length, pending: Object.keys(pending).length, crmOpen: tabs.length > 0, lastHello: meta.lastHello || 0 };
}

function cdevHandle(message, sender) {
  switch (message.type) {
    case "cdev:crm-hello":
      return (async () => {
        await cdevSet(CDEV.meta, { ...(await cdevGet(CDEV.meta, {})), lastHello: Date.now(), crmUrl: sender?.tab?.url || "" });
        setTimeout(() => cdevFlush(true), 300);
        return { version: chrome.runtime.getManifest().version };
      })();
    case "cdev:crm-leads":
      return cdevSaveLeads(message.payload || {});
    case "cdev:crm-open":
      return cdevOpen(message.payload || {}, sender?.tab);
    case "cdev:crm-lead-status":
      return (async () => {
        const store = await cdevGet(CDEV.leads, null);
        const p = message.payload || {};
        if (store?.byId?.[p.id]) {
          Object.assign(store.byId[p.id], { status: p.status, statusLabel: p.statusLabel });
          await cdevSet(CDEV.leads, store);
        }
        await sendToWhatsApp({ type: "cdev:lead-status", ...p });
        return {};
      })();
    case "cdev:crm-ack":
      return cdevAck(message.payload?.id).then(() => ({}));
    case "cdev:crm-flush":
      return cdevFlush(true);
    case "cdev:event":
      return cdevEnqueue(message.event || {}).then(() => ({}));
    case "cdev:pending-done":
      return (async () => {
        const pending = await cdevGet(CDEV.pending, {});
        delete pending[message.key];
        await cdevSet(CDEV.pending, pending);
        return {};
      })();
    case "cdev:open-result":
      return (async () => {
        const tabId = message.crmTabId;
        if (tabId != null) {
          try {
            await chrome.tabs.sendMessage(tabId, { type: "cdev:open-result", payload: message.payload || {} });
          } catch {
            /* CRM fechado */
          }
        }
        return {};
      })();
    case "cdev:status":
      return cdevStatus();
    case "cdev:crm-schedule":
      return schedUpsert(message.payload || {}, "crm");
    case "cdev:crm-schedule-cancel":
      return schedCancel(message.payload?.id, "crm");
    case "cdev:crm-schedules":
      return schedReconcile(message.payload?.items || []);
    case "cdev:wa-schedule":
      return schedUpsert(message.payload || {}, "whatsapp");
    case "cdev:wa-schedule-cancel":
      return schedCancel(message.payload?.id, "whatsapp");
    case "cdev:schedules-list":
      return schedLoad().then((all) => ({ items: Object.values(all).sort((a, b) => a.at - b.at) }));
    case "cdev:schedule-run-now":
      return (async () => {
        const all = await schedLoad();
        if (all[message.id]) {
          all[message.id].at = Date.now();
          all[message.id].tries = 0;
          await schedSave(all);
        }
        await schedRun(message.id);
        return {};
      })();
    case "cdev:open-crm":
      return (async () => {
        const tabs = await crmTabs();
        if (tabs[0]) await focusTab(tabs[0]);
        else {
          const leads = await cdevGet(CDEV.leads, null);
          await chrome.tabs.create({ url: message.url || leads?.crmUrl || "https://cdev.com.br/control" });
        }
        return {};
      })();
    default:
      return null;
  }
}


/* ---------------- Agendamento de mensagens (CRM ou WhatsApp) ---------------- */
const SCHED_KEY = "cdev:schedules";
const SCHED_PREFIX = "cdev-sched|";
let lastScheduledSendAt = 0;
let schedRunning = false;

const schedLoad = () => cdevGet(SCHED_KEY, {});
const schedSave = (all) => cdevSet(SCHED_KEY, all);
async function cdevCfg() {
  const c = (await getConfig()).cdev || {};
  return { enabled: c.enabled !== false, scheduleEnabled: c.scheduleEnabled !== false, missedWindowMin: Number(c.missedWindowMin) || 180, gapSec: Number(c.gapSec) || 25 };
}

async function schedArm(item) {
  await chrome.alarms.clear(SCHED_PREFIX + item.id);
  if (item.status === "scheduled") await chrome.alarms.create(SCHED_PREFIX + item.id, { when: Math.max(Date.now() + 2000, item.at) });
}

/** Cria/atualiza um agendamento. source: "crm" | "whatsapp" */
async function schedUpsert(p, source) {
  const at = Number(p.at) || Date.parse(p.at);
  const digits = String(p.phone || "").replace(/\D+/g, "");
  if (!p.id || !Number.isFinite(at)) return { ok: false, message: "agendamento inválido" };
  if (digits.length < 10 && !p.contactKey) return { ok: false, message: "telefone inválido" };
  if (!String(p.text || "").trim()) return { ok: false, message: "mensagem vazia" };
  const all = await schedLoad();
  const prev = all[p.id];
  if (prev && ["sent", "running"].includes(prev.status)) return { ok: true, status: prev.status };
  all[p.id] = {
    ...(prev || {}),
    id: p.id, at, text: String(p.text), phone: digits, key: p.key || "", leadId: p.leadId || "", contactKey: p.contactKey || prev?.contactKey || "",
    name: p.name || p.lead?.company || prev?.name || "", lead: p.lead || prev?.lead || null,
    source: prev?.source || source, crmConfirmed: source === "crm" || Boolean(prev?.crmConfirmed),
    status: "scheduled", tries: 0, error: "", createdAt: prev?.createdAt || Date.now(), updatedAt: Date.now(),
  };
  // Limpa historico antigo (enviados/cancelados ha mais de 14 dias).
  for (const [k, v] of Object.entries(all)) if (v.status !== "scheduled" && Date.now() - (v.updatedAt || 0) > 14 * 86400000) delete all[k];
  await schedSave(all);
  await schedArm(all[p.id]);
  if (source === "whatsapp" && all[p.id].leadId) await cdevEnqueue({ type: "scheduled", id: `sched:${p.id}:${at}`, scheduleId: p.id, leadId: all[p.id].leadId, phone: digits, text: all[p.id].text, at: new Date(at).toISOString() });
  await sendToWhatsApp({ type: "cdev:schedules-updated" });
  return { ok: true, status: "scheduled" };
}

async function schedCancel(id, source) {
  const all = await schedLoad();
  const it = all[id];
  if (!it) return { ok: true };
  if (it.status === "sent") return { ok: false, message: "já foi enviada" };
  it.status = "cancelled";
  it.updatedAt = Date.now();
  await schedSave(all);
  await chrome.alarms.clear(SCHED_PREFIX + id);
  if (source === "whatsapp" && it.leadId) await cdevEnqueue({ type: "schedule-cancelled", id: `unsched:${id}`, scheduleId: id, leadId: it.leadId });
  await sendToWhatsApp({ type: "cdev:schedules-updated" });
  return { ok: true };
}

/** O CRM manda a lista completa de mensagens AGENDADAS: cria as que faltam e cancela as removidas no CRM. */
async function schedReconcile(items = []) {
  const all = await schedLoad();
  const ids = new Set(items.map((i) => i.id));
  for (const i of items) {
    const cur = all[i.id];
    const at = Date.parse(i.at);
    if (!cur || (cur.status === "scheduled" && (cur.at !== at || cur.text !== i.text))) await schedUpsert(i, "crm");
  }
  const fresh = await schedLoad();
  let changed = false;
  for (const it of Object.values(fresh)) {
    if (it.status === "scheduled" && it.leadId && it.crmConfirmed && !ids.has(it.id)) {
      it.status = "cancelled";
      it.error = "cancelada no CRM";
      it.updatedAt = Date.now();
      await chrome.alarms.clear(SCHED_PREFIX + it.id);
      changed = true;
    }
  }
  if (changed) {
    await schedSave(fresh);
    await sendToWhatsApp({ type: "cdev:schedules-updated" });
  }
  return { count: items.length };
}

async function schedFinish(id, patch, notifyText) {
  const all = await schedLoad();
  const it = all[id];
  if (!it) return;
  Object.assign(it, patch, { updatedAt: Date.now() });
  await schedSave(all);
  await sendToWhatsApp({ type: "cdev:schedules-updated" });
  if (notifyText) notify({ id: `sched|${id}`, title: notifyText.title, message: notifyText.message, key: it.contactKey || "", sticky: patch.status === "failed" });
}

async function schedFail(it, error) {
  await schedFinish(it.id, { status: "failed", error }, { title: `⚠️ Agendada não enviada: ${it.name || it.phone}`, message: error });
  if (it.leadId) await cdevEnqueue({ type: "schedule-failed", id: `schedfail:${it.id}:${Date.now()}`, scheduleId: it.id, leadId: it.leadId, error });
}

async function schedRetry(it, ms, reason, countTry = true) {
  const all = await schedLoad();
  const cur = all[it.id];
  if (!cur || cur.status !== "scheduled") return;
  if (countTry) cur.tries = (cur.tries || 0) + 1;
  cur.error = reason;
  cur.updatedAt = Date.now();
  await schedSave(all);
  await chrome.alarms.create(SCHED_PREFIX + it.id, { when: Date.now() + ms });
}

/** Dispara um agendamento: abre a conversa no WhatsApp Web, cola o texto e envia. */
async function schedRun(id) {
  const cfg = await cdevCfg();
  const all = await schedLoad();
  const it = all[id];
  if (!it || it.status !== "scheduled") return;
  if (!cfg.enabled || !cfg.scheduleEnabled) return schedRetry(it, 10 * 60000, "agendamento pausado nas opções", false);
  if (Date.now() - it.at > cfg.missedWindowMin * 60000) return schedFail(it, `horário perdido (passou ${Math.round((Date.now() - it.at) / 60000)} min; o Chrome/PC estava fechado?)`);
  if ((it.tries || 0) >= 12) return schedFail(it, it.error || "não consegui enviar depois de várias tentativas");
  if (schedRunning) return schedRetry(it, 15000, "outro envio em andamento", false);
  const wait = lastScheduledSendAt + cfg.gapSec * 1000 - Date.now();
  if (wait > 0) return schedRetry(it, wait + 500, "intervalo entre envios", false);

  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  let tab = tabs.find((t) => t.active) || tabs[0];
  if (!tab) {
    await chrome.tabs.create({ url: WA_URL, active: false });
    return schedRetry(it, 45000, "abrindo o WhatsApp Web");
  }
  schedRunning = true;
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: "cdev:run-schedule", item: it }).catch((e) => ({ ok: false, reason: "no-script", message: String(e) }));
    if (r?.ok) {
      lastScheduledSendAt = Date.now();
      await schedFinish(id, { status: "sent", sentAt: Date.now(), msgId: r.msgId || "", error: "" }, { title: `✅ Mensagem agendada enviada`, message: `${it.name || it.phone}: ${it.text.slice(0, 120)}` });
    } else if (r?.reason === "need-reload") {
      const all2 = await schedLoad();
      if (all2[id]) {
        all2[id].reloadedAt = Date.now();
        await schedSave(all2);
      }
      await chrome.tabs.update(tab.id, { url: `https://web.whatsapp.com/send?phone=${it.phone}` });
      await schedRetry(it, 25000, "abrindo a conversa pelo número");
    } else if (["busy", "no-script", "loading"].includes(r?.reason)) {
      await schedRetry(it, 30000, r.message || r.reason);
    } else {
      await schedFail(it, r?.message || r?.reason || "falha desconhecida");
    }
  } finally {
    schedRunning = false;
  }
}

async function schedRearmAll() {
  const all = await schedLoad();
  for (const it of Object.values(all)) if (it.status === "scheduled") await schedArm(it);
}

chrome.alarms.create("cdev-flush", { periodInMinutes: 1 });
schedRearmAll();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(ALARM_PREFIX)) fireReminder(alarm.name);
  else if (alarm.name === "cdev-flush") cdevFlush();
  else if (alarm.name.startsWith(SCHED_PREFIX)) schedRun(alarm.name.slice(SCHED_PREFIX.length));
  else if (alarm.name === "waw-tick") updateBadge();
});

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId.startsWith("waw-n|")) {
    chrome.notifications.clear(notifId);
    openContactFromNotification(notifId.split("|")[1]);
    return;
  }
  if (!notifId.startsWith(ALARM_PREFIX)) return;
  const [, key] = notifId.split("|");
  chrome.notifications.clear(notifId);
  openContactFromNotification(key);
});

chrome.notifications.onButtonClicked.addListener((notifId, index) => {
  if (!notifId.startsWith(ALARM_PREFIX)) return;
  const [, key, id] = notifId.split("|");
  chrome.notifications.clear(notifId);
  if (index === 0) openContactFromNotification(key);
  else snoozeFromNotification(key, id, 60);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[KEYS.contacts] || changes[KEYS.config])) rescheduleReminders();
});

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create("waw-tick", { periodInMinutes: 5 });
  rescheduleReminders();
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("waw-tick", { periodInMinutes: 5 });
  rescheduleReminders();
});

/* ------------------------------------------------------------------ */
/* Mensagens                                                          */
/* ------------------------------------------------------------------ */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;
  const reply = (p) => p.then((r) => sendResponse({ ok: true, ...r })).catch((e) => sendResponse({ ok: false, error: String(e) }));
  if (message.type.startsWith("cdev:")) {
    const p = cdevHandle(message, sender);
    if (!p) return;
    p.then((r) => sendResponse({ ok: r?.ok !== false, ...(r || {}) })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  switch (message.type) {
    case "WAQ_OPEN_URL": // compatibilidade v1.x
    case "waw:open-url": {
      const url = String(message.url || "");
      if (!/^https?:\/\//i.test(url)) {
        sendResponse({ ok: false, error: "invalid_url" });
        return;
      }
      reply(openOrReuseTab(url, message.reuseExistingTab !== false, sender?.tab?.id));
      return true;
    }
    case "waw:open-whatsapp":
      reply(ensureWhatsAppTab(message.url || WA_URL).then((t) => ({ tabId: t.id })));
      return true;
    case "waw:open-options":
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return;
    case "waw:list-tabs":
      reply(listRelatedTabs(message.hosts || []).then((tabs) => ({ tabs })));
      return true;
    case "waw:activate-tab":
      reply(chrome.tabs.get(message.tabId).then(focusTab).then(() => ({})));
      return true;
    case "waw:load-pdf": {
      const tabId = sender?.tab?.id;
      if (tabId == null) {
        sendResponse({ ok: false, error: "no-tab" });
        return;
      }
      reply(chrome.scripting.executeScript({ target: { tabId, frameIds: [sender.frameId ?? 0] }, files: ["lib/jspdf.umd.min.js", "src/pdf/engine.js"] }).then(() => ({})));
      return true;
    }
    case "waw:pdf-preview": {
      const id = `p${Date.now()}`;
      reply(
        chrome.storage.session
          .set({ [`waw:preview:${id}`]: { dataUrl: message.dataUrl, name: message.name } })
          .then(() => chrome.tabs.create({ url: chrome.runtime.getURL(`pdf/preview.html#${id}`) }))
          .then(() => ({})),
      );
      return true;
    }
    case "waw:notify":
      notify(message);
      sendResponse({ ok: true });
      return;
    case "waw:reschedule":
      reply(rescheduleReminders().then(() => ({})));
      return true;
    default:
  }
});
