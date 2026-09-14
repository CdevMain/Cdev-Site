(function () {
  const state = {
    ctx: null,
    settings: {},
    users: [],
    spreadsheets: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const setStatus = (message, tone = 'neutral') => {
    const el = $('#admin-feedback');
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  };

  const formatDate = (value) => {
    if (!value) return '-';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  };

  const renderStats = () => {
    $('#stat-users').textContent = state.users.length;
    $('#stat-active').textContent = state.users.filter((user) => user.active).length;
    $('#stat-admins').textContent = state.users.filter((user) => user.role === 'admin').length;
    $('#stat-modules').textContent = Object.values(state.settings).filter((setting) => setting.enabled).length;
  };

  const renderSettings = () => {
    const list = $('#settings-list');
    list.innerHTML = '';
    Object.values(state.settings).forEach((setting) => {
      const row = document.createElement('article');
      row.className = 'admin-toggle';
      row.innerHTML = `
        <div>
          <div class="toggle-title">${setting.key}</div>
          <p>${setting.description || 'Modulo do sistema.'}</p>
          <span class="toggle-time">Atualizado em ${formatDate(setting.updated_at)}</span>
        </div>
        <label class="switch" title="Alternar ${setting.key}">
          <input type="checkbox" data-setting-key="${setting.key}" ${setting.enabled ? 'checked' : ''}>
          <span></span>
        </label>
      `;
      list.appendChild(row);
    });
    if (window.lucide) window.lucide.createIcons();
  };

  const renderUsers = () => {
    const body = $('#users-table tbody');
    body.innerHTML = '';
    state.users.forEach((user) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${user.email || user.id}</strong>
          <span>${user.id}</span>
        </td>
        <td>
          <select data-user-role="${user.id}" ${user.id === state.ctx.profile.id ? 'disabled' : ''}>
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>user</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </td>
        <td>
          <label class="mini-switch">
            <input type="checkbox" data-user-active="${user.id}" ${user.active ? 'checked' : ''} ${user.id === state.ctx.profile.id ? 'disabled' : ''}>
            <span></span>
          </label>
        </td>
        <td>${formatDate(user.last_login)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-reset="${user.email}" title="Resetar senha"><i data-lucide="key-round"></i></button>
            <button class="icon-btn danger" data-delete="${user.id}" title="Deletar usuario" ${user.id === state.ctx.profile.id ? 'disabled' : ''}><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      body.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
  };

  const renderOwnerOptions = () => {
    const select = $('#create-spreadsheet-form select[name="owner_user_id"]');
    if (!select) return;
    const activeUsers = state.users.filter((user) => user.active);
    select.innerHTML = activeUsers.map((user) => (
      `<option value="${user.id}">${user.email || user.id} (${user.role})</option>`
    )).join('');
  };

  const renderSpreadsheets = () => {
    const body = $('#spreadsheets-table tbody');
    if (!body) return;
    const usersById = new Map(state.users.map((user) => [user.id, user]));
    body.innerHTML = '';
    state.spreadsheets.forEach((sheet) => {
      const owner = usersById.get(sheet.owner_user_id);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${sheet.title}</strong>
          <span>${sheet.property_name}</span>
        </td>
        <td>${owner?.email || sheet.owner_user_id}</td>
        <td>${sheet.year}</td>
        <td>${(Number(sheet.commission_rate || 0) * 100).toFixed(2)}%</td>
        <td>${sheet.active ? 'Ativa' : 'Inativa'}</td>
      `;
      body.appendChild(tr);
    });
  };

  const escapeAttr = (value) => String(value || '').replaceAll('"', '&quot;');
  const escapeHtml = (value) => String(value || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

  const renderPropertyGrid = () => {
    const grid = $('#property-grid');
    const empty = $('#property-grid-empty');
    if (!grid) return;
    grid.innerHTML = '';
    empty.hidden = state.spreadsheets.length > 0;

    state.spreadsheets.forEach((sheet) => {
      const card = document.createElement('article');
      card.className = 'property-card';
      card.dataset.propertyId = sheet.id;
      card.innerHTML = `
        <div class="property-cover">
          ${sheet.cover_image_url
            ? `<img src="${escapeAttr(sheet.cover_image_url)}" alt="${escapeAttr(sheet.property_name)}" loading="lazy">`
            : `<div class="no-image">Sem foto</div>`}
          <span class="property-badge ${sheet.active ? 'is-active' : ''}">${sheet.active ? 'Live' : 'Inativo'}</span>
        </div>
        <div class="property-body">
          <div>
            <h3>${escapeHtml(sheet.property_name)}</h3>
            <div class="property-address">${escapeHtml(sheet.address) || `${sheet.year} · sem endereco`}</div>
          </div>
          <div class="property-actions">
            <a class="btn btn-ghost" href="${sheet.listing_url ? escapeAttr(sheet.listing_url) : '#'}" target="_blank" rel="noopener" ${sheet.listing_url ? '' : 'aria-disabled="true" onclick="return false;" title="Sem link cadastrado"'}>
              <i data-lucide="external-link"></i>Anuncio
            </a>
            <a class="btn btn-primary" href="dashboard.html?sheet=${sheet.id}">
              <i data-lucide="table-2"></i>Planilha
            </a>
          </div>
          <button type="button" class="property-edit-toggle" data-toggle-edit="${sheet.id}">Editar foto / link / endereco</button>
          <form class="property-edit" data-edit-form="${sheet.id}">
            <input class="field" name="cover_image_url" type="url" placeholder="URL da foto de capa" value="${escapeAttr(sheet.cover_image_url)}">
            <input class="field" name="listing_url" type="url" placeholder="Link do anuncio (Airbnb)" value="${escapeAttr(sheet.listing_url)}">
            <input class="field" name="address" placeholder="Endereco / bairro" value="${escapeAttr(sheet.address)}">
            <button class="btn btn-primary" type="submit"><i data-lucide="check"></i>Salvar</button>
          </form>
        </div>
      `;
      grid.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
  };

  const loadSettings = async () => {
    state.settings = await window.CDEVAuth.getSettings({ force: true });
    renderSettings();
    renderStats();
  };

  const loadUsers = async () => {
    const { data, error } = await state.ctx.supabase
      .from('users')
      .select('id,email,role,active,last_login,updated_at')
      .order('email', { ascending: true });
    if (error) throw error;
    state.users = data || [];
    renderUsers();
    renderOwnerOptions();
    renderSpreadsheets();
    renderPropertyGrid();
    renderStats();
  };

  const loadSpreadsheets = async () => {
    const { data, error } = await state.ctx.supabase
      .from('property_spreadsheets')
      .select('id,title,property_name,owner_user_id,year,commission_rate,cleaning_fee_per_client,cover_image_url,listing_url,address,active,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    state.spreadsheets = data || [];
    renderSpreadsheets();
    renderPropertyGrid();
  };

  const invokeAdminUsers = async (payload) => {
    const { data, error } = await state.ctx.supabase.functions.invoke('admin-users', { body: payload });
    if (error) throw error;
    return data;
  };

  const updateSetting = async (key, enabled) => {
    const { error } = await state.ctx.supabase
      .from('system_settings')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('key', key);
    if (error) throw error;
  };

  const updateUser = async (id, patch) => {
    const { error } = await state.ctx.supabase
      .from('users')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  };

  const bindEvents = () => {
    $('#settings-list').addEventListener('change', async (event) => {
      const input = event.target.closest('[data-setting-key]');
      if (!input) return;
      input.disabled = true;
      try {
        await updateSetting(input.dataset.settingKey, input.checked);
        setStatus(`${input.dataset.settingKey} ${input.checked ? 'ativado' : 'desativado'}.`, 'success');
        await loadSettings();
      } catch (error) {
        input.checked = !input.checked;
        setStatus(error.message || 'Falha ao atualizar toggle.', 'error');
      } finally {
        input.disabled = false;
      }
    });

    $('#users-table').addEventListener('change', async (event) => {
      const role = event.target.closest('[data-user-role]');
      const active = event.target.closest('[data-user-active]');
      try {
        if (role) await updateUser(role.dataset.userRole, { role: role.value });
        if (active) await updateUser(active.dataset.userActive, { active: active.checked });
        setStatus('Usuario atualizado.', 'success');
        await loadUsers();
      } catch (error) {
        setStatus(error.message || 'Falha ao atualizar usuario.', 'error');
        await loadUsers();
      }
    });

    $('#users-table').addEventListener('click', async (event) => {
      const reset = event.target.closest('[data-reset]');
      const del = event.target.closest('[data-delete]');
      try {
        if (reset) {
          await invokeAdminUsers({ action: 'reset_password', email: reset.dataset.reset });
          setStatus('Email de redefinicao enviado.', 'success');
        }
        if (del) {
          if (!confirm('Deletar este usuario?')) return;
          await invokeAdminUsers({ action: 'delete', userId: del.dataset.delete });
          setStatus('Usuario deletado.', 'success');
          await loadUsers();
        }
      } catch (error) {
        setStatus(error.message || 'Acao administrativa falhou.', 'error');
      }
    });

    $('#create-user-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!window.CDEVAuth.isEnabled(state.settings, 'user_registration_enabled')) {
        setStatus('Criacao de usuarios esta desabilitada globalmente.', 'error');
        return;
      }
      const form = new FormData(event.currentTarget);
      const email = String(form.get('email') || '').trim();
      const password = String(form.get('password') || '');
      const role = String(form.get('role') || 'user');
      const active = form.get('active') === 'on';
      try {
        await invokeAdminUsers({ action: 'create', email, password, role, active });
        event.currentTarget.reset();
        event.currentTarget.elements.active.checked = true;
        setStatus('Usuario criado.', 'success');
        await loadUsers();
      } catch (error) {
        setStatus(error.message || 'Nao foi possivel criar usuario.', 'error');
      }
    });

    $('#property-grid').addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-toggle-edit]');
      if (!toggle) return;
      const form = $(`[data-edit-form="${toggle.dataset.toggleEdit}"]`);
      if (form) form.classList.toggle('open');
    });

    $('#property-grid').addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-edit-form]');
      if (!form) return;
      event.preventDefault();
      const id = form.dataset.editForm;
      const data = new FormData(form);
      try {
        const { error } = await state.ctx.supabase
          .from('property_spreadsheets')
          .update({
            cover_image_url: String(data.get('cover_image_url') || '').trim() || null,
            listing_url: String(data.get('listing_url') || '').trim() || null,
            address: String(data.get('address') || '').trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
        if (error) throw error;
        setStatus('Apartamento atualizado.', 'success');
        await loadSpreadsheets();
      } catch (error) {
        setStatus(error.message || 'Nao foi possivel atualizar o apartamento.', 'error');
      }
    });

    $('#create-spreadsheet-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const bundle = String(form.get('fixed_bundle') || '').split('/').map((item) => Number(item.trim().replace(',', '.')));
      const [fixedGas = 0, fixedElectricity = 0, fixedInternet = 0] = bundle;
      try {
        const { data, error } = await state.ctx.supabase.rpc('create_property_spreadsheet', {
          p_title: String(form.get('title') || '').trim(),
          p_property_name: String(form.get('property_name') || '').trim(),
          p_owner_user_id: String(form.get('owner_user_id') || ''),
          p_year: Number(form.get('year') || new Date().getFullYear()),
          p_commission_rate: Number(form.get('commission_percent') || 10) / 100,
          p_cleaning_fee_per_client: Number(form.get('cleaning_fee_per_client') || 380),
          p_fixed_gas: fixedGas,
          p_fixed_electricity: fixedElectricity,
          p_fixed_internet: fixedInternet,
          p_fixed_condo: Number(form.get('fixed_condo') || 0),
          p_cover_image_url: String(form.get('cover_image_url') || '').trim() || null,
          p_listing_url: String(form.get('listing_url') || '').trim() || null,
          p_address: String(form.get('address') || '').trim() || null
        });
        if (error) throw error;
        setStatus(`Planilha criada: ${data}`, 'success');
        event.currentTarget.reset();
        event.currentTarget.elements.year.value = '2026';
        event.currentTarget.elements.commission_percent.value = '10';
        event.currentTarget.elements.cleaning_fee_per_client.value = '380';
        event.currentTarget.elements.fixed_condo.value = '1536.30';
        event.currentTarget.elements.fixed_bundle.value = '70 / 265 / 123';
        renderOwnerOptions();
        await loadSpreadsheets();
      } catch (error) {
        setStatus(error.message || 'Nao foi possivel criar a planilha.', 'error');
      }
    });

    $$('[data-sign-out]').forEach((button) => button.addEventListener('click', window.CDEVAuth.signOut));
  };

  const init = async () => {
    state.ctx = await window.CDEVAuth.requireAccess({ admin: true });
    if (!state.ctx) return;
    $('#admin-email').textContent = state.ctx.profile.email || state.ctx.session.user.email;
    state.settings = state.ctx.settings;
    renderSettings();
    bindEvents();
    await loadUsers();
    await loadSpreadsheets();
    window.CDEVAuth.subscribeSettings((settings) => {
      state.settings = settings;
      renderSettings();
      renderStats();
      setStatus('Configuracoes sincronizadas em tempo real.', 'success');
    });
    state.ctx.supabase
      .channel('property-spreadsheets-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_spreadsheets' }, loadSpreadsheets)
      .subscribe();
    setStatus('Painel administrativo pronto.', 'success');
  };

  document.addEventListener('DOMContentLoaded', init);
})();
