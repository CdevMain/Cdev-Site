/* CDEV - Admin
 * Usuarios (criar com senha gerada, definir senha, enviar e-mail, desativar, excluir com protecao),
 * toggles com nomes claros (e confirmacao para o que pode trancar o proprio admin),
 * imoveis/planilhas (lucro do ano no cartao, editar tudo, transferir dono, arquivar, criar ano seguinte).
 */
(function () {
  const state = { ctx: null, settings: {}, users: [], spreadsheets: [], stats: new Map(), userQuery: '' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => window.CDEVIcons.svg(name, 'ico');
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const calc = window.CDEVSheetCalc;
  const currentYear = new Date().getFullYear();

  const SETTINGS = {
    dashboard_enabled: ['Planilhas (Dashboard)', 'Permite abrir a página de planilhas.'],
    spreadsheet_visible: ['Proprietários veem planilhas', 'Quando desligado, só administradores enxergam as planilhas.'],
    editing_enabled: ['Edição das planilhas', 'Quando desligado, as planilhas ficam somente leitura para todos.'],
    user_registration_enabled: ['Criação de usuários', 'Libera o formulário de novos usuários neste painel.'],
    control_center_enabled: ['Control Center', 'Clientes, sites, financeiro, monitoramento e CRM.'],
    admin_panel_enabled: ['Painel administrativo', 'Desligar bloqueia o Admin e o Control Center, inclusive para você.']
  };
  const LOCKOUT = new Set(['admin_panel_enabled']);

  // ---------------------------------------------------------------- UI basica
  const toast = (message, tone = 'success') => {
    const region = $('#toast-region');
    const el = document.createElement('div');
    el.className = `toast is-${tone}`;
    el.innerHTML = `${icon(tone === 'error' ? 'triangle-alert' : 'check')}<span>${esc(message)}</span>`;
    region.appendChild(el);
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 220); }, tone === 'error' ? 6000 : 3200);
    const live = $('#admin-feedback'); if (live) live.textContent = message;
  };

  // Dialogo (substitui confirm/alert): resolve com o valor do botao clicado ou null
  const dialog = ({ title, body = '', actions = [{ label: 'Fechar', value: null }], onOpen, wide = false }) => new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = `admin-dialog${wide ? ' wide' : ''}`;
    d.innerHTML = `<form method="dialog">
        <header><h2>${esc(title)}</h2><button class="icon-btn" value="__close" aria-label="Fechar">${icon('x')}</button></header>
        <div class="dlg-body">${body}</div>
        <footer>${actions.map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost'}" value="${i}" type="submit">${esc(a.label)}</button>`).join('')}</footer>
      </form>`;
    document.body.appendChild(d);
    const form = $('form', d);
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; d.close(); d.remove(); resolve(v); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = e.submitter?.value;
      if (v === '__close' || v === undefined) return finish(null);
      const a = actions[Number(v)];
      if (!a.handler) return finish(a.value);
      const btn = e.submitter; btn.classList.add('is-saving'); btn.disabled = true;
      try {
        const r = await a.handler($('.dlg-body', d));
        if (r !== false) finish(r === undefined ? a.value : r);
      } catch (err) {
        const box = $('.dlg-error', d) || Object.assign(document.createElement('p'), { className: 'dlg-error' });
        box.textContent = err.message || 'Algo deu errado.';
        $('.dlg-body', d).appendChild(box);
      } finally { btn.classList.remove('is-saving'); btn.disabled = false; }
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    d.showModal();
    if (onOpen) onOpen($('.dlg-body', d));
    const first = $('.dlg-body input:not([type=hidden]), .dlg-body select', d); if (first) first.focus();
  });
  const confirmDialog = (title, message, { okLabel = 'Confirmar', danger = false } = {}) =>
    dialog({ title, body: `<p class="dlg-text">${message}</p>`, actions: [{ label: 'Cancelar', value: false }, { label: okLabel, value: true, primary: !danger, danger }] });

  const formatRelative = (value) => {
    if (!value) return 'nunca';
    const diff = (Date.now() - new Date(value).getTime()) / 1000;
    if (diff < 90) return 'agora';
    if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.round(diff / 3600)} h`;
    if (diff < 86400 * 30) return `há ${Math.round(diff / 86400)} dias`;
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
  };

  const generatePassword = (len = 14) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%';
    const buf = new Uint32Array(len); crypto.getRandomValues(buf);
    return Array.from(buf, (n) => chars[n % chars.length]).join('');
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copiado.'); } catch (e) { toast('Não foi possível copiar.', 'error'); } };

  // ---------------------------------------------------------------- Edge Function
  const invokeAdminUsers = async (payload) => {
    const { data, error } = await state.ctx.supabase.functions.invoke('admin-users', { body: payload });
    if (!error) return data;
    let message = error.message || 'Falha na ação administrativa.';
    let code;
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        message = body.error || message; code = body.code;
      }
    } catch (e) { /* resposta sem JSON */ }
    if (/Failed to send a request|Failed to fetch|FunctionsFetchError/i.test(message)) {
      message = 'Não foi possível falar com a função "admin-users" do Supabase. Verifique se ela está publicada (Edge Functions).';
    }
    const err = new Error(message); err.code = code; throw err;
  };

  // ---------------------------------------------------------------- Estatisticas
  const renderStats = () => {
    $('#stat-users').textContent = state.users.length;
    $('#stat-active').textContent = state.users.filter((u) => u.active).length;
    $('#stat-sheets').textContent = state.spreadsheets.filter((s) => s.active).length;
    $('#stat-modules').textContent = `${Object.values(state.settings).filter((s) => s.enabled).length}/${Object.keys(state.settings).length}`;
  };

  // ---------------------------------------------------------------- Toggles
  const renderSettings = () => {
    const list = $('#settings-list');
    const keys = [...Object.keys(SETTINGS).filter((k) => state.settings[k]), ...Object.keys(state.settings).filter((k) => !SETTINGS[k])];
    list.innerHTML = keys.map((key) => {
      const s = state.settings[key];
      const [name, desc] = SETTINGS[key] || [key, s.description || 'Módulo do sistema.'];
      return `<article class="admin-toggle">
          <div>
            <div class="toggle-title">${esc(name)}${LOCKOUT.has(key) ? ' <span class="pill warn">cuidado</span>' : ''}</div>
            <p>${esc(desc)}</p>
            <span class="toggle-time">${esc(key)} · ${s.updated_at ? `alterado ${formatRelative(s.updated_at)}` : 'padrão'}</span>
          </div>
          <label class="switch" title="${s.enabled ? 'Ligado' : 'Desligado'}">
            <input type="checkbox" data-setting-key="${esc(key)}" ${s.enabled ? 'checked' : ''} aria-label="${esc(name)}">
            <span></span>
          </label>
        </article>`;
    }).join('');
  };

  // ---------------------------------------------------------------- Usuarios
  const sheetCount = (userId) => state.spreadsheets.filter((s) => s.owner_user_id === userId).length;
  const adminCount = () => state.users.filter((u) => u.role === 'admin' && u.active).length;

  const renderUsers = () => {
    const body = $('#users-table tbody');
    const me = state.ctx.profile.id;
    const q = state.userQuery.trim().toLowerCase();
    const rows = state.users.filter((u) => !q || (u.email || '').toLowerCase().includes(q));
    body.innerHTML = rows.map((u) => {
      const self = u.id === me;
      const n = sheetCount(u.id);
      return `<tr class="${u.active ? '' : 'is-inactive'}">
          <td><strong>${esc(u.email || u.id)}</strong>${self ? ' <span class="pill">você</span>' : ''}
            <span>${n ? `${n} planilha${n > 1 ? 's' : ''}` : 'sem planilhas'}${u.active ? '' : ' · desativado'}</span></td>
          <td><select data-user-role="${u.id}" ${self ? 'disabled title="Você não pode alterar o próprio perfil"' : ''} aria-label="Perfil">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>Proprietário</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select></td>
          <td><label class="mini-switch" title="${u.active ? 'Acesso liberado' : 'Acesso bloqueado'}"><input type="checkbox" data-user-active="${u.id}" ${u.active ? 'checked' : ''} ${self ? 'disabled' : ''} aria-label="Acesso"><span></span></label></td>
          <td class="nowrap">${formatRelative(u.last_login)}</td>
          <td><div class="row-actions">
            <button class="icon-btn" data-password="${u.id}" title="Senha">${icon('key-round')}</button>
            <button class="icon-btn danger" data-delete="${u.id}" title="Excluir" ${self ? 'disabled' : ''}>${icon('trash-2')}</button>
          </div></td>
        </tr>`;
    }).join('') || `<tr><td colspan="5" class="muted-cell">Nenhum usuário encontrado.</td></tr>`;
  };

  const passwordDialog = async (user) => {
    const pwd = generatePassword();
    const result = await dialog({
      title: `Senha de ${user.email}`,
      body: `<p class="dlg-text">Defina uma nova senha e envie ao usuário, ou mande um e-mail para ele mesmo criar a senha.</p>
        <label class="dlg-field"><span>Nova senha</span>
          <div class="input-row"><input class="field" name="password" type="text" minlength="8" value="${esc(pwd)}" autocomplete="new-password">
          <button class="icon-btn" type="button" data-gen title="Gerar outra">${icon('dices')}</button>
          <button class="icon-btn" type="button" data-copy title="Copiar">${icon('copy')}</button></div></label>`,
      actions: [
        { label: 'Enviar e-mail de redefinição', handler: async () => { await invokeAdminUsers({ action: 'reset_password', email: user.email, redirectTo: `${location.origin}/login` }); return 'email'; } },
        { label: 'Definir senha', primary: true, handler: async (b) => {
          const v = $('[name=password]', b).value;
          if (v.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
          await invokeAdminUsers({ action: 'set_password', userId: user.id, password: v });
          return { password: v };
        } }
      ],
      onOpen: (b) => {
        $('[data-gen]', b).onclick = () => { $('[name=password]', b).value = generatePassword(); };
        $('[data-copy]', b).onclick = () => copy($('[name=password]', b).value);
      }
    });
    if (result === 'email') toast(`E-mail de redefinição enviado para ${user.email}.`);
    if (result && result.password) { toast('Senha atualizada. Envie a nova senha ao usuário.'); copy(result.password); }
  };

  const deleteUser = async (user) => {
    const n = sheetCount(user.id);
    if (n) {
      const r = await dialog({
        title: 'Usuário com planilhas',
        body: `<p class="dlg-text"><strong>${esc(user.email)}</strong> é dono de ${n} planilha${n > 1 ? 's' : ''}. Excluir o usuário apagaria essas planilhas junto.<br><br>Transfira as planilhas para outro dono (botão Editar no imóvel) ou desative o acesso.</p>`,
        actions: [{ label: 'Cancelar', value: null }, { label: 'Desativar acesso', value: 'deactivate', primary: true }]
      });
      if (r === 'deactivate') await updateUser(user.id, { active: false }, 'Acesso desativado.');
      return;
    }
    const ok = await confirmDialog('Excluir usuário', `Excluir <strong>${esc(user.email)}</strong>? Esta ação não pode ser desfeita.`, { okLabel: 'Excluir', danger: true });
    if (!ok) return;
    try {
      await invokeAdminUsers({ action: 'delete', userId: user.id });
      toast('Usuário excluído.');
      await loadAll();
    } catch (e) { toast(e.message, 'error'); }
  };

  const updateUser = async (id, patch, message = 'Usuário atualizado.') => {
    const { error } = await state.ctx.supabase.from('users').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(error.message, 'error'); await loadUsers(); return false; }
    toast(message);
    await loadUsers();
    return true;
  };

  // ---------------------------------------------------------------- Imoveis / planilhas
  const renderOwnerOptions = (select, selected) => {
    const users = state.users.filter((u) => u.active || u.id === selected);
    select.innerHTML = users.map((u) => `<option value="${u.id}" ${u.id === selected ? 'selected' : ''}>${esc(u.email)}${u.role === 'admin' ? ' (admin)' : ''}</option>`).join('');
  };

  const renderProperties = () => {
    const grid = $('#property-grid');
    const empty = $('#property-grid-empty');
    const users = new Map(state.users.map((u) => [u.id, u]));
    const sheets = [...state.spreadsheets].sort((a, b) => (b.active - a.active) || (b.year - a.year) || a.property_name.localeCompare(b.property_name));
    empty.hidden = sheets.length > 0;
    grid.innerHTML = sheets.map((s) => {
      const t = state.stats.get(s.id);
      const owner = users.get(s.owner_user_id);
      const safeCover = /^https?:\/\//i.test(s.cover_image_url || '') ? s.cover_image_url : '';
      const safeListing = /^https?:\/\//i.test(s.listing_url || '') ? s.listing_url : '';
      return `<article class="property-card ${s.active ? '' : 'is-archived'}">
          <div class="property-cover">
            ${safeCover ? `<img src="${esc(safeCover)}" alt="${esc(s.property_name)}" loading="lazy">` : `<div class="no-image">${icon('home')}<span>Sem foto</span></div>`}
            <span class="property-badge ${s.active ? 'is-active' : ''}">${s.active ? 'Ativa' : 'Arquivada'}</span>
            <span class="property-year">${s.year}</span>
          </div>
          <div class="property-body">
            <div>
              <h3>${esc(s.property_name)}</h3>
              <div class="property-address">${esc(s.address || 'sem endereço')}</div>
            </div>
            <dl class="property-kpis">
              <div><dt>Lucro ${s.year}</dt><dd class="${t && t.net < 0 ? 'neg' : 'pos'}">${t ? money.format(t.net) : '—'}</dd></div>
              <div><dt>Noites</dt><dd>${t ? t.nights : '—'}</dd></div>
              <div><dt>Comissão</dt><dd>${(Number(s.commission_rate) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</dd></div>
            </dl>
            ${(() => { const p = state.pay && state.pay.get(s.id); if (!p) return '';
              return p.overdueCount ? `<a class="pay-line is-late" href="/dashboard?sheet=${s.id}&view=payments">${icon('triangle-alert')}<span>${p.overdueCount} ${p.overdueCount === 1 ? 'comissão atrasada' : 'comissões atrasadas'} · ${money.format(p.overdue)}</span></a>`
                : `<a class="pay-line" href="/dashboard?sheet=${s.id}&view=payments">${icon('check')}<span>Comissões em dia · recebido ${money.format(p.received)}</span></a>`; })()}
            <div class="property-owner">${icon('users-round')}<span>${esc(owner ? owner.email : 'dono não encontrado')}</span></div>
            <div class="property-actions">
              <a class="btn btn-primary" href="/dashboard?sheet=${s.id}">${icon('table-2')}Planilha</a>
              ${safeListing ? `<a class="btn btn-ghost" href="${esc(safeListing)}" target="_blank" rel="noopener" title="Abrir anúncio">${icon('external-link')}</a>` : ''}
              <button class="btn btn-ghost" data-edit-sheet="${s.id}" title="Editar">${icon('pencil')}</button>
              <button class="btn btn-ghost" data-next-year="${s.id}" title="Criar planilha de ${s.year + 1}">${icon('calendar-plus')}</button>
            </div>
          </div>
        </article>`;
    }).join('');
  };

  const editSheet = async (s) => {
    const result = await dialog({
      title: `Editar ${s.property_name} (${s.year})`, wide: true,
      body: `<div class="dlg-grid">
        <label class="dlg-field"><span>Nome do imóvel</span><input class="field" name="property_name" value="${esc(s.property_name)}" required></label>
        <label class="dlg-field"><span>Título da planilha</span><input class="field" name="title" value="${esc(s.title)}" required></label>
        <label class="dlg-field"><span>Dono (proprietário)</span><select name="owner_user_id"></select></label>
        <label class="dlg-field"><span>Ano</span><input class="field" name="year" type="number" min="2000" max="2100" value="${s.year}" required></label>
        <label class="dlg-field"><span>Comissão do coanfitrião (%)</span><input class="field" name="commission" type="number" min="0" max="100" step="0.01" value="${(Number(s.commission_rate) * 100).toFixed(2)}"></label>
        <label class="dlg-field"><span>Limpeza por reserva (R$)</span><input class="field" name="cleaning" type="number" min="0" step="0.01" value="${Number(s.cleaning_fee_per_client)}"></label>
        <label class="dlg-field"><span>Vencimento da comissão (dia do mês seguinte)</span><input class="field" name="due_day" type="number" min="1" max="28" step="1" value="${Number(s.commission_due_day || 10)}"></label>
        <label class="dlg-field full"><span>Foto de capa (URL)</span><input class="field" name="cover_image_url" type="url" value="${esc(s.cover_image_url || '')}" placeholder="https://..."></label>
        <label class="dlg-field full"><span>Link do anúncio</span><input class="field" name="listing_url" type="url" value="${esc(s.listing_url || '')}" placeholder="https://airbnb.com/rooms/..."></label>
        <label class="dlg-field full"><span>Endereço / bairro</span><input class="field" name="address" value="${esc(s.address || '')}"></label>
        <label class="dlg-check full"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Planilha ativa (desmarque para arquivar: some para o proprietário, continua aqui)</label>
      </div>`,
      actions: [
        { label: 'Excluir planilha', danger: true, value: 'delete' },
        { label: 'Cancelar', value: null },
        { label: 'Salvar', primary: true, handler: async (b) => {
          const v = (n) => $(`[name=${n}]`, b).value.trim();
          const patch = {
            property_name: v('property_name'), title: v('title'), owner_user_id: v('owner_user_id'),
            year: Number(v('year')), commission_rate: Number(v('commission')) / 100, cleaning_fee_per_client: Number(v('cleaning')),
            cover_image_url: v('cover_image_url') || null, listing_url: v('listing_url') || null, address: v('address') || null,
            ...(('commission_due_day' in s) ? { commission_due_day: Math.min(28, Math.max(1, Number(v('due_day')) || 10)) } : {}),
            active: $('[name=active]', b).checked, updated_at: new Date().toISOString()
          };
          if (!patch.property_name || !patch.title) throw new Error('Informe nome e título.');
          if (!(patch.year >= 2000 && patch.year <= 2100)) throw new Error('Ano inválido.');
          if (!(patch.commission_rate >= 0 && patch.commission_rate <= 1)) throw new Error('Comissão deve ficar entre 0 e 100%.');
          ['cover_image_url', 'listing_url'].forEach((k) => { if (patch[k] && !/^https?:\/\//i.test(patch[k])) throw new Error('Use links completos (https://...).'); });
          const { error } = await state.ctx.supabase.from('property_spreadsheets').update(patch).eq('id', s.id);
          if (error) throw error;
          return 'saved';
        } }
      ],
      onOpen: (b) => renderOwnerOptions($('[name=owner_user_id]', b), s.owner_user_id)
    });
    if (result === 'saved') { toast('Imóvel atualizado.'); await loadSpreadsheets(); }
    if (result === 'delete') {
      const ok = await confirmDialog('Excluir planilha', `Excluir a planilha <strong>${esc(s.title)}</strong> e os 12 meses de lançamentos? Prefira arquivar se quiser manter o histórico.`, { okLabel: 'Excluir definitivamente', danger: true });
      if (!ok) return;
      const { error } = await state.ctx.supabase.from('property_spreadsheets').delete().eq('id', s.id);
      if (error) return toast(error.message, 'error');
      toast('Planilha excluída.'); await loadSpreadsheets();
    }
  };

  const createNextYear = async (s) => {
    const year = s.year + 1;
    if (state.spreadsheets.some((x) => x.property_name === s.property_name && x.year === year && x.owner_user_id === s.owner_user_id)) {
      return toast(`Já existe planilha de ${year} para ${s.property_name}.`, 'error');
    }
    // despesas fixas do ultimo mes preenchido viram o padrao do novo ano
    const { data: months } = await state.ctx.supabase.from('property_spreadsheet_months')
      .select('month_num,fixed_gas,fixed_electricity,fixed_internet,fixed_condo').eq('spreadsheet_id', s.id).order('month_num', { ascending: false });
    const ref = (months || []).find((m) => Number(m.fixed_gas) + Number(m.fixed_electricity) + Number(m.fixed_internet) > 0) || (months || [])[0] || {};
    const ok = await confirmDialog(`Planilha de ${year}`, `Criar a planilha de <strong>${year}</strong> para <strong>${esc(s.property_name)}</strong>, com o mesmo dono, comissão e limpeza, e despesas fixas iniciais de gás ${money.format(ref.fixed_gas || 0)}, luz ${money.format(ref.fixed_electricity || 0)}, internet ${money.format(ref.fixed_internet || 0)} e condomínio ${money.format(ref.fixed_condo || 0)}?`, { okLabel: 'Criar planilha' });
    if (!ok) return;
    const { error } = await state.ctx.supabase.rpc('create_property_spreadsheet', {
      p_title: s.title.includes(String(s.year)) ? s.title.replace(String(s.year), String(year)) : `${s.title} ${year}`,
      p_property_name: s.property_name, p_owner_user_id: s.owner_user_id, p_year: year,
      p_commission_rate: Number(s.commission_rate), p_cleaning_fee_per_client: Number(s.cleaning_fee_per_client),
      p_fixed_gas: Number(ref.fixed_gas || 0), p_fixed_electricity: Number(ref.fixed_electricity || 0),
      p_fixed_internet: Number(ref.fixed_internet || 0), p_fixed_condo: Number(ref.fixed_condo || 0),
      p_cover_image_url: s.cover_image_url, p_listing_url: s.listing_url, p_address: s.address
    });
    if (error) return toast(error.message, 'error');
    toast(`Planilha de ${year} criada.`);
    await loadSpreadsheets();
  };

  // ---------------------------------------------------------------- Dados
  const loadSettings = async () => {
    state.settings = await window.CDEVAuth.getSettings({ force: true });
    renderSettings(); renderStats();
  };
  const loadUsers = async () => {
    const { data, error } = await state.ctx.supabase.from('users').select('id,email,role,active,last_login,updated_at').order('email', { ascending: true });
    if (error) throw error;
    state.users = data || [];
    renderUsers(); renderOwnerOptions($('#create-spreadsheet-form select[name="owner_user_id"]')); renderProperties(); renderStats();
  };
  const loadSpreadsheets = async () => {
    const { data, error } = await state.ctx.supabase.from('property_spreadsheets')
      .select('*');
    if (error) throw error;
    state.spreadsheets = data || [];
    state.pay = new Map();
    const ids = state.spreadsheets.map((s) => s.id);
    state.stats = new Map();
    if (ids.length) {
      const { data: months } = await state.ctx.supabase.from('property_spreadsheet_months').select('*').in('spreadsheet_id', ids);
      const bySheet = new Map();
      (months || []).forEach((m) => { if (!bySheet.has(m.spreadsheet_id)) bySheet.set(m.spreadsheet_id, []); bySheet.get(m.spreadsheet_id).push(m); });
      state.spreadsheets.forEach((s) => { state.stats.set(s.id, calc.totals(s, bySheet.get(s.id) || [])); if (calc.paymentTotals) state.pay.set(s.id, calc.paymentTotals(s, bySheet.get(s.id) || [])); });
    }
    $('#new-sheet').open = !state.spreadsheets.length;
    renderProperties(); renderUsers(); renderStats();
  };
  const loadAll = async () => { await loadUsers(); await loadSpreadsheets(); };

  const updateSetting = async (key, enabled) => {
    const { error } = await state.ctx.supabase.from('system_settings').update({ enabled, updated_at: new Date().toISOString() }).eq('key', key);
    if (error) throw error;
  };

  // ---------------------------------------------------------------- Eventos
  const bindEvents = () => {
    $('#settings-list').addEventListener('change', async (event) => {
      const input = event.target.closest('[data-setting-key]');
      if (!input) return;
      const key = input.dataset.settingKey;
      if (LOCKOUT.has(key) && !input.checked) {
        const ok = await confirmDialog('Desligar o painel administrativo?', 'Você perderá o acesso ao Admin e ao Control Center imediatamente. Para religar será preciso alterar <code>system_settings</code> direto no Supabase.', { okLabel: 'Desligar mesmo assim', danger: true });
        if (!ok) { input.checked = true; return; }
      }
      input.disabled = true;
      try {
        await updateSetting(key, input.checked);
        toast(`${(SETTINGS[key] || [key])[0]}: ${input.checked ? 'ligado' : 'desligado'}.`);
        await loadSettings();
      } catch (error) {
        input.checked = !input.checked;
        toast(error.message || 'Falha ao atualizar.', 'error');
      } finally { input.disabled = false; }
    });

    $('#user-search').addEventListener('input', (e) => { state.userQuery = e.target.value; renderUsers(); });

    $('#users-table').addEventListener('change', async (event) => {
      const role = event.target.closest('[data-user-role]');
      const active = event.target.closest('[data-user-active]');
      if (role) {
        const u = state.users.find((x) => x.id === role.dataset.userRole);
        if (u.role === 'admin' && role.value !== 'admin' && adminCount() <= 1) { role.value = 'admin'; return toast('Precisa existir pelo menos um administrador.', 'error'); }
        await updateUser(u.id, { role: role.value }, `${u.email} agora é ${role.value === 'admin' ? 'administrador' : 'proprietário'}.`);
      }
      if (active) {
        const u = state.users.find((x) => x.id === active.dataset.userActive);
        if (!active.checked && u.role === 'admin' && adminCount() <= 1) { active.checked = true; return toast('Não é possível desativar o último administrador.', 'error'); }
        await updateUser(u.id, { active: active.checked }, active.checked ? 'Acesso liberado.' : 'Acesso bloqueado.');
      }
    });

    $('#users-table').addEventListener('click', (event) => {
      const pwd = event.target.closest('[data-password]');
      const del = event.target.closest('[data-delete]');
      if (pwd) passwordDialog(state.users.find((u) => u.id === pwd.dataset.password));
      if (del) deleteUser(state.users.find((u) => u.id === del.dataset.delete));
    });

    const userForm = $('#create-user-form');
    $('[data-gen-password]', userForm).addEventListener('click', () => {
      const f = userForm.elements.password; f.value = generatePassword(); f.type = 'text';
    });
    userForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!window.CDEVAuth.isEnabled(state.settings, 'user_registration_enabled')) return toast('Criação de usuários está desligada nos toggles.', 'error');
      const email = userForm.elements.email.value.trim().toLowerCase();
      const password = userForm.elements.password.value;
      const role = userForm.elements.role.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('E-mail inválido.', 'error');
      if (password.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres (use "Gerar").', 'error');
      const btn = $('button[type=submit]', userForm); btn.classList.add('is-saving'); btn.disabled = true;
      try {
        await invokeAdminUsers({ action: 'create', email, password, role, active: userForm.elements.active.checked });
        userForm.reset(); userForm.elements.active.checked = true; userForm.elements.password.type = 'password';
        await loadUsers();
        await dialog({
          title: 'Usuário criado',
          body: `<p class="dlg-text">Envie estes dados de acesso para <strong>${esc(email)}</strong>. A senha não fica visível depois.</p>
            <div class="cred"><span>Endereço</span><code>${esc(location.origin)}/login</code><span>E-mail</span><code>${esc(email)}</code><span>Senha</span><code>${esc(password)}</code></div>`,
          actions: [{ label: 'Copiar tudo', handler: async () => { await copy(`Acesso: ${location.origin}/login\nE-mail: ${email}\nSenha: ${password}`); return false; } }, { label: 'Pronto', primary: true, value: true }]
        });
      } catch (error) {
        toast(error.message, 'error');
      } finally { btn.classList.remove('is-saving'); btn.disabled = false; }
    });

    $('#property-grid').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-sheet]');
      const next = event.target.closest('[data-next-year]');
      if (edit) editSheet(state.spreadsheets.find((s) => s.id === edit.dataset.editSheet));
      if (next) createNextYear(state.spreadsheets.find((s) => s.id === next.dataset.nextYear));
    });

    const sheetForm = $('#create-spreadsheet-form');
    sheetForm.elements.year.value = currentYear;
    sheetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = sheetForm.elements;
      const bundle = String(f.fixed_bundle.value || '').split('/').map((x) => Number(x.trim().replace(',', '.')));
      if (bundle.length !== 3 || bundle.some((n) => !Number.isFinite(n) || n < 0)) return toast('Gás / Luz / Internet: use o formato 70 / 265 / 123.', 'error');
      const [gas, luz, internet] = bundle;
      if (!f.owner_user_id.value) return toast('Escolha o dono do imóvel.', 'error');
      const btn = $('button[type=submit]', sheetForm); btn.classList.add('is-saving'); btn.disabled = true;
      try {
        const { error } = await state.ctx.supabase.rpc('create_property_spreadsheet', {
          p_title: f.title.value.trim(), p_property_name: f.property_name.value.trim(), p_owner_user_id: f.owner_user_id.value,
          p_year: Number(f.year.value || currentYear), p_commission_rate: Number(f.commission_percent.value || 10) / 100,
          p_cleaning_fee_per_client: Number(f.cleaning_fee_per_client.value || 0),
          p_fixed_gas: gas, p_fixed_electricity: luz, p_fixed_internet: internet, p_fixed_condo: Number(f.fixed_condo.value || 0),
          p_cover_image_url: f.cover_image_url.value.trim() || null, p_listing_url: f.listing_url.value.trim() || null, p_address: f.address.value.trim() || null
        });
        if (error) throw error;
        toast('Planilha criada com os 12 meses.');
        sheetForm.reset(); f.year.value = currentYear; f.commission_percent.value = '10'; f.cleaning_fee_per_client.value = '380'; f.fixed_condo.value = '1536.30'; f.fixed_bundle.value = '70 / 265 / 123';
        $('#new-sheet').open = false;
        await loadSpreadsheets();
      } catch (error) { toast(error.message || 'Não foi possível criar a planilha.', 'error'); }
      finally { btn.classList.remove('is-saving'); btn.disabled = false; }
    });
  };

  const init = async () => {
    state.ctx = await window.CDEVAuth.requireAccess({ admin: true });
    if (!state.ctx) return;
    $('#admin-email').textContent = state.ctx.profile.email || state.ctx.session.user.email;
    state.settings = state.ctx.settings;
    window.lucide.createIcons();
    renderSettings();
    bindEvents();
    try { await loadAll(); } catch (e) { toast(e.message || 'Falha ao carregar dados.', 'error'); }
    window.CDEVAuth.subscribeSettings((settings) => { state.settings = settings; renderSettings(); renderStats(); });
    state.ctx.supabase.channel('property-spreadsheets-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_spreadsheets' }, () => loadSpreadsheets())
      .subscribe();
  };

  document.addEventListener('DOMContentLoaded', init);
})();
