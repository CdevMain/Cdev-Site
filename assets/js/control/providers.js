/* CDEV Control Center - Providers
 * Toda integracao externa passa por aqui. O MVP usa somente implementacoes gratuitas/manuais.
 * Para adicionar uma integracao futura (ex.: API de registrador, WhatsApp oficial, storage S3),
 * crie um objeto com a mesma interface e registre com CC.providers.register(tipo, nome, impl, { default: true }).
 * Nada no restante do sistema chama APIs externas diretamente.
 */
(function () {
  const CC = window.CC;
  const registry = { lead: {}, message: {}, notification: {}, domain: {}, hosting: {}, storage: {} };
  const defaults = {};

  const providers = {
    register(type, name, impl, { default: isDefault = false } = {}) {
      if (!registry[type]) throw new Error(`Tipo de provider desconhecido: ${type}`);
      registry[type][name] = impl;
      if (isDefault || !defaults[type]) defaults[type] = name;
    },
    get(type, name) { return registry[type][name || defaults[type]]; },
    list(type) { return Object.keys(registry[type] || {}); }
  };

  // ---------------------------------------------------------------- LeadProvider
  // interface: { label, async fetch(input) -> [{ company, name, segment, city, phone, whatsapp, email, instagram, website, notes }] }
  providers.register('lead', 'manual', {
    label: 'Cadastro manual',
    async fetch(input) { return [input]; }
  }, { default: true });

  const CSV_ALIASES = {
    company: ['empresa', 'company', 'nome_fantasia', 'razao_social', 'estabelecimento'],
    name: ['nome', 'contato', 'name', 'responsavel'],
    segment: ['segmento', 'categoria', 'ramo', 'segment'],
    city: ['cidade', 'city', 'municipio'],
    phone: ['telefone', 'phone', 'fone', 'tel'],
    whatsapp: ['whatsapp', 'whats', 'celular', 'zap'],
    email: ['email', 'e_mail', 'mail'],
    instagram: ['instagram', 'insta', 'ig'],
    website: ['site', 'website', 'url'],
    notes: ['observacoes', 'obs', 'notas', 'notes'],
    document: ['cpf_cnpj', 'cnpj', 'cpf', 'documento'],
    address: ['endereco', 'address', 'logradouro']
  };
  const mapRecord = (rec) => {
    const out = {};
    Object.entries(CSV_ALIASES).forEach(([key, aliases]) => {
      const hit = aliases.find((a) => rec[a] !== undefined && rec[a] !== '');
      if (hit) out[key] = rec[hit];
    });
    return out;
  };
  providers.register('lead', 'csv', {
    label: 'Importação CSV',
    async fetch(text) { return CC.csv.parse(text).records.map(mapRecord); },
    mapRecord
  });
  // Futuro: providers.register('lead', 'google', { label: 'Google Places', async fetch(query) { ... } })
  // Deve respeitar termos de uso da plataforma: sem scraping agressivo, sem bypass de CAPTCHA/login.

  // ---------------------------------------------------------------- MessageProvider
  // interface: { label, channel, render(template, vars) -> text, async send({ to, text, subject }) -> { opened|sent } }
  const render = (tpl, vars) => String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
  providers.register('message', 'whatsapp_manual', {
    label: 'WhatsApp (abrir conversa)',
    channel: 'WHATSAPP',
    render,
    async send({ to, text }) {
      if (!CC.normalizePhone(to)) throw new Error('Número de WhatsApp ausente ou inválido.');
      const r = CC.openWhatsAppContact(to, text); // aba nomeada CDEV_WHATSAPP (reutilizada)
      if (!r.ok) throw new Error(r.reason === 'popup' ? 'Pop-up bloqueado: libere pop-ups para o CDEV.' : 'Número inválido.');
      return { opened: true, manual: true };
    }
  }, { default: true });
  providers.register('message', 'email_manual', {
    label: 'E-mail (abrir cliente de e-mail)',
    channel: 'EMAIL',
    render,
    async send({ to, subject, text }) {
      if (!to) throw new Error('E-mail ausente.');
      window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(text || '')}`;
      return { opened: true, manual: true };
    }
  });

  // ---------------------------------------------------------------- NotificationProvider
  // interface: { label, notify(notification) }
  // Interno: as notificacoes ja vivem na tabela public.notifications (geradas pelo banco/worker).
  // Este provider apenas mostra toast + notificacao do navegador (gratis) quando o painel esta aberto.
  providers.register('notification', 'internal', {
    label: 'Painel + navegador',
    notify(n) {
      CC.toast(`${n.title}${n.body ? ' — ' + n.body.split('\n')[0] : ''}`, n.severity === 'danger' ? 'error' : 'success');
      try {
        if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          new Notification(`CDEV · ${n.title}`, { body: n.body || '', tag: n.id });
        }
      } catch (e) { /* navegador sem suporte */ }
    }
  }, { default: true });
  // Canais externos gratuitos opcionais (ex.: Telegram) ficam no worker da VPS: ops/monitor/cdev-monitor.mjs

  // ---------------------------------------------------------------- DomainProvider / HostingProvider
  // interface: { label, openPanel(record), async sync(record) -> patch|null }
  providers.register('domain', 'manual', {
    label: 'Manual (link do painel)',
    openPanel(d) {
      const url = CC.safeUrl(d.panel_url) || (/\.br$/.test(d.domain || '') ? 'https://registro.br/painel/' : '');
      if (!url) throw new Error('Cadastre o link do painel do registrador.');
      window.open(url, '_blank', 'noopener');
    },
    async sync() { return null; } // futuro: consultar vencimento via API do registrador
  }, { default: true });
  providers.register('hosting', 'manual', {
    label: 'Manual (link do painel)',
    openPanel(h) {
      const url = CC.safeUrl(h.panel_url);
      if (!url) throw new Error('Cadastre o link do painel da hospedagem.');
      window.open(url, '_blank', 'noopener');
    },
    async sync() { return null; }
  }, { default: true });

  // ---------------------------------------------------------------- StorageProvider
  // interface: { label, async upload(file) -> url, resolve(url) -> url }
  // MVP: midias sao URLs (arquivos em /media na propria VPS, CDN gratuita ou link do cliente).
  providers.register('storage', 'url', {
    label: 'URL / arquivos na VPS',
    async upload() { throw new Error('Envie o arquivo para a pasta /media da VPS e cole a URL.'); },
    resolve(url) { return CC.safeUrl(url) || (String(url || '').startsWith('/') ? url : ''); }
  }, { default: true });

  CC.providers = providers;
})();
