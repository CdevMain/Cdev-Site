/* CDEV - Planilhas de imoveis (Airbnb / temporada)
 * - Edicao sem perda: o que e digitado vai direto para o estado; trocar de aba nao descarta nada
 * - Salva so os meses alterados (Ctrl+S), avisa antes de sair com alteracoes pendentes
 * - Totais, resumo e indicadores recalculam enquanto voce digita
 * - Indicadores reais: lucro no ano, ocupacao, diaria media, reservas
 * - Grafico mensal de lucro, exportacao CSV e impressao/PDF
 * A formula de calculo e a mesma da versao anterior (os valores salvos nao mudam).
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
  const COLOR_PROFIT = '#2aa0c6';
  const COLOR_LOSS = '#d4691e';

  const NUMBER_FIELDS = ['clients_count', 'nights_count', 'paid_clients', 'paid_extra', 'cleaning_laundry', 'host_fee_override', 'fixed_gas', 'fixed_electricity', 'fixed_internet', 'fixed_condo', 'variable_total'];
  const NULLABLE_FIELDS = ['cleaning_laundry', 'host_fee_override'];
  const SAVE_FIELDS = ['clients_count', 'nights_count', 'client_description', 'paid_clients', 'paid_extra', 'cleaning_laundry', 'host_fee_override', 'fixed_gas', 'fixed_electricity', 'fixed_internet', 'fixed_condo', 'variable_location', 'variable_description', 'variable_date', 'variable_total'];

  const state = {
    ctx: null,
    settings: {},
    spreadsheets: [],
    months: [],
    snapshot: new Map(), // id -> JSON do mes como esta no banco
    dirty: new Set(),
    activeSpreadsheetId: null,
    activeTab: 'summary',
    listQuery: '',
    ignoreRealtimeUntil: 0,
    remoteChanged: false
  };

  const isAdmin = () => state.ctx?.profile?.role === 'admin';
  const canEdit = () => isAdmin() && window.CDEVAuth.isEnabled(state.settings, 'editing_enabled');
  const toNumber = window.CDEVSheetCalc.toNumber;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const activeSpreadsheet = () => state.spreadsheets.find((s) => s.id === state.activeSpreadsheetId);

  // ---------------------------------------------------------------- Toasts
  const showToast = (message, tone = 'success') => {
    const region = $('#toast-region');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = `toast is-${tone}`;
    const icon = tone === 'success'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';
    toast.innerHTML = `${icon}<span>${esc(message)}</span>`;
    region.appendChild(toast);
    setTimeout(() => { toast.classList.add('is-leaving'); setTimeout(() => toast.remove(), 220); }, tone === 'error' ? 5200 : 3200);
  };

  // ---------------------------------------------------------------- Calculos (fonte unica: assets/js/sheet-calc.js)
  const { autoCleaning, calcMonth, isFuture } = window.CDEVSheetCalc;
  const totalsFor = (sheet) => window.CDEVSheetCalc.totals(sheet, state.months);

  // ---------------------------------------------------------------- Lista de planilhas
  const renderSpreadsheetList = () => {
    const list = $('#spreadsheet-list');
    if (!list) return;
    const search = $('#sheet-search');
    if (search) search.hidden = state.spreadsheets.length < 5;
    const q = state.listQuery.trim().toLowerCase();
    const items = state.spreadsheets.filter((s) => !q || `${s.title} ${s.property_name} ${s.year} ${s.address || ''}`.toLowerCase().includes(q));
    if (!state.spreadsheets.length) {
      list.innerHTML = `<p class="sheet-list-empty">${isAdmin() ? 'Nenhuma planilha ainda. Crie uma em Admin → Planilhas.' : 'Nenhuma planilha disponível para você ainda.'}</p>`;
      return;
    }
    list.innerHTML = items.map((sheet) => {
      const active = sheet.id === state.activeSpreadsheetId;
      const thumb = sheet.cover_image_url
        ? `<img src="${esc(sheet.cover_image_url)}" alt="" loading="lazy">`
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></svg>';
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

  // ---------------------------------------------------------------- Indicadores (topo) e resumo
  const renderKpis = () => {
    const sheet = activeSpreadsheet();
    const set = (id, value, hint) => {
      const el = $(`#${id}`); if (!el) return;
      el.querySelector('strong').textContent = value;
      const h = el.querySelector('small'); if (h) h.textContent = hint || '';
    };
    if (!sheet || !state.months.length) {
      ['kpi-profit', 'kpi-occupancy', 'kpi-adr', 'kpi-bookings'].forEach((id) => set(id, '—', ''));
      return;
    }
    const t = totalsFor(sheet);
    set('kpi-profit', moneyShort(t.net), `margem ${pct(t.margin)} do faturamento`);
    set('kpi-occupancy', pct(t.occupancy), `${t.nights} noites ocupadas em ${sheet.year}`);
    set('kpi-adr', money.format(t.adr), 'valor pago ÷ noites');
    set('kpi-bookings', String(t.bookings), `${t.activeMonths} ${t.activeMonths === 1 ? 'mês' : 'meses'} com hóspedes`);
    const profitEl = $('#kpi-profit strong');
    if (profitEl) profitEl.style.color = t.net < 0 ? COLOR_LOSS : '';
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

  // ---------------------------------------------------------------- Grafico mensal (lucro liquido)
  const renderChart = () => {
    const box = $('#sheet-chart');
    const sheet = activeSpreadsheet();
    if (!box) return;
    box.hidden = state.activeTab !== 'summary' || !sheet;
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
      return `<g class="chart-bar${d.future ? ' is-future' : ''}" data-i="${i}" tabindex="0" role="img" aria-label="${esc(label)}">
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
      <div class="chart-head"><span class="chart-title">Lucro líquido por mês</span><span class="chart-sub">passe o mouse nos meses para ver detalhes</span></div>
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

  // ---------------------------------------------------------------- Tabelas
  const cell = (row, i, field, { type = 'number', placeholder = '', textarea = false } = {}) => {
    const value = row[field] ?? '';
    const common = `data-row="${i}" data-field="${field}" aria-label="${esc(field)} ${MONTHS[row.month_num - 1]}"`;
    if (textarea) return `<textarea class="cell-input cell-text" rows="${Math.min(4, Math.max(1, String(value).split('\n').length))}" ${common}>${esc(value)}</textarea>`;
    return `<input class="cell-input" ${common} type="${type}" ${type === 'number' ? 'step="0.01" inputmode="decimal"' : ''} value="${esc(value)}" placeholder="${esc(placeholder)}">`;
  };
  const tone = (v) => (v > 0.004 ? 'is-positive' : v < -0.004 ? 'is-negative' : 'is-zero');
  const rowAttrs = (sheet, row, i) => `data-month-row="${i}" class="${isFuture(sheet, row) ? 'is-future' : ''} ${state.dirty.has(row.id) ? 'is-dirty' : ''}"`;
  const monthCell = (row) => `<td><span class="month-name">${MONTHS[row.month_num - 1]}</span></td>`;

  const TABLES = {
    summary: {
      head: ['Mês', 'Faturamento', 'Limpeza', 'Coanfitrião', 'Receita líquida', 'Fixas', 'Variáveis', 'Lucro líquido', 'Noites', 'Ocupação'],
      row: (row, i, sheet) => {
        const c = calcMonth(row, sheet);
        return `<tr ${rowAttrs(sheet, row, i)}>${monthCell(row)}
          <td>${money.format(c.gross)}</td><td>${money.format(c.cleaning)}</td><td>${money.format(c.hostFee)}</td>
          <td>${money.format(c.revenueTotal)}</td><td>${money.format(c.fixedTotal)}</td><td>${money.format(c.variableTotal)}</td>
          <td class="${tone(c.netProfit)}"><strong>${money.format(c.netProfit)}</strong></td><td>${c.nights}</td><td>${pct(c.occupancy)}</td></tr>`;
      },
      foot: (t) => ['Total', money.format(t.gross), money.format(t.cleaning), money.format(t.host), money.format(t.revenue), money.format(t.fixed), money.format(t.variable), `<strong>${money.format(t.net)}</strong>`, t.nights, pct(t.occupancy)]
    },
    revenue: {
      head: ['Mês', 'Reservas', 'Noites', 'Hóspedes', 'Valor pago', 'Extras', 'Limpeza', 'Coanfitrião', 'Receita líquida'],
      row: (row, i, sheet) => {
        const c = calcMonth(row, sheet);
        return `<tr ${rowAttrs(sheet, row, i)}>${monthCell(row)}
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
        return `<tr ${rowAttrs(sheet, row, i)}>${monthCell(row)}
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
      row: (row, i, sheet) => `<tr ${rowAttrs(sheet, row, i)}>${monthCell(row)}
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
    if (btn) { btn.classList.toggle('has-changes', n > 0); btn.disabled = !canEdit() || n === 0; }
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
        ? 'Edição desabilitada globalmente (Admin → Toggles → editing_enabled). A planilha está em modo somente leitura.'
        : 'Visualização somente leitura. Os valores são lançados pela administração.';
    }
    $$('.cell-input').forEach((f) => { f.disabled = !editing; });
    $$('[data-edit-action]').forEach((b) => { b.hidden = !isAdmin(); });
    updateDirtyUi();
  };

  const renderActiveSpreadsheet = () => {
    const sheet = activeSpreadsheet();
    $('#sheet-skeleton').hidden = true;
    $('#sheet-empty').hidden = Boolean(sheet);
    $('#sheet-workspace').hidden = !sheet;
    $('#sheet-actions').hidden = !sheet;
    $('#sheet-title').textContent = sheet ? sheet.property_name : 'Selecione uma planilha';
    $('#sheet-kicker').textContent = sheet ? `${sheet.title} · ${sheet.year}` : 'Planilha';
    const link = $('#sheet-listing');
    if (link) { link.hidden = !(sheet && sheet.listing_url); if (sheet && sheet.listing_url) link.href = sheet.listing_url; }
    renderSpreadsheetList();
    renderKpis();
    renderSummary();
    renderChart();
    renderTable();
  };

  // ---------------------------------------------------------------- Dados
  const loadSpreadsheets = async () => {
    const { data, error } = await state.ctx.supabase
      .from('property_spreadsheets')
      .select('id,title,property_name,owner_user_id,year,commission_rate,cleaning_fee_per_client,cover_image_url,listing_url,address,active,updated_at')
      .order('active', { ascending: false })
      .order('year', { ascending: false })
      .order('property_name', { ascending: true });
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
    const cols = ['Mês', 'Reservas', 'Noites', 'Ocupação', 'Hóspedes', 'Valor pago', 'Extras', 'Faturamento', 'Limpeza', 'Coanfitrião', 'Receita líquida', 'Gás', 'Luz', 'Internet', 'Condomínio', 'Fixas', 'Variáveis (local)', 'Variáveis (descrição)', 'Variáveis (data)', 'Variáveis', 'Lucro líquido'];
    const num = (v) => toNumber(v).toFixed(2).replace('.', ',');
    const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = state.months.map((r) => {
      const c = calcMonth(r, sheet);
      return [MONTHS_FULL[r.month_num - 1], r.clients_count, r.nights_count, pct(c.occupancy), r.client_description, num(r.paid_clients), num(r.paid_extra), num(c.gross), num(c.cleaning), num(c.hostFee), num(c.revenueTotal),
        num(r.fixed_gas), num(r.fixed_electricity), num(r.fixed_internet), num(r.fixed_condo), num(c.fixedTotal), r.variable_location, r.variable_description, r.variable_date, num(c.variableTotal), num(c.netProfit)].map(q).join(';');
    });
    const t = totalsFor(sheet);
    lines.push(['Total', t.bookings, t.nights, pct(t.occupancy), '', num(t.paid), num(t.gross - t.paid), num(t.gross), num(t.cleaning), num(t.host), num(t.revenue), '', '', '', '', num(t.fixed), '', '', '', num(t.variable), num(t.net)].map(q).join(';'));
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

    $$('.segmented-tab[data-sheet-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        $$('.segmented-tab[data-sheet-tab]').forEach((tab) => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-selected', String(tab === button)); });
        state.activeTab = button.dataset.sheetTab;
        renderChart();
        renderTable();
      });
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); }
    });
    window.addEventListener('beforeunload', (e) => { if (state.dirty.size) { e.preventDefault(); e.returnValue = ''; } });

    $('#export-csv').addEventListener('click', exportCsv);
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderChart, 150); });
    $('#print-sheet').addEventListener('click', () => {
      const prev = state.activeTab;
      state.activeTab = 'summary'; renderChart(); renderTable();
      window.print();
      state.activeTab = prev;
      $$('.segmented-tab[data-sheet-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.sheetTab === prev));
      renderChart(); renderTable();
    });
    $('#reload-remote').addEventListener('click', async () => {
      if (!confirmDiscard()) return;
      await loadMonths({ silent: true });
      showToast('Planilha atualizada.', 'success');
    });
  };

  const init = async () => {
    state.ctx = await window.CDEVAuth.requireAccess({ settingKey: 'dashboard_enabled' });
    if (!state.ctx) return;
    state.settings = state.ctx.settings;
    $('#user-email').textContent = state.ctx.profile.email || state.ctx.session.user.email;
    $('#user-role').textContent = isAdmin() ? 'admin' : 'proprietário';
    bindEvents();
    try {
      await loadSpreadsheets();
      await loadMonths();
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Não foi possível carregar as planilhas.', 'error');
    }
    applyToggles();
    window.CDEVAuth.subscribeSettings((settings) => { state.settings = settings; applyToggles(); });
    state.ctx.supabase
      .channel('property-spreadsheets-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_spreadsheets' }, async () => {
        await loadSpreadsheets(); renderActiveSpreadsheet();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_spreadsheet_months' }, async (payload) => {
        if (Date.now() < state.ignoreRealtimeUntil) return; // nosso proprio salvamento
        const id = payload.new?.spreadsheet_id || payload.old?.spreadsheet_id;
        if (id && id !== state.activeSpreadsheetId) return;
        if (state.dirty.size) { state.remoteChanged = true; updateDirtyUi(); return; } // nao sobrescreve o que esta sendo editado
        await loadMonths({ silent: true });
      })
      .subscribe();
  };

  document.addEventListener('DOMContentLoaded', init);
})();
