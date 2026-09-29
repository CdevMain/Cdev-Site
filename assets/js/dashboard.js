/* CDEV - Planilhas de imoveis (Airbnb / temporada) v2
 * - Visao "Meses": cartoes por mes (lucro, faturamento, ocupacao, status da comissao) + grafico
 * - Modal do mes: leitura organizada e edicao por secoes, com calculo ao vivo e navegacao entre meses
 * - "Comissoes": status de pagamento da comissao do coanfitriao (pago, a vencer, atrasado) e baixa rapida
 * - "Tabela completa": edicao em lote direto nas celulas (Ctrl+S), igual a versao anterior
 * A formula de calculo nao mudou (assets/js/sheet-calc.js).
 */
(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const moneyShort = (v) => {
    const a = Math.abs(v);
    if (a >= 1000) return `${v < 0 ? '-' : ''}R$ ${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return money.format(v);
  };
  const pct = (v) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const fmtDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
  const fmtDateShort = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const COLOR_PROFIT = '#2aa0c6';
  const COLOR_LOSS = '#d4691e';

  const NUMBER_FIELDS = ['clients_count', 'nights_count', 'paid_clients', 'paid_extra', 'cleaning_laundry', 'host_fee_override', 'fixed_gas', 'fixed_electricity', 'fixed_internet', 'fixed_condo', 'variable_total', 'host_fee_paid_amount'];
  const NULLABLE_FIELDS = ['cleaning_laundry', 'host_fee_override', 'host_fee_paid_amount'];
  const SAVE_FIELDS = ['clients_count', 'nights_count', 'client_description', 'paid_clients', 'paid_extra', 'cleaning_laundry', 'host_fee_override', 'fixed_gas', 'fixed_electricity', 'fixed_internet', 'fixed_condo', 'variable_location', 'variable_description', 'variable_date', 'variable_total'];
  const PAY_FIELDS = ['host_fee_paid_at', 'host_fee_paid_amount', 'host_fee_payment_method', 'host_fee_note'];
  const PAY_METHODS = [['PIX', 'Pix'], ['TRANSFERENCIA', 'Transferência'], ['DINHEIRO', 'Dinheiro'], ['CARTAO', 'Cartão'], ['BOLETO', 'Boleto'], ['OUTRO', 'Outro']];
  const PAY_LABEL = { PAGO: 'Pago', ATRASADO: 'Atrasado', A_VENCER: 'A vencer', EM_ANDAMENTO: 'Mês em andamento', FUTURO: 'Previsto', SEM_VALOR: 'Sem comissão' };

  const state = {
    ctx: null,
    settings: {},
    spreadsheets: [],
    months: [],
    snapshot: new Map(), // id -> assinatura do mes como esta no banco (campos da tabela)
    dirty: new Set(),
    activeSpreadsheetId: null,
    view: 'months',
    activeTab: 'summary',
    listQuery: '',
    ignoreRealtimeUntil: 0,
    remoteChanged: false,
    modal: null
  };

  const isAdmin = () => state.ctx?.profile?.role === 'admin';
  const canEdit = () => isAdmin() && window.CDEVAuth.isEnabled(state.settings, 'editing_enabled');
  const toNumber = window.CDEVSheetCalc.toNumber;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const activeSpreadsheet = () => state.spreadsheets.find((s) => s.id === state.activeSpreadsheetId);
  // Aceita "1.234,56", "1234,56" ou "1234.56"
  const parseMoney = (raw) => {
    let v = String(raw ?? '').replace(/[R$\s]/g, '').trim();
    if (!v) return null;
    if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const toInput = (v) => (v === null || v === undefined || v === '' ? '' : String(Number(v).toFixed(2)).replace('.', ','));
  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 14.06 4 20M14 4l6 6-9.5 9.5-6-6Z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>'
  };

  // ---------------------------------------------------------------- Toasts
  const showToast = (message, tone = 'success') => {
    const region = $('#toast-region');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = `toast is-${tone}`;
    toast.innerHTML = `${tone === 'success' ? ICON.check : ICON.alert}<span>${esc(message)}</span>`;
    region.appendChild(toast);
    setTimeout(() => { toast.classList.add('is-leaving'); setTimeout(() => toast.remove(), 220); }, tone === 'error' ? 5200 : 3200);
  };

  // ---------------------------------------------------------------- Calculos (fonte unica: assets/js/sheet-calc.js)
  const { autoCleaning, calcMonth, isFuture, paymentStatus, paymentTotals } = window.CDEVSheetCalc;
  const totalsFor = (sheet) => window.CDEVSheetCalc.totals(sheet, state.months);
  const payChip = (p) => {
    const icon = p.key === 'PAGO' ? ICON.check : p.key === 'ATRASADO' ? ICON.alert : ICON.clock;
    const text = p.key === 'PAGO' ? 'Pago' : p.key === 'ATRASADO' ? `Atrasado ${p.daysLate}d` : p.key === 'A_VENCER' ? `Vence ${fmtDateShort(p.dueISO)}` : PAY_LABEL[p.key];
    return `<span class="pay-chip pay-${p.key}" title="Comissão do coanfitrião: ${esc(PAY_LABEL[p.key])}">${icon}${esc(text)}</span>`;
  };

  // ---------------------------------------------------------------- Lista de planilhas
  const renderSpreadsheetList = () => {
    const list = $('#spreadsheet-list');
    if (!list) return;
    const search = $('#sheet-search');
    if (search) search.hidden = state.spreadsheets.length < 5;
    const q = state.listQuery.trim().toLowerCase();
    const items = state.spreadsheets.filter((s) => !q || `${s.title} ${s.property_name} ${s.year} ${s.address || ''}`.toLowerCase().includes(q));
    if (!state.spreadsheets.length) {
      list.innerHTML = `<p class="sheet-list-empty">${isAdmin() ? 'Nenhuma planilha ainda. Crie uma em Admin → Imóveis.' : 'Nenhuma planilha disponível para você ainda.'}</p>`;
      return;
    }
    list.innerHTML = items.map((sheet) => {
      const active = sheet.id === state.activeSpreadsheetId;
      const thumb = sheet.cover_image_url ? `<img src="${esc(sheet.cover_image_url)}" alt="" loading="lazy">` : ICON.home;
      return `<button type="button" class="sheet-card ${active ? 'active' : ''}" data-spreadsheet-id="${sheet.id}" role="tab" aria-selected="${active}">
          <span class="sheet-thumb">${thumb}</span>
          <span class="sheet-card-info">
            <strong>${esc(sheet.property_name)}</strong>
            <span>${sheet.year} · ${pct(toNumber(sheet.commission_rate))} coanfitrião${sheet.active ? '' : ' · arquivada'}</span>
          </span>
          <span class="sheet-card-dot ${sheet.active ? 'is-active' : ''}" title="${sheet.active ? 'Ativa' : 'Arquivada'}"></span>
        </button>`;
    }).join('') || '<p class="sheet-list-empty">Nada encontrado.</p>';
  };

  // ---------------------------------------------------------------- Cabecalho do imovel e indicadores
  const renderHero = () => {
    const sheet = activeSpreadsheet();
    const hero = $('#prop-hero');
    if (!hero || !sheet) return;
    hero.style.backgroundImage = sheet.cover_image_url ? `url("${sheet.cover_image_url.replace(/"/g, '%22')}")` : '';
    $('#sheet-title').textContent = sheet.property_name;
    $('#sheet-kicker').textContent = sheet.title || 'Planilha';
    const due = toNumber(sheet.commission_due_day) || 10;
    $('#prop-meta').innerHTML = [
      `<span class="prop-year">${sheet.year}</span>`,
      sheet.address ? `<span>${ICON.pin}${esc(sheet.address)}</span>` : '',
      `<span>${ICON.card}Coanfitrião ${pct(toNumber(sheet.commission_rate))} · vence dia ${due} do mês seguinte</span>`,
      sheet.active ? '' : '<span class="pay-chip pay-FUTURO">Arquivada</span>'
    ].join('');
    const link = $('#sheet-listing');
    if (link) { link.hidden = !sheet.listing_url; if (sheet.listing_url) link.href = sheet.listing_url; }
  };

  const renderKpis = () => {
    const sheet = activeSpreadsheet();
    const set = (id, value, hint) => {
      const el = $(`#${id}`); if (!el) return;
      el.querySelector('strong').textContent = value;
      const h = el.querySelector('small'); if (h) h.textContent = hint || '';
    };
    if (!sheet || !state.months.length) {
      ['kpi-profit', 'kpi-occupancy', 'kpi-adr', 'kpi-commission'].forEach((id) => set(id, '—', ''));
      return;
    }
    const t = totalsFor(sheet);
    set('kpi-profit', moneyShort(t.net), `margem ${pct(t.margin)} · ${t.bookings} reservas`);
    set('kpi-occupancy', pct(t.occupancy), `${t.nights} noites ocupadas em ${sheet.year}`);
    const meter = $('#kpi-occupancy .meter i'); if (meter) meter.style.width = `${Math.round(t.occupancy * 100)}%`;
    set('kpi-adr', money.format(t.adr), 'valor pago ÷ noites');
    const p = paymentTotals(sheet, state.months);
    set('kpi-commission', moneyShort(p.received), p.overdueCount ? `${p.overdueCount} ${p.overdueCount === 1 ? 'mês atrasado' : 'meses atrasados'} · ${money.format(p.overdue)}` : p.pending ? `${money.format(p.pending)} a receber` : 'nada pendente');
    $('#kpi-commission').classList.toggle('is-warn', p.overdueCount > 0);
    const profitEl = $('#kpi-profit strong');
    if (profitEl) profitEl.style.color = t.net < 0 ? COLOR_LOSS : '';
    const badge = $('#pay-badge');
    if (badge) { badge.hidden = !p.overdueCount; badge.textContent = p.overdueCount; }
  };

  const sparklineSvg = (values) => {
    if (values.length < 2) return '';
    const w = 120; const h = 26; const pad = 2;
    const min = Math.min(...values, 0); const max = Math.max(...values, 0); const range = max - min || 1;
    const step = (w - pad * 2) / (values.length - 1);
    const pts = values.map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - ((v - min) / range) * (h - pad * 2)).toFixed(1)}`).join(' ');
    return `<svg class="summary-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${values[values.length - 1] >= 0 ? COLOR_PROFIT : COLOR_LOSS}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };

  const renderSummary = () => {
    const sheet = activeSpreadsheet();
    const summary = $('#sheet-summary');
    if (!summary) return;
    if (!sheet) { summary.innerHTML = ''; return; }
    const t = totalsFor(sheet);
    const perMonth = state.months.map((row) => ({ row, c: calcMonth(row, sheet) }));
    const withData = perMonth.filter(({ c }) => c.hasActivity);
    const last = withData[withData.length - 1];
    const prev = withData[withData.length - 2];
    let delta = '';
    if (last && prev) {
      const diff = last.c.netProfit - prev.c.netProfit;
      const up = diff >= 0;
      delta = `<span class="summary-delta ${up ? 'is-up' : 'is-down'}">${up ? '▲' : '▼'} ${money.format(Math.abs(diff))} em ${MONTHS[last.row.month_num - 1]} vs ${MONTHS[prev.row.month_num - 1]}</span>`;
    }
    const cards = [
      { label: 'Faturamento bruto', value: t.gross, hint: 'pago pelos hóspedes + extras' },
      { label: 'Limpeza / lavanderia', value: t.cleaning, hint: 'descontada do faturamento' },
      { label: 'Coanfitrião', value: t.host, hint: `${pct(toNumber(sheet.commission_rate))} sobre bruto − limpeza` },
      { label: 'Despesas', value: t.fixed + t.variable, hint: `fixas ${moneyShort(t.fixed)} · variáveis ${moneyShort(t.variable)}` },
      { label: 'Lucro líquido', value: t.net, strong: true, extra: sparklineSvg(perMonth.filter(({ row }) => !isFuture(sheet, row)).map(({ c }) => c.netProfit)) + delta }
    ];
    summary.innerHTML = cards.map((card) => {
      const tone = card.strong ? (card.value > 0.004 ? 'is-positive' : card.value < -0.004 ? 'is-negative' : '') : '';
      return `<div class="summary-card ${tone} ${card.strong ? 'is-hero' : ''}">
          <span class="summary-label">${card.label}</span>
          <strong>${money.format(card.value)}</strong>
          ${card.hint ? `<span class="summary-hint">${esc(card.hint)}</span>` : ''}
          ${card.extra || ''}
        </div>`;
    }).join('');
  };

  // ---------------------------------------------------------------- Cartoes dos meses
  const renderMonthGrid = () => {
    const grid = $('#month-grid');
    const sheet = activeSpreadsheet();
    if (!grid || !sheet) return;
    const now = new Date();
    $('#months-hint').textContent = canEdit() ? 'Clique em um mês para ver e editar os detalhes.' : 'Clique em um mês para ver os detalhes.';
    grid.innerHTML = state.months.map((row, i) => {
      const c = calcMonth(row, sheet);
      const p = paymentStatus(row, sheet);
      const future = isFuture(sheet, row);
      const current = sheet.year === now.getFullYear() && row.month_num === now.getMonth() + 1;
      const tone = c.netProfit > 0.004 ? 'is-positive' : c.netProfit < -0.004 ? 'is-negative' : 'is-zero';
      const guests = String(row.client_description || '').replace(/^\*$/, '').trim();
      return `<button type="button" class="month-card ${future ? 'is-future' : ''} ${current ? 'is-current' : ''} ${state.dirty.has(row.id) ? 'is-dirty' : ''}" data-open-month="${i}" aria-label="Abrir ${MONTHS_FULL[row.month_num - 1]}">
          <div class="mc-head"><span class="mc-month">${MONTHS_FULL[row.month_num - 1]}</span>${payChip(p)}</div>
          <div><span class="mc-label">${future ? 'Lucro previsto' : 'Lucro líquido'}</span><span class="mc-profit ${tone}">${money.format(c.netProfit)}</span></div>
          <div class="mc-rows">
            <div><span>Faturamento</span><b>${money.format(c.gross)}</b></div>
            <div><span>Despesas</span><b>${money.format(c.fixedTotal + c.variableTotal)}</b></div>
            <div><span>${c.nights} ${c.nights === 1 ? 'noite' : 'noites'} · ${c.bookings} ${c.bookings === 1 ? 'reserva' : 'reservas'}</span><b>${pct(c.occupancy)}</b></div>
          </div>
          <div class="occ" aria-hidden="true"><i style="width:${Math.round(c.occupancy * 100)}%"></i></div>
          ${guests ? `<div class="mc-guests" title="${esc(guests)}">${esc(guests)}</div>` : ''}
        </button>`;
    }).join('');
  };

  // ---------------------------------------------------------------- Comissoes (pagamento do coanfitriao)
  const renderPayments = () => {
    const sheet = activeSpreadsheet();
    if (!sheet) return;
    const t = paymentTotals(sheet, state.months);
    $('#pay-summary').innerHTML = `
      <div class="summary-card is-positive"><span class="summary-label">Recebido</span><strong>${money.format(t.received)}</strong><span class="summary-hint">${t.paidCount} ${t.paidCount === 1 ? 'mês pago' : 'meses pagos'}</span></div>
      <div class="summary-card"><span class="summary-label">A receber</span><strong>${money.format(t.pending)}</strong><span class="summary-hint">${t.pendingCount} ${t.pendingCount === 1 ? 'mês' : 'meses'} em aberto</span></div>
      <div class="summary-card ${t.overdueCount ? 'is-negative' : ''}"><span class="summary-label">Atrasado</span><strong>${money.format(t.overdue)}</strong><span class="summary-hint">${t.overdueCount ? `${t.overdueCount} ${t.overdueCount === 1 ? 'mês vencido' : 'meses vencidos'}` : 'nenhum atraso'}</span></div>`;
    const edit = canEdit();
    const rows = state.months.map((row, i) => {
      const p = paymentStatus(row, sheet);
      const method = PAY_METHODS.find(([k]) => k === row.host_fee_payment_method)?.[1] || '';
      let action = '';
      if (edit && p.key === 'PAGO') action = `<button class="btn" type="button" data-unpay="${i}" title="Desfazer pagamento">Desfazer</button>`;
      else if (edit && ['ATRASADO', 'A_VENCER', 'EM_ANDAMENTO'].includes(p.key)) action = `<button class="btn btn-ok" type="button" data-pay="${i}">${ICON.check}Pago</button>`;
      const paidInfo = p.key === 'PAGO'
        ? `<b>${money.format(p.paidAmount)}</b><span class="sub">${fmtDate(row.host_fee_paid_at)}${method ? ` · ${esc(method)}` : ''}${Math.abs(p.difference) >= 0.01 ? ` · <span style="color:#e07b24">${p.difference > 0 ? '+' : ''}${money.format(p.difference)}</span>` : ''}</span>${row.host_fee_note ? `<span class="sub">${esc(row.host_fee_note)}</span>` : ''}`
        : '<span class="sub">—</span>';
      return `<tr data-month-row="${i}" class="${p.key === 'FUTURO' ? 'is-future' : ''}">
          <td class="left"><button type="button" class="month-link" data-open-month="${i}">${MONTHS_FULL[row.month_num - 1]}</button></td>
          <td><b>${money.format(p.amount)}</b><span class="sub">vence ${fmtDate(p.dueISO)}</span></td>
          <td class="left">${payChip(p)}</td>
          <td>${paidInfo}</td>
          <td class="actions">${action}</td>
        </tr>`;
    }).join('');
    const bulk = edit && t.overdueCount > 1 ? `<button class="btn" type="button" data-pay-overdue title="Marca todos os meses atrasados como pagos na data de vencimento">${ICON.check}Quitar ${t.overdueCount} atrasados</button>` : '';
    $('#pay-table').innerHTML = `<thead><tr><th class="left">Mês</th><th>Comissão</th><th class="left">Status</th><th>Pagamento</th><th class="actions">${bulk}</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="left">Total</td><td>${money.format(state.months.reduce((a, r) => a + Math.max(0, calcMonth(r, sheet).hostFee), 0))}</td><td></td><td>${money.format(t.received)}</td><td></td></tr></tfoot>`;
  };

  const payOverdue = async () => {
    const sheet = activeSpreadsheet();
    const late = state.months.map((row, i) => ({ row, i, p: paymentStatus(row, sheet) })).filter((x) => x.p.key === 'ATRASADO');
    if (!late.length) return;
    const total = late.reduce((a, x) => a + x.p.amount, 0);
    if (!window.confirm(`Marcar ${late.length} meses atrasados (${money.format(total)}) como pagos?\nCada mês fica registrado como pago na própria data de vencimento. Útil para meses antigos, anteriores ao controle.`)) return;
    try {
      state.ignoreRealtimeUntil = Date.now() + 6000;
      for (const x of late) {
        const patch = { host_fee_paid_at: x.p.dueISO, host_fee_paid_amount: Number(x.p.amount.toFixed(2)), host_fee_note: x.row.host_fee_note || 'Baixa em lote' };
        const { error } = await state.ctx.supabase.from('property_spreadsheet_months').update(patch).eq('id', x.row.id);
        if (error) throw error;
        Object.assign(x.row, patch);
      }
      renderAll();
      showToast(`${late.length} meses marcados como pagos.`);
    } catch (e) { renderAll(); showToast(e.message || 'Não foi possível concluir a baixa.', 'error'); }
  };

  const savePayment = async (i, patch) => {
    const row = state.months[i];
    state.ignoreRealtimeUntil = Date.now() + 4000;
    const { error } = await state.ctx.supabase.from('property_spreadsheet_months').update(patch).eq('id', row.id);
    if (error) throw error;
    Object.assign(row, patch);
    renderAll();
  };
  const quickPay = async (i) => {
    const sheet = activeSpreadsheet(); const row = state.months[i];
    const p = paymentStatus(row, sheet);
    const ok = window.confirm(`Confirmar comissão de ${MONTHS_FULL[row.month_num - 1]} (${money.format(p.amount)}) como paga hoje?\nPara informar outra data, valor ou forma, use "Detalhes".`);
    if (!ok) return;
    try {
      await savePayment(i, { host_fee_paid_at: todayISO(), host_fee_paid_amount: Number(p.amount.toFixed(2)), host_fee_payment_method: row.host_fee_payment_method || 'PIX' });
      showToast(`Comissão de ${MONTHS_FULL[row.month_num - 1]} marcada como paga.`);
    } catch (e) { showToast(e.message || 'Não foi possível registrar o pagamento.', 'error'); }
  };
  const undoPay = async (i) => {
    const row = state.months[i];
    if (!window.confirm(`Desfazer o pagamento de ${MONTHS_FULL[row.month_num - 1]}? O mês volta a ficar pendente.`)) return;
    try {
      await savePayment(i, { host_fee_paid_at: null, host_fee_paid_amount: null });
      showToast('Pagamento desfeito.');
    } catch (e) { showToast(e.message || 'Não foi possível desfazer.', 'error'); }
  };

  // ---------------------------------------------------------------- Grafico mensal (lucro liquido)
  const renderChart = () => {
    const box = $('#sheet-chart');
    const sheet = activeSpreadsheet();
    if (!box) return;
    box.hidden = state.view !== 'months' || !sheet;
    if (box.hidden) return;
    box.innerHTML = box.innerHTML || '<div style="height:230px"></div>'; // mede a largura antes de desenhar
    const data = state.months.map((row) => ({ row, c: calcMonth(row, sheet), future: isFuture(sheet, row) }));
    const values = data.map((d) => d.c.netProfit);
    const cs = getComputedStyle(box); const inner = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); const W = Math.max(300, Math.round(inner || 720)); const H = W < 520 ? 200 : 230; const padL = 58; const padR = 8; const padT = 18; const padB = 28;
    const max = Math.max(0, ...values); const min = Math.min(0, ...values);
    const niceStep = (range) => { const raw = range / 4 || 1; const mag = 10 ** Math.floor(Math.log10(raw)); const n = raw / mag; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag; };
    const step = niceStep(max - min);
    const top = Math.ceil(max / step) * step || step;
    const bottom = Math.floor(min / step) * step;
    const y = (v) => padT + ((top - v) / (top - bottom)) * (H - padT - padB);
    const band = (W - padL - padR) / 12;
    const barW = Math.min(24, band * 0.55);
    const ticks = []; for (let v = bottom; v <= top + 1e-6; v += step) ticks.push(v);
    const bar = (d, i) => {
      const v = d.c.netProfit;
      const x = padL + band * i + (band - barW) / 2;
      const y0 = y(0); const y1 = y(v); const hgt = Math.abs(y1 - y0);
      const r = Math.min(4, hgt);
      const color = v >= 0 ? COLOR_PROFIT : COLOR_LOSS;
      let path = '';
      if (hgt > 0.5) {
        path = v >= 0
          ? `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0} Z`
          : `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 - r} V${y0} Z`;
      }
      const label = `${MONTHS_FULL[d.row.month_num - 1]}: lucro ${money.format(v)} · faturamento ${money.format(d.c.gross)} · ${d.c.nights} noites`;
      return `<g class="chart-bar${d.future ? ' is-future' : ''}" data-i="${i}" data-open-month="${i}" tabindex="0" role="button" aria-label="${esc(label)}">
          <rect class="hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT - padB}" fill="transparent"/>
          ${path ? `<path d="${path}" fill="${color}"${d.future ? ' fill-opacity=".35"' : ''}/>` : ''}
          <text x="${padL + band * i + band / 2}" y="${H - 8}" text-anchor="middle" class="chart-x">${MONTHS[d.row.month_num - 1]}</text>
        </g>`;
    };
    // rotulo direto so no melhor e no pior mes
    const best = values.indexOf(Math.max(...values));
    const worst = values.indexOf(Math.min(...values));
    const direct = [...new Set([best, worst])].filter((i) => values[i] !== 0).map((i) => {
      const v = values[i]; const x = padL + band * i + band / 2;
      return `<text x="${x}" y="${v >= 0 ? y(v) - 6 : y(v) + 14}" text-anchor="middle" class="chart-val">${moneyShort(v)}</text>`;
    }).join('');
    box.innerHTML = `
      <div class="chart-head"><span class="chart-title">Lucro líquido por mês</span><span class="chart-sub">passe o mouse para ver os números · clique para abrir o mês</span></div>
      <div class="chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="group" aria-label="Lucro líquido por mês de ${sheet.year}">
          ${ticks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="${Math.abs(v) < 1e-6 ? 'chart-zero' : 'chart-grid'}"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" class="chart-y">${moneyShort(v)}</text>`).join('')}
          ${data.map(bar).join('')}
          ${direct}
        </svg>
        <div class="chart-tip" hidden></div>
      </div>`;
    const tip = $('.chart-tip', box);
    const wrap = $('.chart-wrap', box);
    const show = (g) => {
      const d = data[Number(g.dataset.i)];
      tip.innerHTML = `<strong>${MONTHS_FULL[d.row.month_num - 1]}${d.future ? ' <em>(previsto)</em>' : ''}</strong>
        <span>Lucro líquido <b style="color:${d.c.netProfit >= 0 ? COLOR_PROFIT : COLOR_LOSS}">${money.format(d.c.netProfit)}</b></span>
        <span>Faturamento <b>${money.format(d.c.gross)}</b></span>
        <span>Noites <b>${d.c.nights}</b> · ocupação <b>${pct(d.c.occupancy)}</b></span>
        <span>Despesas <b>${money.format(d.c.fixedTotal + d.c.variableTotal)}</b></span>`;
      tip.hidden = false;
      const r = g.getBoundingClientRect(); const wr = wrap.getBoundingClientRect();
      const left = Math.min(Math.max(r.left - wr.left + r.width / 2 - tip.offsetWidth / 2, 0), wr.width - tip.offsetWidth);
      tip.style.left = `${left}px`; tip.style.top = '0px';
      $$('.chart-bar', box).forEach((b) => b.classList.toggle('is-hover', b === g));
    };
    const hide = () => { tip.hidden = true; $$('.chart-bar', box).forEach((b) => b.classList.remove('is-hover')); };
    $$('.chart-bar', box).forEach((g) => {
      g.addEventListener('mouseenter', () => show(g));
      g.addEventListener('focus', () => show(g));
      g.addEventListener('mouseleave', hide);
      g.addEventListener('blur', hide);
    });
  };

  // ---------------------------------------------------------------- Modal do mes (leitura + edicao)
  const FORM = [
    { title: 'Hóspedes e receita', icon: ICON.users, fields: [
      { key: 'clients_count', label: 'Reservas', kind: 'int' },
      { key: 'nights_count', label: 'Noites ocupadas', kind: 'int' },
      { key: 'paid_clients', label: 'Valor pago pelos hóspedes', kind: 'money' },
      { key: 'paid_extra', label: 'Extras (taxas, itens)', kind: 'money' },
      { key: 'client_description', label: 'Hóspedes / observações', kind: 'textarea', full: true, placeholder: 'Ex.: Ana (3 noites), João (2 noites)' }
    ] },
    { title: 'Limpeza e coanfitrião', icon: ICON.spark, fields: [
      { key: 'cleaning_laundry', label: 'Limpeza / lavanderia', kind: 'money', auto: 'cleaning', hint: 'Vazio = reservas × taxa de limpeza' },
      { key: 'host_fee_override', label: 'Comissão do coanfitrião', kind: 'money', auto: 'host', hint: 'Vazio = percentual sobre (bruto − limpeza)' }
    ] },
    { title: 'Despesas fixas', icon: ICON.home, fields: [
      { key: 'fixed_gas', label: 'Gás', kind: 'money' },
      { key: 'fixed_electricity', label: 'Luz', kind: 'money' },
      { key: 'fixed_internet', label: 'Internet', kind: 'money' },
      { key: 'fixed_condo', label: 'Condomínio', kind: 'money' }
    ] },
    { title: 'Despesa variável', icon: ICON.bag, fields: [
      { key: 'variable_location', label: 'Local / fornecedor', kind: 'text', placeholder: 'loja, prestador…' },
      { key: 'variable_date', label: 'Data', kind: 'date' },
      { key: 'variable_total', label: 'Valor', kind: 'money' },
      { key: 'variable_description', label: 'Descrição', kind: 'textarea', full: true, placeholder: 'O que foi comprado ou consertado' }
    ] }
  ];

  const fieldHtml = (f, draft, sheet, disabled) => {
    const id = `md-${f.key}`;
    const v = draft[f.key];
    const dis = disabled ? 'disabled' : '';
    let input;
    if (f.kind === 'textarea') input = `<textarea id="${id}" data-md="${f.key}" rows="2" placeholder="${esc(f.placeholder || '')}" ${dis}>${esc(v === '*' ? '' : v || '')}</textarea>`;
    else if (f.kind === 'date') input = `<div class="md-input"><input id="${id}" data-md="${f.key}" type="date" value="${esc(v || '')}" ${dis}></div>`;
    else if (f.kind === 'text') input = `<div class="md-input"><input id="${id}" data-md="${f.key}" type="text" value="${esc(v || '')}" placeholder="${esc(f.placeholder || '')}" ${dis}></div>`;
    else if (f.kind === 'int') input = `<div class="md-input"><input id="${id}" data-md="${f.key}" type="number" min="0" step="1" inputmode="numeric" value="${esc(v ?? '')}" ${dis}></div>`;
    else {
      const c = calcMonth(draft, sheet);
      const auto = f.auto === 'cleaning' ? autoCleaning(draft, sheet) : f.auto === 'host' ? c.autoHost : null;
      input = `<div class="md-input"><span class="pre">R$</span><input id="${id}" class="has-pre" data-md="${f.key}" data-money type="text" inputmode="decimal" value="${esc(toInput(v))}" placeholder="${auto !== null ? `auto ${toInput(auto)}` : '0,00'}" ${dis}></div>`;
    }
    return `<div class="md-field ${f.full ? 'full' : ''}"><label for="${id}">${f.label}</label>${input}${f.hint ? `<small>${f.hint}</small>` : ''}</div>`;
  };

  const waterfallHtml = (draft, sheet) => {
    const c = calcMonth(draft, sheet);
    const tone = c.netProfit > 0.004 ? 'is-positive' : c.netProfit < -0.004 ? 'is-negative' : '';
    return `<div class="waterfall">
        <div><span>Faturamento bruto</span><b>${money.format(c.gross)}</b></div>
        <div class="minus"><span>− Limpeza</span><b>${money.format(c.cleaning)}</b></div>
        <div class="minus"><span>− Coanfitrião</span><b>${money.format(c.hostFee)}</b></div>
        <div class="sub"><span>Receita líquida</span><b>${money.format(c.revenueTotal)}</b></div>
        <div class="minus"><span>− Despesas fixas</span><b>${money.format(c.fixedTotal)}</b></div>
        <div class="minus"><span>− Despesa variável</span><b>${money.format(c.variableTotal)}</b></div>
        <div class="total ${tone}"><span>Lucro líquido</span><b>${money.format(c.netProfit)}</b></div>
      </div>
      <div class="mc-rows" style="margin-top:.2rem">
        <div><span>Ocupação</span><b>${pct(c.occupancy)}</b></div>
        <div><span>Diária média</span><b>${money.format(c.adr)}</b></div>
      </div>`;
  };

  const payBoxHtml = (draft, sheet, disabled) => {
    const p = paymentStatus(draft, sheet);
    const paid = Boolean(draft.host_fee_paid_at);
    const dis = disabled ? 'disabled' : '';
    const canMark = !disabled && ['ATRASADO', 'A_VENCER', 'EM_ANDAMENTO'].includes(p.key);
    return `<div class="md-pay">
        <div class="md-pay-head"><strong>Comissão</strong>${payChip(p)}</div>
        <div><span class="amount">${money.format(p.amount)}</span><div class="due">Vencimento ${fmtDate(p.dueISO)}</div></div>
        ${paid || !disabled ? `
        <div class="md-grid">
          <div class="md-field"><label for="md-paid-at">Pago em</label><div class="md-input"><input id="md-paid-at" type="date" data-md="host_fee_paid_at" value="${esc(draft.host_fee_paid_at || '')}" ${dis}></div></div>
          <div class="md-field"><label for="md-paid-amount">Valor pago</label><div class="md-input"><span class="pre">R$</span><input id="md-paid-amount" class="has-pre" type="text" inputmode="decimal" data-md="host_fee_paid_amount" data-money value="${esc(toInput(draft.host_fee_paid_amount))}" placeholder="${esc(toInput(p.amount))}" ${dis}></div></div>
          <div class="md-field"><label for="md-paid-method">Forma</label><select id="md-paid-method" data-md="host_fee_payment_method" ${dis}><option value="">—</option>${PAY_METHODS.map(([k, t]) => `<option value="${k}" ${draft.host_fee_payment_method === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="md-field full"><label for="md-paid-note">Observação</label><div class="md-input"><input id="md-paid-note" type="text" data-md="host_fee_note" value="${esc(draft.host_fee_note || '')}" placeholder="comprovante, referência…" ${dis}></div></div>
        </div>` : ''}
        ${canMark ? `<button class="btn btn-ok" type="button" data-md-paynow>${ICON.check}Marcar como pago hoje</button>` : ''}
        ${!disabled && paid ? '<button class="btn" type="button" data-md-unpay>Desfazer pagamento</button>' : ''}
      </div>`;
  };

  const modalChanged = () => {
    const m = state.modal; if (!m) return false;
    const row = state.months[m.index];
    return [...SAVE_FIELDS, ...PAY_FIELDS].some((f) => (m.draft[f] ?? null) !== (row[f] ?? null) && !(f === 'client_description' && (m.draft[f] || '*') === (row[f] || '*')));
  };

  const renderModal = () => {
    const m = state.modal; const dialog = $('#month-dialog'); const sheet = activeSpreadsheet();
    if (!m || !dialog || !sheet) return;
    const row = state.months[m.index];
    const edit = canEdit();
    dialog.innerHTML = `<form method="dialog" novalidate>
        <div class="md-head">
          <div><div class="md-sub">${esc(sheet.property_name)} · ${sheet.year}</div><h3 id="md-title">${MONTHS_FULL[row.month_num - 1]}</h3></div>
          <div class="md-nav">
            <button class="icon-btn" type="button" data-md-prev ${m.index === 0 ? 'disabled' : ''} title="Mês anterior">${ICON.left}</button>
            <button class="icon-btn" type="button" data-md-next ${m.index === state.months.length - 1 ? 'disabled' : ''} title="Próximo mês">${ICON.right}</button>
            <button class="icon-btn" type="button" data-md-close title="Fechar (Esc)">${ICON.x}</button>
          </div>
        </div>
        <div class="md-body">
          <div class="md-form">
            ${edit ? '' : '<div class="notice" style="padding:.7rem .85rem;font-size:var(--fs-sm)">Somente leitura. Os valores são lançados pela administração.</div>'}
            ${FORM.map((sec) => `<section class="md-section"><h4>${sec.icon}${sec.title}</h4><div class="md-grid">${sec.fields.map((f) => fieldHtml(f, m.draft, sheet, !edit)).join('')}</div></section>`).join('')}
          </div>
          <aside class="md-side">
            <div><span class="mc-label" style="margin-bottom:.5rem">Resultado do mês</span><div id="md-waterfall">${waterfallHtml(m.draft, sheet)}</div></div>
            <div id="md-pay">${payBoxHtml(m.draft, sheet, !edit)}</div>
          </aside>
        </div>
        <div class="md-foot">
          <span class="kbd">${edit ? 'Ctrl+S salva · Esc fecha' : 'Esc fecha'}</span>
          <span class="spacer"></span>
          <button class="btn" type="button" data-md-close>${edit ? 'Cancelar' : 'Fechar'}</button>
          ${edit ? `<button class="btn btn-primary" type="button" data-md-save ${modalChanged() ? '' : 'disabled'}>Salvar ${MONTHS[row.month_num - 1]}</button>` : ''}
        </div>
      </form>`;
  };

  const refreshModalCalc = () => {
    const m = state.modal; const sheet = activeSpreadsheet(); const dialog = $('#month-dialog');
    if (!m || !sheet) return;
    $('#md-waterfall', dialog).innerHTML = waterfallHtml(m.draft, sheet);
    const c = calcMonth(m.draft, sheet);
    const cl = $('[data-md="cleaning_laundry"]', dialog); if (cl) cl.placeholder = `auto ${toInput(autoCleaning(m.draft, sheet))}`;
    const hf = $('[data-md="host_fee_override"]', dialog); if (hf) hf.placeholder = `auto ${toInput(c.autoHost)}`;
    const p = paymentStatus(m.draft, sheet);
    const head = $('.md-pay-head', dialog); if (head) head.innerHTML = `<strong>Comissão</strong>${payChip(p)}`;
    const amt = $('.md-pay .amount', dialog); if (amt) amt.textContent = money.format(p.amount);
    const pa = $('#md-paid-amount', dialog); if (pa) pa.placeholder = toInput(p.amount);
    const save = $('[data-md-save]', dialog); if (save) save.disabled = !modalChanged();
  };

  const openMonth = (index) => {
    const row = state.months[index]; if (!row) return;
    state.modal = { index, draft: { ...row } };
    renderModal();
    const dialog = $('#month-dialog');
    if (!dialog.open) dialog.showModal();
    const first = $('[data-md]:not(:disabled)', dialog) || $('[data-md-close]', dialog);
    if (first && window.matchMedia('(pointer:fine)').matches) first.focus();
  };

  const closeMonth = (force = false) => {
    if (!force && modalChanged() && !window.confirm('Descartar as alterações deste mês?')) return false;
    state.modal = null;
    const dialog = $('#month-dialog'); if (dialog.open) dialog.close();
    return true;
  };

  const saveModal = async () => {
    const m = state.modal; if (!m || !canEdit() || !modalChanged()) return true;
    const row = state.months[m.index];
    const btn = $('[data-md-save]');
    if (btn) { btn.classList.add('is-saving'); btn.disabled = true; }
    const d = m.draft;
    const n = (v) => (v === null || v === '' || v === undefined ? null : toNumber(v));
    const patch = {
      clients_count: toNumber(d.clients_count), nights_count: toNumber(d.nights_count), client_description: (d.client_description || '').trim() || '*',
      paid_clients: toNumber(d.paid_clients), paid_extra: toNumber(d.paid_extra),
      cleaning_laundry: n(d.cleaning_laundry), host_fee_override: n(d.host_fee_override),
      fixed_gas: toNumber(d.fixed_gas), fixed_electricity: toNumber(d.fixed_electricity), fixed_internet: toNumber(d.fixed_internet), fixed_condo: toNumber(d.fixed_condo),
      variable_location: d.variable_location || null, variable_description: d.variable_description || null, variable_date: d.variable_date || null,
      variable_total: toNumber(d.variable_total), variable_cost: toNumber(d.variable_total),
      host_fee_paid_at: d.host_fee_paid_at || null,
      host_fee_paid_amount: d.host_fee_paid_at ? n(d.host_fee_paid_amount) : null,
      host_fee_payment_method: d.host_fee_payment_method || null,
      host_fee_note: d.host_fee_note || null
    };
    try {
      state.ignoreRealtimeUntil = Date.now() + 4000;
      const { error } = await state.ctx.supabase.from('property_spreadsheet_months').update(patch).eq('id', row.id);
      if (error) throw error;
      Object.assign(row, patch);
      state.snapshot.set(row.id, rowSignature(row));
      state.dirty.delete(row.id);
      m.draft = { ...row };
      showToast(`${MONTHS_FULL[row.month_num - 1]} salvo.`);
      renderAll();
      renderModal();
      return true;
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Não foi possível salvar o mês.', 'error');
      if (btn) { btn.classList.remove('is-saving'); btn.disabled = false; }
      return false;
    }
  };

  const moveModal = async (dir) => {
    const m = state.modal; if (!m) return;
    const next = m.index + dir;
    if (next < 0 || next >= state.months.length) return;
    if (modalChanged()) {
      if (canEdit() && window.confirm('Salvar as alterações deste mês antes de continuar?')) { if (!(await saveModal())) return; }
      else if (!window.confirm('Descartar as alterações deste mês?')) return;
    }
    openMonth(next);
  };

  const bindModal = () => {
    const dialog = $('#month-dialog');
    dialog.addEventListener('input', (e) => {
      const el = e.target.closest('[data-md]'); if (!el || !state.modal) return;
      const key = el.dataset.md;
      let v = el.value;
      if (el.hasAttribute('data-money')) v = parseMoney(v);
      else if (el.type === 'number') v = v === '' ? 0 : toNumber(v);
      else if (v === '') v = null;
      if (key === 'host_fee_paid_at' && v && !state.modal.draft.host_fee_paid_amount) {
        state.modal.draft.host_fee_paid_amount = Number(paymentStatus(state.modal.draft, activeSpreadsheet()).amount.toFixed(2));
        const pa = $('#md-paid-amount', dialog); if (pa) pa.value = toInput(state.modal.draft.host_fee_paid_amount);
      }
      state.modal.draft[key] = v;
      refreshModalCalc();
    });
    dialog.addEventListener('change', (e) => { // selects
      const el = e.target.closest('select[data-md]'); if (!el || !state.modal) return;
      state.modal.draft[el.dataset.md] = el.value || null; refreshModalCalc();
    });
    dialog.addEventListener('focusout', (e) => { // formata dinheiro ao sair do campo
      const el = e.target.closest('[data-money]'); if (!el || !state.modal) return;
      el.value = toInput(state.modal.draft[el.dataset.md]);
    });
    dialog.addEventListener('click', async (e) => {
      if (e.target === dialog) { closeMonth(); return; } // clique fora
      if (e.target.closest('[data-md-close]')) { closeMonth(); return; }
      if (e.target.closest('[data-md-save]')) { await saveModal(); return; }
      if (e.target.closest('[data-md-prev]')) { moveModal(-1); return; }
      if (e.target.closest('[data-md-next]')) { moveModal(1); return; }
      if (e.target.closest('[data-md-paynow]')) {
        const d = state.modal.draft; const p = paymentStatus(d, activeSpreadsheet());
        d.host_fee_paid_at = todayISO(); d.host_fee_paid_amount = Number(p.amount.toFixed(2)); d.host_fee_payment_method = d.host_fee_payment_method || 'PIX';
        await saveModal(); return;
      }
      if (e.target.closest('[data-md-unpay]')) {
        const d = state.modal.draft; d.host_fee_paid_at = null; d.host_fee_paid_amount = null;
        await saveModal();
      }
    });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeMonth(); }); // Esc
    dialog.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); saveModal(); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); moveModal(1); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); moveModal(-1); }
    });
  };

  // ---------------------------------------------------------------- Tabela completa (edicao em lote)
  const cell = (row, i, field, { type = 'number', placeholder = '', textarea = false } = {}) => {
    const value = row[field] ?? '';
    const common = `data-row="${i}" data-field="${field}" aria-label="${esc(field)} ${MONTHS[row.month_num - 1]}"`;
    if (textarea) return `<textarea class="cell-input cell-text" rows="${Math.min(4, Math.max(1, String(value).split('\n').length))}" ${common}>${esc(value)}</textarea>`;
    return `<input class="cell-input" ${common} type="${type}" ${type === 'number' ? 'step="0.01" inputmode="decimal"' : ''} value="${esc(value)}" placeholder="${esc(placeholder)}">`;
  };
  const tone = (v) => (v > 0.004 ? 'is-positive' : v < -0.004 ? 'is-negative' : 'is-zero');
  const rowAttrs = (sheet, row, i) => `data-month-row="${i}" class="${isFuture(sheet, row) ? 'is-future' : ''} ${state.dirty.has(row.id) ? 'is-dirty' : ''}"`;
  const monthCell = (row, i) => `<td><button type="button" class="month-name month-link" data-open-month="${i}" title="Abrir ${MONTHS_FULL[row.month_num - 1]}">${MONTHS[row.month_num - 1]}</button></td>`;

  const TABLES = {
    summary: {
      head: ['Mês', 'Faturamento', 'Limpeza', 'Coanfitrião', 'Comissão', 'Receita líquida', 'Fixas', 'Variáveis', 'Lucro líquido', 'Noites', 'Ocupação'],
      row: (row, i, sheet) => {
        const c = calcMonth(row, sheet);
        return `<tr ${rowAttrs(sheet, row, i)}>${monthCell(row, i)}
          <td>${money.format(c.gross)}</td><td>${money.format(c.cleaning)}</td><td>${money.format(c.hostFee)}</td>
          <td data-calc-pay>${payChip(paymentStatus(row, sheet))}</td>
          <td>${money.format(c.revenueTotal)}</td><td>${money.format(c.fixedTotal)}</td><td>${money.format(c.variableTotal)}</td>
          <td class="${tone(c.netProfit)}"><strong>${money.format(c.netProfit)}</strong></td><td>${c.nights}</td><td>${pct(c.occupancy)}</td></tr>`;
      },
      foot: (t) => ['Total', money.format(t.gross), money.format(t.cleaning), money.format(t.host), '', money.format(t.revenue), money.format(t.fixed), money.format(t.variable), `<strong>${money.format(t.net)}</strong>`, t.nights, pct(t.occupancy)]
    },
    revenue: {
      head: ['Mês', 'Reservas', 'Noites', 'Hóspedes', 'Valor pago', 'Extras', 'Limpeza', 'Coanfitrião', 'Receita líquida'],
      row: (row, i, sheet) => {
        const c = calcMonth(row, sheet);
        return `<tr ${rowAttrs(sheet, row, i)}>${monthCell(row, i)}
          <td>${cell(row, i, 'clients_count')}</td><td>${cell(row, i, 'nights_count')}</td>
          <td class="wide">${cell(row, i, 'client_description', { type: 'text', placeholder: 'nomes dos hóspedes' })}</td>
          <td>${cell(row, i, 'paid_clients')}</td><td>${cell(row, i, 'paid_extra')}</td>
          <td>${cell(row, i, 'cleaning_laundry', { placeholder: `auto ${money.format(autoCleaning(row, sheet))}` })}</td>
          <td>${cell(row, i, 'host_fee_override', { placeholder: `auto ${money.format(c.autoHost)}` })}</td>
          <td class="${tone(c.revenueTotal)}" data-calc="revenueTotal">${money.format(c.revenueTotal)}</td></tr>`;
      },
      foot: (t) => ['Total', t.bookings, t.nights, '', money.format(t.paid), money.format(t.gross - t.paid), money.format(t.cleaning), money.format(t.host), money.format(t.revenue)]
    },
    fixed: {
      head: ['Mês', 'Gás', 'Luz', 'Internet', 'Condomínio', 'Total'],
      row: (row, i, sheet) => {
        const c = calcMonth(row, sheet);
        return `<tr ${rowAttrs(sheet, row, i)}>${monthCell(row, i)}
          <td>${cell(row, i, 'fixed_gas')}</td><td>${cell(row, i, 'fixed_electricity')}</td><td>${cell(row, i, 'fixed_internet')}</td><td>${cell(row, i, 'fixed_condo')}</td>
          <td data-calc="fixedTotal">${money.format(c.fixedTotal)}</td></tr>`;
      },
      foot: (t) => {
        const s = (f) => money.format(state.months.reduce((a, r) => a + toNumber(r[f]), 0));
        return ['Total', s('fixed_gas'), s('fixed_electricity'), s('fixed_internet'), s('fixed_condo'), money.format(t.fixed)];
      }
    },
    variable: {
      head: ['Mês', 'Local / fornecedor', 'Descrição', 'Data', 'Valor'],
      row: (row, i, sheet) => `<tr ${rowAttrs(sheet, row, i)}>${monthCell(row, i)}
          <td>${cell(row, i, 'variable_location', { type: 'text', placeholder: 'loja, prestador…' })}</td>
          <td class="wide">${cell(row, i, 'variable_description', { textarea: true })}</td>
          <td>${cell(row, i, 'variable_date', { type: 'date' })}</td>
          <td>${cell(row, i, 'variable_total')}</td></tr>`,
      foot: (t) => ['Total', '', '', '', money.format(t.variable)]
    }
  };

  const renderTable = () => {
    const sheet = activeSpreadsheet();
    const table = $('#sheet-table');
    if (!table) return;
    if (!sheet) { table.innerHTML = ''; return; }
    const def = TABLES[state.activeTab];
    const t = totalsFor(sheet);
    table.dataset.tab = state.activeTab;
    table.innerHTML = `<thead><tr>${def.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${state.months.map((row, i) => def.row(row, i, sheet)).join('')}</tbody>
      <tfoot><tr>${def.foot(t).map((v) => `<td>${v}</td>`).join('')}</tr></tfoot>`;
    applyToggles();
  };

  // Atualiza so os valores calculados (sem redesenhar os campos: o foco nao se perde)
  const refreshComputed = (rowIndex) => {
    const sheet = activeSpreadsheet();
    if (!sheet) return;
    const def = TABLES[state.activeTab];
    if (rowIndex !== undefined) {
      const tr = $(`#sheet-table tr[data-month-row="${rowIndex}"]`);
      const row = state.months[rowIndex];
      const c = calcMonth(row, sheet);
      if (tr) {
        tr.classList.toggle('is-dirty', state.dirty.has(row.id));
        $$('[data-calc]', tr).forEach((td) => { const v = c[td.dataset.calc]; td.textContent = money.format(v); td.className = td.dataset.calc === 'revenueTotal' ? tone(v) : ''; });
        const hostInput = $('[data-field="host_fee_override"]', tr); if (hostInput) hostInput.placeholder = `auto ${money.format(c.autoHost)}`;
        const cleanInput = $('[data-field="cleaning_laundry"]', tr); if (cleanInput) cleanInput.placeholder = `auto ${money.format(autoCleaning(row, sheet))}`;
      }
    }
    const foot = $('#sheet-table tfoot tr');
    if (foot) foot.innerHTML = def.foot(totalsFor(sheet)).map((v) => `<td>${v}</td>`).join('');
    renderSummary();
    renderKpis();
    updateDirtyUi();
  };

  // ---------------------------------------------------------------- Estado de edicao
  const rowSignature = (row) => JSON.stringify(SAVE_FIELDS.map((f) => (row[f] === undefined || row[f] === '' ? null : row[f])));
  const takeSnapshot = () => { state.snapshot = new Map(state.months.map((r) => [r.id, rowSignature(r)])); state.dirty.clear(); };
  const updateDirtyUi = () => {
    const n = state.dirty.size;
    const btn = $('#save-sheet');
    const label = $('#save-label');
    if (label) label.textContent = n ? `Salvar ${n} ${n === 1 ? 'mês' : 'meses'}` : 'Salvo';
    if (btn) { btn.classList.toggle('has-changes', n > 0); btn.disabled = !canEdit() || n === 0; btn.hidden = !isAdmin() || (state.view !== 'table' && n === 0); }
    const notice = $('#remote-change');
    if (notice) notice.hidden = !state.remoteChanged;
  };
  const setField = (i, field, raw) => {
    const row = state.months[i];
    if (!row) return;
    if (NUMBER_FIELDS.includes(field)) {
      const v = String(raw).replace(',', '.').trim();
      row[field] = v === '' ? (NULLABLE_FIELDS.includes(field) ? null : 0) : toNumber(v);
    } else {
      row[field] = raw === '' ? null : raw;
    }
    if (rowSignature(row) === state.snapshot.get(row.id)) state.dirty.delete(row.id); else state.dirty.add(row.id);
  };

  const applyToggles = () => {
    const editing = canEdit();
    $$('[data-requires-setting]').forEach((el) => { el.hidden = !window.CDEVAuth.isEnabled(state.settings, el.dataset.requiresSetting); });
    const readonly = $('#readonly-state');
    if (readonly) {
      readonly.hidden = editing;
      readonly.textContent = isAdmin()
        ? 'Edição desabilitada globalmente (Admin → Toggles → Edição das planilhas). A planilha está em modo somente leitura.'
        : 'Visualização somente leitura. Os valores e pagamentos são lançados pela administração.';
    }
    $$('.cell-input').forEach((f) => { f.disabled = !editing; });
    $$('[data-edit-action]').forEach((b) => { b.hidden = !isAdmin(); });
    updateDirtyUi();
  };

  const setView = (view) => {
    state.view = view;
    $$('[data-view]').forEach((b) => { const on = b.dataset.view === view; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    $('#view-months').hidden = view !== 'months';
    $('#view-payments').hidden = view !== 'payments';
    $('#view-table').hidden = view !== 'table';
    try { localStorage.setItem('cdev:sheet-view', view); } catch (e) { /* sem storage */ }
    renderAll();
  };

  const renderAll = () => {
    renderKpis();
    if (state.view === 'months') { renderSummary(); renderChart(); renderMonthGrid(); }
    if (state.view === 'payments') renderPayments();
    if (state.view === 'table') renderTable();
    updateDirtyUi();
  };

  const renderActiveSpreadsheet = () => {
    const sheet = activeSpreadsheet();
    $('#sheet-skeleton').hidden = true;
    $('#sheet-empty').hidden = Boolean(sheet);
    $('#sheet-workspace').hidden = !sheet;
    $('#sheet-actions').hidden = !sheet;
    renderSpreadsheetList();
    renderHero();
    renderAll();
  };

  // ---------------------------------------------------------------- Dados
  const loadSpreadsheets = async () => {
    let { data, error } = await state.ctx.supabase
      .from('property_spreadsheets')
      .select('id,title,property_name,owner_user_id,year,commission_rate,cleaning_fee_per_client,cover_image_url,listing_url,address,active,updated_at,commission_due_day')
      .order('active', { ascending: false })
      .order('year', { ascending: false })
      .order('property_name', { ascending: true });
    if (error && /commission_due_day/.test(error.message || '')) { // banco sem a migracao 13
      ({ data, error } = await state.ctx.supabase.from('property_spreadsheets').select('id,title,property_name,owner_user_id,year,commission_rate,cleaning_fee_per_client,cover_image_url,listing_url,address,active,updated_at')
        .order('active', { ascending: false }).order('year', { ascending: false }).order('property_name', { ascending: true }));
    }
    if (error) throw error;
    state.spreadsheets = data || [];
    const fromUrl = new URLSearchParams(location.search).get('sheet');
    if (fromUrl && state.spreadsheets.some((s) => s.id === fromUrl)) state.activeSpreadsheetId = fromUrl;
    else if (!state.spreadsheets.some((s) => s.id === state.activeSpreadsheetId)) state.activeSpreadsheetId = state.spreadsheets[0]?.id || null;
    renderSpreadsheetList();
  };

  const loadMonths = async ({ silent = false } = {}) => {
    if (!state.activeSpreadsheetId) { state.months = []; takeSnapshot(); renderActiveSpreadsheet(); return; }
    if (!silent) {
      $('#sheet-empty').hidden = true;
      $('#sheet-workspace').hidden = true;
      $('#sheet-skeleton').hidden = false;
    }
    const { data, error } = await state.ctx.supabase
      .from('property_spreadsheet_months')
      .select('*')
      .eq('spreadsheet_id', state.activeSpreadsheetId)
      .order('month_num', { ascending: true });
    if (error) throw error;
    state.months = (data || []).map((r) => ({ ...r, variable_total: toNumber(r.variable_total) || toNumber(r.variable_cost) }));
    takeSnapshot();
    state.remoteChanged = false;
    renderActiveSpreadsheet();
  };

  const saveMonths = async () => {
    if (!canEdit() || !state.dirty.size) return 0;
    const rows = state.months.filter((r) => state.dirty.has(r.id)).map((row) => ({
      id: row.id,
      spreadsheet_id: row.spreadsheet_id,
      month_num: row.month_num,
      clients_count: toNumber(row.clients_count),
      nights_count: toNumber(row.nights_count),
      client_description: row.client_description || '*',
      paid_clients: toNumber(row.paid_clients),
      paid_extra: toNumber(row.paid_extra),
      cleaning_laundry: row.cleaning_laundry === null || row.cleaning_laundry === '' ? null : toNumber(row.cleaning_laundry),
      host_fee_override: row.host_fee_override === null || row.host_fee_override === '' ? null : toNumber(row.host_fee_override),
      fixed_gas: toNumber(row.fixed_gas),
      fixed_electricity: toNumber(row.fixed_electricity),
      fixed_internet: toNumber(row.fixed_internet),
      fixed_condo: toNumber(row.fixed_condo),
      variable_location: row.variable_location || null,
      variable_description: row.variable_description || null,
      variable_date: row.variable_date || null,
      variable_cost: toNumber(row.variable_total), // coluna antiga mantida em sincronia
      variable_total: toNumber(row.variable_total)
    }));
    state.ignoreRealtimeUntil = Date.now() + 4000;
    const { error } = await state.ctx.supabase.from('property_spreadsheet_months').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    takeSnapshot();
    $$('#sheet-table tr.is-dirty').forEach((tr) => tr.classList.remove('is-dirty'));
    updateDirtyUi();
    return rows.length;
  };

  const doSave = async () => {
    const button = $('#save-sheet');
    if (!state.dirty.size || !canEdit()) return;
    button.classList.add('is-saving'); button.disabled = true;
    try {
      const n = await saveMonths();
      showToast(`${n} ${n === 1 ? 'mês salvo' : 'meses salvos'}.`, 'success');
      renderAll();
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Não foi possível salvar a planilha.', 'error');
    } finally {
      button.classList.remove('is-saving');
      updateDirtyUi();
    }
  };

  const confirmDiscard = () => !state.dirty.size || window.confirm(`Há ${state.dirty.size} ${state.dirty.size === 1 ? 'mês alterado' : 'meses alterados'} sem salvar. Descartar as alterações?`);

  // ---------------------------------------------------------------- Exportar / imprimir
  const exportCsv = () => {
    const sheet = activeSpreadsheet();
    if (!sheet) return;
    const cols = ['Mês', 'Reservas', 'Noites', 'Ocupação', 'Hóspedes', 'Valor pago', 'Extras', 'Faturamento', 'Limpeza', 'Coanfitrião', 'Comissão: status', 'Comissão: vencimento', 'Comissão: paga em', 'Comissão: valor pago', 'Receita líquida', 'Gás', 'Luz', 'Internet', 'Condomínio', 'Fixas', 'Variáveis (local)', 'Variáveis (descrição)', 'Variáveis (data)', 'Variáveis', 'Lucro líquido'];
    const num = (v) => toNumber(v).toFixed(2).replace('.', ',');
    const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = state.months.map((r) => {
      const c = calcMonth(r, sheet); const p = paymentStatus(r, sheet);
      return [MONTHS_FULL[r.month_num - 1], r.clients_count, r.nights_count, pct(c.occupancy), r.client_description, num(r.paid_clients), num(r.paid_extra), num(c.gross), num(c.cleaning), num(c.hostFee),
        PAY_LABEL[p.key], fmtDate(p.dueISO), fmtDate(r.host_fee_paid_at), p.key === 'PAGO' ? num(p.paidAmount) : '', num(c.revenueTotal),
        num(r.fixed_gas), num(r.fixed_electricity), num(r.fixed_internet), num(r.fixed_condo), num(c.fixedTotal), r.variable_location, r.variable_description, r.variable_date, num(c.variableTotal), num(c.netProfit)].map(q).join(';');
    });
    const t = totalsFor(sheet); const pt = paymentTotals(sheet, state.months);
    lines.push(['Total', t.bookings, t.nights, pct(t.occupancy), '', num(t.paid), num(t.gross - t.paid), num(t.gross), num(t.cleaning), num(t.host), '', '', '', num(pt.received), num(t.revenue), '', '', '', '', num(t.fixed), '', '', '', num(t.variable), num(t.net)].map(q).join(';'));
    const blob = new Blob([`﻿${cols.join(';')}\r\n${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${sheet.property_name.replace(/[^\w-]+/g, '-')}-${sheet.year}.csv` });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  };

  // ---------------------------------------------------------------- Eventos
  const bindEvents = () => {
    $('#spreadsheet-list').addEventListener('click', async (event) => {
      const card = event.target.closest('[data-spreadsheet-id]');
      if (!card || card.dataset.spreadsheetId === state.activeSpreadsheetId) return;
      if (!confirmDiscard()) return;
      state.activeSpreadsheetId = card.dataset.spreadsheetId;
      const url = new URL(location.href); url.searchParams.set('sheet', state.activeSpreadsheetId);
      history.replaceState({}, '', url);
      try { await loadMonths(); } catch (e) { showToast(e.message, 'error'); }
    });
    const search = $('#sheet-search');
    if (search) search.addEventListener('input', () => { state.listQuery = search.value; renderSpreadsheetList(); });

    $$('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $$('.segmented-tab[data-sheet-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        if (state.view !== 'table') setView('table');
        $$('.segmented-tab[data-sheet-tab]').forEach((tab) => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-selected', String(tab === button)); });
        state.activeTab = button.dataset.sheetTab;
        renderTable();
      });
    });

    // abrir mes (cartoes, tabela, comissoes, grafico)
    document.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-open-month]');
      if (opener && !opener.closest('#month-dialog')) { openMonth(Number(opener.dataset.openMonth)); return; }
      const pay = e.target.closest('[data-pay]'); if (pay) { quickPay(Number(pay.dataset.pay)); return; }
      const unpay = e.target.closest('[data-unpay]'); if (unpay) { undoPay(Number(unpay.dataset.unpay)); return; }
      if (e.target.closest('[data-pay-overdue]')) payOverdue();
    });

    const table = $('#sheet-table');
    table.addEventListener('input', (event) => {
      const input = event.target.closest('[data-field]');
      if (!input) return;
      const i = Number(input.dataset.row);
      setField(i, input.dataset.field, input.value);
      if (input.tagName === 'TEXTAREA') input.rows = Math.min(4, Math.max(1, input.value.split('\n').length));
      refreshComputed(i);
    });
    // Enter / setas: mesmo campo no mes seguinte ou anterior (como numa planilha)
    table.addEventListener('keydown', (event) => {
      const input = event.target.closest('input[data-field]');
      if (!input) return;
      const dir = event.key === 'Enter' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (!dir || (input.type === 'date' && event.key !== 'Enter')) return;
      const next = $(`#sheet-table [data-field="${input.dataset.field}"][data-row="${Number(input.dataset.row) + dir}"]`);
      if (next) { event.preventDefault(); next.focus(); if (next.select) next.select(); }
    });

    $('#save-sheet').addEventListener('click', doSave);
    document.addEventListener('keydown', (e) => {
      if (state.modal) return; // o modal trata o proprio Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); }
    });
    window.addEventListener('beforeunload', (e) => { if (state.dirty.size || modalChanged()) { e.preventDefault(); e.returnValue = ''; } });

    $('#export-csv').addEventListener('click', exportCsv);
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.view === 'months') renderChart(); }, 150); });
    $('#print-sheet').addEventListener('click', () => {
      const prevView = state.view; const prevTab = state.activeTab;
      state.activeTab = 'summary';
      setView('table');
      window.print();
      state.activeTab = prevTab;
      $$('.segmented-tab[data-sheet-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.sheetTab === prevTab));
      setView(prevView);
    });
    $('#reload-remote').addEventListener('click', async () => {
      if (!confirmDiscard()) return;
      await loadMonths({ silent: true });
      showToast('Planilha atualizada.', 'success');
    });
    bindModal();
  };

  const init = async () => {
    state.ctx = await window.CDEVAuth.requireAccess({ settingKey: 'dashboard_enabled' });
    if (!state.ctx) return;
    state.settings = state.ctx.settings;
    $('#user-email').textContent = state.ctx.profile.email || state.ctx.session.user.email;
    $('#user-role').textContent = isAdmin() ? 'admin' : 'proprietário';
    try { const v = localStorage.getItem('cdev:sheet-view'); if (['months', 'payments', 'table'].includes(v)) state.view = v; } catch (e) { /* sem storage */ }
    const fromUrl = new URLSearchParams(location.search).get('view'); if (['months', 'payments', 'table'].includes(fromUrl)) state.view = fromUrl;
    bindEvents();
    $$('[data-view]').forEach((b) => { const on = b.dataset.view === state.view; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    $('#view-months').hidden = state.view !== 'months';
    $('#view-payments').hidden = state.view !== 'payments';
    $('#view-table').hidden = state.view !== 'table';
    try {
      await loadSpreadsheets();
      await loadMonths();
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Não foi possível carregar as planilhas.', 'error');
    }
    applyToggles();
    window.CDEVAuth.subscribeSettings((settings) => { state.settings = settings; applyToggles(); renderAll(); });
    state.ctx.supabase
      .channel('property-spreadsheets-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_spreadsheets' }, async () => {
        await loadSpreadsheets(); renderActiveSpreadsheet();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_spreadsheet_months' }, async (payload) => {
        if (Date.now() < state.ignoreRealtimeUntil) return; // nosso proprio salvamento
        const id = payload.new?.spreadsheet_id || payload.old?.spreadsheet_id;
        if (id && id !== state.activeSpreadsheetId) return;
        if (state.dirty.size || modalChanged()) { state.remoteChanged = true; updateDirtyUi(); return; } // nao sobrescreve o que esta sendo editado
        await loadMonths({ silent: true });
      })
      .subscribe();
  };

  document.addEventListener('DOMContentLoaded', init);
})();
