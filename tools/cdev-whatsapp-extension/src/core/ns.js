/* CDEV WhatsApp — namespace e utilitários compartilhados.
 * Carregado primeiro em todos os contextos (content script, options, popup).
 * Todos os módulos se registram em globalThis.WAW. */
(() => {
  if (globalThis.WAW?.__ready) return;
  const WAW = (globalThis.WAW = globalThis.WAW || {});
  WAW.__ready = true;
  WAW.VERSION = "3.0.0";

  const U = (WAW.util = {});

  U.uid = (prefix = "id") =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  U.clone = (value) =>
    typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

  U.escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  U.esc = U.escapeHtml;

  U.sanitizeHex = (value, fallback = "#3b82f6") => {
    const raw = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
  };

  U.hexToRgba = (hex, alpha) => {
    const v = U.sanitizeHex(hex).slice(1);
    return `rgba(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)}, ${alpha})`;
  };

  /** Texto comparável: sem acentos, sem espaços extras, minúsculo. */
  U.norm = (value) =>
    String(value ?? "")
      .replace(/[​-‍﻿]/g, "")
      .replace(/ /g, " ")
      .replace(/[✓✔]/g, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  U.digits = (value) => String(value ?? "").replace(/\D+/g, "");

  U.formatPhone = (digits) => {
    const d = U.digits(digits);
    if (d.length === 13 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
    return d ? `+${d}` : "";
  };

  U.debounce = (fn, wait = 150) => {
    let t = null;
    const wrapped = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
  };

  U.throttle = (fn, wait = 250) => {
    let last = 0;
    let timer = null;
    return (...args) => {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        last = now;
        fn(...args);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          fn(...args);
        }, remaining);
      }
    };
  };

  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  U.money = (value) =>
    Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  U.parseMoney = (value) => {
    if (typeof value === "number") return value;
    const raw = String(value || "").replace(/[^\d,.-]/g, "");
    if (!raw) return 0;
    // 1.500,50 -> 1500.50 ; 1500.5 -> 1500.5
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  /* ---------- datas ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  U.dayKey = (ts = Date.now()) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  U.startOfDay = (ts = Date.now()) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  U.fmtTime = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  U.fmtDate = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  };
  U.fmtDateTime = (ts) => `${U.fmtDate(ts)} ${U.fmtTime(ts)}`;
  U.fmtWhen = (ts) => {
    const today = U.startOfDay();
    const day = U.startOfDay(ts);
    const diff = Math.round((day - today) / 86400000);
    if (diff === 0) return `hoje às ${U.fmtTime(ts)}`;
    if (diff === 1) return `amanhã às ${U.fmtTime(ts)}`;
    if (diff === -1) return `ontem às ${U.fmtTime(ts)}`;
    return `${U.fmtDate(ts)} às ${U.fmtTime(ts)}`;
  };
  U.ago = (ts) => {
    if (!ts) return "";
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return "agora";
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? "há 1 dia" : `há ${d} dias`;
  };
  U.fmtDuration = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
  };
  /** valor para <input type="datetime-local"> */
  U.toLocalInput = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  U.fromLocalInput = (value) => {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : null;
  };

  /* ---------- atalhos de teclado ---------- */
  const MODS = ["ctrl", "alt", "shift", "meta"];
  U.normalizeShortcut = (value) => {
    const parts = String(value || "")
      .split("+")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
      .map((p) => (p === "control" ? "ctrl" : p === "cmd" ? "meta" : p));
    const key = parts.find((p) => !MODS.includes(p));
    if (!key) return "";
    const mods = MODS.filter((m) => parts.includes(m));
    const cap = (s) => (s.length === 1 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1));
    return [...mods.map(cap), cap(key)].join("+");
  };
  U.shortcutFromEvent = (event) => {
    const key = event.key;
    if (!key || ["Control", "Alt", "Shift", "Meta"].includes(key)) return "";
    const mods = [];
    if (event.ctrlKey) mods.push("Ctrl");
    if (event.altKey) mods.push("Alt");
    if (event.shiftKey) mods.push("Shift");
    if (event.metaKey) mods.push("Meta");
    // Usa event.code para dígitos/letras (Alt+1 em alguns layouts gera "¡").
    let k = key;
    if (/^Digit\d$/.test(event.code)) k = event.code.slice(5);
    else if (/^Key[A-Z]$/.test(event.code)) k = event.code.slice(3);
    return U.normalizeShortcut([...mods, k].join("+"));
  };
  U.eventMatches = (event, shortcut) => {
    const wanted = U.normalizeShortcut(shortcut);
    return Boolean(wanted) && U.shortcutFromEvent(event) === wanted;
  };

  /* ---------- log de diagnóstico ---------- */
  const logBuffer = [];
  U.log = (...args) => {
    logBuffer.push({ ts: Date.now(), msg: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") });
    if (logBuffer.length > 300) logBuffer.shift();
    if (WAW.debug) console.debug("[CDEV WhatsApp]", ...args);
  };
  U.getLogs = () => logBuffer.slice();

  /* ---------- barramento de eventos ---------- */
  const listeners = new Map();
  WAW.on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  };
  WAW.emit = (name, payload) => {
    listeners.get(name)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (error) {
        console.error("[CDEV WhatsApp] listener", name, error);
      }
    });
  };

  /** Cria elemento a partir de HTML (primeiro nó). */
  U.h = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
})();
