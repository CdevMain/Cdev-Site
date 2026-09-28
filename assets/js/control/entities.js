/* CDEV Control Center - entidades, formularios e acoes compartilhadas */
(function () {
  const CC = window.CC;
  const { esc, api, toast, formModal, confirmDialog, label, todayISO } = CC;

  // ---------------------------------------------------------------- Lookups (selects)
  const lookups = { clients: [], hostings: [], templates: [], projects: [], domains: [] };
  const SELECTS = {
    clients: ['clients', 'id,name,company,whatsapp,phone,email,status', 'name'],
    hostings: ['hostings', 'id,name,provider,client_id,status', 'name'],
    templates: ['templates', 'id,key,name,segment,active,sections,theme,content', 'name'],
    projects: ['projects', 'id,name,slug,client_id,status,site_url', 'name'],
    domains: ['domains', 'id,domain,client_id,project_id', 'domain']
  };
  CC.lookups = lookups;
  CC.loadLookups = async (names = Object.keys(SELECTS)) => {
    await Promise.all(names.map(async (n) => {
      const [table, select, order] = SELECTS[n];
      lookups[n] = await api.list(table, { select, order });
    }));
    return lookups;
  };
  const opts = (name, labelFn) => () => lookups[name].map((r) => [r.id, labelFn ? labelFn(r) : (r.name || r.domain)]);
  CC.nameOf = (name, id) => { const r = lookups[name].find((x) => x.id === id); return r ? (r.name || r.domain) : ''; };

  // ---------------------------------------------------------------- Definicoes de campos
  const F = {
    clients: [
      { name: 'name', label: 'Nome', required: true },
      { name: 'company', label: 'Empresa' },
      { name: 'document', label: 'CPF/CNPJ', validate: 'document', hint: 'Somente para cobrança/contrato.' },
      { name: 'status', label: 'Status', type: 'select', options: ['ATIVO', 'INATIVO'], required: true, default: 'ATIVO' },
      { name: 'phone', label: 'Telefone', type: 'tel', validate: 'phone' },
      { name: 'whatsapp', label: 'WhatsApp', type: 'tel', validate: 'phone' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'city', label: 'Cidade' },
      { name: 'address', label: 'Endereço', full: true },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true }
    ],
    hostings: [
      { name: 'name', label: 'Nome', required: true, placeholder: 'VPS #03' },
      { name: 'provider', label: 'Provedor', placeholder: 'Hostinger, Contabo, Vercel...' },
      { name: 'type', label: 'Tipo', type: 'select', required: true, default: 'VPS', options: ['VPS', 'SERVIDOR_PROPRIO', 'SHARED', 'CLOUD', 'VERCEL', 'NETLIFY', 'CLOUDFLARE_PAGES', 'OUTRO'] },
      { name: 'client_id', label: 'Cliente', type: 'select', options: opts('clients'), emptyLabel: 'Infraestrutura CDEV' },
      { name: 'panel_url', label: 'URL do painel', type: 'url', full: true, hint: 'O botão "Abrir painel" usa este link. Nunca guarde senhas aqui.' },
      { name: 'host', label: 'IP / hostname' },
      { name: 'status', label: 'Status', type: 'select', required: true, default: 'ATIVA', options: ['ATIVA', 'SUSPENSA', 'CANCELADA'] },
      { name: 'contracted_at', label: 'Contratação', type: 'date' },
      { name: 'expires_at', label: 'Vencimento', type: 'date' },
      { name: 'amount', label: 'Valor (R$)', type: 'money', default: 0 },
      { name: 'billing_cycle', label: 'Ciclo', type: 'select', required: true, default: 'MENSAL', options: ['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'NENHUMA'] },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true }
    ],
    domains: [
      { name: 'domain', label: 'Domínio', required: true, lower: true, validate: 'domain', placeholder: 'cliente.com.br' },
      { name: 'registrar', label: 'Registrador', placeholder: 'Registro.br' },
      { name: 'client_id', label: 'Cliente', type: 'select', options: opts('clients') },
      { name: 'project_id', label: 'Projeto / site', type: 'select', options: opts('projects') },
      { name: 'panel_url', label: 'Link do painel do registrador', type: 'url', full: true, hint: 'Ex.: https://registro.br/painel/ — sem senhas.' },
      { name: 'account_ref', label: 'Login / identificação', hint: 'Apenas identificador da conta (nunca senha).' },
      { name: 'status', label: 'Status', type: 'select', required: true, default: 'ATIVO', options: ['ATIVO', 'EXPIRADO', 'TRANSFERIDO', 'CANCELADO'] },
      { name: 'contracted_at', label: 'Contratação', type: 'date' },
      { name: 'expires_at', label: 'Vencimento', type: 'date' },
      { name: 'amount', label: 'Valor anual (R$)', type: 'money', default: 0 },
      { name: 'auto_renew', label: 'Renovação automática', type: 'checkbox' },
      { name: 'is_primary', label: 'Domínio principal do site', type: 'checkbox', default: true },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true }
    ],
    payments: [
      { name: 'client_id', label: 'Cliente', type: 'select', options: opts('clients') },
      { name: 'type', label: 'Tipo', type: 'select', required: true, default: 'HOSPEDAGEM', options: ['DOMINIO', 'HOSPEDAGEM', 'MANUTENCAO', 'DESENVOLVIMENTO', 'OUTROS'] },
      { name: 'description', label: 'Descrição', full: true },
      { name: 'amount', label: 'Valor (R$)', type: 'money', required: true },
      { name: 'due_date', label: 'Vencimento', type: 'date', required: true },
      { name: 'recurrence', label: 'Recorrência', type: 'select', required: true, default: 'NENHUMA', options: ['NENHUMA', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'], hint: 'Ao marcar como pago, a próxima cobrança é gerada automaticamente.' },
      { name: 'status', label: 'Status', type: 'select', required: true, default: 'PENDENTE', options: ['PENDENTE', 'ATRASADO', 'PAGO', 'CANCELADO'] },
      { name: 'project_id', label: 'Projeto', type: 'select', options: opts('projects') },
      { name: 'domain_id', label: 'Domínio vinculado', type: 'select', options: opts('domains'), hint: 'Pagar renova o vencimento do domínio.' },
      { name: 'hosting_id', label: 'Hospedagem vinculada', type: 'select', options: opts('hostings'), hint: 'Pagar renova o vencimento da hospedagem.' },
      { name: 'paid_at', label: 'Data do pagamento', type: 'date' },
      { name: 'method', label: 'Forma de pagamento', placeholder: 'Pix, boleto...' },
      { name: 'notes', label: 'Observação', type: 'textarea', full: true }
    ],
    backups: [
      { name: 'project_id', label: 'Projeto', type: 'select', required: true, options: opts('projects') },
      { name: 'status', label: 'Status', type: 'select', required: true, default: 'OK', options: ['OK', 'FALHOU', 'PENDENTE'] },
      { name: 'performed_at', label: 'Data/hora', type: 'datetime-local', required: true },
      { name: 'kind', label: 'Tipo', type: 'select', required: true, default: 'MANUAL', options: ['MANUAL', 'AUTOMATICO'] },
      { name: 'location', label: 'Local', full: true, placeholder: '/var/backups/cliente/2026-09-24.tar.gz' },
      { name: 'size_mb', label: 'Tamanho (MB)', type: 'number', min: 0 },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true }
    ],
    leads: [
      { name: 'company', label: 'Empresa', required: true },
      { name: 'name', label: 'Contato' },
      { name: 'segment', label: 'Segmento', placeholder: 'Barbearia, Restaurante...' },
      { name: 'city', label: 'Cidade' },
      { name: 'state', label: 'UF', placeholder: 'SP', validate: (v) => /^[A-Za-z]{2}$/.test(v) || 'Use a sigla (2 letras)' },
      { name: 'whatsapp', label: 'WhatsApp', type: 'tel', validate: 'phone' },
      { name: 'phone', label: 'Telefone', type: 'tel', validate: 'phone' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'instagram', label: 'Instagram', placeholder: '@empresa' },
      { name: 'website', label: 'Site atual' },
      { name: 'address', label: 'Endereço' },
      { name: 'cep', label: 'CEP', type: 'digits', placeholder: '00000-000' },
      { name: 'maps_url', label: 'Google Maps (link do perfil)', type: 'url', full: true },
      { name: 'google_rating', label: 'Nota no Google', type: 'number', min: 0, max: 5, step: 0.1 },
      { name: 'google_reviews', label: 'Avaliações no Google', type: 'number', min: 0 },
      { name: 'potential', label: 'Potencial de compra', type: 'select', options: [['5', '5 · muito alto'], ['4', '4 · alto'], ['3', '3 · médio'], ['2', '2 · baixo'], ['1', '1 · muito baixo']] },
      { name: 'sale_value', label: 'Valor da venda', type: 'money', hint: 'Preencha quando o lead virar cliente (entra no TOTAL DE VENDAS).' },
      { name: 'status', label: 'Status', type: 'select', required: true, default: 'LEAD', options: ['LEAD', 'CONTATADO', 'RESPONDEU', 'DEMO_ENVIADA', 'NEGOCIACAO', 'CLIENTE', 'PERDIDO'] },
      { name: 'source', label: 'Origem', type: 'select', required: true, default: 'MANUAL', options: ['MANUAL', 'CSV', 'WEB', 'GOOGLE', 'OUTRO'] },
      { name: 'next_action_at', label: 'Próximo follow-up', type: 'date' },
      { name: 'lost_reason', label: 'Motivo da perda', full: true },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true }
    ],
    message_templates: [
      { name: 'name', label: 'Nome', required: true },
      { name: 'channel', label: 'Canal', type: 'select', required: true, default: 'WHATSAPP', options: ['WHATSAPP', 'EMAIL'] },
      { name: 'subject', label: 'Assunto (e-mail)', full: true },
      { name: 'body', label: 'Mensagem', type: 'textarea', rows: 8, required: true, full: true, hint: 'Variáveis: {{nome}} {{empresa}} {{segmento}} {{cidade}} {{demo_url}}' },
      { name: 'active', label: 'Ativo', type: 'checkbox', default: true }
    ]
  };
  CC.fields = F;

  // ---------------------------------------------------------------- Score de lead (interno)
  const SCORE_FLAGS = [
    ['sem_site', 'Sem site'], ['instagram', 'Tem Instagram'], ['whatsapp', 'Tem WhatsApp'],
    ['presenca_publica', 'Presença pública (Google/avaliações)'], ['imagens_profissionais', 'Imagens profissionais'], ['relevancia_comercial', 'Relevância comercial']
  ];
  CC.SCORE_FLAGS = SCORE_FLAGS;
  CC.leadScore = (flags) => {
    const w = CC.setting('lead_score_weights', {});
    return SCORE_FLAGS.reduce((s, [k]) => s + (flags && flags[k] ? Number(w[k] || 0) : 0), 0);
  };
  CC.autoFlags = (l) => ({ sem_site: !l.website, instagram: !!l.instagram, whatsapp: !!l.whatsapp });

  // ---------------------------------------------------------------- Acoes CRUD
  const refresh = () => CC.router.render();
  const clean = (v) => { Object.keys(v).forEach((k) => { if (v[k] === undefined) delete v[k]; }); return v; };

  CC.actions = {
    async editClient(row = {}) {
      const saved = await formModal({
        title: row.id ? 'Editar cliente' : 'Novo cliente', fields: F.clients, values: row,
        onSubmit: async (v) => (row.id ? api.update('clients', row.id, v) : api.insert('clients', v))
      });
      if (saved) { toast(row.id ? 'Cliente atualizado.' : 'Cliente criado.'); if (!row.id) CC.router.go(`#/clientes/${saved.id}`); else refresh(); }
      return saved;
    },

    async editHosting(row = {}) {
      await CC.loadLookups(['clients']);
      const extra = row.id ? '' : `<label class="check" style="margin-top:1rem"><input type="checkbox" name="_recurring" checked> Criar cobrança recorrente com este valor e vencimento</label>`;
      const saved = await formModal({
        title: row.id ? 'Editar hospedagem' : 'Nova hospedagem', fields: F.hostings, values: row, extra,
        onSubmit: async (v, body) => {
          const rec = row.id ? await api.update('hostings', row.id, v) : await api.insert('hostings', v);
          if (!row.id && body.querySelector('[name=_recurring]')?.checked && v.expires_at && Number(v.amount) > 0 && v.billing_cycle !== 'NENHUMA') {
            await api.insert('payments', { client_id: v.client_id, hosting_id: rec.id, type: 'HOSPEDAGEM', description: `Hospedagem ${v.name}`, amount: v.amount, due_date: v.expires_at, recurrence: v.billing_cycle });
          }
          return rec;
        }
      });
      if (saved) { toast('Hospedagem salva.'); refresh(); }
      return saved;
    },

    async editDomain(row = {}) {
      await CC.loadLookups(['clients', 'projects']);
      const extra = row.id ? '' : `<label class="check" style="margin-top:1rem"><input type="checkbox" name="_recurring" checked> Criar cobrança anual de renovação no vencimento</label>`;
      const saved = await formModal({
        title: row.id ? 'Editar domínio' : 'Novo domínio', fields: F.domains, values: row, extra,
        onSubmit: async (v, body) => {
          if (!v.client_id && v.project_id) v.client_id = CC.lookups.projects.find((p) => p.id === v.project_id)?.client_id || null;
          const rec = row.id ? await api.update('domains', row.id, v) : await api.insert('domains', v);
          if (!row.id && body.querySelector('[name=_recurring]')?.checked && v.expires_at && Number(v.amount) > 0) {
            await api.insert('payments', { client_id: v.client_id, project_id: v.project_id, domain_id: rec.id, type: 'DOMINIO', description: `Domínio ${v.domain}`, amount: v.amount, due_date: v.expires_at, recurrence: 'ANUAL' });
          }
          // Projeto sem URL monitorada: usa o dominio principal
          if (v.project_id && v.is_primary) {
            const p = CC.lookups.projects.find((x) => x.id === v.project_id);
            if (p && !p.site_url) await api.update('projects', p.id, { site_url: `https://${v.domain}` });
          }
          return rec;
        }
      });
      if (saved) { toast('Domínio salvo.'); refresh(); }
      return saved;
    },

    async editPayment(row = {}, preset = {}) {
      await CC.loadLookups(['clients', 'projects', 'domains', 'hostings']);
      const values = { due_date: todayISO(), ...preset, ...row };
      const saved = await formModal({
        title: row.id ? 'Editar cobrança' : 'Nova cobrança', fields: F.payments, values,
        onSubmit: async (v) => {
          if (v.status === 'PAGO' && !v.paid_at) v.paid_at = todayISO();
          if (v.status !== 'PAGO') v.paid_at = null;
          if (!v.client_id) {
            v.client_id = CC.lookups.projects.find((p) => p.id === v.project_id)?.client_id
              || CC.lookups.domains.find((d) => d.id === v.domain_id)?.client_id
              || CC.lookups.hostings.find((h) => h.id === v.hosting_id)?.client_id || null;
          }
          if (!row.id && v.status === 'PAGO') {
            // cria pendente e usa o fluxo oficial de pagamento (gera recorrencia/renovacao)
            const created = await api.insert('payments', { ...clean({ ...v }), status: 'PENDENTE', paid_at: null });
            await api.rpc('cc_mark_payment_paid', { p_payment_id: created.id, p_paid_at: v.paid_at, p_method: v.method });
            return created;
          }
          if (row.id && row.status !== 'PAGO' && v.status === 'PAGO') {
            // pagamento via edicao tambem passa pelo fluxo oficial (recorrencia + renovacao)
            await api.update('payments', row.id, { ...v, status: row.status === 'CANCELADO' ? 'PENDENTE' : row.status, paid_at: null });
            await api.rpc('cc_mark_payment_paid', { p_payment_id: row.id, p_paid_at: v.paid_at, p_method: v.method });
            return row;
          }
          return row.id ? api.update('payments', row.id, v) : api.insert('payments', v);
        }
      });
      if (saved) { toast('Cobrança salva.'); refresh(); }
      return saved;
    },

    // Registrar pagamento: marca como pago e gera a proxima cobranca
    async payPayment(p) {
      const fields = [
        { name: 'paid_at', label: 'Data do pagamento', type: 'date', required: true, default: todayISO() },
        { name: 'amount', label: 'Valor recebido (R$)', type: 'money', required: true, default: p.amount },
        { name: 'method', label: 'Forma', placeholder: 'Pix, boleto, cartão...', full: true }
      ];
      const info = `<div class="notice info" style="margin-bottom:1rem"><strong>${esc(p.description || label(p.type))}</strong> · ${CC.money(p.amount)} · vencimento ${CC.fmtDate(p.due_date)}${p.recurrence !== 'NENHUMA' ? `<br><span class="small muted">Recorrência ${label(p.recurrence).toLowerCase()}: a próxima cobrança será criada automaticamente${p.domain_id || p.hosting_id ? ' e o vencimento do serviço será renovado' : ''}.</span>` : ''}</div>`;
      const res = await CC.modal({
        title: 'Registrar pagamento', body: info + CC.formHtml(fields, {}),
        actions: [{ label: 'Cancelar', value: null }, {
          label: 'Confirmar pagamento', primary: true,
          handler: async (body) => {
            const { values, ok } = CC.readForm(body, fields);
            if (!ok) return false;
            const next = await api.rpc('cc_mark_payment_paid', { p_payment_id: p.id, p_paid_at: values.paid_at, p_method: values.method, p_amount: values.amount });
            return { next };
          }
        }]
      });
      if (res) { toast(res.next ? 'Pagamento registrado. Próxima cobrança gerada.' : 'Pagamento registrado.'); refresh(); }
      return res;
    },

    async cancelPayment(p) {
      if (!(await confirmDialog('Cancelar esta cobrança? Alertas pendentes serão encerrados.', { okLabel: 'Cancelar cobrança', danger: true }))) return;
      await api.update('payments', p.id, { status: 'CANCELADO', paid_at: null });
      toast('Cobrança cancelada.'); refresh();
    },

    async editBackup(row = {}, preset = {}) {
      await CC.loadLookups(['projects']);
      const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const saved = await formModal({
        title: 'Registrar backup', fields: F.backups, values: { performed_at: now, ...preset, ...row },
        onSubmit: async (v) => { v.performed_at = new Date(v.performed_at).toISOString(); return row.id ? api.update('backups', row.id, v) : api.insert('backups', v); }
      });
      if (saved) { toast('Backup registrado.'); refresh(); }
    },

    async editLead(row = {}) {
      const flagsHtml = `<div class="full" style="margin-top:1rem"><span class="lbl">Score interno (organização)</span><div class="grid-3" style="gap:.4rem">${
        CC.SCORE_FLAGS.map(([k, t]) => `<label class="check"><input type="checkbox" name="flag_${k}" ${(row.score_flags || {})[k] ? 'checked' : ''}> ${esc(t)} <span class="muted">+${Number(CC.setting('lead_score_weights', {})[k] || 0)}</span></label>`).join('')
      }</div></div>`;
      const saved = await formModal({
        title: row.id ? 'Editar lead' : 'Novo lead', fields: F.leads, values: row, extra: flagsHtml,
        onSubmit: async (v, body) => {
          const flags = Object.fromEntries(CC.SCORE_FLAGS.map(([k]) => [k, !!body.querySelector(`[name=flag_${k}]`)?.checked]));
          if (!row.id) Object.assign(flags, Object.fromEntries(Object.entries(CC.autoFlags(v)).filter(([, x]) => x)));
          v.score_flags = flags; v.score = CC.leadScore(flags);
          const rec = row.id ? await api.update('leads', row.id, v) : await api.insert('leads', v);
          if (row.id && row.status !== v.status) await api.insert('lead_activities', { lead_id: rec.id, type: 'STATUS', content: `${label(row.status)} → ${label(v.status)}` });
          return rec;
        }
      });
      if (saved) { toast('Lead salvo.'); refresh(); }
      return saved;
    },

    async editMessageTemplate(row = {}) {
      const saved = await formModal({
        title: row.id ? 'Editar modelo' : 'Novo modelo de mensagem', fields: F.message_templates, values: row,
        onSubmit: async (v) => (row.id ? api.update('message_templates', row.id, v) : api.insert('message_templates', v))
      });
      if (saved) { toast('Modelo salvo.'); refresh(); }
    },

    // Novo projeto/site a partir de template (Site Factory)
    async newProject(preset = {}) {
      await CC.loadLookups(['clients', 'templates', 'hostings']);
      const tpls = CC.lookups.templates.filter((t) => t.active);
      const fields = [
        { name: 'template_id', label: 'Template', type: 'select', required: true, options: () => tpls.map((t) => [t.id, `${t.name} · ${t.segment}`]) },
        { name: 'name', label: 'Nome do site / empresa', required: true },
        { name: 'slug', label: 'Slug', required: true, validate: 'slug', lower: true, hint: `Demo: https://<slug>.${CC.setting('demo_base_domain', 'sites.cdev.com.br')}` },
        { name: 'status', label: 'Status inicial', type: 'select', required: true, default: 'DEMO', options: ['RASCUNHO', 'DEMO', 'PUBLICADO'] },
        { name: 'client_id', label: 'Cliente', type: 'select', options: () => CC.lookups.clients.map((c) => [c.id, c.name]), emptyLabel: 'Sem cliente (demo)' },
        { name: 'hosting_id', label: 'Hospedagem', type: 'select', options: () => CC.lookups.hostings.map((h) => [h.id, h.name]) },
        { name: 'whatsapp', label: 'WhatsApp do negócio', type: 'tel', validate: 'phone' },
        { name: 'city', label: 'Cidade' }
      ];
      const saved = await CC.modal({
        title: 'Novo site (Site Factory)', body: CC.formHtml(fields, preset),
        onOpen: (body) => {
          const n = body.querySelector('[name=name]'); const s = body.querySelector('[name=slug]');
          let touched = !!preset.slug;
          s.addEventListener('input', () => { touched = true; });
          n.addEventListener('input', () => { if (!touched) s.value = CC.slugify(n.value); });
        },
        actions: [{ label: 'Cancelar', value: null }, {
          label: 'Criar site', primary: true,
          handler: async (body) => {
            const { values: v, ok } = CC.readForm(body, fields);
            if (!ok) return false;
            const tpl = tpls.find((t) => t.id === v.template_id);
            const content = CC.siteContentFrom(tpl, { name: v.name, whatsapp: v.whatsapp, city: v.city, ...preset.contentPatch });
            const demoUrl = CC.demoUrl(v.slug);
            const project = await api.insert('projects', {
              name: v.name, slug: v.slug, status: v.status, client_id: v.client_id, hosting_id: v.hosting_id,
              template_id: tpl.id, theme: tpl.theme, content, site_url: v.status === 'PUBLICADO' ? null : demoUrl
            });
            return project;
          }
        }]
      });
      if (saved) { toast('Site criado a partir do template.'); if (preset.onCreated) await preset.onCreated(saved); else CC.router.go(`#/projetos/${saved.id}`); }
      return saved;
    },

    async openDomainPanel(d) { try { CC.providers.get('domain').openPanel(d); } catch (e) { toast(e.message, 'error'); } },
    async openHostingPanel(h) { try { CC.providers.get('hosting').openPanel(h); } catch (e) { toast(e.message, 'error'); } },

    async remove(table, row, what) {
      if (!(await confirmDialog(`Excluir ${what}? Esta ação não pode ser desfeita.`, { okLabel: 'Excluir', danger: true }))) return false;
      await api.remove(table, row.id);
      toast('Excluído.'); refresh();
      return true;
    }
  };

  // ---------------------------------------------------------------- Site Factory helpers
  CC.demoUrl = (slug) => `https://${slug}.${CC.setting('demo_base_domain', 'sites.cdev.com.br')}`;
  CC.previewUrl = (slug) => `/site?slug=${encodeURIComponent(slug)}`;
  CC.siteContentFrom = (tpl, { name, whatsapp, city, phone, email, instagram } = {}) => {
    const c = JSON.parse(JSON.stringify(tpl.content || {}));
    c.brand = c.brand || {}; c.contact = c.contact || {}; c.seo = c.seo || {};
    const oldName = c.brand.name;
    if (name) {
      c.brand.name = name;
      c.seo.title = `${name} | ${tpl.segment}`;
      // troca o nome ficticio do template nos textos
      if (oldName) c.sections = JSON.parse(JSON.stringify(c.sections || []).split(oldName).join(name));
    }
    if (whatsapp) c.contact.whatsapp = CC.waNumber(whatsapp);
    if (phone || whatsapp) c.contact.phone = phone || whatsapp;
    if (city) c.contact.city = city;
    if (email) c.contact.email = email;
    if (instagram) c.contact.instagram = instagram;
    return c;
  };
})();
