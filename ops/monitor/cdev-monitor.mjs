#!/usr/bin/env node
/**
 * CDEV MONITOR - worker de monitoramento externo (HTTP/HTTPS + SSL) e verificacao de vencimentos.
 *
 * - Sem dependencias: Node >= 18 (fetch nativo + tls).
 * - Roda na VPS da CDEV via systemd timer (a cada 1 minuto) ou cron. Custo: R$0.
 * - Fala com o Supabase existente via REST usando a SERVICE KEY (nunca exposta no navegador).
 * - Alertas so sao gerados na MUDANCA de estado (ONLINE <-> OFFLINE): a logica fica no banco
 *   (public.cc_record_check), entao o worker e "burro" e facil de substituir.
 *
 * Uso:
 *   node cdev-monitor.mjs            # uma rodada (systemd timer / cron)
 *   node cdev-monitor.mjs --loop     # processo continuo (a cada LOOP_SECONDS)
 *   node cdev-monitor.mjs --check https://site.com.br   # teste manual, nao grava nada
 *
 * Variaveis (ver cdev-monitor.env.example):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY           obrigatorias
 *   CONCURRENCY=8, LOOP_SECONDS=60, DUE_CHECK_EVERY_MIN=10, STATE_DIR=/var/lib/cdev-monitor
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID         opcionais (canal externo gratuito)
 */
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const env = process.env;
const SUPABASE_URL = (env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
const CONCURRENCY = Math.max(1, Number(env.CONCURRENCY || 8));
const LOOP_SECONDS = Math.max(30, Number(env.LOOP_SECONDS || 60));
const DUE_EVERY_MIN = Math.max(1, Number(env.DUE_CHECK_EVERY_MIN || 10));
const STATE_DIR = env.STATE_DIR || (fs.existsSync('/var/lib/cdev-monitor') ? '/var/lib/cdev-monitor' : os.tmpdir());
const UA = env.USER_AGENT || 'CDEV-Monitor/1.0 (+https://cdev.com.br)';
const TG_TOKEN = env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = env.TELEGRAM_CHAT_ID || '';

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ Supabase REST
const headers = () => {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (SERVICE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SERVICE_KEY}`; // chave legada (JWT)
  return h;
};
async function rest(method, pathname, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn, args = {}) => rest('POST', `rpc/${fn}`, args);

// ------------------------------------------------------------------ Checks
const HTTP_TEXT = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 408: 'Request Timeout', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout', 520: 'Unknown Error (Cloudflare)', 521: 'Web Server Is Down (Cloudflare)', 522: 'Connection Timed Out (Cloudflare)', 523: 'Origin Unreachable (Cloudflare)', 525: 'SSL Handshake Failed (Cloudflare)', 526: 'Invalid SSL Certificate (Cloudflare)' };

function describeError(err, timeoutMs) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return `Timeout (${timeoutMs}ms)`;
  const code = err?.cause?.code || err?.code || '';
  const map = {
    ENOTFOUND: 'DNS não resolve (ENOTFOUND)', EAI_AGAIN: 'Falha temporária de DNS', ECONNREFUSED: 'Conexão recusada', ECONNRESET: 'Conexão resetada',
    ETIMEDOUT: 'Timeout de conexão', UND_ERR_CONNECT_TIMEOUT: 'Timeout de conexão', CERT_HAS_EXPIRED: 'Certificado SSL expirado',
    ERR_TLS_CERT_ALTNAME_INVALID: 'Certificado SSL não corresponde ao domínio', DEPTH_ZERO_SELF_SIGNED_CERT: 'Certificado SSL autoassinado',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Cadeia SSL incompleta', SELF_SIGNED_CERT_IN_CHAIN: 'Certificado SSL não confiável'
  };
  return map[code] || `${code || err?.name || 'Erro'}: ${err?.cause?.message || err?.message || ''}`.slice(0, 300);
}

async function httpOnce(url, timeoutMs) {
  const started = performance.now();
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(timeoutMs) });
    // le no maximo alguns KB para medir resposta completa sem baixar o site inteiro
    const reader = res.body?.getReader();
    if (reader) { let n = 0; while (n < 65536) { const { done, value } = await reader.read(); if (done) break; n += value.length; } reader.cancel().catch(() => {}); }
    const ms = Math.round(performance.now() - started);
    const ok = res.status >= 200 && res.status < 400;
    return { ok, status: res.status, ms, error: ok ? null : `${res.status} ${HTTP_TEXT[res.status] || res.statusText || ''}`.trim() };
  } catch (err) {
    return { ok: false, status: null, ms: null, error: describeError(err, timeoutMs) };
  }
}

function sslExpiry(hostname, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert?.valid_to ? new Date(cert.valid_to).toISOString() : null);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
}

async function checkSite(url, { timeout = 10000, retries = 3 } = {}) {
  let attempt = 0; let last;
  while (attempt < retries) {
    attempt += 1;
    last = await httpOnce(url, timeout);
    if (last.ok) break;
    if (attempt < retries) await sleep(2000 * attempt);
  }
  let ssl = null;
  try { const u = new URL(url); if (u.protocol === 'https:') ssl = await sslExpiry(u.hostname); } catch { /* url invalida */ }
  return { ...last, attempts: attempt, ssl };
}

// ------------------------------------------------------------------ Notificacoes externas opcionais (Telegram = gratis)
async function forwardNotifications() {
  if (!TG_TOKEN || !TG_CHAT) return 0;
  const since = new Date(Date.now() - 86400000).toISOString();
  const rows = await rest('GET', `notifications?select=id,title,body,severity,resolved_at&delivered_at=is.null&created_at=gte.${since}&order=created_at.asc&limit=20`);
  const emoji = { danger: '🔴', warning: '🟠', notice: '🟡', success: '🟢', info: '🔵' };
  let sent = 0;
  for (const n of rows || []) {
    if (!n.resolved_at) {
      const text = `${emoji[n.severity] || '•'} ${n.title}\n\n${n.body || ''}`;
      const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(10000) }).catch((e) => ({ ok: false, statusText: e.message }));
      if (!r.ok) { log('telegram falhou', r.status || '', r.statusText || ''); break; }
      sent += 1;
    }
    await rest('PATCH', `notifications?id=eq.${n.id}`, { delivered_at: new Date().toISOString() });
  }
  return sent;
}

// ------------------------------------------------------------------ Rodada
function dueCheckIsDue() {
  const file = path.join(STATE_DIR, 'cdev-monitor-last-due');
  try {
    const last = Number(fs.readFileSync(file, 'utf8'));
    if (Date.now() - last < DUE_EVERY_MIN * 60000) return false;
  } catch { /* primeira execucao */ }
  try { fs.writeFileSync(file, String(Date.now())); } catch { /* sem permissao: roda sempre */ }
  return true;
}

async function pool(items, limit, fn) {
  const queue = [...items]; const out = [];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => { while (queue.length) { const it = queue.shift(); out.push(await fn(it)); } }));
  return out;
}

async function runOnce() {
  const t0 = Date.now();
  const targets = await rpc('cc_monitor_targets', { p_limit: 200 });
  const results = await pool(targets || [], CONCURRENCY, async (t) => {
    const r = await checkSite(t.site_url, { timeout: t.timeout_ms, retries: t.retries });
    try {
      const state = await rpc('cc_record_check', {
        p_project_id: t.id, p_ok: r.ok, p_status_code: r.status, p_response_ms: r.ms,
        p_error: r.error, p_ssl_expires_at: r.ssl, p_attempts: r.attempts
      });
      if (state !== t.monitor_status) log(`estado ${t.name}: ${t.monitor_status} -> ${state}${r.error ? ` (${r.error})` : ''}`);
      return { ok: r.ok };
    } catch (e) { log('erro ao gravar check', t.name, e.message); return { ok: false }; }
  });
  let due = null;
  if (dueCheckIsDue()) due = await rpc('cc_run_due_checks');
  const forwarded = await forwardNotifications().catch((e) => { log('telegram', e.message); return 0; });
  log(`checks=${results.length} falhas=${results.filter((x) => !x.ok).length}${due ? ` alertas_vencimento=${due.notifications_created}` : ''}${forwarded ? ` telegram=${forwarded}` : ''} em ${Date.now() - t0}ms`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--check') {
    const r = await checkSite(args[1], { timeout: 10000, retries: 1 });
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (ver cdev-monitor.env.example).');
    process.exit(2);
  }
  if (args.includes('--loop')) {
    log(`loop a cada ${LOOP_SECONDS}s, concorrencia ${CONCURRENCY}`);
    for (;;) {
      try { await runOnce(); } catch (e) { log('rodada falhou:', e.message); }
      await sleep(LOOP_SECONDS * 1000);
    }
  }
  await runOnce();
}

main().catch((e) => { log('falha:', e.message); process.exit(1); });
