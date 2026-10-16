/* CDEV - Calendario do Airbnb no Dashboard (SOMENTE LEITURA do Airbnb)
 * - Le as reservas sincronizadas pela Edge Function "airbnb-ical" (link .ics exportado pelo Airbnb)
 * - Importa o CSV do Airbnb (nome do hospede e valores), casando pelo codigo da reserva (HM...)
 * - Calcula por mes: noites ocupadas, reservas com entrada no mes, hospedes e valor -> preenche a planilha
 * Nada e enviado ao Airbnb. O link .ics fica em property_calendars (so admin).
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const ICAL_RE = /^https:\/\/([a-z0-9-]+\.)*airbnb\.[a-z.]+\/calendar\/ical\/\S+$/i;
  const STALE_MS = 60 * 60 * 1000;

  // ---------------------------------------------------------------- datas
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const fmt = (s) => (s ? parseISO(s).toLocaleDateString('pt-BR') : '');
  const fmtShort = (s) => (s ? parseISO(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
  const monthStart = (y, m) => `${y}-${String(m).padStart(2, '0')}-01`;
  const monthEnd = (y, m) => iso(new Date(y, m, 1)); // exclusivo

  // ---------------------------------------------------------------- agregacao
  const active = (b) => b.status === 'ATIVA';
  const isRes = (b) => b.kind === 'RESERVA' && active(b);
  const nightsIn = (b, y, m) => {
    const a = b.check_in > monthStart(y, m) ? b.check_in : monthStart(y, m);
    const z = b.check_out < monthEnd(y, m) ? b.check_out : monthEnd(y, m);
    return Math.max(0, diffDays(a, z));
  };
  const label = (b) => (b.guest_name || (b.code ? `Reserva ${b.code}` : 'Reserva'));
  const monthAgg = (bookings, y, m) => {
    const res = bookings.filter((b) => isRes(b) && nightsIn(b, y, m) > 0);
    const checkins = res.filter((b) => b.check_in >= monthStart(y, m) && b.check_in < monthEnd(y, m)).sort((a, b) => a.check_in.localeCompare(b.check_in));
    const nights = res.reduce((s, b) => s + nightsIn(b, y, m), 0);
    const withValue = checkins.filter((b) => b.gross_amount != null);
    const gross = withValue.reduce((s, b) => s + Number(b.gross_amount), 0);
    const description = checkins.map((b) => `${label(b)} · ${fmtShort(b.check_in)}→${fmtShort(b.check_out)} · ${b.nights} ${b.nights === 1 ? 'noite' : 'noites'}${b.gross_amount != null ? ` · ${money.format(b.gross_amount)}` : ''}`).join('\n');
    return {
      reservations: res, checkins, nights, clients: checkins.length, gross,
      missingValue: checkins.length - withValue.length, missingName: checkins.filter((b) => !b.guest_name).length,
      description, blocks: bookings.filter((b) => b.kind === 'BLOQUEIO' && active(b) && nightsIn(b, y, m) > 0)
    };
  };
  // valores que vao para a planilha do mes
  const fillValues = (agg) => {
    const v = { clients_count: agg.clients, nights_count: agg.nights, client_description: agg.description || '*' };
    if (agg.clients && agg.missingValue < agg.clients) v.paid_clients = Number(agg.gross.toFixed(2));
    return v;
  };

  // ---------------------------------------------------------------- dados
  const cache = new Map(); // property_name -> { calendar, bookings, autoSynced }
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  const load = async (ctx, property, { admin }) => {
    const sb = ctx.supabase;
    const [bk, cal] = await Promise.all([
      sb.from('property_bookings').select('*').eq('property_name', property).order('check_in'),
      admin ? sb.from('property_calendars').select('id,property_name,ical_url,active,last_sync_at,last_sync_status,last_sync_message,last_sync_counts').eq('property_name', property).maybeSingle() : Promise.resolve({ data: null })
    ]);
    if (bk.error) {
      if (/property_bookings/.test(bk.error.message || '') || bk.error.code === '42P01' || bk.error.code === 'PGRST205') {
        cache.set(property, { calendar: null, bookings: [], missing: true });
        return cache.get(property);
      }
      throw bk.error;
    }
    const prev = cache.get(property) || {};
    cache.set(property, { calendar: cal.data || null, bookings: bk.data || [], autoSynced: prev.autoSynced, missing: false });
    return cache.get(property);
  };
  const get = (property) => cache.get(property) || { calendar: null, bookings: [] };

  const sync = async (ctx, property) => {
    const { data, error } = await ctx.supabase.functions.invoke('airbnb-ical', { body: { property_name: property } });
    if (error) {
      let msg = error.message || 'Falha ao sincronizar';
      try { const body = await error.context?.json?.(); if (body?.error) msg = body.error; } catch (e) { /* sem corpo */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  // sincroniza sozinho ao abrir (admin), no maximo 1x por hora
  const ensure = async (ctx, property, { admin }) => {
    const d = await load(ctx, property, { admin });
    if (admin && d.calendar?.ical_url && d.calendar.active && !d.autoSynced) {
      const last = d.calendar.last_sync_at ? new Date(d.calendar.last_sync_at).getTime() : 0;
      d.autoSynced = true;
      if (Date.now() - last > STALE_MS) {
        try { await sync(ctx, property); await load(ctx, property, { admin }); } catch (e) { console.warn('airbnb sync', e); await load(ctx, property, { admin }); }
      }
    }
    notify();
    return get(property);
  };

  // ---------------------------------------------------------------- CSV do Airbnb
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[#º°.]/g, ' ').replace(/\s+/g, ' ').trim();
  const parseCsv = (text) => {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = []; let cell = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim()));
  };
  const FIELDS = [
    ['code', 'Código da reserva', ['codigo de confirmacao', 'confirmation code', 'codigo da reserva', 'codigo']],
    ['type', 'Tipo da linha', ['tipo', 'type']],
    ['guest', 'Hóspede', ['nome do hospede', 'guest name', 'hospede', 'guest', 'nome']],
    ['start', 'Data de entrada', ['data de inicio', 'start date', 'check-in', 'data de check-in', 'chegada', 'inicio']],
    ['end', 'Data de saída', ['data de termino', 'end date', 'check-out', 'data de check-out', 'data de saida', 'saida', 'termino']],
    ['nights', 'Noites', ['n de noites', 'no de noites', 'numero de noites', 'of nights', 'noites', 'nights']],
    ['gross', 'Valor da reserva (vai para a planilha)', ['ganhos brutos', 'gross earnings', 'valor bruto', 'ganhos', 'earnings', 'valor', 'amount', 'total']],
    ['payout', 'Valor recebido (líquido)', ['pago', 'paid out', 'valor pago', 'repasse', 'payout']],
    ['cleaning', 'Taxa de limpeza', ['taxa de limpeza', 'cleaning fee']],
    ['service', 'Taxa de serviço', ['taxa de servico', 'service fee', 'host service fee']],
    ['guests', 'Nº de hóspedes', ['n de adultos', 'of adults', 'adultos', 'hospedes', 'guests']]
  ];
  const detect = (headers) => {
    const H = headers.map(norm);
    const used = new Set(); const map = {};
    FIELDS.forEach(([key, , aliases]) => {
      let idx = -1;
      for (const a of aliases) { idx = H.findIndex((h, i) => !used.has(i) && h === a); if (idx >= 0) break; }
      if (idx < 0) for (const a of aliases) { idx = H.findIndex((h, i) => !used.has(i) && (h.startsWith(a) || h.endsWith(a))); if (idx >= 0) break; }
      if (idx >= 0) { map[key] = idx; used.add(idx); }
    });
    return map;
  };
  const parseMoney = (raw) => {
    let s = String(raw ?? '').replace(/[^\d,.-]/g, '');
    if (!s || s === '-' ) return null;
    const lc = s.lastIndexOf(','); const ld = s.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc >= 0) s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (ld >= 0 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const dateParts = (v) => { const m = String(v || '').trim().match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/); return m ? [m[1], m[2], m[3]].map(Number) : null; };
  const guessDateFormat = (values, headersPt) => {
    for (const v of values) { const p = dateParts(v); if (!p || p[0] > 31) continue; if (p[0] > 12) return 'DMY'; if (p[1] > 12) return 'MDY'; }
    return headersPt ? 'DMY' : 'MDY';
  };
  const toISODate = (v, fmtCode) => {
    const p = dateParts(v); if (!p) return null;
    let y; let m; let d;
    if (p[0] > 31) [y, m, d] = p; else if (fmtCode === 'DMY') [d, m, y] = p; else [m, d, y] = p;
    if (y < 100) y += 2000;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  // Agrupa as linhas por codigo (o extrato do Airbnb pode ter mais de uma linha por reserva)
  const buildRecords = (rows, map, fmtCode, onlyReservations) => {
    const byKey = new Map(); const skipped = [];
    rows.forEach((r, i) => {
      const val = (k) => (map[k] != null ? String(r[map[k]] ?? '').trim() : '');
      const type = val('type');
      if (onlyReservations && map.type != null && type && !/reserva|reservation|booking/i.test(type)) { skipped.push({ line: i + 2, reason: `tipo "${type}"` }); return; }
      const code = (val('code').match(/[A-Z0-9]{6,14}/i) || [''])[0].toUpperCase() || null;
      const start = toISODate(val('start'), fmtCode);
      let end = toISODate(val('end'), fmtCode);
      const nights = parseInt(val('nights'), 10);
      if (!end && start && nights > 0) end = addDays(start, nights);
      const guest = val('guest') || null;
      if (!code && !(start && guest)) { skipped.push({ line: i + 2, reason: 'sem código e sem data/hóspede' }); return; }
      const key = code || `${start}|${guest}`;
      const cur = byKey.get(key) || { code, guest_name: null, check_in: null, check_out: null, gross_amount: null, payout_amount: null, cleaning_fee: null, service_fee: null, guests: null };
      const add = (k, v) => { if (v != null) cur[k] = Number(((cur[k] || 0) + v).toFixed(2)); };
      cur.guest_name = cur.guest_name || guest;
      cur.check_in = cur.check_in || start;
      cur.check_out = cur.check_out || (end && start && end > start ? end : null);
      add('gross_amount', parseMoney(val('gross')));
      add('payout_amount', parseMoney(val('payout')));
      add('cleaning_fee', parseMoney(val('cleaning')));
      add('service_fee', parseMoney(val('service')));
      const g = parseInt(val('guests'), 10); if (g > 0) cur.guests = g;
      byKey.set(key, cur);
    });
    return { records: [...byKey.values()], skipped };
  };

  const importRecords = async (ctx, property, records) => {
    const sb = ctx.supabase;
    const { data: existing, error } = await sb.from('property_bookings').select('id,code,check_in,check_out,guest_name').eq('property_name', property);
    if (error) throw error;
    const byCode = new Map((existing || []).filter((b) => b.code).map((b) => [b.code, b]));
    const now = new Date().toISOString();
    const out = { updated: 0, created: 0, skipped: 0 };
    for (const r of records) {
      let found = r.code ? byCode.get(r.code) : null;
      if (!found && r.check_in) found = (existing || []).find((b) => b.check_in === r.check_in && (!r.check_out || b.check_out === r.check_out) && !b.guest_name);
      const patch = { csv_imported_at: now, updated_at: now };
      ['guest_name', 'gross_amount', 'payout_amount', 'cleaning_fee', 'service_fee', 'guests'].forEach((k) => { if (r[k] != null) patch[k] = r[k]; });
      if (found) {
        if (r.code && !found.code) patch.code = r.code;
        const { error: e } = await sb.from('property_bookings').update(patch).eq('id', found.id);
        if (e) throw e; out.updated++;
      } else if (r.check_in && r.check_out) {
        const { error: e } = await sb.from('property_bookings').insert({ ...patch, property_name: property, source: 'CSV', kind: 'RESERVA', status: 'ATIVA', code: r.code, check_in: r.check_in, check_out: r.check_out });
        if (e) throw e; out.created++;
      } else out.skipped++;
    }
    return out;
  };

  // ---------------------------------------------------------------- dialog simples
  const dialog = (title, body, { wide = false } = {}) => {
    const d = document.createElement('dialog');
    d.className = `ab-dialog ${wide ? 'wide' : ''}`;
    d.innerHTML = `<form method="dialog"><header><h3>${esc(title)}</h3><button class="ab-x" value="cancel" aria-label="Fechar">×</button></header><div class="ab-body">${body}</div></form>`;
    document.body.appendChild(d);
    d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
    d.showModal();
    return d;
  };

  const openConfig = (ctx, property, onDone) => {
    const cal = get(property).calendar;
    const d = dialog('Calendário do Airbnb', `
      <p class="ab-p">No Airbnb: <b>Calendário → Disponibilidade → Conectar a outro site</b>. Copie o link da <b>Etapa 1</b> (termina em <code>.ics</code>) e cole aqui.</p>
      <p class="ab-p ab-muted">Somente leitura: o CDEV apenas lê esse link para ver as reservas. Não use a Etapa 2 e nada é alterado no seu calendário do Airbnb. O link fica guardado só para administradores.</p>
      <label class="ab-label">Link de exportação (.ics)<input class="ab-input" name="url" value="${esc(cal?.ical_url || '')}" placeholder="https://www.airbnb.com.br/calendar/ical/....ics?t=..." autocomplete="off"></label>
      <label class="ab-check"><input type="checkbox" name="active" ${cal?.active === false ? '' : 'checked'}> Sincronizar automaticamente ao abrir o painel (no máximo 1 vez por hora)</label>
      <p class="ab-err" data-err hidden></p>
      <footer>${cal ? '<button type="button" class="btn" data-remove>Remover link</button>' : ''}<span style="flex:1"></span><button class="btn" value="cancel">Cancelar</button><button type="button" class="btn btn-primary" data-save>Salvar e sincronizar</button></footer>`);
    const err = (m) => { const e = $('[data-err]', d); e.hidden = !m; e.textContent = m || ''; };
    $('[data-save]', d).addEventListener('click', async (ev) => {
      const url = $('[name=url]', d).value.trim();
      if (!ICAL_RE.test(url)) { err('Cole o link de exportação do Airbnb (começa com https://www.airbnb.../calendar/ical/ e termina em .ics).'); return; }
      ev.target.disabled = true; ev.target.textContent = 'Salvando…';
      try {
        const rec = { property_name: property, ical_url: url, active: $('[name=active]', d).checked, updated_at: new Date().toISOString() };
        const { error } = cal ? await ctx.supabase.from('property_calendars').update(rec).eq('id', cal.id) : await ctx.supabase.from('property_calendars').insert(rec);
        if (error) throw error;
        ev.target.textContent = 'Sincronizando…';
        let res = null; let syncErr = null;
        try { res = await sync(ctx, property); } catch (e) { syncErr = e; }
        await load(ctx, property, { admin: true });
        d.close(); notify();
        onDone?.(syncErr ? { error: syncErr.message } : res);
      } catch (e) { err(e.message || 'Não foi possível salvar.'); ev.target.disabled = false; ev.target.textContent = 'Salvar e sincronizar'; }
    });
    $('[data-remove]', d)?.addEventListener('click', async () => {
      if (!window.confirm('Remover o link do calendário? As reservas já importadas continuam salvas.')) return;
      const { error } = await ctx.supabase.from('property_calendars').delete().eq('id', cal.id);
      if (error) { err(error.message); return; }
      await load(ctx, property, { admin: true }); d.close(); notify(); onDone?.({ removed: true });
    });
  };

  const openImport = (ctx, property, onDone) => {
    const d = dialog('Importar CSV do Airbnb', `
      <p class="ab-p">No Airbnb: <b>Menu → Ganhos (ou Reservas) → Exportar CSV</b>. O arquivo traz <b>nome do hóspede</b> e <b>valores</b>; o CDEV junta com o calendário pelo código da reserva (HM…).</p>
      <label class="btn ab-file">Escolher arquivo .csv<input type="file" accept=".csv,text/csv" data-file hidden></label>
      <div data-step></div>`, { wide: true });
    let rows = []; let headers = []; let map = {}; let fmtCode = 'DMY';
    const step = $('[data-step]', d);
    const draw = () => {
      if (!headers.length) { step.innerHTML = ''; return; }
      const sel = (key) => `<select class="ab-input" data-map="${key}"><option value="">— não usar —</option>${headers.map((h, i) => `<option value="${i}" ${map[key] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>`;
      const onlyRes = $('[data-onlyres]', d)?.checked ?? true;
      const { records, skipped } = buildRecords(rows, map, fmtCode, onlyRes);
      const bookings = get(property).bookings;
      const match = (r) => (r.code && bookings.find((b) => b.code === r.code)) || null;
      const found = records.filter(match).length;
      step.innerHTML = `
        <div class="ab-map">${FIELDS.map(([k, t]) => `<label class="ab-label">${esc(t)}${sel(k)}</label>`).join('')}
          <label class="ab-label">Formato das datas<select class="ab-input" data-fmt><option value="DMY" ${fmtCode === 'DMY' ? 'selected' : ''}>dia/mês/ano</option><option value="MDY" ${fmtCode === 'MDY' ? 'selected' : ''}>mês/dia/ano (Airbnb em inglês)</option></select></label></div>
        ${map.type != null ? `<label class="ab-check"><input type="checkbox" data-onlyres ${onlyRes ? 'checked' : ''}> Usar só linhas de reserva (ignora repasses, ajustes e outras linhas do extrato)</label>` : ''}
        <p class="ab-p"><b>${records.length}</b> reserva(s) no arquivo · <b>${found}</b> já estão no calendário (pelo código) · ${records.length - found} novas${skipped.length ? ` · ${skipped.length} linha(s) ignoradas` : ''}</p>
        <div class="ab-table-wrap"><table class="ab-table"><thead><tr><th>Código</th><th>Hóspede</th><th>Entrada</th><th>Saída</th><th>Valor</th><th></th></tr></thead><tbody>
          ${records.slice(0, 60).map((r) => `<tr><td class="mono">${esc(r.code || '—')}</td><td>${esc(r.guest_name || '—')}</td><td>${esc(fmt(r.check_in) || '?')}</td><td>${esc(fmt(r.check_out) || '?')}</td><td class="num">${r.gross_amount != null ? money.format(r.gross_amount) : '—'}</td><td>${match(r) ? '<span class="ab-tag ok">no calendário</span>' : r.check_in && r.check_out ? '<span class="ab-tag">nova</span>' : '<span class="ab-tag warn">sem datas</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        ${records.length > 60 ? `<p class="ab-muted ab-p">Mostrando 60 de ${records.length}.</p>` : ''}
        <p class="ab-err" data-err hidden></p>
        <footer><span style="flex:1"></span><button class="btn" value="cancel">Cancelar</button><button type="button" class="btn btn-primary" data-go ${records.length ? '' : 'disabled'}>Importar ${records.length} reserva(s)</button></footer>`;
      $$('[data-map]', step).forEach((s) => s.addEventListener('change', () => { map[s.dataset.map] = s.value === '' ? undefined : Number(s.value); draw(); }));
      $('[data-fmt]', step).addEventListener('change', (e) => { fmtCode = e.target.value; draw(); });
      $('[data-onlyres]', step)?.addEventListener('change', draw);
      $('[data-go]', step).addEventListener('click', async (ev) => {
        ev.target.disabled = true; ev.target.textContent = 'Importando…';
        try {
          const res = await importRecords(ctx, property, buildRecords(rows, map, fmtCode, $('[data-onlyres]', d)?.checked ?? true).records);
          await load(ctx, property, { admin: true });
          d.close(); notify(); onDone?.(res);
        } catch (e) { const er = $('[data-err]', d); er.hidden = false; er.textContent = e.message || 'Falha ao importar.'; ev.target.disabled = false; ev.target.textContent = 'Importar'; }
      });
    };
    $('[data-file]', d).addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      const all = parseCsv(await f.text());
      headers = all[0] || []; rows = all.slice(1); map = detect(headers);
      const pt = headers.some((h) => /[ãçé]|data|hospede|hóspede|noites|codigo|código/i.test(h));
      const dates = rows.slice(0, 200).flatMap((r) => [r[map.start], r[map.end]]).filter(Boolean);
      fmtCode = guessDateFormat(dates, pt);
      if (!headers.length) { step.innerHTML = '<p class="ab-err">Arquivo vazio ou inválido.</p>'; return; }
      draw();
    });
  };

  const openBooking = (ctx, property, b, onDone) => {
    const d = dialog(`Reserva ${b.code || ''}`.trim(), `
      <p class="ab-p">${esc(fmt(b.check_in))} → ${esc(fmt(b.check_out))} · ${b.nights} noite(s) · origem: ${b.source === 'ICAL' ? 'calendário do Airbnb' : b.source === 'CSV' ? 'CSV do Airbnb' : 'manual'}${b.status !== 'ATIVA' ? ` · <b>${b.status === 'REMOVIDA' ? 'sumiu do calendário (cancelada ou alterada)' : 'cancelada'}</b>` : ''}</p>
      <div class="ab-map">
        <label class="ab-label">Hóspede<input class="ab-input" name="guest_name" value="${esc(b.guest_name || '')}"></label>
        <label class="ab-label">Valor da reserva<input class="ab-input" name="gross_amount" inputmode="decimal" value="${b.gross_amount != null ? String(b.gross_amount).replace('.', ',') : ''}" placeholder="0,00"></label>
        <label class="ab-label">Nº de hóspedes<input class="ab-input" name="guests" inputmode="numeric" value="${esc(b.guests ?? '')}"></label>
        <label class="ab-label">Situação<select class="ab-input" name="status"><option value="ATIVA" ${b.status === 'ATIVA' ? 'selected' : ''}>Ativa</option><option value="CANCELADA" ${b.status === 'CANCELADA' ? 'selected' : ''}>Cancelada (não conta)</option>${b.status === 'REMOVIDA' ? '<option value="REMOVIDA" selected>Sumiu do calendário (não conta)</option>' : ''}</select></label>
        <label class="ab-label" style="grid-column:1/-1">Observação<input class="ab-input" name="notes" value="${esc(b.notes || '')}"></label>
      </div>
      <p class="ab-err" data-err hidden></p>
      <footer><span style="flex:1"></span><button class="btn" value="cancel">Cancelar</button><button type="button" class="btn btn-primary" data-save>Salvar</button></footer>`);
    $('[data-save]', d).addEventListener('click', async () => {
      const v = (n) => $(`[name=${n}]`, d).value.trim();
      const patch = { guest_name: v('guest_name') || null, gross_amount: v('gross_amount') ? parseMoney(v('gross_amount')) : null, guests: v('guests') ? parseInt(v('guests'), 10) || null : null, status: v('status'), notes: v('notes') || null, updated_at: new Date().toISOString() };
      const { error } = await ctx.supabase.from('property_bookings').update(patch).eq('id', b.id);
      if (error) { const e = $('[data-err]', d); e.hidden = false; e.textContent = error.message; return; }
      await load(ctx, property, { admin: true }); d.close(); notify(); onDone?.();
    });
  };

  // ---------------------------------------------------------------- visao "Calendario"
  const view = { month: null };
  const relTime = (s) => {
    if (!s) return 'nunca';
    const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
    if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60); if (h < 48) return `há ${h} h`;
    return new Date(s).toLocaleDateString('pt-BR');
  };
  const COLORS = ['#2b8ba5', '#e07b24', '#7c6cf0', '#3fb68b', '#d6b44a', '#e5534b', '#4aa3df', '#c06bd6'];
  const colorOf = (b) => { let h = 0; const s = b.code || b.ical_uid || b.id; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; };

  const renderView = (el, { ctx, sheet, admin, editable, months, onFill }) => {
    const property = sheet.property_name; const y = sheet.year;
    const data = get(property);
    if (data.missing) { el.innerHTML = `<div class="ab-empty"><b>Banco ainda sem as tabelas do calendário.</b><span>Rode <code>supabase/17_airbnb_calendario.sql</code> no Supabase.</span></div>`; return; }
    const now = new Date();
    if (!view.month || view.year !== y || view.property !== property) {
      view.year = y; view.property = property;
      view.month = y === now.getFullYear() ? now.getMonth() + 1 : (Array.from({ length: 12 }, (_, i) => i + 1).find((m) => monthAgg(data.bookings, y, m).reservations.length) || 1);
    }
    const m = view.month;
    const agg = monthAgg(data.bookings, y, m);
    const cal = data.calendar;
    const days = new Date(y, m, 0).getDate();
    const lead = new Date(y, m - 1, 1).getDay();
    const dayInfo = (d) => {
      const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const b = data.bookings.find((x) => active(x) && x.check_in <= day && day < x.check_out);
      const out = data.bookings.find((x) => active(x) && x.kind === 'RESERVA' && x.check_out === day);
      return { day, b, out };
    };
    const row = monthRow(months, m);
    const vals = fillValues(agg);
    const diff = row ? [['clients_count', 'Reservas'], ['nights_count', 'Noites'], ['paid_clients', 'Valor pago pelos hóspedes']].filter(([k]) => vals[k] != null && Number(row[k] || 0) !== Number(vals[k])) : [];
    el.innerHTML = `
      <div class="ab-bar">
        <div class="ab-status">${cal?.ical_url ? `<span class="ab-dot ${cal.last_sync_status === 'ERRO' ? 'err' : 'ok'}"></span><span>Calendário do Airbnb · sincronizado ${esc(relTime(cal.last_sync_at))}${cal.last_sync_status === 'ERRO' ? ` · <b class="ab-errtxt">${esc(cal.last_sync_message || 'erro')}</b>` : ''}</span>` : admin ? '<span class="ab-dot"></span><span>Calendário do Airbnb não conectado</span>' : `<span>${data.bookings.length} reserva(s) registradas</span>`}</div>
        ${admin ? `<div class="ab-actions">
          ${cal?.ical_url ? '<button class="btn" type="button" data-ab-sync>Sincronizar agora</button>' : ''}
          <button class="btn" type="button" data-ab-import>Importar CSV do Airbnb</button>
          <button class="btn ${cal?.ical_url ? '' : 'btn-primary'}" type="button" data-ab-config>${cal?.ical_url ? 'Link do calendário' : 'Conectar calendário'}</button>
        </div>` : ''}
      </div>
      <div class="ab-months">${MONTHS_FULL.map((n, i) => { const a = monthAgg(data.bookings, y, i + 1); return `<button type="button" class="ab-mchip ${i + 1 === m ? 'on' : ''}" data-ab-month="${i + 1}"><b>${n.slice(0, 3)}</b><span>${a.nights ? `${a.nights} ${a.nights === 1 ? 'noite' : 'noites'}` : '—'}</span></button>`; }).join('')}</div>
      <div class="ab-grid-wrap">
        <div class="ab-grid">
          ${WEEK.map((w) => `<div class="ab-wd">${w}</div>`).join('')}
          ${Array.from({ length: lead }, () => '<div class="ab-day empty"></div>').join('')}
          ${Array.from({ length: days }, (_, i) => {
            const { day, b, out } = dayInfo(i + 1);
            const start = b && b.check_in === day; const isBlock = b && b.kind === 'BLOQUEIO';
            return `<div class="ab-day ${b ? (isBlock ? 'blocked' : 'busy') : ''} ${day === iso(now) ? 'today' : ''}" ${b && !isBlock ? `style="--c:${colorOf(b)}" data-ab-booking="${b.id}" role="button" tabindex="0"` : ''} title="${b ? esc(isBlock ? 'Bloqueado' : `${label(b)} · ${fmt(b.check_in)} → ${fmt(b.check_out)}`) : ''}">
              <span class="n">${i + 1}</span>${out ? '<span class="out" title="Saída">↦</span>' : ''}
              ${b ? `<span class="bar ${start ? 'start' : ''}">${start && !isBlock ? esc(label(b)) : isBlock && start ? 'Bloqueado' : ''}</span>` : ''}
            </div>`; }).join('')}
        </div>
      </div>
      <div class="ab-summary">
        <div><span>Noites ocupadas</span><b>${agg.nights} de ${days}</b><small>${Math.round((agg.nights / days) * 100)}% de ocupação</small></div>
        <div><span>Reservas com entrada no mês</span><b>${agg.clients}</b><small>${agg.missingName ? `${agg.missingName} sem nome (importe o CSV)` : 'todas com nome'}</small></div>
        <div><span>Valor das reservas</span><b>${money.format(agg.gross)}</b><small>${agg.missingValue ? `${agg.missingValue} sem valor (importe o CSV)` : agg.clients ? 'todas com valor' : '—'}</small></div>
        ${editable ? `<div class="ab-fill"><button class="btn btn-primary" type="button" data-ab-fill="${m}" ${agg.reservations.length && diff.length ? '' : 'disabled'}>Preencher ${MONTHS_FULL[m - 1]} na planilha</button><small>${diff.length ? `Muda: ${diff.map(([, t]) => t).join(', ')}` : 'Planilha já confere com o calendário'}</small></div>` : ''}
      </div>
      <div class="ab-list">
        <table class="ab-table"><thead><tr><th>Hóspede</th><th>Código</th><th>Entrada</th><th>Saída</th><th class="num">Noites (no mês)</th><th class="num">Valor</th><th>Origem</th></tr></thead><tbody>
        ${agg.reservations.length ? agg.reservations.map((b) => `<tr ${admin ? `data-ab-booking="${b.id}" class="click"` : ''}><td><span class="sw" style="background:${colorOf(b)}"></span>${esc(b.guest_name || '—')}</td><td class="mono">${esc(b.code || '—')}</td><td>${esc(fmt(b.check_in))}</td><td>${esc(fmt(b.check_out))}</td><td class="num">${b.nights} (${nightsIn(b, y, m)})</td><td class="num">${b.gross_amount != null ? money.format(b.gross_amount) : '<span class="ab-muted">—</span>'}</td><td>${b.source === 'ICAL' ? (b.csv_imported_at ? 'calendário + CSV' : 'calendário') : b.source === 'CSV' ? 'CSV' : 'manual'}</td></tr>`).join('') : `<tr><td colspan="7" class="ab-muted">Nenhuma reserva em ${MONTHS_FULL[m - 1]}.</td></tr>`}
        </tbody></table>
      </div>
      ${editable ? `<div class="ab-foot"><button class="btn" type="button" data-ab-fill-all>Preencher todos os meses de ${y} com o calendário</button><span class="ab-muted">Preenche reservas, noites, hóspedes e valor (quando houver). Despesas e comissão não são alteradas.</span></div>` : ''}
      <p class="ab-muted ab-note">Somente leitura do Airbnb: o CDEV lê o calendário exportado e nunca altera nada no Airbnb. Reservas que atravessam meses contam as noites em cada mês; valor e hóspede entram no mês da entrada.</p>`;

    const rerender = () => renderView(el, { ctx, sheet, admin, editable, months, onFill });
    el.onclick = async (e) => {
      const mb = e.target.closest('[data-ab-month]'); if (mb) { view.month = Number(mb.dataset.abMonth); rerender(); return; }
      const bk = e.target.closest('[data-ab-booking]');
      if (bk && admin) { const b = data.bookings.find((x) => x.id === bk.dataset.abBooking); if (b) openBooking(ctx, property, b, rerender); return; }
      if (e.target.closest('[data-ab-config]')) { openConfig(ctx, property, (r) => { if (r?.error) window.alert(`Link salvo, mas a sincronização falhou: ${r.error}`); rerender(); }); return; }
      if (e.target.closest('[data-ab-import]')) { openImport(ctx, property, (r) => { window.alert(`CSV importado: ${r.updated} reserva(s) atualizada(s), ${r.created} nova(s)${r.skipped ? `, ${r.skipped} sem datas ignorada(s)` : ''}.`); rerender(); }); return; }
      const sb = e.target.closest('[data-ab-sync]');
      if (sb) {
        sb.disabled = true; sb.textContent = 'Sincronizando…';
        try { const r = await sync(ctx, property); await load(ctx, property, { admin }); notify(); rerender(); sb.blur(); window.dispatchEvent(new CustomEvent('cdev:toast', { detail: `Calendário atualizado: ${r.counts.reservations} reservas (${r.counts.created} novas${r.counts.removed ? `, ${r.counts.removed} canceladas/alteradas` : ''}).` })); }
        catch (err) { await load(ctx, property, { admin }); rerender(); window.alert(err.message); }
        return;
      }
      const f = e.target.closest('[data-ab-fill]'); if (f) { onFill?.([Number(f.dataset.abFill)]); return; }
      if (e.target.closest('[data-ab-fill-all]')) onFill?.(Array.from({ length: 12 }, (_, i) => i + 1));
    };
  };
  const monthRow = (months, m) => (months || []).find((r) => r.month_num === m);

  // ---------------------------------------------------------------- caixa no modal do mes
  const monthBoxHtml = (sheet, draft, { editable }) => {
    const data = get(sheet.property_name);
    if (data.missing) return '';
    const agg = monthAgg(data.bookings, sheet.year, draft.month_num);
    if (!data.bookings.length && !data.calendar) return '';
    const vals = fillValues(agg);
    const same = Number(draft.nights_count || 0) === vals.nights_count && Number(draft.clients_count || 0) === vals.clients_count && (vals.paid_clients == null || Number(draft.paid_clients || 0) === vals.paid_clients);
    return `<div class="ab-box">
      <div class="ab-box-head"><strong>Airbnb</strong><span class="ab-muted">${agg.reservations.length} reserva(s) no mês</span></div>
      ${agg.reservations.length ? `<ul class="ab-mini">${agg.reservations.map((b) => `<li><span class="sw" style="background:${colorOf(b)}"></span><span>${esc(label(b))}<small>${esc(fmtShort(b.check_in))}→${esc(fmtShort(b.check_out))} · ${nightsIn(b, sheet.year, draft.month_num)} noite(s) no mês</small></span><b>${b.gross_amount != null && b.check_in.slice(5, 7) === String(draft.month_num).padStart(2, '0') ? esc(money.format(b.gross_amount)) : ''}</b></li>`).join('')}</ul>` : '<p class="ab-muted ab-p">Nenhuma reserva no calendário deste mês.</p>'}
      <div class="ab-box-sum">${agg.nights} ${agg.nights === 1 ? 'noite' : 'noites'} · ${agg.clients} entrada(s) · ${money.format(agg.gross)}${agg.missingValue ? ` <span class="ab-warn">(${agg.missingValue} sem valor)</span>` : ''}</div>
      ${editable ? (same ? '<p class="ab-muted ab-p">A planilha já confere com o calendário.</p>' : '<button class="btn btn-primary" type="button" data-md-airbnb>Preencher com os dados do Airbnb</button><small class="ab-muted">Preenche reservas, noites, hóspedes e valor pago. Revise e salve.</small>') : ''}
    </div>`;
  };

  // ---------------------------------------------------------------- estilos
  const css = `
  .ab-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:1rem}
  .ab-status{display:flex;align-items:center;gap:.55rem;font-size:var(--fs-sm,14px);color:#a9c0c8}
  .ab-dot{width:9px;height:9px;border-radius:50%;background:#4a6570;flex-shrink:0}.ab-dot.ok{background:#3fb68b;box-shadow:0 0 0 4px rgba(63,182,139,.15)}.ab-dot.err{background:#e5534b}
  .ab-errtxt{color:#f0a15c;font-weight:500}
  .ab-actions{display:flex;flex-wrap:wrap;gap:.5rem}
  .ab-months{display:grid;grid-template-columns:repeat(auto-fill,minmax(5.2rem,1fr));gap:.4rem;margin-bottom:1rem}
  .ab-mchip{display:grid;gap:.1rem;padding:.45rem .5rem;border:1px solid var(--line,rgba(30,98,117,.18));border-radius:8px;background:rgba(8,14,16,.4);color:#a9c0c8;text-align:left;cursor:pointer;font:inherit}
  .ab-mchip b{color:#e8f2f5;font-size:var(--fs-sm,14px)}.ab-mchip span{font-family:var(--fm,monospace);font-size:11px;color:#6f8d98}
  .ab-mchip.on{border-color:#2b8ba5;background:rgba(43,139,165,.14)}.ab-mchip:hover{border-color:rgba(43,139,165,.6)}
  .ab-grid-wrap{overflow-x:auto}
  .ab-grid{display:grid;grid-template-columns:repeat(7,minmax(4.2rem,1fr));gap:3px;min-width:30rem}
  .ab-wd{font-family:var(--fm,monospace);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6f8d98;padding:.3rem .4rem}
  .ab-day{position:relative;min-height:4.4rem;border:1px solid var(--line,rgba(30,98,117,.18));border-radius:6px;background:rgba(8,14,16,.35);padding:.3rem .35rem;overflow:hidden}
  .ab-day.empty{border:0;background:none}
  .ab-day .n{font-family:var(--fm,monospace);font-size:12px;color:#6f8d98}
  .ab-day.today{border-color:#2b8ba5}.ab-day.today .n{color:#e8f2f5;font-weight:700}
  .ab-day .out{position:absolute;top:.25rem;right:.35rem;font-size:12px;color:#6f8d98}
  .ab-day.busy{cursor:pointer;background:color-mix(in srgb,var(--c) 14%,rgba(8,14,16,.5));border-color:color-mix(in srgb,var(--c) 45%,transparent)}
  .ab-day.busy .bar{position:absolute;left:0;right:0;bottom:.35rem;height:1.35rem;background:var(--c);opacity:.85;color:#fff;font-size:11px;font-weight:600;line-height:1.35rem;padding:0 .4rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ab-day.busy .bar.start{left:.3rem;border-radius:4px 0 0 4px}
  .ab-day.blocked{background:repeating-linear-gradient(135deg,rgba(111,141,152,.12) 0 6px,transparent 6px 12px)}
  .ab-day.blocked .bar{position:absolute;left:.35rem;bottom:.35rem;font-size:10.5px;color:#6f8d98}
  .ab-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:.7rem;margin:1rem 0}
  .ab-summary>div{border:1px solid var(--line,rgba(30,98,117,.18));border-radius:8px;padding:.75rem .85rem;display:grid;gap:.15rem;background:rgba(8,14,16,.35)}
  .ab-summary span{font-family:var(--fm,monospace);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6f8d98}
  .ab-summary b{font-family:var(--fm,monospace);font-size:var(--fs-lg,18px);color:#e8f2f5;font-weight:500}
  .ab-summary small{font-size:12px;color:#6f8d98}
  .ab-summary .ab-fill{align-content:center;background:rgba(43,139,165,.08);border-color:rgba(43,139,165,.4)}
  .ab-table-wrap,.ab-list{overflow-x:auto}
  .ab-table{width:100%;border-collapse:collapse;font-size:var(--fs-sm,14px)}
  .ab-table th{font-family:var(--fm,monospace);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6f8d98;text-align:left;font-weight:400;padding:.55rem .6rem;border-bottom:1px solid var(--line-strong,rgba(30,98,117,.45));white-space:nowrap}
  .ab-table td{padding:.55rem .6rem;border-bottom:1px solid var(--line,rgba(30,98,117,.18));color:#cfe0e5;white-space:nowrap}
  .ab-table .num{text-align:right;font-family:var(--fm,monospace)}.ab-table .mono{font-family:var(--fm,monospace);font-size:12px}
  .ab-table tr.click{cursor:pointer}.ab-table tr.click:hover td{background:rgba(43,139,165,.08)}
  .sw{display:inline-block;width:.6rem;height:.6rem;border-radius:2px;margin-right:.45rem;vertical-align:middle}
  .ab-foot{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;margin-top:1rem}
  .ab-muted{color:#6f8d98;font-size:12.5px}.ab-note{margin-top:.9rem}.ab-warn{color:#f0a15c}
  .ab-empty{display:grid;gap:.4rem;padding:2rem 1rem;text-align:center;color:#a9c0c8}
  .ab-box{border:1px solid var(--line,rgba(30,98,117,.18));border-radius:10px;padding:.85rem;display:grid;gap:.55rem}
  .ab-box-head{display:flex;justify-content:space-between;align-items:center;gap:.5rem}
  .ab-box-sum{font-family:var(--fm,monospace);font-size:12.5px;color:#e8f2f5}
  .ab-mini{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
  .ab-mini li{display:flex;align-items:flex-start;gap:.4rem;font-size:13px;color:#cfe0e5}
  .ab-mini li>span:nth-child(2){flex:1;display:grid}.ab-mini small{color:#6f8d98;font-size:11.5px}.ab-mini b{font-family:var(--fm,monospace);font-weight:500;font-size:12px}
  .ab-mini .sw{margin-top:.35rem}
  .ab-dialog{border:1px solid var(--line-strong,rgba(30,98,117,.45));border-radius:12px;background:#0c1518;color:#e8f2f5;padding:0;width:min(560px,calc(100vw - 2rem));max-height:calc(100dvh - 2rem)}
  .ab-dialog.wide{width:min(980px,calc(100vw - 2rem))}
  .ab-dialog::backdrop{background:rgba(4,8,9,.72);backdrop-filter:blur(3px)}
  .ab-dialog header{display:flex;justify-content:space-between;align-items:center;padding:.9rem 1.1rem;border-bottom:1px solid var(--line,rgba(30,98,117,.18))}
  .ab-dialog h3{margin:0;font-size:var(--fs-base,16px)}
  .ab-x{background:none;border:0;color:#a9c0c8;font-size:1.4rem;cursor:pointer;line-height:1}
  .ab-body{padding:1rem 1.1rem;display:grid;gap:.75rem;overflow:auto;max-height:calc(100dvh - 8rem)}
  .ab-body footer{display:flex;gap:.5rem;align-items:center;padding-top:.4rem}
  .ab-p{margin:0;font-size:13.5px;line-height:1.55;color:#a9c0c8}.ab-p b{color:#e8f2f5}
  .ab-label{display:grid;gap:.3rem;font-family:var(--fm,monospace);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6f8d98}
  .ab-input{font:inherit;font-family:var(--fd,inherit);font-size:14px;letter-spacing:0;text-transform:none;color:#e8f2f5;background:rgba(8,14,16,.6);border:1px solid var(--line-strong,rgba(30,98,117,.45));border-radius:6px;padding:.55rem .65rem;width:100%}
  .ab-check{display:flex;gap:.5rem;align-items:center;font-size:13px;color:#a9c0c8}
  .ab-err{margin:0;color:#f0a15c;font-size:13px}
  .ab-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:.6rem}
  .ab-file{justify-self:start;cursor:pointer}
  .ab-tag{font-family:var(--fm,monospace);font-size:11px;padding:.12rem .45rem;border-radius:99px;border:1px solid var(--line-strong,rgba(30,98,117,.45));color:#a9c0c8}
  .ab-tag.ok{color:#7fd1a8;border-color:rgba(46,160,110,.4)}.ab-tag.warn{color:#f0a15c;border-color:rgba(224,123,36,.45)}
  .ab-dialog code,.ab-empty code{font-family:var(--fm,monospace);font-size:.9em;color:#e8f2f5}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  window.CDEVAirbnb = { load, ensure, get, sync, monthAgg, fillValues, nightsIn, renderView, monthBoxHtml, openConfig, openImport, onChange: (fn) => listeners.add(fn), _test: { parseCsv, detect, buildRecords, parseMoney, toISODate, guessDateFormat } };
})();
