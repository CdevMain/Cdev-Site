/* CDEV WhatsApp — armazenamento, valores padrão, normalização e migração.
 * Tudo fica em chrome.storage.local (com unlimitedStorage). */
(() => {
  const { util: U } = WAW;

  const KEYS = {
    config: "waw:config",
    contacts: "waw:contacts",
    history: "waw:history",
    stats: "waw:stats",
    recents: "waw:recents",
    timer: "waw:timer",
    diag: "waw:diag",
    alerts: "waw:alerts",
    quotes: "waw:quotes",
  };
  const LEGACY = { config: "wa-atalhos-config", statuses: "wa-atalhos-contact-statuses" };
  const INSTANCE = U.uid("inst");

  /* ------------------------------------------------------------------ */
  /* Padrões                                                            */
  /* ------------------------------------------------------------------ */
  const ACTIONS = {
    lists: { label: "Abrir menu de listas", params: [] },
    list: { label: "Abrir lista específica", params: ["listName"] },
    chat: { label: "Abrir conversa (telefone)", params: ["phone"] },
    contact: { label: "Abrir contato (busca por nome)", params: ["query"] },
    group: { label: "Abrir grupo (busca por nome)", params: ["query"] },
    url: { label: "Abrir link (reutiliza aba)", params: ["url"] },
    page: { label: "Abrir página em nova aba", params: ["url"] },
    crm: { label: "Abrir CRM", params: ["url"] },
    copy: { label: "Copiar texto", params: ["text"] },
    insert: { label: "Inserir mensagem", params: ["text"] },
    generate: { label: "Gerar mensagem", params: [] },
    panel: { label: "Abrir painel", params: ["panelTab"] },
    status: { label: "Alterar status do contato atual", params: ["statusId"] },
    note: { label: "Adicionar nota", params: [] },
    reminder: { label: "Criar lembrete", params: [] },
    palette: { label: "Abrir paleta de comandos", params: [] },
    mode: { label: "Trocar modo de trabalho", params: ["mode"] },
    follow: { label: "Seguir contato atual (online/mensagem)", params: [] },
    togglelist: { label: "Esconder/mostrar lista de conversas", params: [] },
    priority: { label: "Prioridade + fixar conversa atual", params: [] },
  };

  const PANEL_TABS = {
    dashboard: "Painel",
    contact: "Contato",
    followup: "Follow-up",
    contacts: "Contatos",
    messages: "Mensagens",
    tools: "Ferramentas",
  };

  const MODES = {
    admin: "Admin",
    normal: "Normal",
    focus: "Foco",
    prospect: "Prospecção",
    support: "Atendimento",
    billing: "Cobrança",
  };

  const STATUS_STYLES = {
    bar: "Barra lateral",
    border: "Borda",
    marker: "Pequeno marcador",
    dot: "Bolinha",
    bg: "Plano de fundo discreto",
  };

  const DEFAULT_STATUSES = [
    { id: "novo", label: "Novo", color: "#3b82f6", icon: "user" },
    { id: "primeiro-contato", label: "Primeiro contato", color: "#06b6d4", icon: "leads" },
    { id: "contato", label: "Em conversa", color: "#f59e0b", icon: "message" },
    { id: "interessado", label: "Interessado", color: "#10b981", icon: "star" },
    { id: "aguardando", label: "Aguardando resposta", color: "#a3a3a3", icon: "clock" },
    { id: "follow-up", label: "Follow-up", color: "#f97316", icon: "bell" },
    { id: "proposta", label: "Proposta enviada", color: "#8b5cf6", icon: "briefcase" },
    { id: "negociacao", label: "Negociação", color: "#eab308", icon: "dollar" },
    { id: "fechado", label: "Fechado", color: "#22c55e", icon: "check" },
    { id: "cliente", label: "Cliente", color: "#14b8a6", icon: "heart" },
    { id: "sem-interesse", label: "Sem interesse", color: "#ef4444", icon: "x" },
  ];

  const DEFAULT_TAGS = [
    { id: "lead", label: "Lead", color: "#3b82f6" },
    { id: "cliente", label: "Cliente", color: "#14b8a6" },
    { id: "indicacao", label: "Indicação", color: "#a855f7" },
    { id: "orcamento", label: "Orçamento", color: "#eab308" },
    { id: "urgente", label: "Urgente", color: "#ef4444" },
    { id: "retornar", label: "Retornar", color: "#f97316" },
  ];

  const DEFAULT_CATEGORIES = [
    "Saudação",
    "Prospecção",
    "Follow-up",
    "Orçamento",
    "Preço",
    "Cobrança",
    "Suporte",
    "Agradecimento",
    "Encerramento",
  ];

  const qm = (category, title, text) => ({ id: U.uid("msg"), category, title, text, favorite: false });
  const DEFAULT_MESSAGES = () => [
    qm("Saudação", "Bom dia", "{{saudacao}}, {{nome}}! Tudo bem?"),
    qm("Prospecção", "Primeiro contato", "{{saudacao}}, {{nome}}! Aqui é {{meunome}}. Vi o trabalho da {{empresa}} e tive uma ideia que pode ajudar a atrair mais clientes em {{cidade}}. Posso te mostrar em 2 minutos?"),
    qm("Follow-up", "Retomando contato", "Oi, {{nome}}! Passando para saber se você conseguiu ver o que te enviei. Ficou alguma dúvida?"),
    qm("Orçamento", "Envio de orçamento", "{{nome}}, segue o orçamento conforme conversamos. Qualquer ajuste é só me falar!"),
    qm("Preço", "Explicar valor", "O valor inclui tudo o que conversamos: desenvolvimento, publicação e suporte inicial. Posso detalhar cada item se preferir."),
    qm("Cobrança", "Lembrete", "Oi, {{nome}}! Tudo bem? Passando só para lembrar que o pagamento vence em breve. Qualquer dúvida estou à disposição."),
    qm("Cobrança", "Vencimento", "Olá, {{nome}}! Hoje é o dia do vencimento. Se já realizou o pagamento, pode desconsiderar esta mensagem. Obrigado!"),
    qm("Cobrança", "Vencido", "Oi, {{nome}}. Notei que o pagamento ainda está em aberto. Aconteceu alguma coisa? Posso te ajudar a regularizar?"),
    qm("Cobrança", "Segunda cobrança", "{{nome}}, estou retomando o assunto do pagamento em aberto. Consegue me dar uma previsão para hoje?"),
    qm("Cobrança", "Confirmação de pagamento", "Pagamento confirmado, {{nome}}! Muito obrigado. 🙌"),
    qm("Suporte", "Recebi seu chamado", "Oi, {{nome}}! Recebi sua mensagem e já estou verificando. Te retorno em instantes."),
    qm("Agradecimento", "Obrigado", "Muito obrigado, {{nome}}! Foi um prazer falar com você."),
    qm("Encerramento", "Encerrar atendimento", "Vou encerrar por aqui, {{nome}}. Se precisar de algo, é só chamar. Até mais!"),
  ];

  const DEFAULT_CATALOG = () => [
    { id: U.uid("cat"), name: "Site", description: "Site institucional responsivo", price: 1500, link: "" },
    { id: U.uid("cat"), name: "Landing Page", description: "Página de conversão", price: 900, link: "" },
    { id: U.uid("cat"), name: "Hospedagem", description: "Hospedagem mensal", price: 50, link: "" },
    { id: U.uid("cat"), name: "Domínio", description: "Registro anual", price: 40, link: "" },
    { id: U.uid("cat"), name: "Manutenção", description: "Manutenção mensal", price: 150, link: "" },
  ];

  const DEFAULT_CHECKLIST = () => [
    { id: "ck-necessidade", label: "Identificar necessidade" },
    { id: "ck-solucao", label: "Apresentar solução" },
    { id: "ck-proposta", label: "Enviar proposta" },
    { id: "ck-recebimento", label: "Confirmar recebimento" },
    { id: "ck-retorno", label: "Agendar retorno" },
  ];

  const makeButton = (overrides = {}) => ({
    id: U.uid("btn"),
    label: "Novo atalho",
    icon: "star",
    color: "",
    shortcut: "",
    action: "url",
    params: { url: "", listName: "", phone: "", query: "", text: "", statusId: "", panelTab: "dashboard", mode: "normal" },
    reuseExistingTab: true,
    groupId: "",
    active: true,
    favorite: false,
    ...overrides,
  });

  /* Integracao com o CRM CDEV (extensao <-> /control). statusOnSent "" = automatico. */
  const CDEV_STAGES = { LEAD: "Lead", CONTATADO: "Mensagem enviada", RESPONDEU: "Respondeu", DEMO_ENVIADA: "Demo enviada", NEGOCIACAO: "Negociação", CLIENTE: "Cliente", PERDIDO: "Perdido" };
  const CDEV_DEFAULT = () => ({
    enabled: true,
    statusOnSent: "",          // status do WhatsApp ao enviar a mensagem do CRM ("" = "Novo contato"/"Primeiro contato")
    statusOnReply: "contato",  // status do WhatsApp quando o lead responde
    statusFromCrm: true,       // etapa mudou no CRM -> muda o status/cor no WhatsApp
    statusToCrm: true,         // status mudou no WhatsApp -> muda a etapa no CRM (pelo mapa abaixo)
    notifyReply: true,         // resposta de lead: aviso fixo + som + notificação do Chrome
    trackManualSends: true,    // mensagem digitada direto no WhatsApp para um lead também conta como enviada
    scheduleEnabled: true,     // envia as mensagens agendadas (CRM ou WhatsApp) no horário
    missedWindowMin: 180,      // agendamento atrasado mais que isso (PC desligado) NÃO é enviado: vira "falhou"
    gapSec: 25,                // intervalo mínimo entre dois envios agendados
    // etapa do CRM -> status do WhatsApp
    fromCrm: { LEAD: "", CONTATADO: "", RESPONDEU: "contato", DEMO_ENVIADA: "proposta", NEGOCIACAO: "negociacao", CLIENTE: "cliente", PERDIDO: "sem-interesse" },
    // status do WhatsApp -> etapa do CRM ("" = não muda)
    toCrm: { contato: "RESPONDEU", interessado: "RESPONDEU", proposta: "DEMO_ENVIADA", negociacao: "NEGOCIACAO", "sem-interesse": "PERDIDO" },
  });
  const normalizeCdev = (raw) => {
    const base = CDEV_DEFAULT();
    const r = raw && typeof raw === "object" ? raw : {};
    const bool = (k) => (typeof r[k] === "boolean" ? r[k] : base[k]);
    const str = (k) => (typeof r[k] === "string" ? r[k] : base[k]);
    return {
      enabled: bool("enabled"), statusOnSent: str("statusOnSent"), statusOnReply: str("statusOnReply"), statusFromCrm: bool("statusFromCrm"),
      statusToCrm: bool("statusToCrm"), notifyReply: bool("notifyReply"), trackManualSends: bool("trackManualSends"),
      scheduleEnabled: bool("scheduleEnabled"),
      missedWindowMin: Math.max(5, Math.min(1440, Number(r.missedWindowMin) || base.missedWindowMin)),
      gapSec: Math.max(10, Math.min(600, Number(r.gapSec) || base.gapSec)),
      fromCrm: { ...base.fromCrm, ...(r.fromCrm && typeof r.fromCrm === "object" ? r.fromCrm : {}) },
      toCrm: r.toCrm && typeof r.toCrm === "object" ? { ...r.toCrm } : base.toCrm,
    };
  };

  const DEFAULT_CONFIG = () => ({
    schema: 2,
    buttons: [
      makeButton({ id: "btn1", label: "Listas", icon: "lists", action: "lists", shortcut: "Alt+1" }),
      makeButton({ id: "btn2", label: "Leads", icon: "leads", action: "url", shortcut: "Alt+2" }),
      makeButton({ id: "btn3", label: "Follow-up", icon: "bell", action: "panel", params: { ...makeButton().params, panelTab: "followup" }, shortcut: "Alt+3" }),
      makeButton({ id: "btn4", label: "Gerar mensagem", icon: "sparkles", action: "generate" }),
      makeButton({ id: "btn-follow", label: "Seguir", icon: "eye", action: "follow", shortcut: "Alt+S" }),
    ],
    seeded: ["follow"],
    groups: [],
    profiles: [ADMIN_PROFILE()],
    activeProfileId: "admin",
    statuses: U.clone(DEFAULT_STATUSES),
    tags: U.clone(DEFAULT_TAGS),
    categories: DEFAULT_CATEGORIES.slice(),
    quickMessages: DEFAULT_MESSAGES(),
    catalog: DEFAULT_CATALOG(),
    links: [],
    checklist: DEFAULT_CHECKLIST(),
    favorites: [],
    display: {
      statusStyle: "bar",
      showTags: true,
      showBadges: true,
      railPosition: "native",
      railSize: 40,
      railGap: 6,
      railX: 12,
      railY: 120,
      railOpacity: 0.92,
      panelWidth: 360,
      panelOpacity: 1,
      panelFloating: false,
      panelX: 0,
      panelY: 70,
      panelHeight: 640,
      listHidden: false,
      listPeek: true,
      listPeekWidth: 400,
    },
    shortcuts: {
      palette: "Ctrl+K",
      panel: "Alt+P",
      settings: "Alt+4",
      note: "Alt+N",
      reminder: "Alt+R",
      messages: "Alt+M",
      focus: "Alt+F",
      list: "Alt+L",
    },
    features: {
      reuseWhatsAppTab: true,
      dockPanel: true,
      pinnedBanner: true,
      notifications: true,
      trackMessages: true,
      diagnostic: false,
      debugLogs: false,
      sounds: true,
      soundToasts: true,
      soundVolume: 0.6,
      autoPinPriority: true,
      priorityBar: true,
    },
    me: { name: "", company: "" },
    mode: "admin",
    panel: { open: false, minimized: false, tab: "dashboard" },
    genDefaults: { objective: "primeiro-contato", tone: "amigavel", size: "media" },
    pdf: PDF_DEFAULT(),
    contract: CONTRACT_DEFAULT(),
    cdev: CDEV_DEFAULT(),
  });

  /* ------------------------------------------------------------------ */
  /* Modelo de orçamento em PDF                                         */
  /* ------------------------------------------------------------------ */
  const PDF_BLOCKS = {
    header: { label: "Cabeçalho (logo e empresa)", unique: true, icon: "home" },
    title: { label: "Título, número e datas", unique: true, icon: "hash" },
    client: { label: "Dados do cliente", unique: true, icon: "user" },
    intro: { label: "Texto de abertura", unique: true, icon: "message" },
    items: { label: "Tabela de itens", unique: true, icon: "lists" },
    totals: { label: "Totais", unique: true, icon: "dollar" },
    payment: { label: "Condições de pagamento", unique: true, icon: "briefcase" },
    terms: { label: "Observações e termos", unique: true, icon: "note" },
    signature: { label: "Assinaturas", unique: true, icon: "edit" },
    parties: { label: "Partes (contratante e contratada)", unique: true, icon: "contacts" },
    clauses: { label: "Cláusulas", unique: true, icon: "checklist" },
    witnesses: { label: "Testemunhas", unique: true, icon: "user" },
    footer: { label: "Rodapé (todas as páginas)", unique: true, icon: "minus" },
    text: { label: "Texto livre", unique: false, icon: "note" },
    divider: { label: "Linha divisória", unique: false, icon: "minus" },
    spacer: { label: "Espaço em branco", unique: false, icon: "chevronDown" },
  };

  const PDF_BLOCK_DEFAULTS = {
    header: { style: "classic" },
    title: { text: "PROPOSTA COMERCIAL", showValidity: true },
    client: { title: "CLIENTE" },
    intro: { text: "Prezado(a) {{nomecompleto}},\n\nAgradecemos o interesse. Conforme conversamos, apresentamos abaixo a proposta para os serviços solicitados." },
    items: { title: "ITENS DA PROPOSTA", showDescription: true, showQty: true, showUnit: true, zebra: true },
    totals: {},
    payment: { title: "CONDIÇÕES DE PAGAMENTO", text: "50% na aprovação e 50% na entrega, via Pix, boleto ou cartão." },
    terms: { title: "OBSERVAÇÕES", text: "Proposta válida até {{validade}}. Prazos contados a partir da aprovação e do envio do material necessário." },
    signature: { align: "center", clientAccept: true, dateLine: true, companyLabel: "", clientLabel: "" },
    parties: { title: "DAS PARTES" },
    clauses: { clauses: [] },
    witnesses: { title: "TESTEMUNHAS" },
    footer: { text: "{{minhaempresa}} · {{site}}", pageNumbers: true },
    text: { title: "TÍTULO", text: "Texto do bloco." },
    divider: {},
    spacer: { height: 8 },
  };

  const clause = (title, text) => ({ id: U.uid("cl"), title, text });
  const DEFAULT_CLAUSES = () => [
    clause("DO OBJETO", "O presente contrato tem por objeto a prestação, pela CONTRATADA, dos seguintes serviços à CONTRATANTE:\n{{itens}}"),
    clause("DO VALOR E DA FORMA DE PAGAMENTO", "Pelos serviços contratados, a CONTRATANTE pagará à CONTRATADA o valor total de {{total}} ({{totalextenso}}), da seguinte forma: 50% (cinquenta por cento) na assinatura deste contrato e 50% (cinquenta por cento) na entrega dos serviços, via Pix, boleto ou transferência bancária."),
    clause("DO PRAZO", "Os serviços serão executados em até 30 (trinta) dias corridos, contados a partir da assinatura deste contrato e do recebimento, pela CONTRATADA, de todas as informações e materiais necessários fornecidos pela CONTRATANTE."),
    clause("DAS OBRIGAÇÕES DA CONTRATADA", "A CONTRATADA se obriga a executar os serviços com qualidade técnica e dentro do prazo acordado, a manter a CONTRATANTE informada sobre o andamento e a guardar sigilo sobre as informações a que tiver acesso em razão deste contrato."),
    clause("DAS OBRIGAÇÕES DA CONTRATANTE", "A CONTRATANTE se obriga a fornecer as informações e os materiais necessários em tempo hábil, a aprovar as etapas do trabalho e a efetuar os pagamentos nas datas combinadas."),
    clause("DA RESCISÃO", "O presente contrato poderá ser rescindido por qualquer das partes mediante aviso prévio, por escrito, de 15 (quinze) dias. Em caso de rescisão, serão devidos os valores proporcionais aos serviços já executados."),
    clause("DO FORO", "Fica eleito o foro da comarca de {{cidade}} para dirimir quaisquer dúvidas oriundas do presente contrato, com renúncia de qualquer outro, por mais privilegiado que seja."),
  ];

  function CONTRACT_DEFAULT() {
    return {
      numberPrefix: "CT-",
      nextNumber: 1,
      numberPad: 4,
      markClosed: false,
      blocks: [
        makePdfBlock("header"),
        makePdfBlock("title", { text: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS", showValidity: false }),
        makePdfBlock("parties"),
        makePdfBlock("clauses", { clauses: DEFAULT_CLAUSES() }),
        makePdfBlock("text", { title: "", text: "E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença das testemunhas abaixo." }),
        makePdfBlock("signature", { companyLabel: "CONTRATADA", clientLabel: "CONTRATANTE" }),
        makePdfBlock("witnesses"),
        makePdfBlock("footer", { text: "{{numero}} · {{minhaempresa}}" }),
      ],
    };
  }

  function makePdfBlock(type, overrides = {}) {
    return { id: U.uid("blk"), type, on: true, ...U.clone(PDF_BLOCK_DEFAULTS[type] || {}), ...overrides };
  }

  function PDF_DEFAULT() {
    return {
      paper: "a4",
      margin: 16,
      font: "helvetica",
      primary: "#0f766e",
      text: "#1f2937",
      muted: "#6b7280",
      numberPrefix: "ORC-",
      nextNumber: 1,
      numberPad: 4,
      validityDays: 15,
      watermark: "",
      markProposal: true,
      company: { name: "", doc: "", address: "", phone: "", email: "", site: "" },
      logo: "",
      logoWidth: 34,
      signature: "",
      signerName: "",
      signerRole: "",
      signerDoc: "",
      blocks: ["header", "title", "client", "intro", "items", "totals", "payment", "terms", "signature", "footer"].map((t) => makePdfBlock(t)),
    };
  }

  function normalizeContract(raw) {
    const base = CONTRACT_DEFAULT();
    if (!raw || typeof raw !== "object") return base;
    const n = normalizePdf({ ...PDF_DEFAULT(), blocks: raw.blocks || base.blocks, numberPrefix: raw.numberPrefix ?? base.numberPrefix, nextNumber: raw.nextNumber, numberPad: raw.numberPad });
    n.blocks.forEach((b) => {
      if (b.type === "clauses") b.clauses = arr(b.clauses).map((c) => ({ id: str(c.id, 64) || U.uid("cl"), title: str(c.title, 120), text: str(c.text, 6000) }));
    });
    return { numberPrefix: n.numberPrefix, nextNumber: n.nextNumber, numberPad: n.numberPad, markClosed: Boolean(raw.markClosed), blocks: n.blocks };
  }

  function normalizePdf(raw) {
    const base = PDF_DEFAULT();
    if (!raw || typeof raw !== "object") return base;
    const img = (v) => (typeof v === "string" && /^data:image\/(png|jpe?g);base64,/.test(v) ? v : "");
    const blocks = [];
    const seen = new Set();
    for (const b of arr(raw.blocks)) {
      const meta = PDF_BLOCKS[b.type];
      if (!meta || (meta.unique && seen.has(b.type))) continue;
      seen.add(b.type);
      blocks.push({ ...PDF_BLOCK_DEFAULTS[b.type], ...b, id: str(b.id, 64) || U.uid("blk"), on: b.on !== false });
    }
    for (const [type, meta] of Object.entries(PDF_BLOCKS)) if (meta.unique && !seen.has(type)) blocks.push(makePdfBlock(type, { on: false }));
    return {
      ...base,
      ...raw,
      paper: ["a4", "letter"].includes(raw.paper) ? raw.paper : "a4",
      margin: Math.min(30, Math.max(8, Number(raw.margin) || 16)),
      font: ["helvetica", "times", "courier"].includes(raw.font) ? raw.font : "helvetica",
      primary: U.sanitizeHex(raw.primary, base.primary),
      text: U.sanitizeHex(raw.text, base.text),
      muted: U.sanitizeHex(raw.muted, base.muted),
      numberPrefix: str(raw.numberPrefix, 12),
      nextNumber: Math.max(1, Math.floor(Number(raw.nextNumber) || 1)),
      numberPad: Math.min(8, Math.max(1, Number(raw.numberPad) || 4)),
      validityDays: Math.min(365, Math.max(0, Number(raw.validityDays ?? 15))),
      watermark: str(raw.watermark, 30),
      markProposal: raw.markProposal !== false,
      company: { ...base.company, ...(raw.company || {}) },
      logo: img(raw.logo),
      logoWidth: Math.min(80, Math.max(10, Number(raw.logoWidth) || 34)),
      signature: img(raw.signature),
      blocks,
    };
  }

  /** Workspace "Admin": embutido, não pode ser removido, mostra tudo. */
  function ADMIN_PROFILE() {
    return { id: "admin", label: "Admin", buttonIds: [], mode: "admin", builtin: true };
  }

  const SHORTCUT_LABELS = {
    palette: "Paleta de comandos",
    panel: "Abrir/fechar painel",
    settings: "Configurações",
    note: "Nova nota no contato atual",
    reminder: "Novo lembrete no contato atual",
    messages: "Mensagens rápidas",
    focus: "Alternar modo Foco",
    list: "Esconder/mostrar lista de conversas",
  };

  /* ------------------------------------------------------------------ */
  /* Normalização                                                       */
  /* ------------------------------------------------------------------ */
  const str = (v, max = 200, fb = "") => (typeof v === "string" ? v.trim().slice(0, max) : fb);
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
  const uniqById = (list) => list.filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);

  function normalizeButton(raw, index) {
    const base = makeButton();
    const legacyAction = raw.action;
    const action = ACTIONS[legacyAction] ? legacyAction : "url";
    const params = { ...base.params, ...(raw.params && typeof raw.params === "object" ? raw.params : {}) };
    // Campos antigos (v1.x) ficavam na raiz.
    if (typeof raw.url === "string" && !params.url) params.url = raw.url.trim();
    if (typeof raw.listName === "string" && !params.listName) params.listName = raw.listName.trim();
    Object.keys(params).forEach((k) => (params[k] = str(params[k], k === "text" ? 4000 : 400)));
    return {
      id: str(raw.id, 80) || `btn-${index}-${Math.random().toString(36).slice(2, 6)}`,
      label: str(raw.label, 32) || `Atalho ${index + 1}`,
      icon: WAW.ICONS?.[raw.icon] ? raw.icon : "star",
      color: raw.color ? U.sanitizeHex(raw.color, "") : "",
      shortcut: U.normalizeShortcut(raw.shortcut),
      action,
      params,
      reuseExistingTab: typeof raw.reuseExistingTab === "boolean" ? raw.reuseExistingTab : true,
      groupId: str(raw.groupId, 80),
      active: raw.active !== false,
      favorite: Boolean(raw.favorite),
    };
  }

  function normalizeStatusLike(list, fallback, prefix) {
    const out = uniqById(
      arr(list).map((item, i) => ({
        id: str(item.id, 64) || `${prefix}-${i + 1}`,
        label: str(item.label, 32) || `${prefix} ${i + 1}`,
        color: U.sanitizeHex(item.color, "#64748b"),
        icon: WAW.ICONS?.[item.icon] ? item.icon : "",
      })),
    );
    return out.length || !fallback ? out : U.clone(fallback);
  }

  function normalizeConfig(raw) {
    const base = DEFAULT_CONFIG();
    if (!raw || typeof raw !== "object") return base;
    const buttons = arr(raw.buttons).map(normalizeButton);
    const groups = uniqById(
      arr(raw.groups).map((g, i) => ({ id: str(g.id, 64) || `grp-${i}`, label: str(g.label, 32) || `Grupo ${i + 1}`, collapsed: Boolean(g.collapsed) })),
    );
    const groupIds = new Set(groups.map((g) => g.id));
    buttons.forEach((b) => {
      if (b.groupId && !groupIds.has(b.groupId)) b.groupId = "";
    });
    const buttonIds = new Set(buttons.map((b) => b.id));
    const profiles = uniqById(
      arr(raw.profiles)
        .filter((p) => p.id !== "admin")
        .map((p, i) => ({
          id: str(p.id, 64) || `prf-${i}`,
          label: str(p.label, 32) || `Perfil ${i + 1}`,
          buttonIds: Array.isArray(p.buttonIds) ? p.buttonIds.filter((id) => buttonIds.has(id)) : [],
          mode: MODES[p.mode] ? p.mode : "normal",
        })),
    );
    profiles.unshift(ADMIN_PROFILE());
    const categories = Array.isArray(raw.categories)
      ? [...new Set(raw.categories.map((c) => str(c, 32)).filter(Boolean))]
      : base.categories;

    // Novidades da 2.1: adiciona o botão "Seguir" uma única vez em configs antigas.
    const seeded = Array.isArray(raw.seeded) ? raw.seeded.filter((x) => typeof x === "string") : [];
    if (buttons.length && !seeded.includes("follow")) {
      if (!buttons.some((b) => b.action === "follow")) buttons.push(normalizeButton(base.buttons.find((b) => b.action === "follow"), buttons.length));
      seeded.push("follow");
    }

    return {
      schema: 2,
      seeded,
      buttons: buttons.length ? buttons : base.buttons,
      groups,
      profiles,
      activeProfileId: profiles.some((p) => p.id === raw.activeProfileId) ? raw.activeProfileId : "admin",
      statuses: normalizeStatusLike(raw.statuses, DEFAULT_STATUSES, "status"),
      tags: normalizeStatusLike(raw.tags ?? DEFAULT_TAGS, null, "tag"),
      categories: categories.length ? categories : base.categories,
      quickMessages: Array.isArray(raw.quickMessages)
        ? uniqById(arr(raw.quickMessages).map((m) => ({
            id: str(m.id, 64) || U.uid("msg"),
            title: str(m.title, 60) || "Mensagem",
            category: str(m.category, 32) || "Geral",
            text: str(m.text, 4000),
            favorite: Boolean(m.favorite),
          })))
        : base.quickMessages,
      catalog: Array.isArray(raw.catalog)
        ? arr(raw.catalog).map((c) => ({
            id: str(c.id, 64) || U.uid("cat"),
            name: str(c.name, 60) || "Item",
            description: str(c.description, 300),
            price: U.parseMoney(c.price),
            link: str(c.link, 500),
          }))
        : base.catalog,
      links: arr(raw.links).map((l) => ({ id: str(l.id, 64) || U.uid("lnk"), label: str(l.label, 40) || "Link", url: str(l.url, 500), favorite: Boolean(l.favorite) })),
      checklist: Array.isArray(raw.checklist)
        ? arr(raw.checklist).map((c) => ({ id: str(c.id, 64) || U.uid("ck"), label: str(c.label, 80) || "Item" }))
        : base.checklist,
      favorites: arr(raw.favorites)
        .map((f) => ({ type: str(f.type, 16), ref: str(f.ref, 120), label: str(f.label, 60) }))
        .filter((f) => f.type && f.ref),
      display: {
        ...base.display,
        ...(raw.display || {}),
        statusStyle: STATUS_STYLES[raw.display?.statusStyle] ? raw.display.statusStyle : base.display.statusStyle,
        railPosition: ["native", "left", "right", "free"].includes(raw.display?.railPosition) ? raw.display.railPosition : "native",
        railOpacity: Math.min(1, Math.max(0.1, Number(raw.display?.railOpacity ?? base.display.railOpacity))),
        panelOpacity: Math.min(1, Math.max(0.4, Number(raw.display?.panelOpacity ?? 1))),
        railX: Number(raw.display?.railX ?? base.display.railX) || 0,
        railY: Number(raw.display?.railY ?? base.display.railY) || 0,
        panelX: Number(raw.display?.panelX) || 0,
        panelY: Number(raw.display?.panelY ?? 70) || 0,
        panelHeight: Math.min(1400, Math.max(320, Number(raw.display?.panelHeight) || 640)),
        panelFloating: Boolean(raw.display?.panelFloating),
        railSize: Math.min(56, Math.max(28, Number(raw.display?.railSize) || 40)),
        railGap: Math.min(20, Math.max(0, Number(raw.display?.railGap ?? 6))),
        panelWidth: Math.min(560, Math.max(300, Number(raw.display?.panelWidth) || 360)),
      },
      shortcuts: Object.fromEntries(
        Object.keys(base.shortcuts).map((k) => [
          k,
          raw.shortcuts && typeof raw.shortcuts[k] === "string" ? U.normalizeShortcut(raw.shortcuts[k]) : base.shortcuts[k],
        ]),
      ),
      features: {
        ...base.features,
        ...(raw.features || {}),
        soundVolume: Math.min(1, Math.max(0, Number(raw.features?.soundVolume ?? base.features.soundVolume))),
      },
      me: { name: str(raw.me?.name, 60), company: str(raw.me?.company, 60) },
      mode: MODES[raw.mode] ? raw.mode : "admin",
      panel: {
        open: Boolean(raw.panel?.open),
        minimized: Boolean(raw.panel?.minimized),
        tab: PANEL_TABS[raw.panel?.tab] ? raw.panel.tab : "dashboard",
      },
      genDefaults: { ...base.genDefaults, ...(raw.genDefaults || {}) },
      pdf: normalizePdf(raw.pdf),
      contract: normalizeContract(raw.contract),
      cdev: normalizeCdev(raw.cdev),
    };
  }

  /** Atalhos em conflito: retorna [{shortcut, owners:[...]}] */
  function findShortcutConflicts(config) {
    const map = new Map();
    const add = (sc, owner) => {
      const k = U.normalizeShortcut(sc);
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(owner);
    };
    Object.entries(config.shortcuts || {}).forEach(([k, v]) => add(v, SHORTCUT_LABELS[k] || k));
    (config.buttons || []).forEach((b) => b.active !== false && add(b.shortcut, `Botão “${b.label}”`));
    return [...map.entries()].filter(([, o]) => o.length > 1).map(([shortcut, owners]) => ({ shortcut, owners }));
  }

  /* ------------------------------------------------------------------ */
  /* Contatos                                                           */
  /* ------------------------------------------------------------------ */
  function makeContact(key, seed = {}) {
    const now = Date.now();
    return {
      key,
      jid: "",
      phone: "",
      name: "",
      aliases: [],
      company: "",
      city: "",
      segment: "",
      email: "",
      statusId: "",
      tags: [],
      priority: false,
      following: false,
      favorite: false,
      state: "active",
      notes: [],
      reminders: [],
      tasks: [],
      checklist: {},
      lastOpenedAt: 0,
      lastInboundAt: 0,
      lastOutboundAt: 0,
      timeSpentMs: 0,
      createdAt: now,
      updatedAt: now,
      ...seed,
    };
  }

  function normalizeContacts(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, c] of Object.entries(raw)) {
      if (!c || typeof c !== "object") continue;
      out[key] = makeContact(key, {
        ...c,
        key,
        aliases: Array.isArray(c.aliases) ? c.aliases.slice(0, 12) : [],
        tags: Array.isArray(c.tags) ? c.tags : [],
        notes: arr(c.notes),
        reminders: arr(c.reminders),
        tasks: arr(c.tasks),
        checklist: c.checklist && typeof c.checklist === "object" ? c.checklist : {},
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Estado em memória + persistência                                   */
  /* ------------------------------------------------------------------ */
  const state = {
    config: DEFAULT_CONFIG(),
    contacts: {},
    history: [],
    stats: {},
    recents: [],
    timer: null,
    diag: [],
    alerts: [],
    quotes: [],
  };

  const hasChrome = typeof chrome !== "undefined" && chrome.storage?.local;
  const getLocal = (keys) =>
    new Promise((resolve) => {
      if (!hasChrome) return resolve({});
      chrome.storage.local.get(keys, (r) => resolve(chrome.runtime.lastError ? {} : r || {}));
    });
  const setLocal = (obj) =>
    new Promise((resolve) => {
      if (!hasChrome) return resolve();
      chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) console.warn("[CDEV WhatsApp] storage", chrome.runtime.lastError.message);
        resolve();
      });
    });
  const getSync = (keys) =>
    new Promise((resolve) => {
      if (!chrome?.storage?.sync) return resolve({});
      chrome.storage.sync.get(keys, (r) => resolve(chrome.runtime.lastError ? {} : r || {}));
    });

  const wrap = (data) => ({ w: INSTANCE, t: Date.now(), data });
  const unwrap = (v) => (v && typeof v === "object" && "data" in v && "w" in v ? v.data : v);

  async function migrateLegacy() {
    const [syncData, localData] = await Promise.all([getSync(LEGACY.config), getLocal(LEGACY.statuses)]);
    const legacyConfig = syncData?.[LEGACY.config];
    const legacyStatuses = localData?.[LEGACY.statuses];
    const config = normalizeConfig(legacyConfig ? { ...legacyConfig, tags: DEFAULT_TAGS } : null);
    const contacts = {};
    if (legacyStatuses && typeof legacyStatuses === "object") {
      for (const [oldKey, statusId] of Object.entries(legacyStatuses)) {
        if (typeof statusId !== "string") continue;
        const key = `name:${U.norm(oldKey)}`;
        contacts[key] = makeContact(key, { name: oldKey, aliases: [U.norm(oldKey)], statusId, migrated: true });
      }
    }
    U.log("Migração v1 → v2", { buttons: config.buttons.length, contacts: Object.keys(contacts).length });
    return { config, contacts };
  }

  async function load() {
    const data = await getLocal(Object.values(KEYS));
    if (!data[KEYS.config]) {
      const migrated = await migrateLegacy();
      state.config = migrated.config;
      state.contacts = migrated.contacts;
      await setLocal({ [KEYS.config]: wrap(state.config), [KEYS.contacts]: wrap(state.contacts) });
    } else {
      state.config = normalizeConfig(unwrap(data[KEYS.config]));
      state.contacts = normalizeContacts(unwrap(data[KEYS.contacts]));
    }
    state.history = Array.isArray(unwrap(data[KEYS.history])) ? unwrap(data[KEYS.history]) : [];
    state.stats = unwrap(data[KEYS.stats]) || {};
    state.recents = Array.isArray(unwrap(data[KEYS.recents])) ? unwrap(data[KEYS.recents]) : [];
    state.timer = unwrap(data[KEYS.timer]) || null;
    state.diag = Array.isArray(unwrap(data[KEYS.diag])) ? unwrap(data[KEYS.diag]) : [];
    state.alerts = Array.isArray(unwrap(data[KEYS.alerts])) ? unwrap(data[KEYS.alerts]) : [];
    state.quotes = Array.isArray(unwrap(data[KEYS.quotes])) ? unwrap(data[KEYS.quotes]) : [];
    WAW.debug = Boolean(state.config.features.debugLogs);
    return state;
  }

  const pending = new Set();
  const flush = U.debounce(async () => {
    const payload = {};
    for (const name of pending) payload[KEYS[name]] = wrap(state[name]);
    pending.clear();
    await setLocal(payload);
  }, 250);

  function persist(name, immediate = false) {
    pending.add(name);
    if (immediate) {
      flush.cancel();
      const payload = {};
      for (const n of pending) payload[KEYS[n]] = wrap(state[n]);
      pending.clear();
      return setLocal(payload);
    }
    flush();
    return Promise.resolve();
  }

  async function setConfig(next) {
    state.config = normalizeConfig(next);
    WAW.debug = Boolean(state.config.features.debugLogs);
    await persist("config", true);
    WAW.emit("config", state.config);
  }

  /** Atualiza parte da config (ex.: estado do painel) sem re-normalizar tudo. */
  function patchConfig(mutator) {
    mutator(state.config);
    persist("config");
    WAW.emit("config", state.config);
  }

  function listenExternalChanges() {
    if (!hasChrome || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      for (const [name, key] of Object.entries(KEYS)) {
        const ch = changes[key];
        if (!ch) continue;
        const nv = ch.newValue;
        if (nv && nv.w === INSTANCE) continue; // eco da própria instância
        const data = unwrap(nv);
        if (name === "config") state.config = normalizeConfig(data);
        else if (name === "contacts") state.contacts = normalizeContacts(data);
        else state[name] = data ?? (name === "timer" ? null : Array.isArray(state[name]) ? [] : {});
        WAW.emit(name, state[name]);
        WAW.emit("external-change", name);
      }
    });
  }

  /* ---------- exportação/importação ---------- */
  const EXPORT_SECTIONS = {
    buttons: "Botões e grupos",
    statuses: "Status",
    tags: "Tags",
    messages: "Mensagens rápidas e categorias",
    profiles: "Perfis",
    catalog: "Catálogo",
    links: "Links rápidos",
    checklist: "Checklist",
    settings: "Aparência, atalhos e preferências",
    contacts: "Contatos (status, tags, notas, lembretes, tarefas)",
    history: "Histórico e contadores",
    pdf: "Modelos de orçamento e contrato PDF (layout, cláusulas, logo e assinatura)",
  };

  function exportData(sections = Object.keys(EXPORT_SECTIONS)) {
    const c = state.config;
    const out = { app: "wa-workspace", version: WAW.VERSION, exportedAt: new Date().toISOString(), sections: {} };
    const S = out.sections;
    if (sections.includes("buttons")) S.buttons = { buttons: c.buttons, groups: c.groups, favorites: c.favorites };
    if (sections.includes("statuses")) S.statuses = c.statuses;
    if (sections.includes("tags")) S.tags = c.tags;
    if (sections.includes("messages")) S.messages = { quickMessages: c.quickMessages, categories: c.categories };
    if (sections.includes("profiles")) S.profiles = { profiles: c.profiles, activeProfileId: c.activeProfileId };
    if (sections.includes("catalog")) S.catalog = c.catalog;
    if (sections.includes("links")) S.links = c.links;
    if (sections.includes("checklist")) S.checklist = c.checklist;
    if (sections.includes("settings")) S.settings = { display: c.display, shortcuts: c.shortcuts, features: c.features, me: c.me, genDefaults: c.genDefaults };
    if (sections.includes("contacts")) S.contacts = state.contacts;
    if (sections.includes("history")) S.history = { history: state.history, stats: state.stats };
    if (sections.includes("pdf")) S.pdf = { ...c.pdf, contract: c.contract };
    return out;
  }

  async function importData(payload, sections, { mergeContacts = true } = {}) {
    const S = payload?.sections;
    if (!S || typeof S !== "object") throw new Error("Arquivo inválido: não é um backup do CDEV WhatsApp.");
    const next = U.clone(state.config);
    const want = (k) => sections.includes(k) && S[k] != null;
    if (want("buttons")) Object.assign(next, { buttons: S.buttons.buttons, groups: S.buttons.groups, favorites: S.buttons.favorites || next.favorites });
    if (want("statuses")) next.statuses = S.statuses;
    if (want("tags")) next.tags = S.tags;
    if (want("messages")) Object.assign(next, S.messages);
    if (want("profiles")) Object.assign(next, S.profiles);
    if (want("catalog")) next.catalog = S.catalog;
    if (want("links")) next.links = S.links;
    if (want("checklist")) next.checklist = S.checklist;
    if (want("settings")) Object.assign(next, S.settings);
    if (want("pdf")) {
      const { contract, ...pdf } = S.pdf;
      next.pdf = pdf;
      if (contract) next.contract = contract;
    }
    await setConfig(next);
    if (want("contacts")) {
      const incoming = normalizeContacts(S.contacts);
      state.contacts = mergeContacts ? { ...state.contacts, ...incoming } : incoming;
      await persist("contacts", true);
      WAW.emit("contacts", state.contacts);
    }
    if (want("history")) {
      state.history = Array.isArray(S.history.history) ? S.history.history : [];
      state.stats = S.history.stats || {};
      await persist("history", true);
      await persist("stats", true);
    }
  }

  WAW.store = {
    KEYS,
    ACTIONS,
    PANEL_TABS,
    MODES,
    STATUS_STYLES,
    SHORTCUT_LABELS,
    EXPORT_SECTIONS,
    DEFAULT_CONFIG,
    DEFAULT_STATUSES,
    state,
    makeButton,
    PDF_BLOCKS,
    makePdfBlock,
    PDF_DEFAULT,
    CONTRACT_DEFAULT,
    makeContact,
    CDEV_STAGES,
    CDEV_DEFAULT,
    normalizeConfig,
    findShortcutConflicts,
    load,
    persist,
    setConfig,
    patchConfig,
    listenExternalChanges,
    exportData,
    importData,
    get config() {
      return state.config;
    },
    get contacts() {
      return state.contacts;
    },
  };
})();
