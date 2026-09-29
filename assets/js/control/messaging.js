/* CDEV Control Center - Motor de mensagens de prospeccao
 *
 * TUDO que define o comportamento das mensagens esta na secao CONFIG deste arquivo:
 *   nichos, variaveis, estrategias, regras automaticas, tons, tamanhos, CTAs e blocos.
 * Para um novo nicho: adicione em NICHES. Para uma nova variavel: adicione em VARIABLES
 * (ou crie a coluna no lead: qualquer {{coluna}} existente no lead ja funciona sem mudar o motor).
 *
 * Regra de ouro: o motor so usa dados que existem no lead. Se um dado falta, o trecho que
 * depende dele simplesmente nao entra (menos personalizacao, nunca informacao inventada).
 * Nao ha IA paga: a "geracao" e composicao por blocos com variacoes de frase (custo zero).
 */
(function () {
  const CC = window.CC;

  // =====================================================================================
  // CONFIG
  // =====================================================================================
  const NICHES = {
    academia: {
      label: 'Academias', profiles: ['academias'], match: /academ|fitness|crossfit|muscula|treino|pilates|funcional|box\b|gym/i,
      benefit: ['apresentar a estrutura, as modalidades e os horários da academia', 'mostrar planos, modalidades e localização, com o WhatsApp a um clique'],
      notes: 'Não inventar número de alunos, resultados ou estrutura.'
    },
    advocacia: {
      label: 'Advocacia', profiles: ['advogados'], match: /advoca|advogad|jur[ií]dic/i,
      benefit: ['organizar as áreas de atuação e os canais de contato do escritório de forma clara', 'apresentar o escritório de forma sóbria, com informações e contato em um só lugar'],
      notes: 'Sem promessa de resultado jurídico. Não inventar especialidades (Provimento 205/2021 da OAB).'
    },
    energia_solar: {
      label: 'Energia Solar', profiles: ['energia-solar'], match: /solar|fotovolt/i,
      benefit: ['apresentar os serviços, as regiões atendidas e facilitar pedidos de orçamento', 'mostrar como a empresa trabalha e deixar o pedido de orçamento a um clique'],
      notes: 'Não inventar projetos, clientes, resultados ou economia.'
    }
  };

  const LEVELS = [['AUTO', 'Automático'], ['BASICO', 'Básico'], ['MEDIO', 'Médio'], ['AVANCADO', 'Avançado']];
  const LEVEL_RANK = { BASICO: 1, MEDIO: 2, AVANCADO: 3 };

  const TONES = [['NATURAL', 'Natural'], ['PROFISSIONAL', 'Profissional'], ['CASUAL', 'Casual'], ['DIRETO', 'Direto'], ['CONSULTIVO', 'Consultivo']];
  // as 2 versoes extras usam tons diferentes do escolhido
  const ALT_TONES = { NATURAL: ['DIRETO', 'CONSULTIVO'], PROFISSIONAL: ['DIRETO', 'CONSULTIVO'], CASUAL: ['DIRETO', 'CONSULTIVO'], DIRETO: ['NATURAL', 'CONSULTIVO'], CONSULTIVO: ['NATURAL', 'DIRETO'] };
  const SIZES = [['CURTA', 'Curta'], ['MEDIA', 'Média'], ['DETALHADA', 'Detalhada']];

  const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const lowerFirst = (s) => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const SOCIAL_RE = /(instagram\.com|facebook\.com|fb\.com|fb\.me|linktr\.ee|linktree|beacons\.ai|bio\.link|taplink|linkbio|wa\.me|whatsapp|tiktok\.com|youtube\.com|ifood\.com|google\.com\/maps|goo\.gl|business\.site|g\.page)/i;
  const ownSite = (l) => { const w = clean(l.website); return w && !SOCIAL_RE.test(w) ? w : ''; };
  const igHandle = (l) => clean(l.instagram).replace(/^@|https?:\/\/(www\.)?instagram\.com\//gi, '').replace(/[/?].*$/, '');

  // Primeiro nome; mantem o titulo ("Dra. Ana", "Dr. Paulo")
  const firstName = (full) => {
    const parts = clean(full).split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (/^(dr|dra|sr|sra|prof|profa)\.?$/i.test(parts[0]) && parts[1]) return `${parts[0].replace(/\.?$/, '.')} ${parts[1]}`;
    return parts[0];
  };
  // group: basico | medio | avancado | sistema (sistema = sempre disponivel, calculado pelo motor)
  // optional: pode faltar; o trecho e ajustado (ex.: "Ola, {{nome}}!" vira "Ola!")
  const VARIABLES = {
    nome: { label: 'Nome do contato', group: 'basico', optional: true, get: (l) => firstName(l.name) },
    empresa: { label: 'Empresa', group: 'basico', get: (l) => clean(l.company) },
    segmento: { label: 'Segmento', group: 'basico', get: (l, c) => lowerFirst(clean(l.segment) || (c.niche ? NICHES[c.niche].label : '')) },
    cidade: { label: 'Cidade', group: 'basico', get: (l) => clean(l.city) },
    estado: { label: 'UF', group: 'basico', get: (l) => clean(l.state) },
    bairro: { label: 'Bairro', group: 'basico', get: (l) => clean(l.neighborhood) },
    telefone: { label: 'Telefone', group: 'basico', get: (l) => (CC.fmtPhone ? CC.fmtPhone(l.whatsapp || l.phone || '') : clean(l.whatsapp || l.phone)) },
    site_atual: { label: 'Site atual', group: 'medio', get: (l) => ownSite(l).replace(/^https?:\/\//, '').replace(/\/$/, '') },
    site_url: { label: 'URL do site', group: 'medio', get: (l) => { const s = ownSite(l); return s ? (/^https?:/i.test(s) ? s : `https://${s}`) : ''; } },
    tem_site: { label: 'Tem site? (sim/não)', group: 'medio', get: (l) => (ownSite(l) ? 'sim' : 'não') },
    instagram: { label: 'Instagram (@)', group: 'medio', get: (l) => (igHandle(l) ? `@${igHandle(l)}` : '') },
    instagram_url: { label: 'Link do Instagram', group: 'medio', get: (l) => (igHandle(l) ? `https://instagram.com/${igHandle(l)}` : '') },
    tem_instagram: { label: 'Tem Instagram? (sim/não)', group: 'medio', get: (l) => (igHandle(l) ? 'sim' : 'não') },
    google_maps_url: { label: 'Link do Google Maps', group: 'medio', get: (l) => clean(l.maps_url) },
    tem_google: { label: 'Está no Google? (sim/não)', group: 'medio', get: (l) => (l.maps_url || l.google_rating != null ? 'sim' : 'não') },
    avaliacao_google: { label: 'Nota no Google', group: 'medio', get: (l) => (l.google_rating != null && l.google_rating !== '' ? String(l.google_rating).replace('.', ',') : '') },
    quantidade_avaliacoes: { label: 'Nº de avaliações', group: 'medio', get: (l) => (Number(l.google_reviews) > 0 ? Number(l.google_reviews).toLocaleString('pt-BR') : '') },
    demo_url: { label: 'Link da demo', group: 'medio', get: (l, c) => c.demoUrl || '' },
    especialidade: { label: 'Especialidade', group: 'avancado', get: (l) => clean(l.specialty) },
    servico_principal: { label: 'Serviço principal', group: 'avancado', get: (l) => clean(l.main_service) },
    diferencial: { label: 'Diferencial', group: 'avancado', get: (l) => clean(l.differential) },
    gancho: { label: 'Gancho', group: 'avancado', get: (l) => clean(l.hook) },
    observacao: { label: 'Observação', group: 'avancado', get: (l) => clean(l.message_notes) },
    problema_detectado: { label: 'Problema detectado', group: 'avancado', get: (l) => clean(l.detected_problem) },
    oportunidade: { label: 'Oportunidade', group: 'avancado', get: (l) => clean(l.opportunity_note) },
    motivo_contato: { label: 'Motivo do contato', group: 'avancado', get: (l, c) => clean(l.contact_reason) || derivedReason(l, c) },
    cta: { label: 'Chamada para ação (automática)', group: 'sistema', get: (l, c) => c.cta || '' }
  };
  const VAR_ORDER = ['nome', 'empresa', 'segmento', 'cidade', 'estado', 'bairro', 'telefone', 'demo_url', 'cta', 'gancho', 'problema_detectado', 'oportunidade', 'motivo_contato',
    'especialidade', 'servico_principal', 'diferencial', 'observacao', 'site_atual', 'site_url', 'tem_site', 'instagram', 'instagram_url', 'tem_instagram',
    'google_maps_url', 'tem_google', 'avaliacao_google', 'quantidade_avaliacoes'];

  // Motivo do contato derivado SOMENTE de fatos do lead (usado quando o campo nao foi preenchido)
  function derivedReason(l) {
    if (ownSite(l)) return '';
    if (igHandle(l)) return `Vi que a ${clean(l.company)} se apresenta pelo Instagram, mas ainda não tem um site próprio.`;
    return `Vi que a ${clean(l.company)} ainda não tem um site próprio.`;
  }

  // Estrategias: nome, descricao, nichos compativeis ('*' = todos), prioridade e requisitos
  const STRATEGIES = {
    MODERNIZACAO: { name: 'Modernização', description: 'Já tem site e você anotou um problema nele.', niches: '*', priority: 10, requires: ['site_atual', 'problema_detectado'] },
    OPORTUNIDADE: { name: 'Oportunidade', description: 'Usa a oportunidade/gancho que você anotou no lead.', niches: '*', priority: 20, requiresAny: ['oportunidade', 'gancho'] },
    DEMONSTRACAO: { name: 'Demonstração', description: 'Leva o link da demo pronta.', niches: '*', priority: 30, requires: ['demo_url'] },
    INSTAGRAM: { name: 'Instagram', description: 'Se apresenta pelo Instagram, sem site próprio.', niches: '*', priority: 40, requires: ['instagram'], when: (v) => v.tem_site === 'não' },
    SEM_SITE: { name: 'Sem site', description: 'Ainda não tem site próprio.', niches: '*', priority: 50, when: (v) => v.tem_site === 'não' },
    GOOGLE: { name: 'Google', description: 'Cita a nota e as avaliações do Google.', niches: '*', priority: 60, requires: ['avaliacao_google', 'quantidade_avaliacoes'] },
    PRESENCA_ONLINE: { name: 'Presença online', description: 'Fortalecer a presença online de quem já tem algum canal.', niches: '*', priority: 70 },
    CURIOSIDADE: { name: 'Curiosidade', description: 'Abre com uma pergunta curta.', niches: '*', priority: 80 },
    GENERICA: { name: 'Genérica', description: 'Apresentação simples, serve para qualquer lead.', niches: '*', priority: 90 }
  };
  // Regras da escolha automatica (em ordem; a primeira que casar vence)
  const AUTO_RULES = [
    { strategy: 'MODERNIZACAO', why: 'tem site e há um problema anotado', when: (v) => v.site_atual && v.problema_detectado },
    { strategy: 'OPORTUNIDADE', why: 'há gancho/oportunidade anotados', when: (v) => v.oportunidade || (v.gancho && v.problema_detectado) },
    { strategy: 'DEMONSTRACAO', why: 'o lead já tem uma demo', when: (v) => v.demo_url },
    { strategy: 'INSTAGRAM', why: 'sem site e com Instagram', when: (v) => v.tem_site === 'não' && v.instagram },
    { strategy: 'SEM_SITE', why: 'sem site próprio', when: (v) => v.tem_site === 'não' },
    { strategy: 'GOOGLE', why: 'boa presença no Google', when: (v) => v.avaliacao_google && Number(String(v.quantidade_avaliacoes).replace(/\D/g, '')) >= 20 },
    { strategy: 'PRESENCA_ONLINE', why: 'já tem algum canal online', when: (v) => v.site_atual || v.instagram },
    { strategy: 'GENERICA', why: 'poucos dados disponíveis', when: () => true }
  ];

  // Banco de CTAs (o motor evita repetir o ultimo usado com o lead)
  const CTAS = {
    demo: ['Quer dar uma olhada?', 'O que achou da ideia?', 'Posso te mostrar a estrutura que preparei?', 'Dá uma olhada e me diz o que achou?', 'Faz sentido para vocês?'],
    noDemo: ['Posso te mostrar?', 'Faz sentido para vocês?', 'Posso te explicar rapidamente?', 'Quer que eu te mostre como funcionaria?', 'Posso te mandar uma ideia de como ficaria?'],
    DIRETO: ['Posso te mostrar?', 'Quer ver?', 'Te mando?'],
    CONSULTIVO: ['Faz sentido para vocês?', 'Posso te explicar rapidamente como funcionaria?', 'Quer que eu te mostre como funcionaria na prática?']
  };

  // =====================================================================================
  // MOTOR
  // =====================================================================================
  const detectNiche = (lead) => {
    const byProfile = Object.entries(NICHES).find(([, n]) => (n.profiles || []).includes(lead.profile_key));
    if (byProfile) return byProfile[0];
    const text = [lead.segment, lead.main_activity, lead.company].map(clean).join(' ');
    const hit = Object.entries(NICHES).find(([, n]) => n.match.test(text));
    return hit ? hit[0] : null;
  };

  // Valores de todas as variaveis para o lead (variavel desconhecida -> coluna do lead com o mesmo nome)
  const buildVars = (lead, ctx = {}) => {
    const c = { niche: ctx.niche ?? detectNiche(lead), demoUrl: ctx.demoUrl || '', cta: ctx.cta || '' };
    const v = {};
    Object.entries(VARIABLES).forEach(([k, def]) => { v[k] = clean(def.get(lead, c)); });
    return v;
  };
  const resolveVar = (key, vars, lead) => (key in vars ? vars[key] : clean(lead?.[key]));

  const autoLevel = (v) => {
    if (['gancho', 'problema_detectado', 'oportunidade', 'especialidade', 'servico_principal', 'diferencial', 'observacao'].some((k) => v[k])) return 'AVANCADO';
    if (v.site_atual || v.instagram || v.avaliacao_google || v.demo_url) return 'MEDIO';
    return 'BASICO';
  };
  // Aplica o nivel: variaveis acima do nivel ficam vazias para o motor (nao entram na mensagem)
  const levelVars = (v, level) => {
    const rank = LEVEL_RANK[level] || 3;
    const out = { ...v };
    Object.entries(VARIABLES).forEach(([k, def]) => {
      const need = def.group === 'avancado' ? 3 : def.group === 'medio' ? 2 : 1;
      if (def.group !== 'sistema' && need > rank && !['tem_site', 'tem_instagram', 'tem_google'].includes(k)) out[k] = '';
    });
    return out;
  };

  const strategyFits = (key, v) => {
    const s = STRATEGIES[key]; if (!s) return false;
    if (s.requires && s.requires.some((k) => !v[k])) return false;
    if (s.requiresAny && !s.requiresAny.some((k) => v[k])) return false;
    if (s.when && !s.when(v)) return false;
    return true;
  };
  const autoStrategy = (v) => {
    const rule = AUTO_RULES.find((r) => r.when(v) && strategyFits(r.strategy, v)) || AUTO_RULES[AUTO_RULES.length - 1];
    const extra = rule.strategy === 'INSTAGRAM' ? ' (+ sem site)' : '';
    return { strategy: rule.strategy, why: rule.why, label: `${STRATEGIES[rule.strategy].name}${extra}` };
  };

  // --- placeholders
  const VAR_RE = /\{\{\s*([\w]+)\s*\}\}/g;
  const usedVars = (text) => [...new Set([...String(text || '').matchAll(VAR_RE)].map((m) => m[1]))];
  const unknownVars = (text, lead) => usedVars(text).filter((k) => !(k in VARIABLES) && !(lead && k in lead));
  const missingVars = (text, vars, lead) => usedVars(text).filter((k) => !(VARIABLES[k]?.optional) && k !== 'cta' && !resolveVar(k, vars, lead));
  const leftoverPlaceholders = (text) => usedVars(text);

  const tidy = (text) => String(text)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1').replace(/,\s*([!?.])/g, '$1').replace(/([^.])\.\.(?!\.)/g, '$1.').trim();

  // Renderiza um template. Variavel opcional vazia remove o trecho de forma natural.
  const renderTemplate = (body, vars, lead) => {
    let t = String(body || '');
    if (!vars.nome) t = t.replace(/,\s*\{\{\s*nome\s*\}\}/g, '').replace(/\{\{\s*nome\s*\}\},?\s*/g, '');
    const missing = missingVars(t, vars, lead);
    const unknown = unknownVars(t, lead);
    // linha que so tem uma variavel vazia some inteira (ex.: {{gancho}} sozinho)
    const lines = t.split('\n').filter((line) => { const m = line.trim().match(/^\{\{\s*(\w+)\s*\}\}$/); return !m || resolveVar(m[1], vars, lead); });
    const text = tidy(lines.join('\n').replace(VAR_RE, (_, k) => resolveVar(k, vars, lead)));
    return { text, missing, unknown };
  };

  // --- aleatorio com semente (Regenerar muda a semente; mesmos dados, nova construcao)
  const rng = (seed) => { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  const timeGreeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  // Blocos da mensagem. Cada bloco usa SO variaveis com valor; sem dado, retorna vazio.
  const BLOCKS = {
    SAUDACAO: (v, t, r) => {
      const n = v.nome;
      const opts = {
        NATURAL: n ? [`Olá, ${n}! Tudo bem?`, `Oi, ${n}! Tudo bem?`] : ['Olá! Tudo bem?', 'Oi, tudo bem?'],
        PROFISSIONAL: n ? [`${timeGreeting()}, ${n}! Tudo bem?`, `Olá, ${n}, tudo bem?`] : [`${timeGreeting()}! Tudo bem?`, 'Olá, tudo bem?'],
        CASUAL: n ? [`Oi, ${n}! Tudo certo?`, `E aí, ${n}, tudo bem?`] : ['Oi! Tudo certo?', 'Oi, tudo bem?'],
        DIRETO: n ? [`Olá, ${n}.`, `Oi, ${n}!`] : ['Olá!', 'Oi!'],
        CONSULTIVO: n ? [`${timeGreeting()}, ${n}! Tudo bem?`, `Olá, ${n}, tudo bem?`] : [`${timeGreeting()}! Tudo bem?`, 'Olá, tudo bem?']
      };
      return pick(r, opts[t] || opts.NATURAL);
    },
    CONTEXTO: (v, t, r, s) => {
      const e = v.empresa; const where = v.cidade ? ` aqui de ${v.cidade}` : '';
      const seg = v.segmento ? ` e vi que vocês trabalham com ${v.segmento}` : '';
      if (s === 'GOOGLE' && v.avaliacao_google) return pick(r, [`Encontrei a ${e} no Google Maps, com nota ${v.avaliacao_google} em ${v.quantidade_avaliacoes} avaliações.`, `Vi a ${e} no Google Maps: nota ${v.avaliacao_google} em ${v.quantidade_avaliacoes} avaliações.`]);
      if (s === 'INSTAGRAM' && v.instagram) return pick(r, [`Vi o Instagram da ${e} (${v.instagram})${where ? `, aqui de ${v.cidade}` : ''}.`, `Encontrei a ${e}${where} pelo Instagram (${v.instagram}).`]);
      if (s === 'MODERNIZACAO' && v.site_atual) return pick(r, [`Dei uma olhada no site da ${e} (${v.site_atual}).`, `Visitei o site da ${e} (${v.site_atual}).`]);
      if (t === 'DIRETO') return pick(r, [`Sou da CDEV, trabalho com criação de sites, e encontrei a ${e}${where}.`, `Trabalho com criação de sites e encontrei a ${e}${where}.`]);
      if (v.segmento && v.cidade) return pick(r, [`Encontrei a ${e}${where}${seg}.`, `Estava pesquisando ${v.segmento} em ${v.cidade} e encontrei a ${e}.`]);
      return pick(r, [`Encontrei a ${e}${where}${seg}.`, `Encontrei a ${e}${where}.`]);
    },
    APRESENTACAO: (v, t, r) => (t === 'DIRETO' ? '' : pick(r, ['Eu trabalho com criação de sites para empresas.', 'Trabalho com criação de sites e presença online para empresas.'])),
    GANCHO: (v, t, r) => {
      if (v.gancho) return v.gancho;
      if (v.servico_principal) return pick(r, [`Vi que o forte de vocês é ${lowerFirst(v.servico_principal)}.`, `Vi que vocês trabalham com ${lowerFirst(v.servico_principal)}.`]);
      if (v.especialidade) return `Vi que vocês atuam com ${lowerFirst(v.especialidade)}.`;
      if (v.diferencial) return `Vi que um diferencial de vocês é ${lowerFirst(v.diferencial)}.`;
      return '';
    },
    PROBLEMA: (v, t, r, s) => {
      if (v.problema_detectado) return pick(r, [`Notei um ponto que pode melhorar na presença online: ${v.problema_detectado}`, `Anotei uma oportunidade de melhoria: ${v.problema_detectado}`]);
      if (s === 'INSTAGRAM' && v.tem_site === 'não') return pick(r, ['Vi que hoje vocês se apresentam pelo Instagram, mas ainda sem um site próprio.', 'Pelo que vi, vocês ainda não têm um site próprio além do Instagram.']);
      if ((s === 'SEM_SITE' || s === 'CURIOSIDADE') && v.tem_site === 'não') return pick(r, [`Vi que a ${v.empresa} ainda não tem um site próprio.`, 'Pelo que vi, vocês ainda não têm um site próprio.']);
      if (v.motivo_contato && s === 'GENERICA') return v.motivo_contato;
      return '';
    },
    OPORTUNIDADE: (v, t, r, s, ctx) => {
      if (v.oportunidade) return v.oportunidade;
      const benefit = ctx.niche ? pick(r, NICHES[ctx.niche].benefit) : 'apresentar os serviços e deixar o contato a um clique';
      if (s === 'GOOGLE') return pick(r, [`Quem encontra vocês pelo Google costuma procurar mais informações antes de chamar. Um site próprio ajuda a ${benefit}.`, `Um site próprio complementa o perfil do Google e ajuda a ${benefit}.`]);
      if (s === 'INSTAGRAM') return pick(r, [`Um site complementa o Instagram, reunindo tudo em um endereço só e ajudando a ${benefit}.`, `A ideia de um site é somar ao Instagram: ${benefit}.`]);
      if (s === 'MODERNIZACAO') return pick(r, [`Uma versão atualizada pode ${benefit}.`, `Com uma nova versão dá para ${benefit}.`]);
      return pick(r, [`Um site próprio ajuda a ${benefit}.`, `A ideia é ter um site que ajude a ${benefit}.`]);
    },
    DEMONSTRACAO: (v, t, r) => {
      if (!v.demo_url) return '';
      const e = v.empresa;
      const lead = {
        NATURAL: [`Preparei uma demonstração de como poderia ficar o site da ${e}:`, `Inclusive, montei uma demonstração de site para a ${e}:`],
        PROFISSIONAL: [`Preparei uma demonstração de como a ${e} poderia se apresentar na internet:`, `Elaborei uma demonstração de site para a ${e}:`],
        CASUAL: [`Montei uma prévia de como poderia ficar o site de vocês:`, `Fiz uma demonstração do site da ${e}, olha só:`],
        DIRETO: [`Fiz uma demonstração para a ${e}:`, `Demonstração do site da ${e}:`],
        CONSULTIVO: [`Para facilitar a conversa, preparei uma demonstração de como eu apresentaria a ${e}:`, `Montei uma demonstração para você visualizar como ficaria:`]
      };
      return `${pick(r, lead[t] || lead.NATURAL)}\n\n${v.demo_url}`;
    },
    OFERTA_DEMO: (v, t, r) => (v.demo_url ? '' : pick(r, ['Posso preparar uma demonstração sem compromisso para vocês verem como ficaria.', 'Se quiser, preparo uma demonstração sem compromisso.'])),
    PERGUNTA: (v, t, r) => (v.tem_site === 'não'
      ? pick(r, [`Vocês já pensaram em ter um site próprio para a ${v.empresa}?`, 'Já pensaram em ter um site próprio?'])
      : pick(r, ['Vocês estão satisfeitos com o site atual?', `Como está funcionando o site da ${v.empresa} para vocês?`])),
    CTA: (v) => v.cta,
    ENCERRAMENTO: (v, t, r) => ({ NATURAL: pick(r, ['Fico à disposição!', 'Qualquer coisa, estou por aqui.']), PROFISSIONAL: 'Fico à disposição para qualquer dúvida.', CASUAL: 'Abraço!', DIRETO: '', CONSULTIVO: 'Se fizer sentido, te explico sem compromisso.' }[t] || '')
  };

  // Estrutura (ordem dos blocos) por estrategia; o tamanho define quais entram
  const STRUCTURE = {
    GENERICA: ['SAUDACAO', 'CONTEXTO', 'APRESENTACAO', 'PROBLEMA', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    CURIOSIDADE: ['SAUDACAO', 'CONTEXTO', 'PROBLEMA', 'PERGUNTA', 'DEMONSTRACAO', 'ENCERRAMENTO'],
    DEMONSTRACAO: ['SAUDACAO', 'CONTEXTO', 'GANCHO', 'DEMONSTRACAO', 'OPORTUNIDADE', 'CTA', 'ENCERRAMENTO'],
    SEM_SITE: ['SAUDACAO', 'CONTEXTO', 'PROBLEMA', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    INSTAGRAM: ['SAUDACAO', 'CONTEXTO', 'PROBLEMA', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    GOOGLE: ['SAUDACAO', 'CONTEXTO', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    PRESENCA_ONLINE: ['SAUDACAO', 'CONTEXTO', 'APRESENTACAO', 'GANCHO', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    MODERNIZACAO: ['SAUDACAO', 'CONTEXTO', 'PROBLEMA', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    OPORTUNIDADE: ['SAUDACAO', 'CONTEXTO', 'GANCHO', 'PROBLEMA', 'OPORTUNIDADE', 'DEMONSTRACAO', 'CTA', 'ENCERRAMENTO']
  };
  const SIZE_DROP = {
    CURTA: ['APRESENTACAO', 'OPORTUNIDADE', 'OFERTA_DEMO', 'ENCERRAMENTO', 'GANCHO'],
    MEDIA: ['ENCERRAMENTO'],
    DETALHADA: []
  };

  const pickCta = (v, tone, r, avoid) => {
    const pool = [...(CTAS[tone] || []), ...(v.demo_url ? CTAS.demo : CTAS.noDemo)];
    const options = pool.filter((c) => c !== avoid);
    return pick(r, options.length ? options : pool);
  };

  // Compoe uma mensagem a partir dos blocos (sem template)
  const compose = ({ vars, strategy, tone, size, seed, niche, variant = 0 }) => {
    const r = rng(seed);
    let order = [...(STRUCTURE[strategy] || STRUCTURE.GENERICA)].filter((b) => !(SIZE_DROP[size] || []).includes(b));
    // variacao estrutural entre versoes: gancho antes do contexto, pergunta no lugar do CTA...
    if (variant === 1 && order.includes('GANCHO')) order = ['SAUDACAO', 'GANCHO', ...order.filter((b) => !['SAUDACAO', 'GANCHO'].includes(b))];
    if (variant === 2 && strategy !== 'CURIOSIDADE' && size !== 'CURTA' && !order.includes('APRESENTACAO') && tone !== 'DIRETO') order.splice(2, 0, 'APRESENTACAO');
    const parts = order.map((b) => BLOCKS[b](vars, tone, r, strategy, { niche })).filter(Boolean);
    // curta: contexto e problema na mesma frase
    let text = size === 'CURTA' && parts.length > 3 ? [parts[0], `${parts[1]} ${parts[2]}`, ...parts.slice(3)].join('\n\n') : parts.join('\n\n');
    text = text.replace(/\n\n(Olá|Oi)[^\n]*\n\n/, (m) => m);
    return tidy(text);
  };

  // Escolhe o melhor template para o lead (nicho > universal; tom e tamanho como desempate)
  const eligibleTemplates = (templates, { niche, strategy, tone, size, vars, lead }) => templates
    .filter((t) => t.active !== false && t.channel !== 'EMAIL' && t.strategy && (!strategy || t.strategy === strategy))
    .filter((t) => !t.niche || t.niche === niche)
    .filter((t) => !missingVars(t.body, vars, lead).length && !unknownVars(t.body, lead).length)
    .map((t) => ({ t, score: (t.niche && t.niche === niche ? 4 : 0) + (t.tone === tone ? 2 : 0) + (t.size === size ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);

  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  /**
   * Gera ate 3 versoes.
   * opts: { lead, templates, demoUrl, strategy ('AUTO'|key), tone, size, level ('AUTO'|...), templateId ('AUTO'|'COMPOSE'|id), seed, avoidTexts[], lastCta }
   * retorno: { versions: [{ text, tone, source, templateId, templateName, cta }], strategy, strategyLabel, why, level, niche, error, missing }
   */
  const generate = (opts) => {
    const { lead, templates = [], demoUrl = '', tone = 'NATURAL', size = 'MEDIA' } = opts;
    const niche = detectNiche(lead);
    const all = buildVars(lead, { niche, demoUrl });
    const level = opts.level && opts.level !== 'AUTO' ? opts.level : autoLevel(all);
    const vars = levelVars(all, level);
    let strategy = opts.strategy; let why = 'escolhida manualmente'; let strategyLabel = STRATEGIES[strategy]?.name;
    if (!strategy || strategy === 'AUTO') { const a = autoStrategy(vars); strategy = a.strategy; why = a.why; strategyLabel = a.label; }
    else if (!strategyFits(strategy, vars)) {
      const s = STRATEGIES[strategy];
      const need = [...(s.requires || []), ...(s.requiresAny || [])].filter((k) => !vars[k]);
      return { error: `A estratégia "${s.name}" precisa de dados que este lead não tem${need.length ? `: ${need.map((k) => `{{${k}}}`).join(', ')}` : ''}${all[need[0]] && !vars[need[0]] ? ' (aumente o nível de personalização)' : ''}.`, missing: need, strategy, niche, level };
    }
    const avoid = new Set((opts.avoidTexts || []).map(norm));
    const baseSeed = opts.seed || Date.now();
    const tones = [tone, ...(ALT_TONES[tone] || ['DIRETO', 'CONSULTIVO'])];
    const versions = [];

    // Versao 1: template (escolhido ou automatico) quando existir; senao composicao
    let primaryTemplate = null;
    if (opts.templateId && !['AUTO', 'COMPOSE'].includes(opts.templateId)) {
      primaryTemplate = templates.find((t) => t.id === opts.templateId);
      if (primaryTemplate) {
        const miss = missingVars(primaryTemplate.body, vars, lead);
        const unk = unknownVars(primaryTemplate.body, lead);
        if (miss.length || unk.length) {
          return {
            error: miss.length ? miss.map((k) => `A mensagem utiliza a variável {{${k}}}, mas este lead não possui esse dado preenchido${all[k] && !vars[k] ? ' no nível de personalização escolhido' : ''}.`).join('\n')
              : `O template usa variáveis desconhecidas: ${unk.map((k) => `{{${k}}}`).join(', ')}.`,
            missing: miss, strategy, niche, level
          };
        }
      }
    } else if (opts.templateId !== 'COMPOSE') {
      const list = eligibleTemplates(templates, { niche, strategy, tone, size, vars, lead });
      primaryTemplate = list.length ? list[Math.floor(rng(baseSeed + 7)() * Math.min(list.length, 2))] : null;
    }

    for (let i = 0; i < 3; i += 1) {
      const vt = tones[i];
      let made = null;
      for (let attempt = 0; attempt < 6 && !made; attempt += 1) {
        const seed = baseSeed + i * 7919 + attempt * 104729;
        const cta = pickCta(vars, vt, rng(seed + 3), opts.lastCta);
        const v = { ...vars, cta };
        let text; let source = 'COMPOSE';
        if (i === 0 && primaryTemplate) { text = renderTemplate(primaryTemplate.body, v, lead).text; source = 'TEMPLATE'; }
        else text = compose({ vars: v, strategy, tone: vt, size, seed, niche, variant: i });
        const n = norm(text);
        if (!avoid.has(n) && !versions.some((x) => norm(x.text) === n)) made = { text, tone: vt, cta, source, templateId: source === 'TEMPLATE' ? primaryTemplate.id : null, templateName: source === 'TEMPLATE' ? primaryTemplate.name : 'Composição modular' };
      }
      if (made) versions.push(made);
    }
    return { versions, strategy, strategyLabel, why, level, niche, repeated: versions.length === 0 };
  };

  // Checagem final antes de copiar / salvar / abrir WhatsApp
  const validateFinal = (text) => {
    const t = String(text || '').trim();
    if (!t) return 'A mensagem está vazia.';
    const left = leftoverPlaceholders(t);
    if (left.length) return `A mensagem ainda tem variáveis sem valor: ${left.map((k) => `{{${k}}}`).join(', ')}. Troque por texto ou preencha os dados do lead.`;
    return '';
  };

  CC.messaging = {
    NICHES, VARIABLES, VAR_ORDER, STRATEGIES, AUTO_RULES, TONES, SIZES, LEVELS, CTAS,
    detectNiche, buildVars, autoLevel, autoStrategy, strategyFits, levelVars,
    renderTemplate, usedVars, missingVars, unknownVars, generate, validateFinal, derivedReason
  };
})();
