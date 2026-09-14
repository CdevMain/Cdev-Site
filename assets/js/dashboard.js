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
    activeTab: 'summary'
  };

  const canEdit = () => (
    state.ctx?.profile?.role === 'admin' &&
    window.CDEVAuth.isEnabled(state.settings, 'editing_enabled')
  );

  const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

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

    $$('[data-field]').forEach((field) => {
      field.disabled = !editingEnabled;
    });
  };

  const renderSpreadsheetList = () => {
    const list = $('#spreadsheet-list');
    list.innerHTML = '';

    state.spreadsheets.forEach((sheet) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sheet-card ${sheet.id === state.activeSpreadsheetId ? 'active' : ''}`;
      button.dataset.spreadsheetId = sheet.id;
      button.innerHTML = `
        <strong>${sheet.title}</strong>
        <span>${sheet.property_name} / ${sheet.year} / ${(toNumber(sheet.commission_rate) * 100).toFixed(2)}%</span>
      `;
      list.appendChild(button);
    });
  };

  const renderSummary = () => {
    const sheet = activeSpreadsheet();
    const summary = $('#sheet-summary');
    if (!sheet) {
      summary.innerHTML = '';
      return;
    }

    const totals = state.months.reduce((acc, row) => {
      const calc = calcMonth(row, sheet);
      acc.revenue += calc.revenueTotal;
      acc.fixed += calc.fixedTotal;
      acc.variable += calc.variableTotal;
      acc.host += calc.hostFee;
      acc.net += calc.netProfit;
      return acc;
    }, { revenue: 0, fixed: 0, variable: 0, host: 0, net: 0 });

    summary.innerHTML = `
      <div><span>Receitas</span><strong>${money.format(totals.revenue)}</strong></div>
      <div><span>Fixas</span><strong>${money.format(totals.fixed)}</strong></div>
      <div><span>Variadas</span><strong>${money.format(totals.variable)}</strong></div>
      <div><span>Canfitriao</span><strong>${money.format(totals.host)}</strong></div>
      <div><span>Lucro liquido</span><strong>${money.format(totals.net)}</strong></div>
    `;
  };

  const cellInput = (row, field, type = 'number') => {
    const value = row[field] ?? '';
    return `<input class="field" data-field="${field}" data-month-id="${row.id}" type="${type}" ${type === 'number' ? 'step="0.01"' : ''} value="${String(value).replaceAll('"', '&quot;')}">`;
  };

  const renderTable = () => {
    const sheet = activeSpreadsheet();
    const table = $('#sheet-table');
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
              <td>${money.format(calc.netProfit)}</td>
              <td>${money.format(calc.hostFee)}</td>
              <td>${money.format(calc.cleaning)}</td>
            </tr>`;
          }).join('')}
        </tbody>
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
              <td>${money.format(calc.revenueTotal)}</td>
            </tr>`;
          }).join('')}
        </tbody>
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
      `;
    }

    applyToggles();
  };

  const renderActiveSpreadsheet = () => {
    const sheet = activeSpreadsheet();
    $('#sheet-empty').hidden = Boolean(sheet);
    $('#sheet-workspace').hidden = !sheet;
    $('#save-sheet').hidden = !sheet;
    $('#sheet-title').textContent = sheet ? sheet.title : 'Selecione uma planilha';
    $('#sheet-kicker').textContent = sheet ? `${sheet.property_name} / ${sheet.year}` : 'Tabela';
    renderSpreadsheetList();
    renderSummary();
    renderTable();
  };

  const loadSpreadsheets = async () => {
    const { data, error } = await state.ctx.supabase
      .from('property_spreadsheets')
      .select('id,title,property_name,owner_user_id,year,commission_rate,cleaning_fee_per_client,active,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    state.spreadsheets = data || [];
    if (!state.activeSpreadsheetId && state.spreadsheets.length) {
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

    const { data, error } = await state.ctx.supabase
      .from('property_spreadsheet_months')
      .select('*')
      .eq('spreadsheet_id', state.activeSpreadsheetId)
      .order('month_num', { ascending: true });
    if (error) throw error;
    state.months = data || [];
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

  const bindEvents = () => {
    $('#spreadsheet-list').addEventListener('click', async (event) => {
      const card = event.target.closest('[data-spreadsheet-id]');
      if (!card) return;
      state.activeSpreadsheetId = card.dataset.spreadsheetId;
      await loadMonths();
    });

    $$('.sheet-tab').forEach((button) => {
      button.addEventListener('click', () => {
        $$('.sheet-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
        state.activeTab = button.dataset.sheetTab;
        renderTable();
      });
    });

    $('#save-sheet').addEventListener('click', async () => {
      try {
        await saveMonths();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Nao foi possivel salvar a planilha.');
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
