/* CDEV Control Center - nucleo (sem build, sem dependencias alem do supabase-js ja usado no painel) */
(function () {
  const CC = window.CC = window.CC || {};

  // ------------------------------------------------------------------ DOM / texto
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => {
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return 'https://' + s;
    return '';
  };
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const slugify = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ------------------------------------------------------------------ Icones SVG (subset lucide, ISC)
  const ICONS = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    idcard: '<rect width="20" height="14" x="2" y="5" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4M5.5 17a3 3 0 0 1 5 0"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    insta: '<rect width="20" height="20" x="2" y="2" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    money: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    msg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    arrowUp: '<path d="m18 15-6-6-6 6"/>',
    arrowDown: '<path d="m6 9 6 6 6-6"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>'
  };
  const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.layout}</svg>`;

  // ------------------------------------------------------------------ Configuracoes (cc_settings)
  CC.settings = {};
  const setting = (key, fallback) => (CC.settings[key] !== undefined ? CC.settings[key] : fallback);
  const locale = () => setting('locale', 'pt-BR');
  const tz = () => setting('timezone', 'America/Sao_Paulo');

  // ------------------------------------------------------------------ Datas e valores
  const money = (v) => new Intl.NumberFormat(locale(), { style: 'currency', currency: setting('currency', 'BRL') }).format(Number(v || 0));
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const parseISODate = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fmtDate = (s, opts = {}) => {
    if (!s) return '—';
    const d = String(s).length <= 10 ? parseISODate(s) : new Date(s);
    return new Intl.DateTimeFormat(locale(), { timeZone: String(s).length <= 10 ? 'UTC' : tz(), day: '2-digit', month: '2-digit', year: opts.short ? undefined : 'numeric' }).format(d);
  };
  const fmtDateTime = (s) => s ? new Intl.DateTimeFormat(locale(), { timeZone: tz(), day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(s)) : '—';
  const fmtTime = (s) => s ? new Intl.DateTimeFormat(locale(), { timeZone: tz(), hour: '2-digit', minute: '2-digit' }).format(new Date(s)) : '—';
  const daysUntil = (iso) => { if (!iso) return null; return Math.round((parseISODate(iso) - parseISODate(todayISO())) / 86400000); };
  const addDays = (iso, n) => { const d = parseISODate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const duration = (sec) => {
    sec = Math.max(0, Math.round(Number(sec || 0)));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)} min`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}min`;
    return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
  };
  const relTime = (s) => {
    if (!s) return '—';
    const diff = (Date.now() - new Date(s).getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.round(diff / 3600)} h`;
    return `há ${Math.round(diff / 86400)} d`;
  };
  const dueLabel = (days) => {
    if (days === null || days === undefined) return '—';
    if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'} em atraso`;
    if (days === 0) return 'vence hoje';
    if (days === 1) return 'vence amanhã';
    return `em ${days} dias`;
  };
  const dueTone = (days) => (days === null ? 'gray' : days < 0 ? 'red' : days <= 1 ? 'red' : days <= 7 ? 'orange' : days <= 30 ? 'yellow' : 'green');

  // ------------------------------------------------------------------ Rotulos
  const LABELS = {
    CONCLUIDA: 'Concluída', PARCIAL: 'Parcial', EM_ANDAMENTO: 'Em andamento',
    DOMINIO: 'Domínio', HOSPEDAGEM: 'Hospedagem', MANUTENCAO: 'Manutenção', DESENVOLVIMENTO: 'Desenvolvimento', OUTROS: 'Outros',
    PENDENTE: 'Pendente', PAGO: 'Pago', ATRASADO: 'Atrasado', CANCELADO: 'Cancelado', VENCE_HOJE: 'Vence hoje', VENCENDO: 'Vencendo',
    NENHUMA: 'Única', MENSAL: 'Mensal', TRIMESTRAL: 'Trimestral', SEMESTRAL: 'Semestral', ANUAL: 'Anual',
    RASCUNHO: 'Rascunho', DEMO: 'Demo', PUBLICADO: 'Publicado', SUSPENSO: 'Suspenso', ARQUIVADO: 'Arquivado',
    ATIVO: 'Ativo', INATIVO: 'Inativo', ATIVA: 'Ativa', SUSPENSA: 'Suspensa', CANCELADA: 'Cancelada', EXPIRADO: 'Expirado', TRANSFERIDO: 'Transferido',
    ONLINE: 'Online', OFFLINE: 'Offline', INSTAVEL: 'Com problemas', MANUTENCAO: 'Manutenção', DESCONHECIDO: 'Sem dados',
    ABERTO: 'Aberto', RESOLVIDO: 'Resolvido', OK: 'OK', FALHOU: 'Falhou',
    LEAD: 'Lead', CONTATADO: 'Contatado', RESPONDEU: 'Respondeu', DEMO_ENVIADA: 'Demo enviada', NEGOCIACAO: 'Negociação', CLIENTE: 'Cliente', PERDIDO: 'Perdido',
    VPS: 'VPS', SERVIDOR_PROPRIO: 'Servidor próprio', SHARED: 'Shared Hosting', CLOUD: 'Cloud', VERCEL: 'Vercel', NETLIFY: 'Netlify', CLOUDFLARE_PAGES: 'Cloudflare Pages', OUTRO: 'Outro',
    MANUAL: 'Manual', CSV: 'CSV', WEB: 'Web', GOOGLE: 'Google Maps', AUTOMATICO: 'Automático', WHATSAPP: 'WhatsApp', EMAIL: 'E-mail'
  };
  const label = (v) => LABELS[v] || v || '—';
  const TONES = {
    PAGO: 'green', PENDENTE: 'blue', ATRASADO: 'red', CANCELADO: 'gray', VENCE_HOJE: 'red', VENCENDO: 'orange',
    RASCUNHO: 'gray', DEMO: 'yellow', PUBLICADO: 'green', SUSPENSO: 'orange', ARQUIVADO: 'gray',
    ATIVO: 'green', ATIVA: 'green', INATIVO: 'gray', SUSPENSA: 'orange', CANCELADA: 'gray', EXPIRADO: 'red', TRANSFERIDO: 'gray',
    ONLINE: 'green', OFFLINE: 'red', INSTAVEL: 'yellow', MANUTENCAO: 'blue', DESCONHECIDO: 'gray',
    ABERTO: 'red', RESOLVIDO: 'green', OK: 'green', FALHOU: 'red',
    LEAD: 'gray', CONTATADO: 'blue', RESPONDEU: 'blue', DEMO_ENVIADA: 'yellow', NEGOCIACAO: 'orange', CLIENTE: 'green', PERDIDO: 'gray'
  };
  const badge = (v, text) => `<span class="badge ${TONES[v] || 'gray'}">${esc(text || label(v))}</span>`;
  const SEV = { danger: 'red', warning: 'orange', notice: 'yellow', success: 'green', info: 'blue' };

  // ------------------------------------------------------------------ Toast / modal
  const toast = (message, tone = 'success') => {
    let region = $('#toast-region');
    if (!region) { region = document.createElement('div'); region.id = 'toast-region'; document.body.appendChild(region); }
    const el = document.createElement('div');
    el.className = `toast is-${tone}`;
    el.innerHTML = `${icon(tone === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
    region.appendChild(el);
    setTimeout(() => el.remove(), tone === 'error' ? 6000 : 3500);
  };

  const modal = ({ title, body = '', wide = false, actions = [{ label: 'Fechar', value: null }], onOpen } = {}) => new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'cc-modal-backdrop';
    back.innerHTML = `
      <div class="cc-modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="cc-modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button></div>
        <div class="cc-modal-body"></div>
        ${actions.length ? `<div class="cc-modal-foot">${actions.map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : ''} ${a.danger ? 'btn-danger' : ''}" data-action="${i}" type="button">${esc(a.label)}</button>`).join('')}</div>` : ''}
      </div>`;
    const bodyEl = $('.cc-modal-body', back);
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    document.body.appendChild(back);
    const close = (value) => { back.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onNav); resolve(value); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const onNav = () => close(null); // navegar (ex.: link dentro do modal) fecha o modal
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onNav);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    $('[data-close]', back).addEventListener('click', () => close(null));
    $$('[data-action]', back).forEach((btn) => btn.addEventListener('click', async () => {
      const a = actions[Number(btn.dataset.action)];
      if (a.handler) {
        btn.classList.add('is-saving'); btn.disabled = true;
        try {
          const result = await a.handler(bodyEl, back);
          if (result === false) return;
          close(result === undefined ? a.value : result);
        } catch (err) {
          toast(CC.errMsg(err), 'error');
        } finally { btn.classList.remove('is-saving'); btn.disabled = false; }
      } else close(a.value);
    }));
    if (onOpen) onOpen(bodyEl, close);
    const first = $('input:not([type=hidden]),select,textarea', bodyEl);
    if (first) setTimeout(() => first.focus(), 30);
  });
  const confirmDialog = (message, { title = 'Confirmar', okLabel = 'Confirmar', danger = false } = {}) =>
    modal({ title, body: `<p class="small" style="line-height:1.6">${esc(message)}</p>`, actions: [{ label: 'Cancelar', value: false }, { label: okLabel, value: true, primary: !danger, danger }] });

  // ------------------------------------------------------------------ Erros
  CC.errMsg = (err) => {
    const m = String(err?.message || err || 'Erro inesperado');
    const code = err?.code;
    if (code === '23505' || /duplicate key/i.test(m)) {
      if (/slug/.test(m)) return 'Já existe um projeto com este slug.';
      if (/domain/.test(m)) return 'Este domínio já está cadastrado.';
      return 'Registro duplicado.';
    }
    if (code === '23514' || /violates check constraint/i.test(m)) return `Valor inválido (${(m.match(/"([^"]+)"/) || [])[1] || 'restrição'}).`;
    if (code === '23503') return 'Registro relacionado não encontrado ou em uso.';
    if (code === '42501' || /permission denied|row-level security/i.test(m)) return 'Sem permissão para esta ação.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Falha de conexão com o servidor.';
    return m;
  };

  // ------------------------------------------------------------------ API (Supabase)
  const db = () => CC.ctx.supabase;
  const unwrap = ({ data, error }) => { if (error) throw error; return data; };
  CC.api = {
    list: async (table, { select = '*', filters = [], order = null, asc = true, limit = 2000 } = {}) => {
      let q = db().from(table).select(select);
      filters.forEach(([op, ...args]) => { q = q[op](...args); });
      if (order) q = q.order(order, { ascending: asc, nullsFirst: false });
      if (limit) q = q.limit(limit);
      return unwrap(await q) || [];
    },
    get: async (table, id, select = '*') => unwrap(await db().from(table).select(select).eq('id', id).maybeSingle()),
    insert: async (table, row) => unwrap(await db().from(table).insert(row).select().single()),
    insertMany: async (table, rows) => unwrap(await db().from(table).insert(rows).select()),
    update: async (table, id, patch) => unwrap(await db().from(table).update(patch).eq('id', id).select().single()),
    remove: async (table, id) => unwrap(await db().from(table).delete().eq('id', id)),
    rpc: async (fn, args = {}) => unwrap(await db().rpc(fn, args))
  };

  // ------------------------------------------------------------------ Validacao
  const validCpf = (c) => {
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    const calc = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
  };
  const validCnpj = (c) => {
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const calc = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * Number(c[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
  };
  const VALIDATORS = {
    email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'E-mail inválido',
    url: (v) => !v || /^https?:\/\/[^\s]+$/i.test(v) || 'Use uma URL completa (https://...)',
    phone: (v) => !v || (digits(v).length >= 10 && digits(v).length <= 13) || 'Telefone inválido (DDD + número)',
    document: (v) => { const d = digits(v); return !d || validCpf(d) || validCnpj(d) || 'CPF/CNPJ inválido'; },
    cpf: (v) => { const d = digits(v); return !d || validCpf(d) || 'CPF inválido'; },
    cep: (v) => { const d = digits(v); return !d || d.length === 8 || 'CEP deve ter 8 dígitos'; },
    uf: (v) => !v || /^[A-Za-z]{2}$/.test(v) || 'Use a sigla (2 letras)',
    domain: (v) => !v || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v) || 'Domínio inválido (ex.: cliente.com.br)',
    slug: (v) => !v || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(v) || 'Use apenas letras minúsculas, números e hífen',
    money: (v) => v === '' || v === null || (Number(v) >= 0) || 'Valor inválido',
    json: (v) => { if (!v) return true; try { JSON.parse(v); return true; } catch (e) { return 'JSON inválido'; } }
  };

  // ------------------------------------------------------------------ Formularios
  // field: { name, label, type(text|email|url|tel|number|money|date|select|textarea|checkbox|days|json|hidden), required, options, validate, hint, full, placeholder }
  const optionHtml = (opts, value) => (opts || []).map((o) => {
    const [v, t] = Array.isArray(o) ? o : [o, label(o)];
    return `<option value="${esc(v)}" ${String(value ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
  }).join('');
  const fieldHtml = (f, values) => {
    let v = values[f.name];
    if (v === undefined || v === null) v = f.default ?? '';
    const id = `f_${f.name}_${Math.random().toString(36).slice(2, 7)}`;
    const common = `id="${id}" name="${esc(f.name)}" ${f.required ? 'required' : ''} ${f.readonly ? 'readonly' : ''} placeholder="${esc(f.placeholder || '')}"`;
    let input;
    if (f.type === 'section') return `<div class="form-section full"><h4>${esc(f.label)}</h4>${f.hint ? `<p>${esc(f.hint)}</p>` : ''}</div>`;
    switch (f.type) {
      case 'hidden': return `<input type="hidden" name="${esc(f.name)}" value="${esc(v)}">`;
      case 'textarea': input = `<textarea class="field" ${common} rows="${f.rows || 4}">${esc(v)}</textarea>`; break;
      case 'json': input = `<textarea class="field mono" ${common} rows="${f.rows || 10}">${esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2))}</textarea>`; break;
      case 'select': {
        const opts = typeof f.options === 'function' ? f.options(values) : f.options;
        input = `<select class="cc-select" ${common}>${f.required ? '' : `<option value="">${esc(f.emptyLabel || '—')}</option>`}${optionHtml(opts, v)}</select>`;
        break;
      }
      case 'checkbox': return `<div class="form-field ${f.full ? 'full' : ''}"><label class="check" style="margin-top:1.3rem"><input type="checkbox" name="${esc(f.name)}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
      case 'days': input = `<input class="field" ${common} type="text" value="${esc(Array.isArray(v) ? v.join(', ') : v)}">`; break;
      case 'money': input = `<input class="field" ${common} type="number" min="0" step="0.01" value="${esc(v)}">`; break;
      default: input = `<input class="field" ${common} type="${f.type || 'text'}" value="${esc(v)}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.step !== undefined ? `step="${f.step}"` : ''}>`;
    }
    if (f.button) input = `<div class="field-with-btn">${input}<button type="button" class="btn btn-sm" data-field-action="${esc(f.button.action)}">${f.button.icon ? icon(f.button.icon) : ''}${esc(f.button.label)}</button></div>`;
    return `<div class="form-field ${f.full ? 'full' : ''}" data-field="${esc(f.name)}"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}<div class="err" hidden></div></div>`;
  };
  const formHtml = (fields, values = {}) => `<form class="form-grid" novalidate>${fields.map((f) => fieldHtml(f, values)).join('')}</form>`;
  const readForm = (root, fields) => {
    const values = {}; const errors = {};
    fields.forEach((f) => {
      const el = root.querySelector(`[name="${f.name}"]`);
      if (!el) return;
      let v;
      if (f.type === 'checkbox') v = el.checked;
      else {
        v = el.value.trim();
        if (f.lower) v = v.toLowerCase();
        if (f.type === 'number' || f.type === 'money') v = v === '' ? null : Number(v);
        else if (f.type === 'days') v = v === '' ? [] : v.split(/[,;\s]+/).filter(Boolean).map(Number);
        else if (f.type === 'digits') v = digits(v) || null;
        else if (v === '') v = null;
      }
      if (f.required && (v === null || v === '' || (Array.isArray(v) && !v.length))) errors[f.name] = 'Obrigatório';
      if (!errors[f.name] && v !== null && v !== '') {
        const checks = [].concat(f.validate || []);
        if (f.type === 'email') checks.push('email');
        if (f.type === 'url') checks.push('url');
        if (f.type === 'money') checks.push('money');
        if (f.type === 'json') checks.push('json');
        if (f.type === 'days' && v.some((n) => !Number.isInteger(n))) errors[f.name] = 'Use números inteiros separados por vírgula';
        for (const c of checks) {
          const r = typeof c === 'function' ? c(v, values) : VALIDATORS[c](String(v));
          if (r !== true) { errors[f.name] = r; break; }
        }
      }
      if (f.type === 'json' && v && !errors[f.name]) v = JSON.parse(v);
      if (f.type === 'digits' || f.validate === 'document') v = v ? digits(v) : null;
      values[f.name] = v;
    });
    $$('.form-field', root).forEach((ff) => {
      const name = ff.dataset.field; const err = $('.err', ff); const input = $('[name]', ff);
      if (!err) return;
      if (errors[name]) { err.hidden = false; err.textContent = errors[name]; input && input.classList.add('invalid'); }
      else { err.hidden = true; input && input.classList.remove('invalid'); }
    });
    return { values, errors, ok: !Object.keys(errors).length };
  };

  // Abre modal com formulario e salva
  const formModal = ({ title, fields, values = {}, onSubmit, wide = false, submitLabel = 'Salvar', extra = '', onOpen: onOpenForm }) =>
    modal({
      title, wide,
      body: formHtml(fields, values) + extra,
      actions: [{ label: 'Cancelar', value: null }, {
        label: submitLabel, primary: true,
        handler: async (body) => {
          const { values: v, ok } = readForm(body, fields);
          if (!ok) { toast('Corrija os campos destacados.', 'error'); return false; }
          return await onSubmit(v, body);
        }
      }],
      onOpen: (body) => {
        const form = $('form', body); form && form.addEventListener('submit', (e) => e.preventDefault());
        // erro some assim que o campo e corrigido
        body.addEventListener('input', (e) => { const f = e.target.closest('.form-field'); if (f) { const er = $('.err', f); if (er) er.hidden = true; e.target.classList.remove('invalid'); } });
        if (onOpenForm) onOpenForm(body);
      }
    });

  // ------------------------------------------------------------------ Tabela generica
  // columns: [{ key, label, render(row), cls, sortValue }]
  const table = (columns, rows, { rowAttr = () => '', empty = 'Nada por aqui.' } = {}) => {
    if (!rows.length) return `<div class="empty-state">${icon('archive')}<strong>${esc(empty)}</strong></div>`;
    return `<div class="table-wrap"><table class="cc-table"><thead><tr>${columns.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((r) => `<tr ${rowAttr(r)}>${columns.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')
    }</tbody></table></div>`;
  };

  // ------------------------------------------------------------------ CSV
  const csv = {
    stringify(rows, columns) {
      const cell = (v) => { const s = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      return '﻿' + [columns.map((c) => cell(c.label || c.key)).join(';'), ...rows.map((r) => columns.map((c) => cell(c.value ? c.value(r) : r[c.key])).join(';'))].join('\r\n');
    },
    parse(text) {
      text = String(text || '').replace(/^﻿/, '');
      const first = text.split(/\r?\n/)[0] || '';
      const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
      const rows = []; let row = []; let cur = ''; let q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true;
        else if (ch === delim) { row.push(cur); cur = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += ch;
      }
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
      const clean = rows.filter((r) => r.some((c) => c.trim() !== ''));
      if (!clean.length) return { headers: [], records: [] };
      const norm = (h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const headers = clean[0].map(norm);
      return { headers, records: clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()]))) };
    },
    download(filename, content) {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    pickFile() {
      return new Promise((resolve) => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,text/csv';
        input.onchange = () => { const f = input.files[0]; if (!f) return resolve(null); const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsText(f, 'utf-8'); };
        input.click();
      });
    }
  };

  // ------------------------------------------------------------------ Filtros/ordenacao reutilizaveis
  // Gera barra: chips de filtro + ordenacao + busca local. state = { filter, sort, q }
  const toolbar = ({ filters = [], sorts = [], state, counts = {}, search = true, extra = '' }) => `
    <div class="toolbar">
      ${filters.length ? `<div class="chips">${filters.map(([k, t]) => `<button class="chip ${state.filter === k ? 'active' : ''}" data-filter="${esc(k)}">${esc(t)}${counts[k] !== undefined ? ` <span class="n">${counts[k]}</span>` : ''}</button>`).join('')}</div>` : ''}
      <div class="spacer"></div>
      ${search ? `<input class="field" data-q placeholder="Filtrar..." value="${esc(state.q || '')}" style="min-width:12rem">` : ''}
      ${sorts.length ? `<select class="cc-select" data-sort>${sorts.map(([k, t]) => `<option value="${esc(k)}" ${state.sort === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
      ${extra}
    </div>`;
  const bindToolbar = (root, state, rerender) => {
    $$('[data-filter]', root).forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; CC.router.setQuery({ f: state.filter }); rerender(); }));
    const s = $('[data-sort]', root); if (s) s.addEventListener('change', () => { state.sort = s.value; rerender(); });
    const q = $('[data-q]', root); if (q) q.addEventListener('input', debounce(() => { state.q = q.value; rerender(true); }, 200));
  };
  const matchQ = (row, q, keys) => !q || keys.some((k) => String(typeof k === 'function' ? k(row) : row[k] ?? '').toLowerCase().includes(q.toLowerCase()));
  const SORTERS = {
    name: (k = 'name') => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''), 'pt-BR'),
    date: (k, dir = 1) => (a, b) => (String(a[k] || '9999') < String(b[k] || '9999') ? -dir : String(a[k] || '9999') > String(b[k] || '9999') ? dir : 0),
    num: (k, dir = 1) => (a, b) => (Number(a[k] || 0) - Number(b[k] || 0)) * dir,
    str: (k) => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''))
  };

  // ------------------------------------------------------------------ Router (hash)
  CC.routes = {};
  CC.router = {
    parse() {
      const raw = location.hash.replace(/^#\/?/, '') || 'painel';
      const [path, qs] = raw.split('?');
      const parts = path.split('/').filter(Boolean);
      return { name: parts[0] || 'painel', id: parts[1] || null, sub: parts[2] || null, query: Object.fromEntries(new URLSearchParams(qs || '')) };
    },
    go(hash) { if (location.hash === hash) CC.router.render(); else location.hash = hash; },
    setQuery(patch) {
      const r = CC.router.parse();
      const q = new URLSearchParams({ ...r.query, ...patch });
      [...q.keys()].forEach((k) => { if (!q.get(k)) q.delete(k); });
      const base = `#/${[r.name, r.id, r.sub].filter(Boolean).join('/')}`;
      history.replaceState(null, '', base + (q.toString() ? `?${q}` : ''));
    },
    async render() {
      const r = CC.router.parse();
      const view = CC.routes[r.name] || CC.routes.painel;
      if (window.CDEVShell) { window.CDEVShell.setActiveRoute(CC.routes[r.name] ? r.name : 'painel'); window.CDEVShell.closeMenu(); }
      // novo elemento a cada rota: listeners da tela anterior nao se acumulam
      const old = $('#view');
      const root = old.cloneNode(false);
      old.replaceWith(root);
      root.innerHTML = `<div class="page-head"><div><div class="skeleton" style="width:8rem;height:.8rem"></div><div class="skeleton" style="width:18rem;height:2rem;margin-top:.8rem"></div></div></div><div class="panel panel-pad"><div class="skeleton" style="height:12rem"></div></div>`;
      try {
        await view(root, r);
      } catch (err) {
        console.error(err);
        root.innerHTML = `<div class="notice" style="margin-top:2rem"><strong>Não foi possível carregar esta área.</strong><br>${esc(CC.errMsg(err))}<br><br><span class="muted small">Se as tabelas ainda não existem, rode <code>supabase/07_control_center.sql</code> no Supabase SQL Editor.</span></div>`;
      }
      window.scrollTo(0, 0);
    }
  };

  const pageHead = (kicker, title, text = '', actions = '') => `
    <div class="page-head"><div><div class="section-label">${esc(kicker)}</div><h1>${esc(title)}</h1>${text ? `<p>${text}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;

  // WhatsApp (link manual, sem API paga)
  const waNumber = (v) => { let d = digits(v); if (!d) return ''; if (d.length <= 11) d = '55' + d; return d; };
  const waLink = (number, text = '') => { const n = waNumber(number); return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}` : ''; };

  // Busy button helper
  const busy = async (btn, fn) => { if (btn) { btn.classList.add('is-saving'); btn.disabled = true; } try { return await fn(); } finally { if (btn) { btn.classList.remove('is-saving'); btn.disabled = false; } } };

  // ------------------------------------------------------------------ Documentos, CEP/CNPJ (APIs publicas gratuitas) e fotos
  const fmtDoc = (v) => {
    const d = digits(v);
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return v || '';
  };
  const fmtCep = (v) => { const d = digits(v); return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (v || ''); };
  const fmtPhone = (v) => {
    let d = digits(v); if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return v || '';
  };
  const fetchJson = async (url) => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
    try { const r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) throw new Error(r.status === 404 ? 'não encontrado' : `erro ${r.status}`); return await r.json(); }
    finally { clearTimeout(t); }
  };
  // ViaCEP: gratuito, sem chave
  const lookupCep = async (cep) => {
    const d = digits(cep); if (d.length !== 8) throw new Error('CEP deve ter 8 dígitos');
    const j = await fetchJson(`https://viacep.com.br/ws/${d}/json/`);
    if (j.erro) throw new Error('CEP não encontrado');
    return { cep: d, address: j.logradouro || '', neighborhood: j.bairro || '', city: j.localidade || '', state: j.uf || '', address_complement: j.complemento || '' };
  };
  // BrasilAPI (dados publicos da Receita Federal): gratuito, sem chave
  const lookupCnpj = async (cnpj) => {
    const d = digits(cnpj); if (!validCnpj(d)) throw new Error('CNPJ inválido');
    const j = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
    const phone = digits(j.ddd_telefone_1 || '');
    return {
      document: d, person_type: 'PJ', legal_name: j.razao_social || '', company: j.nome_fantasia || j.razao_social || '',
      main_activity: j.cnae_fiscal_descricao || '', tax_regime: j.opcao_pelo_mei ? 'MEI' : j.opcao_pelo_simples ? 'SIMPLES' : '',
      cep: digits(j.cep || ''), address: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '), address_number: j.numero || '',
      address_complement: j.complemento || '', neighborhood: j.bairro || '', city: j.municipio ? j.municipio.charAt(0) + j.municipio.slice(1).toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()) : '',
      state: j.uf || '', phone: phone.length >= 10 ? phone : '', email: (j.email || '').toLowerCase(),
      situation: j.descricao_situacao_cadastral || '', opened_at: j.data_inicio_atividade || ''
    };
  };
  // Fotos: bucket privado crm-media; reduz para no maximo 640px antes de enviar
  const MEDIA_BUCKET = 'crm-media';
  const resizeImage = (file, max = 640) => new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error('Use uma imagem JPG, PNG ou WebP.')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('Imagem muito grande (máx. 15 MB).')); return; }
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem.'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Arquivo de imagem inválido.')); };
    img.src = url;
  });
  const signedCache = new Map();
  const media = {
    async upload(file, folder) {
      const blob = await resizeImage(file);
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await CC.ctx.supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error(/bucket not found/i.test(error.message || '') ? 'Armazenamento de fotos não configurado (rode supabase/13_comissao_e_dados_fiscais.sql).' : error.message);
      return path;
    },
    async url(path) {
      if (!path) return '';
      const hit = signedCache.get(path); if (hit && hit.exp > Date.now()) return hit.url;
      const { data, error } = await CC.ctx.supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
      if (error || !data) return '';
      signedCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
      return data.signedUrl;
    },
    async remove(path) { if (path) await CC.ctx.supabase.storage.from(MEDIA_BUCKET).remove([path]); signedCache.delete(path); },
    // varias fotos de uma vez (lista de leads)
    async urls(paths) {
      const need = [...new Set(paths.filter(Boolean))].filter((p) => !(signedCache.get(p)?.exp > Date.now()));
      if (need.length) {
        const { data } = await CC.ctx.supabase.storage.from(MEDIA_BUCKET).createSignedUrls(need, 3600);
        (data || []).forEach((d) => { if (d.signedUrl && d.path) signedCache.set(d.path, { url: d.signedUrl, exp: Date.now() + 50 * 60 * 1000 }); });
      }
      return Object.fromEntries(paths.filter(Boolean).map((p) => [p, signedCache.get(p)?.url || '']));
    }
  };

  // Botoes "Buscar CNPJ" / "Buscar CEP" dentro de formularios (preenche so campos vazios, exceto os do proprio documento)
  const bindLookups = (body) => {
    const set = (name, value, force = false) => {
      const el = body.querySelector(`[name="${name}"]`); if (!el || value === undefined || value === null || value === '') return false;
      if (!force && String(el.value || '').trim()) return false;
      el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.classList.add('autofilled'); setTimeout(() => el.classList.remove('autofilled'), 1600);
      return true;
    };
    body.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-field-action]'); if (!btn) return;
      const action = btn.dataset.fieldAction;
      try {
        await busy(btn, async () => {
          if (action === 'cnpj') {
            const d = await lookupCnpj(body.querySelector('[name="document"]').value);
            set('document', fmtDoc(d.document), true); set('person_type', 'PJ', true);
            if (d.phone) d.phone = fmtPhone(d.phone);
            let n = 0; ['legal_name', 'company', 'main_activity', 'tax_regime', 'address', 'address_number', 'address_complement', 'neighborhood', 'city', 'state', 'phone', 'email'].forEach((k) => { if (set(k, d[k])) n += 1; });
            if (set('cep', fmtCep(d.cep))) n += 1;
            toast(`${d.legal_name || 'CNPJ encontrado'}${d.situation ? ` · ${d.situation}` : ''} · ${n} campos preenchidos.`);
          }
          if (action === 'cep') {
            const d = await lookupCep(body.querySelector('[name="cep"]').value);
            set('cep', fmtCep(d.cep), true);
            ['address', 'neighborhood', 'city', 'state', 'address_complement'].forEach((k) => set(k, d[k], k !== 'address_complement'));
            toast('Endereço preenchido pelo CEP.');
          }
        });
      } catch (err) { toast(`Busca: ${err.message === 'The user aborted a request.' ? 'tempo esgotado' : err.message}`, 'error'); }
    });
    // mascara ao sair do campo
    body.addEventListener('focusout', (e) => {
      const el = e.target; if (!el.name) return;
      if (['document', 'contact_document'].includes(el.name)) el.value = fmtDoc(el.value);
      if (el.name === 'cep') el.value = fmtCep(el.value);
      if (['whatsapp', 'phone'].includes(el.name) && el.value) el.value = fmtPhone(el.value);
      if (el.name === 'state') el.value = el.value.toUpperCase();
    });
  };

  Object.assign(CC, {
    $, $$, esc, safeUrl, digits, slugify, debounce, icon, setting, money, todayISO, parseISODate, fmtDate, fmtDateTime, fmtTime,
    daysUntil, addDays, duration, relTime, dueLabel, dueTone, label, badge, TONES, SEV, toast, modal, confirmDialog, VALIDATORS,
    formHtml, readForm, formModal, table, csv, toolbar, bindToolbar, matchQ, SORTERS, pageHead, waLink, waNumber, busy, optionHtml,
    fmtDoc, fmtCep, fmtPhone, lookupCep, lookupCnpj, media, validCpf, validCnpj, bindLookups
  });
})();
