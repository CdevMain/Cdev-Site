(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const state = {
    ctx: null,
    settings: {},
    spreadsheets: [],
    months: [],
    activeSpreadsheetId: null,
    activeTab: 'summary',
    loadingMonths: false
  };

  const canEdit = () => (
    state.ctx?.profile?.role === 'admin' &&
    window.CDEVAuth.isEnabled(state.settings, 'editing_enabled')
  );

  const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  const escapeAttr = (value) => String(value || '').replaceAll('"', '&quot;');
  const escapeHtml = (value) => String(value || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

  // ---------- Toasts ----------
  const showToast = (message, tone = 'success') => {
    const region = $('#toast-region');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = `toast is-${tone}`;
    const icon = tone === 'success'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    region.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 220);
    }, 3200);
  };

  // ---------- Calculations ----------
  const calcMonth = (row, sheet) => {
    const cleaning = row.cleaning_laundry === null || row.cleaning_laundry === undefined
      ? toNumber(row.clients_count) * toNumber(sheet.cleaning_fee_per_client)
      : toNumber(row.cleaning_laundry);
    const baseForCommission = toNumber(row.paid_clients) + toNumber(row.paid_extra) - cleaning;
    const hostFee = row.host_fee_override === null || row.host_fee_override === undefined
      ? baseForCommission * toNumber(sheet.commission_rate)
      : toNumber(row.host_fee_override);
    const revenueTotal = toNumber(row.paid_clients) + toNumber(row.paid_extra) - cleaning - hostFee;
    const fixedTotal = toNumber(row.fixed_gas) + toNumber(row.fixed_electricity) + toNumber(row.fixed_internet) + toNumber(row.fixed_condo);
    const variableTotal = toNumber(row.variable_total) || toNumber(row.variable_cost);
    const netProfit = revenueTotal - fixedTotal - variableTotal;
    return { cleaning, hostFee, revenueTotal, fixedTotal, variableTotal, netProfit };
  };

  const activeSpreadsheet = () => state.spreadsheets.find((sheet) => sheet.id === state.activeSpreadsheetId);

  const getSheetIdFromUrl = () => new URLSearchParams(window.location.search).get('sheet');

  // ---------- Sparkline ----------
  const sparklineSvg = (values) => {
    if (!values.length) return '';
    const w = 120, h = 26, pad = 2;
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;
    const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
    const points = values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last = values[values.length - 1];
    const color = last >= 0 ? '#2b8ba5' : '#e07b24';
    return `<svg class="summary-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
  };

  const deltaBadge = (current, previous) => {
    if (previous === null || previous === undefined) return '';
    const diff = current - previous;
    if (Math.abs(diff) < 0.005) return `<span class="summary-delta">— vs mes anterior</span>`;
    const up = diff > 0;
    const arrow = up
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7 7 17"/><path d="M17 17H7V7"/></svg>';
    return `<span class="summary-delta ${up ? 'is-up' : 'is-down'}">${arrow} ${money.format(Math.abs(diff))} vs mes anterior</span>`;
  };

  // ---------- Rendering: sidebar ----------
  const renderSpreadsheetList = () => {
    const list = $('#spreadsheet-list');
    if (!list) return;
    list.innerHTML = '';

    state.spreadsheets.forEach((sheet) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sheet-card ${sheet.id === state.activeSpreadsheetId ? 'active' : ''}`;
      button.dataset.spreadsheetId = sheet.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', sheet.id === state.activeSpreadsheetId ? 'true' : 'false');
      const thumb = sheet.cover_image_url
        ? `<img src="${escapeAttr(sheet.cover_image_url)}" alt="" loading="lazy">`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></svg>`;
      button.innerHTML = `
        <span class="sheet-thumb">${thumb}</span>
        <span class="sheet-card-info">
          <strong>${escapeHtml(sheet.title)}</strong>
          <span>${escapeHtml(sheet.property_name)} · ${sheet.year} · ${(toNumber(sheet.commission_rate) * 100).toFixed(1)}%</span>
        </span>
        <span class="sheet-card-dot ${sheet.active ? 'is-active' : ''}"></span>
      `;
      list.appendChild(button);
    });
  };

  // ---------- Rendering: summary ----------
  const renderSummary = () => {
    const sheet = activeSpreadsheet();
    const summary = $('#sheet-summary');
    if (!summary) return;
    if (!sheet) {
      summary.innerHTML = '';
      return;
    }

    const perMonth = state.months.map((row) => calcMonth(row, sheet));
    const totals = perMonth.reduce((acc, calc) => {
      acc.revenue += calc.revenueTotal;
      acc.fixed += calc.fixedTotal;
      acc.variable += calc.variableTotal;
      acc.host += calc.hostFee;
      acc.net += calc.netProfit;
      return acc;
    }, { revenue: 0, fixed: 0, variable: 0, host: 0, net: 0 });

    const netSeries = perMonth.map((c) => c.netProfit);
    const monthsWithData = state.months
      .map((row, i) => ({ row, calc: perMonth[i] }))
      .filter(({ calc }) => calc.revenueTotal || calc.fixedTotal || calc.variableTotal);
    const lastTwo = monthsWithData.slice(-2);
    const currentNet = lastTwo.length ? lastTwo[lastTwo.length - 1].calc.netProfit : null;
    const previousNet = lastTwo.length === 2 ? lastTwo[0].calc.netProfit : null;

    const cards = [
      { label: 'Receitas', value: totals.revenue },
      { label: 'Fixas', value: totals.fixed },
      { label: 'Variadas', value: totals.variable },
      { label: 'Canfitriao', value: totals.host },
      { label: 'Lucro liquido', value: totals.net, withTrend: true }
    ];

    summary.innerHTML = cards.map((card) => {
      const tone = card.value > 0.004 ? 'is-positive' : card.value < -0.004 ? 'is-negative' : '';
      const trend = card.withTrend
        ? sparklineSvg(netSeries) + deltaBadge(currentNet, previousNet)
        : '';
      return `
        <div class="summary-card ${tone}">
          <span class="summary-label">${card.label}</span>
          <strong>${money.format(card.value)}</strong>
          ${trend}
        </div>
      `;
    }).join('');
  };

  // ---------- Rendering: table ----------
  const cellInput = (row, field, type = 'number') => {
    const value = row[field] ?? '';
    return `<input class="cell-input" data-field="${field}" data-month-id="${row.id}" type="${type}" ${type === 'number' ? 'step="0.01"' : ''} value="${String(value).replaceAll('"', '&quot;')}">`;
  };

  const profitClass = (value) => (value > 0.004 ? 'is-positive' : value < -0.004 ? 'is-negative' : 'is-zero');

  const sumBy = (fn) => state.months.reduce((acc, row) => acc + fn(row, calcMonth(row, activeSpreadsheet())), 0);

  const renderTable = () => {
    const sheet = activeSpreadsheet();
    const table = $('#sheet-table');
    if (!table) return;
    if (!sheet) {
      table.innerHTML = '';
      return;
    }

    if (state.activeTab === 'summary') {
      table.innerHTML = `
        <thead><tr><th>Mes</th><th>Receitas</th><th>Fixas</th><th>Variadas</th><th>Lucro liquido</th><th>Canfitriao</th><th>Limpeza/Lavagem</th></tr></thead>
        <tbody>
          ${state.months.map((row) => {
            const calc = calcMonth(row, sheet);
            return `<tr>
              <td>${monthNames[row.month_num - 1]}</td>
              <td>${money.format(calc.revenueTotal)}</td>
              <td>${money.format(calc.fixedTotal)}</td>
              <td>${money.format(calc.variableTotal)}</td>
              <td class="${profitClass(calc.netProfit)}">${money.format(calc.netProfit)}</td>
              <td>${money.format(calc.hostFee)}</td>
              <td>${money.format(calc.cleaning)}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr>
          <td>Total</td>
          <td>${money.format(sumBy((r, c) => c.revenueTotal))}</td>
          <td>${money.format(sumBy((r, c) => c.fixedTotal))}</td>
          <td>${money.format(sumBy((r, c) => c.variableTotal))}</td>
          <td>${money.format(sumBy((r, c) => c.netProfit))}</td>
          <td>${money.format(sumBy((r, c) => c.hostFee))}</td>
          <td>${money.format(sumBy((r, c) => c.cleaning))}</td>
        </tr></tfoot>
      `;
    }

    if (state.activeTab === 'revenue') {
      table.innerHTML = `
        <thead><tr><th>Mes</th><th>Clientes</th><th>Noites</th><th>Descricao</th><th>Pago clientes</th><th>Extra</th><th>Limpeza</th><th>Canfitriao</th><th>Lucro total</th></tr></thead>
        <tbody>
          ${state.months.map((row) => {
            const calc = calcMonth(row, sheet);
            return `<tr>
              <td>${monthNames[row.month_num - 1]}</td>
              <td>${cellInput(row, 'clients_count')}</td>
              <td>${cellInput(row, 'nights_count')}</td>
              <td>${cellInput(row, 'client_description', 'text')}</td>
              <td>${cellInput(row, 'paid_clients')}</td>
              <td>${cellInput(row, 'paid_extra')}</td>
              <td>${cellInput(row, 'cleaning_laundry')}</td>
              <td>${cellInput(row, 'host_fee_override')}</td>
              <td class="${profitClass(calc.revenueTotal)}">${money.format(calc.revenueTotal)}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr>
          <td>Total</td>
          <td>${state.months.reduce((a, r) => a + toNumber(r.clients_count), 0)}</td>
          <td>${state.months.reduce((a, r) => a + toNumber(r.nights_count), 0)}</td>
          <td>-</td>
          <td>${money.format(state.months.reduce((a, r) => a + toNumber(r.paid_clients), 0))}</td>
          <td>${money.format(state.months.reduce((a, r) => a + toNumber(r.paid_extra), 0))}</td>
          <td>-</td>
          <td>-</td>
          <td>${money.format(sumBy((r, c) => c.revenueTotal))}</td>
        </tr></tfoot>
      `;
    }

    if (state.activeTab === 'fixed') {
      table.innerHTML = `
        <thead><tr><th>Mes</th><th>Gas</th><th>Luz</th><th>Internet</th><th>Condominio</th><th>Total</th></tr></thead>
        <tbody>
          ${state.months.map((row) => {
            const calc = calcMonth(row, sheet);
            return `<tr>
              <td>${monthNames[row.month_num - 1]}</td>
              <td>${cellInput(row, 'fixed_gas')}</td>
              <td>${cellInput(row, 'fixed_electricity')}</td>
              <td>${cellInput(row, 'fixed_internet')}</td>
              <td>${cellInput(row, 'fixed_condo')}</td>
              <td>${money.format(calc.fixedTotal)}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr>
          <td>Total</td>
          <td>${money.format(state.months.reduce((a, r) => a + toNumber(r.fixed_gas), 0))}</td>
          <td>${money.format(state.months.reduce((a, r) => a + toNumber(r.fixed_electricity), 0))}</td>
          <td>${money.format(state.months.reduce((a, r) => a + toNumber(r.fixed_internet), 0))}</td>
          <td>${money.format(state.months.reduce((a, r) => a + toNumber(r.fixed_condo), 0))}</td>
          <td>${money.format(sumBy((r, c) => c.fixedTotal))}</td>
        </tr></tfoot>
      `;
    }

    if (state.activeTab === 'variable') {
      table.innerHTML = `
        <thead><tr><th>Mes</th><th>Local</th><th>Descricao</th><th>Data</th><th>Valor/c</th><th>Valor total</th></tr></thead>
        <tbody>
          ${state.months.map((row) => `<tr>
            <td>${monthNames[row.month_num - 1]}</td>
            <td>${cellInput(row, 'variable_location', 'text')}</td>
            <td>${cellInput(row, 'variable_description', 'text')}</td>
            <td>${cellInput(row, 'variable_date', 'date')}</td>
            <td>${cellInput(row, 'variable_cost')}</td>
            <td>${cellInput(row, 'variable_total')}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr>
          <td>Total</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>${money.format(state.months.reduce((a, r) => a + toNumber(r.variable_cost), 0))}</td>
          <td>${money.format(state.months.reduce((a, r) => a + toNumber(r.variable_total), 0))}</td>
        </tr></tfoot>
      `;
    }

    applyToggles();
  };

  const applyToggles = () => {
    const editingEnabled = canEdit();
    const spreadsheetVisible = window.CDEVAuth.isEnabled(state.settings, 'spreadsheet_visible');

    $$('[data-requires-setting]').forEach((el) => {
      const key = el.dataset.requiresSetting;
      el.hidden = !window.CDEVAuth.isEnabled(state.settings, key);
    });

    $$('[data-edit-action]').forEach((button) => {
      button.disabled = !editingEnabled;
      button.title = editingEnabled ? 'Editar' : 'Edicao disponivel apenas para admin com toggle ligado';
    });

    const table = $('#spreadsheet-panel');
    if (table) table.hidden = !spreadsheetVisible;

    const readonly = $('#readonly-state');
    if (readonly) readonly.hidden = editingEnabled;

    $$('.cell-input').forEach((field) => {
      field.disabled = !editingEnabled;
    });
  };

  const renderActiveSpreadsheet = () => {
    const sheet = activeSpreadsheet();
    $('#sheet-skeleton').hidden = true;
    $('#sheet-empty').hidden = Boolean(sheet);
    $('#sheet-workspace').hidden = !sheet;
    $('#save-sheet').hidden = !sheet;
    $('#sheet-title').textContent = sheet ? sheet.title : 'Selecione uma planilha';
    $('#sheet-kicker').textContent = sheet ? `${sheet.property_name} / ${sheet.year}` : 'Tabela';
    renderSpreadsheetList();
    renderSummary();
    renderTable();
  };

  // ---------- Data ----------
  const loadSpreadsheets = async () => {
    const { data, error } = await state.ctx.supabase
      .from('property_spreadsheets')
      .select('id,title,property_name,owner_user_id,year,commission_rate,cleaning_fee_per_client,cover_image_url,active,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    state.spreadsheets = data || [];
    const fromUrl = getSheetIdFromUrl();
    if (fromUrl && state.spreadsheets.some((sheet) => sheet.id === fromUrl)) {
      state.activeSpreadsheetId = fromUrl;
    } else if (!state.activeSpreadsheetId && state.spreadsheets.length) {
      state.activeSpreadsheetId = state.spreadsheets[0].id;
    }
    renderSpreadsheetList();
  };

  const loadMonths = async () => {
    if (!state.activeSpreadsheetId) {
      state.months = [];
      renderActiveSpreadsheet();
      return;
    }

    state.loadingMonths = true;
    $('#sheet-empty').hidden = true;
    $('#sheet-workspace').hidden = true;
    $('#sheet-skeleton').hidden = false;

    const { data, error } = await state.ctx.supabase
      .from('property_spreadsheet_months')
      .select('*')
      .eq('spreadsheet_id', state.activeSpreadsheetId)
      .order('month_num', { ascending: true });
    if (error) throw error;
    state.months = data || [];
    state.loadingMonths = false;
    renderActiveSpreadsheet();
  };

  const collectEdits = () => {
    const rowsById = new Map(state.months.map((row) => [row.id, { ...row }]));
    $$('[data-field]').forEach((input) => {
      const row = rowsById.get(input.dataset.monthId);
      if (!row) return;
      const numeric = input.type === 'number';
      const nullableNumber = input.dataset.field === 'cleaning_laundry' || input.dataset.field === 'host_fee_override';
      row[input.dataset.field] = numeric
        ? (nullableNumber && input.value === '' ? null : toNumber(input.value))
        : input.value || null;
    });
    return Array.from(rowsById.values());
  };

  const saveMonths = async () => {
    if (!canEdit()) return;
    const rows = collectEdits().map((row) => ({
      id: row.id,
      spreadsheet_id: row.spreadsheet_id,
      month_num: row.month_num,
      clients_count: toNumber(row.clients_count),
      nights_count: toNumber(row.nights_count),
      client_description: row.client_description || '*',
      paid_clients: toNumber(row.paid_clients),
      paid_extra: toNumber(row.paid_extra),
      cleaning_laundry: row.cleaning_laundry === '' ? null : row.cleaning_laundry,
      host_fee_override: row.host_fee_override === '' ? null : row.host_fee_override,
      fixed_gas: toNumber(row.fixed_gas),
      fixed_electricity: toNumber(row.fixed_electricity),
      fixed_internet: toNumber(row.fixed_internet),
      fixed_condo: toNumber(row.fixed_condo),
      variable_location: row.variable_location || null,
      variable_description: row.variable_description || null,
      variable_date: row.variable_date || null,
      variable_cost: toNumber(row.variable_cost),
      variable_total: toNumber(row.variable_total)
    }));

    const { error } = await state.ctx.supabase
      .from('property_spreadsheet_months')
      .upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    await loadMonths();
  };

  // ---------- Events ----------
  const bindEvents = () => {
    $('#spreadsheet-list').addEventListener('click', async (event) => {
      const card = event.target.closest('[data-spreadsheet-id]');
      if (!card) return;
      state.activeSpreadsheetId = card.dataset.spreadsheetId;
      const url = new URL(window.location.href);
      url.searchParams.set('sheet', state.activeSpreadsheetId);
      window.history.replaceState({}, '', url);
      await loadMonths();
    });

    $$('.segmented-tab').forEach((button) => {
      button.addEventListener('click', () => {
        $$('.segmented-tab').forEach((tab) => {
          tab.classList.toggle('active', tab === button);
          tab.setAttribute('aria-selected', tab === button ? 'true' : 'false');
        });
        state.activeTab = button.dataset.sheetTab;
        renderTable();
      });
    });

    $('#save-sheet').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.classList.add('is-saving');
      button.disabled = true;
      try {
        await saveMonths();
        showToast('Alteracoes salvas com sucesso.', 'success');
      } catch (error) {
        console.error(error);
        showToast(error.message || 'Nao foi possivel salvar a planilha.', 'error');
      } finally {
        button.classList.remove('is-saving');
        applyToggles();
      }
    });

    $$('[data-sign-out]').forEach((button) => button.addEventListener('click', window.CDEVAuth.signOut));
  };

  const init = async () => {
    state.ctx = await window.CDEVAuth.requireAccess({ settingKey: 'dashboard_enabled' });
    if (!state.ctx) return;
    state.settings = state.ctx.settings;
    $('#user-email').textContent = state.ctx.profile.email || state.ctx.session.user.email;
    $('#user-role').textContent = state.ctx.profile.role;
    bindEvents();
    await loadSpreadsheets();
    await loadMonths();
    applyToggles();
    window.CDEVAuth.subscribeSettings((settings) => {
      state.settings = settings;
      applyToggles();
      renderTable();
    });
    state.ctx.supabase
      .channel('property-spreadsheets-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_spreadsheets' }, async () => {
        await loadSpreadsheets();
        await loadMonths();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_spreadsheet_months' }, async () => {
        await loadMonths();
      })
      .subscribe();
  };

  document.addEventListener('DOMContentLoaded', init);
})();
