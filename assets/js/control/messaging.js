/* CDEV Control Center - Motor de mensagens de prospeccao (v2: diagnostico + argumento + tecnica)
 *
 * Fluxo:
 *   LEAD -> NICHO (categorias do editor, crm_tags) -> DIAGNOSTICO (fatos do lead)
 *        -> ARGUMENTO (por que conversar) -> TECNICA (como dizer) -> ESTRATEGIA (estrutura)
 *        -> BLOCOS -> 3 versoes -> VALIDACAO (sem promessas, sem urgencia falsa, sem estatistica solta)
 *
 * Regras de ouro (mantidas da v1):
 *   - o motor so usa dados que existem no lead; sem o dado, o trecho nao entra;
 *   - nenhuma estatistica entra automaticamente na mensagem (RESEARCH fica so como referencia);
 *   - sem IA paga: composicao por blocos e frases com variacao (custo zero).
 *
 * Categorias: vem do editor "Categorias e tags" (crm_tags, kind NICHO: nome, palavras-chave,
 * beneficios, dores, cuidados). Academia, Advocacia e Energia solar tem um padrao embutido
 * para continuar funcionando mesmo sem o catalogo. Para um nicho novo nao e preciso mexer aqui.
 */
(function () {
  const CC = window.CC;

  // =====================================================================================
  // UTILITARIOS
  // =====================================================================================
  const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const lowerFirst = (s) => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const fold = (v) => clean(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nicheKey = (name) => fold(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/\n|;/)).map(clean).filter(Boolean);
  const SOCIAL_RE = /(instagram\.com|facebook\.com|fb\.com|fb\.me|linktr\.ee|linktree|beacons\.ai|bio\.link|taplink|linkbio|wa\.me|whatsapp|tiktok\.com|youtube\.com|ifood\.com|google\.com\/maps|goo\.gl|business\.site|g\.page|nextfit\.bio)/i;
  const ownSite = (l) => { const w = clean(l.website); return w && !SOCIAL_RE.test(w) ? w : ''; };
  const igHandle = (l) => clean(l.instagram).replace(/^@|https?:\/\/(www\.)?instagram\.com\//gi, '').replace(/[/?].*$/, '');

  // "Clínica / Saúde" -> "clínica e saúde"; siglas (OAB, TI) ficam como estao
  const segPhrase = (s) => clean(s).split(/\s+/).map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ').replace(/\s*\/\s*/g, ' e ');
  const endDot = (s) => (s && !/[.!?:]$/.test(s.trim()) ? `${s.trim()}.` : s);

  // Primeiro nome; mantem o titulo ("Dra. Ana", "Dr. Paulo")
  const firstName = (full) => {
    const parts = clean(full).split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (/^(dr|dra|sr|sra|prof|profa)\.?$/i.test(parts[0]) && parts[1]) return `${parts[0].replace(/\.?$/, '.')} ${parts[1]}`;
    return parts[0];
  };

  // =====================================================================================
  // CATEGORIAS (nichos) - dinamicas
  // =====================================================================================
  // Padrao embutido (usado quando o catalogo nao tem beneficios/dores para o nicho)
  const BUILTIN = {
    academia: {
      label: 'Academia', profiles: ['academias'], keywords: ['academia', 'fitness', 'crossfit', 'musculação', 'treino', 'pilates', 'funcional', 'gym'],
      benefits: ['apresentar a estrutura, as modalidades e os horários da academia', 'mostrar planos, modalidades e localização, com o WhatsApp a um clique'],
      pains: ['perguntas repetidas sobre planos e horários no WhatsApp', 'alunos que querem ver a estrutura antes de visitar'],
      notes: 'Não inventar número de alunos, resultados ou estrutura.'
    },
    advocacia: {
      label: 'Advocacia', profiles: ['advogados'], keywords: ['advocacia', 'advogad', 'jurídic', 'escritório de advocacia'],
      benefits: ['organizar as áreas de atuação e os canais de contato do escritório de forma clara', 'apresentar o escritório de forma sóbria, com informações e contato em um só lugar'],
      pains: ['clientes que chegam sem saber as áreas de atuação do escritório'],
      notes: 'Sem promessa de resultado jurídico. Não inventar especialidades (Provimento 205/2021 da OAB).', regulated: 'OAB'
    },
    energia_solar: {
      label: 'Energia solar', profiles: ['energia-solar'], keywords: ['energia solar', 'solar', 'fotovolt'],
      benefits: ['apresentar os serviços, as regiões atendidas e facilitar pedidos de orçamento', 'mostrar como a empresa trabalha e deixar o pedido de orçamento a um clique'],
      pains: ['pedidos de orçamento que chegam sem as informações básicas do cliente'],
      notes: 'Não inventar projetos, clientes, resultados ou economia.'
    }
  };
  const GENERIC_BENEFITS = ['apresentar os serviços e deixar o contato a um clique', 'reunir serviços, localização e contato em um só lugar', 'deixar claro o que a empresa oferece e como falar com vocês'];

  let OVERRIDE = null; // setCategories() permite injetar categorias de outra fonte
  const sourceRows = () => {
    if (OVERRIDE) return OVERRIDE;
    return (CC.tags && Array.isArray(CC.tags.rows) ? CC.tags.rows : []).filter((t) => t.kind === 'NICHO');
  };
  let cache = { sig: null, niches: null };
  const buildNiches = () => {
    const rows = sourceRows();
    const sig = rows.map((r) => `${r.id || r.name}|${r.updated_at || ''}|${(r.keywords || []).length}|${(r.benefits || []).length}`).join(';');
    if (cache.niches && cache.sig === sig) return cache.niches;
    const out = {};
    Object.entries(BUILTIN).forEach(([k, n]) => { out[k] = { key: k, ...n, keywords: [...n.keywords], builtin: true }; });
    rows.forEach((r) => {
      const name = clean(r.name || r.label); if (!name) return;
      const k = nicheKey(name);
      const base = out[k] || {};
      const benefits = list(r.benefits);
      const pains = list(r.pains);
      const notes = clean(r.notes);
      out[k] = {
        key: k, label: name, color: r.color,
        profiles: base.profiles || [],
        keywords: [...new Set([...(base.keywords || []), ...(r.keywords || []).map(clean).filter(Boolean), name])],
        benefits: benefits.length ? benefits : (base.benefits || GENERIC_BENEFITS),
        pains: pains.length ? pains : (base.pains || []),
        notes: notes || base.notes || '',
        regulated: base.regulated || (/oab|crm|cfm|cro|crp|conselho|provimento/i.test(notes) ? 'CONSELHO' : ''),
        builtin: !!base.builtin, dynamic: true
      };
    });
    cache = { sig, niches: out };
    return out;
  };
  const niches = () => buildNiches();
  const nicheCfg = (k) => (k ? niches()[k] || null : null);

  const detectNiche = (lead = {}) => {
    const all = niches();
    const byProfile = Object.values(all).find((n) => (n.profiles || []).includes(lead.profile_key));
    if (byProfile) return byProfile.key;
    const seg = fold(lead.segment);
    if (seg) { const exact = Object.values(all).find((n) => fold(n.label) === seg || n.key === nicheKey(seg)); if (exact) return exact.key; }
    const text = fold([lead.segment, lead.main_activity, lead.specialty, lead.company].map(clean).join(' '));
    if (!text) return null;
    let best = null; let bestScore = 0;
    Object.values(all).forEach((n) => {
      const score = (n.keywords || []).reduce((s, kw) => { const k = fold(kw); return k && text.includes(k) ? s + k.length : s; }, 0);
      if (score > bestScore) { best = n.key; bestScore = score; }
    });
    return best;
  };

  // =====================================================================================
  // NIVEIS / TONS / TAMANHOS
  // =====================================================================================
  const LEVELS = [['AUTO', 'Automático'], ['BASICO', 'Básico'], ['MEDIO', 'Médio'], ['AVANCADO', 'Avançado']];
  const LEVEL_RANK = { BASICO: 1, MEDIO: 2, AVANCADO: 3 };
  const TONES = [['NATURAL', 'Natural'], ['PROFISSIONAL', 'Profissional'], ['CASUAL', 'Casual'], ['DIRETO', 'Direto'], ['CONSULTIVO', 'Consultivo']];
  const ALT_TONES = { NATURAL: ['DIRETO', 'CONSULTIVO'], PROFISSIONAL: ['DIRETO', 'CONSULTIVO'], CASUAL: ['DIRETO', 'CONSULTIVO'], DIRETO: ['NATURAL', 'CONSULTIVO'], CONSULTIVO: ['NATURAL', 'DIRETO'] };
  const SIZES = [['CURTA', 'Curta'], ['MEDIA', 'Média'], ['DETALHADA', 'Detalhada']];

  // =====================================================================================
  // VARIAVEIS
  // =====================================================================================
  // group: basico | medio | avancado | sistema (sistema = calculado pelo motor)
  // optional: pode faltar; o trecho e ajustado (ex.: "Ola, {{nome}}!" vira "Ola!")
  const VARIABLES = {
    nome: { label: 'Nome do contato', group: 'basico', optional: true, get: (l) => firstName(l.name) },
    empresa: { label: 'Empresa', group: 'basico', get: (l) => clean(l.company) },
    segmento: { label: 'Segmento', group: 'basico', get: (l, c) => segPhrase(clean(l.segment) || nicheCfg(c.niche)?.label || '') },
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
    // calculadas pelo motor a partir do diagnostico (servem para templates universais)
    argumento: { label: 'Argumento escolhido (nome)', group: 'sistema', optional: true, get: (l, c) => c.argumentLabel || '' },
    evidencia: { label: 'Frase com o fato do lead que sustenta o argumento', group: 'sistema', optional: true, get: (l, c) => c.evidence || '' },
    beneficio: { label: 'Benefício do nicho', group: 'sistema', optional: true, get: (l, c) => c.benefit || '' },
    cta: { label: 'Chamada para ação (automática)', group: 'sistema', get: (l, c) => c.cta || '' }
  };
  const VAR_ORDER = ['nome', 'empresa', 'segmento', 'cidade', 'estado', 'bairro', 'telefone', 'demo_url', 'cta', 'evidencia', 'beneficio', 'argumento',
    'gancho', 'problema_detectado', 'oportunidade', 'motivo_contato', 'especialidade', 'servico_principal', 'diferencial', 'observacao',
    'site_atual', 'site_url', 'tem_site', 'instagram', 'instagram_url', 'tem_instagram', 'google_maps_url', 'tem_google', 'avaliacao_google', 'quantidade_avaliacoes'];

  // Motivo do contato derivado SOMENTE de fatos do lead (usado quando o campo nao foi preenchido)
  function derivedReason(l) {
    if (ownSite(l)) return '';
    if (igHandle(l)) return `Vi que a ${clean(l.company)} se apresenta pelo Instagram, mas ainda não tem um site próprio.`;
    return `Vi que a ${clean(l.company)} ainda não tem um site próprio.`;
  }

  // =====================================================================================
  // ESTRATEGIAS (estrutura da mensagem)
  // =====================================================================================
  const STRATEGIES = {
    MODERNIZACAO: { name: 'Modernização', description: 'Já tem site e você anotou um problema nele.', niches: '*', priority: 10, requires: ['site_atual', 'problema_detectado'] },
    OPORTUNIDADE: { name: 'Oportunidade', description: 'Usa a oportunidade/gancho que você anotou no lead.', niches: '*', priority: 20, requiresAny: ['oportunidade', 'gancho'] },
    DEMONSTRACAO: { name: 'Demonstração', description: 'Leva o link da demo pronta.', niches: '*', priority: 30, requires: ['demo_url'] },
    INSTAGRAM: { name: 'Instagram', description: 'Se apresenta pelo Instagram, sem site próprio.', niches: '*', priority: 40, requires: ['instagram'], when: (v) => v.tem_site === 'não' },
    IA_VISIBILIDADE: { name: 'Descoberta e IA', description: 'Fala da mudança na forma de pesquisar empresas (busca e ferramentas de IA), sem prometer posição.', niches: '*', priority: 45, requiresAny: ['servico_principal', 'especialidade'], when: (v) => !!v.segmento },
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
    { strategy: 'IA_VISIBILIDADE', why: 'sem site e com serviço principal anotado', when: (v) => v.tem_site === 'não' && (v.servico_principal || v.especialidade) },
    { strategy: 'SEM_SITE', why: 'sem site próprio', when: (v) => v.tem_site === 'não' },
    { strategy: 'GOOGLE', why: 'boa presença no Google', when: (v) => v.avaliacao_google && Number(String(v.quantidade_avaliacoes).replace(/\D/g, '')) >= 20 },
    { strategy: 'PRESENCA_ONLINE', why: 'já tem algum canal online', when: (v) => v.site_atual || v.instagram },
    { strategy: 'GENERICA', why: 'poucos dados disponíveis', when: () => true }
  ];

  // =====================================================================================
  // TECNICAS (como dizer) - todas seguras; as que exigem prova so entram com prova real
  // =====================================================================================
  const TECHNIQUES = {
    ESPECIFICIDADE: { name: 'Especificidade', description: 'Cita um fato real do lead (cidade, Instagram, nota, serviço).' },
    CONTRASTE: { name: 'Contraste', description: 'Compara a situação atual com uma alternativa possível, sem exagero.' },
    LACUNA: { name: 'Lacuna', description: 'Mostra o que falta (informações espalhadas, sem endereço próprio).' },
    PERGUNTA_REFLEXIVA: { name: 'Pergunta reflexiva', description: 'Faz o lead avaliar a própria situação, sem afirmar que ele precisa comprar.' },
    RECIPROCIDADE: { name: 'Reciprocidade', description: 'Oferece algo antes de pedir: demo ou ideia sem compromisso.' },
    MUDANCA_COMPORTAMENTO: { name: 'Mudança de comportamento', description: 'A forma de pesquisar empresas está mudando (sem números inventados).' },
    PROVA_REAL: { name: 'Prova real', description: 'Usa a nota/avaliações do próprio lead. Nunca clientes ou números inventados.', requiresRealData: ['avaliacao_google', 'quantidade_avaliacoes'] }
  };

  // =====================================================================================
  // DIAGNOSTICO: fatos -> achados (o que tem, o que falta, problema, oportunidade)
  // =====================================================================================
  const diagnose = (v) => {
    const f = [];
    const reviews = Number(String(v.quantidade_avaliacoes || '').replace(/\D/g, '')) || 0;
    if (v.problema_detectado) f.push({ type: 'PROBLEMA_ANOTADO', fact: v.problema_detectado, weight: 100 });
    if (v.oportunidade) f.push({ type: 'OPORTUNIDADE_ANOTADA', fact: v.oportunidade, weight: 95 });
    if (v.demo_url) f.push({ type: 'DEMO_PRONTA', fact: 'Já existe uma demonstração para este lead.', weight: 90 });
    if (v.instagram && v.tem_site === 'não') f.push({ type: 'SO_INSTAGRAM', fact: `Tem Instagram (${v.instagram}), mas não tem site próprio.`, weight: 80 });
    if (v.tem_google === 'sim' && v.tem_site === 'não') f.push({ type: 'GOOGLE_SEM_SITE', fact: 'Está no Google/Maps, mas não tem site próprio.', weight: 70 });
    if (v.avaliacao_google && reviews >= 20) f.push({ type: 'BOAS_AVALIACOES', fact: `Nota ${v.avaliacao_google} em ${v.quantidade_avaliacoes} avaliações no Google.`, weight: 65 });
    if (v.servico_principal || v.especialidade) f.push({ type: 'SERVICO_CONHECIDO', fact: `Serviço principal: ${v.servico_principal || v.especialidade}.`, weight: 60 });
    if (v.tem_site === 'não' && !f.some((x) => ['SO_INSTAGRAM', 'GOOGLE_SEM_SITE'].includes(x.type))) f.push({ type: 'SEM_SITE', fact: 'Não tem site próprio identificado.', weight: 50 });
    if (v.site_atual && !v.problema_detectado) f.push({ type: 'TEM_SITE', fact: `Tem site (${v.site_atual}).`, weight: 30 });
    return f.sort((a, b) => b.weight - a.weight);
  };

  // =====================================================================================
  // ARGUMENTOS (por que conversar). Cada um: quando vale, prioridade, estrategias onde cabe,
  // tecnicas, o fato que o sustenta e frases por tecnica.
  // =====================================================================================
  const AUTOMATION_RE = /manual|planilha|repetitiv|atendimento|agendament|demora|perde|pergunta/i;
  const ARGUMENTS = {
    MODERNIZACAO: {
      name: 'Modernização do site', priority: 100, strategies: ['MODERNIZACAO', 'OPORTUNIDADE', 'PRESENCA_ONLINE', 'GENERICA', 'DEMONSTRACAO'],
      when: (v) => v.site_atual && v.problema_detectado, techniques: ['ESPECIFICIDADE', 'CONTRASTE'], evidence: (v) => endDot(`Notei um ponto no site atual: ${v.problema_detectado}`),
      lines: {
        ESPECIFICIDADE: (v, b) => [`Uma versão atualizada pode resolver esse ponto e ${b}.`, `Dá para modernizar a estrutura mantendo o que já funciona e corrigindo esse ponto.`],
        CONTRASTE: (v, b) => ['A ideia seria melhorar esse ponto sem complicar a experiência de quem chega pelo site.', `Com uma nova versão dá para ${b}.`]
      }
    },
    AUTOMACAO: {
      name: 'Menos trabalho manual', priority: 95, strategies: ['OPORTUNIDADE', 'MODERNIZACAO', 'GENERICA', 'PRESENCA_ONLINE', 'SEM_SITE', 'INSTAGRAM'],
      when: (v) => v.problema_detectado && AUTOMATION_RE.test(v.problema_detectado), techniques: ['CONTRASTE', 'PERGUNTA_REFLEXIVA'], evidence: (v) => endDot(`Notei um ponto que dá para melhorar: ${v.problema_detectado}`),
      lines: {
        CONTRASTE: () => ['Um site com as informações principais já respondidas tira parte desse trabalho do WhatsApp.', 'Quando as dúvidas mais comuns já estão respondidas no site, o atendimento fica para quem realmente quer avançar.'],
        PERGUNTA_REFLEXIVA: () => ['Quanto desse atendimento poderia ser resolvido com as informações já disponíveis em um site?', 'Já pensaram em deixar as respostas mais comuns organizadas em um lugar só?']
      }
    },
    INSTAGRAM_COMPLEMENT: {
      name: 'Instagram + site', priority: 90, strategies: ['INSTAGRAM', 'SEM_SITE', 'DEMONSTRACAO', 'GENERICA', 'CURIOSIDADE', 'PRESENCA_ONLINE'],
      when: (v) => v.instagram && v.tem_site === 'não', techniques: ['CONTRASTE', 'LACUNA'], evidence: (v) => `Vi que vocês estão no Instagram (${v.instagram}), mas ainda não encontrei um site próprio.`,
      lines: {
        CONTRASTE: (v, b) => ['O Instagram já apresenta o trabalho de vocês; um site pode complementar isso reunindo as informações em um endereço próprio.', `A ideia não é substituir o Instagram, mas ter um endereço fixo para ${b}.`],
        LACUNA: (v, b) => [`Vocês já têm o Instagram como canal. Um site poderia ser a base onde tudo fica reunido, ajudando a ${b}.`, 'Um site deixa de depender só do perfil e concentra serviços, informações e contato em um lugar.']
      }
    },
    LOCAL_DISCOVERY: {
      name: 'Descoberta local', priority: 85, strategies: ['GOOGLE', 'SEM_SITE', 'GENERICA', 'DEMONSTRACAO', 'PRESENCA_ONLINE'],
      when: (v) => v.tem_google === 'sim' && v.tem_site === 'não', techniques: ['ESPECIFICIDADE', 'PROVA_REAL'],
      evidence: (v) => (v.avaliacao_google ? `Vi que vocês estão no Google com nota ${v.avaliacao_google}${v.quantidade_avaliacoes ? ` em ${v.quantidade_avaliacoes} avaliações` : ''}, mas ainda sem um site próprio.` : 'Vi que vocês estão no Google, mas ainda sem um site próprio.'),
      lines: {
        ESPECIFICIDADE: (v, b) => [`Quem pesquisa ${v.segmento || 'esse serviço'}${v.cidade ? ` em ${v.cidade}` : ''} costuma querer conhecer melhor a empresa antes de entrar em contato. Um site ajuda a ${b}.`, `Um site pode complementar a presença no Google e ${b}.`],
        PROVA_REAL: (v, b) => (v.avaliacao_google ? [`Com a nota que vocês já têm no Google, um site próprio dá o próximo passo para quem quer saber mais.`, `As avaliações já mostram o trabalho de vocês; um site reúne isso com serviços e contato, ajudando a ${b}.`] : [`Um site pode complementar a presença no Google e ${b}.`])
      }
    },
    INFORMATION_GAP: {
      name: 'Informação espalhada', priority: 75, strategies: ['SEM_SITE', 'INSTAGRAM', 'GENERICA', 'CURIOSIDADE', 'GOOGLE'],
      when: (v) => v.tem_site === 'não' && (v.instagram || v.tem_google === 'sim'), techniques: ['LACUNA', 'PERGUNTA_REFLEXIVA'], evidence: (v) => `Hoje as informações de vocês ficam ${[v.instagram ? 'no Instagram' : '', v.tem_google === 'sim' ? 'no Google' : '', 'no WhatsApp'].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' e $1')}, sem um site próprio que reúna tudo.`,
      lines: {
        LACUNA: () => ['Hoje parte das informações fica nas redes e no Google. Um site pode reunir tudo em um único lugar.', 'Um endereço próprio permite organizar serviços, informações e contato sem depender de uma única plataforma.'],
        PERGUNTA_REFLEXIVA: () => ['Quando alguém quer saber mais sobre vocês, onde encontra tudo reunido hoje?', 'Hoje, quem chega até vocês precisa procurar as informações em vários lugares?']
      }
    },
    AI_DISCOVERY: {
      name: 'Descoberta por busca e IA', priority: 70, strategies: ['IA_VISIBILIDADE', 'PRESENCA_ONLINE', 'GENERICA'],
      when: (v) => v.segmento && (v.servico_principal || v.especialidade), techniques: ['MUDANCA_COMPORTAMENTO', 'PERGUNTA_REFLEXIVA'], evidence: (v) => `Vi que o forte de vocês é ${lowerFirst(v.servico_principal || v.especialidade)}.`,
      lines: {
        MUDANCA_COMPORTAMENTO: (v) => ['A forma como as pessoas pesquisam empresas está mudando, inclusive com ferramentas de IA. Ter informações próprias e bem organizadas ajuda a apresentar melhor o negócio.', `Hoje a pesquisa pode começar com uma pergunta, como "${lowerFirst(v.servico_principal || v.especialidade)} em ${v.cidade || 'minha cidade'}", e não pelo nome da empresa. Um site deixa essas informações disponíveis de forma completa.`],
        PERGUNTA_REFLEXIVA: (v) => [`Se alguém pesquisar por ${lowerFirst(v.servico_principal || v.especialidade)}${v.cidade ? ` em ${v.cidade}` : ''}, encontra hoje as informações completas de vocês?`, 'Além do Google e das redes, novas ferramentas estão sendo usadas para pesquisar serviços. Vocês já têm uma fonte própria de informações sobre a empresa?']
      }
    },
    CREDIBILIDADE: {
      name: 'Credibilidade e clareza', priority: 60, strategies: ['SEM_SITE', 'GENERICA', 'CURIOSIDADE', 'DEMONSTRACAO', 'INSTAGRAM'],
      when: (v) => v.tem_site === 'não', techniques: ['CONTRASTE', 'PERGUNTA_REFLEXIVA'], evidence: () => 'Pelo que vi, vocês ainda não têm um site próprio.',
      lines: {
        CONTRASTE: (v, b) => [`Um site próprio ajuda a ${b}.`, 'Ter um endereço próprio na web facilita para quem pesquisa a empresa e quer mais informações antes de chamar.'],
        PERGUNTA_REFLEXIVA: (v, b) => [`Um site simples já ajudaria a ${b}. Faz sentido pensar nisso agora?`, 'Quem pesquisa a empresa hoje encontra as informações principais com facilidade?']
      }
    },
    PRESENCA: {
      name: 'Presença digital', priority: 10, strategies: '*', when: () => true, techniques: ['CONTRASTE'], evidence: () => '',
      lines: { CONTRASTE: (v, b) => [`Um site próprio ajuda a ${b}.`, `A ideia é ter um site que ajude a ${b}.`, 'Ter um site próprio dá mais controle sobre o que aparece quando alguém pesquisa a empresa.'] }
    }
  };
  const fitsStrategy = (a, s) => a.strategies === '*' || a.strategies.includes(s);
  const ARG_SAFE = (a, v) => { try { return !!a.when(v); } catch (e) { return false; } };
  // Lista ordenada dos argumentos validos para o lead (e para a estrategia, se informada)
  const rankArguments = (v, strategy) => {
    const ok = Object.entries(ARGUMENTS).filter(([, a]) => ARG_SAFE(a, v));
    const fit = ok.filter(([, a]) => !strategy || fitsStrategy(a, strategy));
    return (fit.length ? fit : ok).sort((x, y) => y[1].priority - x[1].priority).map(([k]) => k);
  };
  const selectArgument = (v, strategy) => rankArguments(v, strategy)[0] || 'PRESENCA';
  const techniqueOk = (key, v) => { const t = TECHNIQUES[key]; return !t?.requiresRealData || t.requiresRealData.every((k) => v[k]); };
  const pickTechnique = (argKey, v, variant) => {
    const ts = (ARGUMENTS[argKey]?.techniques || ['CONTRASTE']).filter((t) => techniqueOk(t, v));
    return ts.length ? ts[variant % ts.length] : 'CONTRASTE';
  };

  // =====================================================================================
  // PESQUISAS (referencia para o time). NUNCA entram sozinhas na mensagem.
  // Os numeros abaixo vieram de material de pesquisa e ainda NAO foram conferidos na fonte
  // original; por isso verified:false. Para usar em copy, confira a fonte e mude para true.
  // =====================================================================================
  const RESEARCH = {
    PESQUISA_ANTES_DE_COMPRAR: { claim: 'A maioria dos consumidores pesquisa online antes de contratar um serviço local.', source: 'Material de pesquisa (BrightLocal/Google, diversos anos)', verified: false, supports: ['LOCAL_DISCOVERY', 'CREDIBILIDADE'] },
    CONFIANCA_SITE: { claim: 'Parte relevante dos consumidores desconfia de empresas sem site.', source: 'Material de pesquisa (Blue Corona / Stanford Web Credibility)', verified: false, supports: ['CREDIBILIDADE'] },
    IA_NA_PESQUISA: { claim: 'Uma parcela dos usuários brasileiros de IA já usou IA para pesquisar produtos ou serviços.', source: 'Material de pesquisa (FBIZ / On The Go, 2026)', verified: false, supports: ['AI_DISCOVERY'] },
    EMPRESAS_COM_SITE_BR: { claim: 'Muitas empresas brasileiras, principalmente pequenas, ainda não têm site.', source: 'Material de pesquisa (TIC Empresas / Cetic.br)', verified: false, supports: ['CREDIBILIDADE', 'INFORMATION_GAP'] }
  };
  const getResearch = (argKey) => Object.entries(RESEARCH).filter(([, r]) => r.supports.includes(argKey)).map(([k, r]) => ({ key: k, ...r }));

  // =====================================================================================
  // MOTOR
  // =====================================================================================
  // Valores de todas as variaveis para o lead (variavel desconhecida -> coluna do lead com o mesmo nome)
  const buildVars = (lead, ctx = {}) => {
    const c = { niche: ctx.niche ?? detectNiche(lead), demoUrl: ctx.demoUrl || '', cta: ctx.cta || '' };
    const v = {};
    Object.entries(VARIABLES).forEach(([k, def]) => { if (def.group !== 'sistema') v[k] = clean(def.get(lead, c)); });
    const arg = ctx.argument || selectArgument(v);
    c.argumentLabel = ARGUMENTS[arg]?.name || '';
    c.evidence = clean(ARGUMENTS[arg]?.evidence(v));
    c.benefit = (nicheCfg(c.niche)?.benefits || GENERIC_BENEFITS)[0];
    Object.entries(VARIABLES).forEach(([k, def]) => { if (def.group === 'sistema') v[k] = clean(def.get(lead, c)); });
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
  const rng = (seed) => { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x >>>= 0; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  const pick = (r, arr) => { const a = (arr || []).filter(Boolean); return a.length ? a[Math.floor(r() * a.length)] : ''; };
  const timeGreeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  // Banco de CTAs (o motor evita repetir o ultimo usado com o lead)
  const CTAS = {
    demo: ['Quer dar uma olhada?', 'O que achou da ideia?', 'Posso te mostrar a estrutura que preparei?', 'Dá uma olhada e me diz o que achou?', 'Faz sentido para vocês?'],
    noDemo: ['Posso te mostrar?', 'Faz sentido para vocês?', 'Posso te explicar rapidamente?', 'Quer que eu te mostre como funcionaria?', 'Posso te mandar uma ideia de como ficaria?'],
    DIRETO: ['Posso te mostrar?', 'Quer ver?', 'Te mando?'],
    CONSULTIVO: ['Faz sentido para vocês?', 'Posso te explicar rapidamente como funcionaria?', 'Quer que eu te mostre como funcionaria na prática?']
  };

  const benefitOf = (ctx, r) => pick(r, nicheCfg(ctx.niche)?.benefits || GENERIC_BENEFITS) || GENERIC_BENEFITS[0];

  // Blocos da mensagem. Cada bloco usa SO variaveis com valor; sem dado, retorna vazio.
  // ctx = { niche, argument, technique }
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
      if (v.gancho) return endDot(v.gancho);
      if (v.servico_principal) return pick(r, [`Vi que o forte de vocês é ${lowerFirst(v.servico_principal)}.`, `Vi que vocês trabalham com ${lowerFirst(v.servico_principal)}.`]);
      if (v.especialidade) return `Vi que vocês atuam com ${lowerFirst(v.especialidade)}.`;
      if (v.diferencial) return `Vi que um diferencial de vocês é ${lowerFirst(v.diferencial)}.`;
      return '';
    },
    PROBLEMA: (v, t, r, s) => {
      if (v.problema_detectado) return endDot(pick(r, [`Notei um ponto que pode melhorar na presença online: ${v.problema_detectado}`, `Anotei uma oportunidade de melhoria: ${v.problema_detectado}`, `Vi algo que dá para ajustar na presença digital: ${v.problema_detectado}`]));
      if (s === 'INSTAGRAM' && v.tem_site === 'não') return pick(r, ['Vi que hoje vocês se apresentam pelo Instagram, mas ainda sem um site próprio.', 'Pelo que vi, vocês ainda não têm um site próprio além do Instagram.', 'O Instagram está ativo, mas ainda não encontrei um site próprio da empresa.', 'Vocês estão bem no Instagram; o que ainda não aparece é um endereço próprio na web.']);
      if (['SEM_SITE', 'CURIOSIDADE', 'IA_VISIBILIDADE'].includes(s) && v.tem_site === 'não') return pick(r, [`Vi que a ${v.empresa} ainda não tem um site próprio.`, 'Pelo que vi, vocês ainda não têm um site próprio.', 'Ainda não localizei um site oficial da empresa.']);
      if (v.motivo_contato && (s === 'GENERICA' || s === 'PRESENCA_ONLINE')) return v.motivo_contato;
      return '';
    },
    // O argumento + a tecnica escolhem a frase (fato -> interpretacao -> argumento -> tecnica -> frase)
    OPORTUNIDADE: (v, t, r, s, ctx) => {
      if (v.oportunidade) return endDot(v.oportunidade);
      const arg = ARGUMENTS[ctx.argument] || ARGUMENTS.PRESENCA;
      const tech = arg.lines[ctx.technique] ? ctx.technique : Object.keys(arg.lines)[0];
      return pick(r, arg.lines[tech](v, benefitOf(ctx, r)));
    },
    DEMONSTRACAO: (v, t, r) => {
      if (!v.demo_url) return '';
      const e = v.empresa;
      const lead = {
        NATURAL: [`Preparei uma demonstração de como poderia ficar o site da ${e}:`, `Inclusive, montei uma demonstração de site para a ${e}:`],
        PROFISSIONAL: [`Preparei uma demonstração de como a ${e} poderia se apresentar na internet:`, `Elaborei uma demonstração de site para a ${e}:`],
        CASUAL: ['Montei uma prévia de como poderia ficar o site de vocês:', `Fiz uma demonstração do site da ${e}, olha só:`],
        DIRETO: [`Fiz uma demonstração para a ${e}:`, `Demonstração do site da ${e}:`],
        CONSULTIVO: [`Para facilitar a conversa, preparei uma demonstração de como eu apresentaria a ${e}:`, 'Montei uma demonstração para você visualizar como ficaria:']
      };
      return `${pick(r, lead[t] || lead.NATURAL)}\n\n${v.demo_url}`;
    },
    OFERTA_DEMO: (v, t, r) => (v.demo_url ? '' : pick(r, ['Posso preparar uma demonstração sem compromisso para vocês verem como ficaria.', 'Se quiser, preparo uma demonstração sem compromisso.'])),
    // Pergunta: dores do nicho viram PERGUNTA (nunca afirmacao); senao a pergunta padrao
    PERGUNTA: (v, t, r, s, ctx) => {
      const pains = nicheCfg(ctx.niche)?.pains || [];
      if (pains.length && r() < 0.6) return pick(r, pains.map((p) => `Hoje vocês lidam com ${lowerFirst(p).replace(/[.?!]$/, '')}?`));
      return v.tem_site === 'não'
        ? pick(r, [`Vocês já pensaram em ter um site próprio para a ${v.empresa}?`, 'Já pensaram em ter um site próprio?'])
        : pick(r, ['Vocês estão satisfeitos com o site atual?', `Como está funcionando o site da ${v.empresa} para vocês?`]);
    },
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
    IA_VISIBILIDADE: ['SAUDACAO', 'CONTEXTO', 'GANCHO', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    GOOGLE: ['SAUDACAO', 'CONTEXTO', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    PRESENCA_ONLINE: ['SAUDACAO', 'CONTEXTO', 'APRESENTACAO', 'GANCHO', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    MODERNIZACAO: ['SAUDACAO', 'CONTEXTO', 'PROBLEMA', 'OPORTUNIDADE', 'DEMONSTRACAO', 'OFERTA_DEMO', 'CTA', 'ENCERRAMENTO'],
    OPORTUNIDADE: ['SAUDACAO', 'CONTEXTO', 'GANCHO', 'PROBLEMA', 'OPORTUNIDADE', 'DEMONSTRACAO', 'CTA', 'ENCERRAMENTO']
  };
  const SIZE_DROP = {
    CURTA: ['APRESENTACAO', 'OFERTA_DEMO', 'ENCERRAMENTO', 'GANCHO'],
    MEDIA: ['ENCERRAMENTO'],
    DETALHADA: []
  };

  const pickCta = (v, tone, r, avoid) => {
    const pool = [...(CTAS[tone] || []), ...(v.demo_url ? CTAS.demo : CTAS.noDemo)];
    const options = pool.filter((c) => c !== avoid);
    return pick(r, options.length ? options : pool);
  };

  // Compoe uma mensagem a partir dos blocos (sem template)
  const compose = ({ vars, strategy, tone, size, seed, niche, argument, technique, variant = 0 }) => {
    const r = rng(seed);
    let order = [...(STRUCTURE[strategy] || STRUCTURE.GENERICA)].filter((b) => !(SIZE_DROP[size] || []).includes(b));
    // variacao estrutural entre versoes: gancho antes do contexto, apresentacao extra...
    if (variant === 1 && order.includes('GANCHO')) order = ['SAUDACAO', 'GANCHO', ...order.filter((b) => !['SAUDACAO', 'GANCHO'].includes(b))];
    if (variant === 2 && strategy !== 'CURIOSIDADE' && size !== 'CURTA' && !order.includes('APRESENTACAO') && tone !== 'DIRETO') order.splice(2, 0, 'APRESENTACAO');
    // pergunta reflexiva ja termina com pergunta: o CTA vira opcional
    const parts = order.map((b) => BLOCKS[b](vars, tone, r, strategy, { niche, argument, technique })).filter(Boolean);
    const last2 = parts.slice(-3).join(' ');
    let text = size === 'CURTA' && parts.length > 3 ? [parts[0], `${parts[1]} ${parts[2]}`, ...parts.slice(3)].join('\n\n') : parts.join('\n\n');
    if (technique === 'PERGUNTA_REFLEXIVA' && (last2.match(/\?/g) || []).length >= 2 && vars.cta) text = text.replace(new RegExp(`\\n\\n${vars.cta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
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
   * Gera ate 3 versoes. Cada versao pode usar um argumento diferente (o melhor, o segundo...)
   * opts: { lead, templates, demoUrl, strategy ('AUTO'|key), tone, size, level ('AUTO'|...), templateId ('AUTO'|'COMPOSE'|id), seed, avoidTexts[], lastCta }
   * retorno: { versions: [{ text, tone, source, templateId, templateName, cta, argument, argumentLabel, technique, techniqueLabel, evidence }],
   *            strategy, strategyLabel, why, level, niche, nicheLabel, diagnosis, argument, argumentLabel, error, missing }
   */
  const generate = (opts) => {
    const { lead, templates = [], demoUrl = '', tone = 'NATURAL', size = 'MEDIA' } = opts;
    const niche = detectNiche(lead);
    const all = buildVars(lead, { niche, demoUrl });
    const level = opts.level && opts.level !== 'AUTO' ? opts.level : autoLevel(all);
    const lv = levelVars(all, level);
    let strategy = opts.strategy; let why = 'escolhida manualmente'; let strategyLabel = STRATEGIES[strategy]?.name;
    if (!strategy || strategy === 'AUTO') { const a = autoStrategy(lv); strategy = a.strategy; why = a.why; strategyLabel = a.label; }
    else if (!strategyFits(strategy, lv)) {
      const s = STRATEGIES[strategy];
      if (!s) return { error: `Estratégia desconhecida: ${strategy}.`, missing: [], strategy, niche, level };
      const need = [...(s.requires || []), ...(s.requiresAny || [])].filter((k) => !lv[k]);
      return { error: `A estratégia "${s.name}" precisa de dados que este lead não tem${need.length ? `: ${need.map((k) => `{{${k}}}`).join(', ')}` : ''}${all[need[0]] && !lv[need[0]] ? ' (aumente o nível de personalização)' : ''}.`, missing: need, strategy, niche, level };
    }
    // diagnostico e argumentos usam SO o que o nivel permite (nada vaza de um nivel acima)
    const diagnosis = diagnose(lv);
    const args = rankArguments(lv, strategy);
    const argFor = (i) => args[Math.min(i, args.length - 1)] || 'PRESENCA';
    const baseVars = buildVars(lead, { niche, demoUrl, argument: args[0] });
    const vars = { ...lv, argumento: baseVars.argumento, evidencia: baseVars.evidencia, beneficio: baseVars.beneficio };

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
      const tl = eligibleTemplates(templates, { niche, strategy, tone, size, vars, lead });
      primaryTemplate = tl.length ? tl[Math.floor(rng(baseSeed + 7)() * Math.min(tl.length, 2))] : null;
    }

    for (let i = 0; i < 3; i += 1) {
      const vt = tones[i];
      const argument = argFor(i);
      let made = null;
      for (let attempt = 0; attempt < 8 && !made; attempt += 1) {
        const seed = baseSeed + i * 7919 + attempt * 104729;
        const technique = pickTechnique(argument, vars, i + attempt);
        const cta = pickCta(vars, vt, rng(seed + 3), opts.lastCta);
        const v = { ...vars, cta };
        let text; let source = 'COMPOSE';
        if (i === 0 && primaryTemplate) { text = renderTemplate(primaryTemplate.body, v, lead).text; source = 'TEMPLATE'; }
        else text = compose({ vars: v, strategy, tone: vt, size, seed, niche, argument, technique, variant: i });
        const n = norm(text);
        // composicao que falha na validacao e descartada (template escolhido passa e o aviso aparece no editor)
        const bad = source === 'COMPOSE' && checkClaims(text, { niche }).some((c) => c.block);
        if (!bad && !avoid.has(n) && !versions.some((x) => norm(x.text) === n)) {
          made = {
            text, tone: vt, cta, source,
            templateId: source === 'TEMPLATE' ? primaryTemplate.id : null, templateName: source === 'TEMPLATE' ? primaryTemplate.name : 'Composição modular',
            argument: source === 'TEMPLATE' ? args[0] : argument, argumentLabel: ARGUMENTS[source === 'TEMPLATE' ? args[0] : argument]?.name || '',
            technique: source === 'TEMPLATE' ? '' : technique, techniqueLabel: source === 'TEMPLATE' ? '' : (TECHNIQUES[technique]?.name || ''),
            evidence: clean(ARGUMENTS[source === 'TEMPLATE' ? args[0] : argument]?.evidence(vars))
          };
        }
      }
      if (made) versions.push(made);
    }
    return {
      versions, strategy, strategyLabel, why, level, niche, nicheLabel: nicheCfg(niche)?.label || '',
      diagnosis, argument: args[0], argumentLabel: ARGUMENTS[args[0]]?.name || '', arguments: args, repeated: versions.length === 0
    };
  };

  // =====================================================================================
  // PROTECOES: promessas, urgencia falsa, prova social inventada, estatistica sem fonte
  // block = impede copiar/enviar; warn = so avisa (voce decide)
  // =====================================================================================
  const CLAIMS = [
    { re: /\b(garant\w*|garantimos)\b/i, msg: 'promessa de garantia', block: true },
    { re: /(vai|v[aã]o|ir[aá]) (aumentar|dobrar|triplicar|multiplicar) (suas|as|seus|os)? ?(vendas|clientes|faturamento|lucro)/i, msg: 'promessa de resultado', block: true },
    { re: /(dobrar|triplicar|multiplicar) (suas|as|seus|os)? ?(vendas|clientes|faturamento)/i, msg: 'promessa de resultado', block: true },
    { re: /(última|ultima) chance|só hoje|so hoje|últimas vagas|ultimas vagas|vagas limitadas/i, msg: 'urgência ou escassez artificial', block: true },
    { re: /milhares de clientes|centenas de clientes|(\d+) empresas do seu (setor|segmento)/i, msg: 'prova social sem base', block: true },
    { re: /(perdendo|perde) (milhares|dinheiro|clientes) todo/i, msg: 'aversão à perda sem prova', block: true },
    { re: /primeiro lugar no google|topo do google|aparecer no chatgpt|aparecer na ia|ranquear em primeiro/i, msg: 'promessa de posição em busca/IA', block: true },
    { re: /\d+([.,]\d+)?\s?%/, msg: 'estatística (confira a fonte antes de enviar)', block: false }
  ];
  const REGULATED = [
    { re: /\b(ganhar|ganhe|vencer|vença) (a|sua|seu|o)? ?(causa|processo|ação)/i, msg: 'promessa de resultado jurídico (Provimento 205/2021 da OAB)', block: true },
    { re: /\b(cura|curar|sem dor|resultado garantido)\b/i, msg: 'promessa de resultado em área regulada', block: true }
  ];
  const checkClaims = (text, { niche } = {}) => {
    const t = String(text || '').replace(/https?:\/\/\S+/g, ' ');
    const out = CLAIMS.filter((c) => c.re.test(t)).map((c) => ({ msg: c.msg, block: c.block }));
    if (nicheCfg(niche)?.regulated) REGULATED.filter((c) => c.re.test(t)).forEach((c) => out.push({ msg: c.msg, block: c.block }));
    return out;
  };

  // Checagem final antes de copiar / salvar / abrir WhatsApp (retorna '' se ok)
  const validateFinal = (text, ctx = {}) => {
    const t = String(text || '').trim();
    if (!t) return 'A mensagem está vazia.';
    const left = leftoverPlaceholders(t);
    if (left.length) return `A mensagem ainda tem variáveis sem valor: ${left.map((k) => `{{${k}}}`).join(', ')}. Troque por texto ou preencha os dados do lead.`;
    const blocked = checkClaims(t, ctx).filter((c) => c.block);
    if (blocked.length) return `Revise antes de enviar: ${[...new Set(blocked.map((c) => c.msg))].join('; ')}. O CDEV não envia promessas, urgência falsa ou dados sem base.`;
    return '';
  };
  const warnings = (text, ctx = {}) => checkClaims(text, ctx).filter((c) => !c.block).map((c) => c.msg);

  CC.messaging = {
    VARIABLES, VAR_ORDER, STRATEGIES, AUTO_RULES, TONES, SIZES, LEVELS, CTAS, ARGUMENTS, TECHNIQUES, RESEARCH,
    get NICHES() { return niches(); },
    setCategories: (rows) => { OVERRIDE = Array.isArray(rows) ? rows : null; cache = { sig: null, niches: null }; return niches(); },
    refreshCategories: () => { cache = { sig: null, niches: null }; return niches(); },
    nicheKey, detectNiche, buildVars, diagnose, rankArguments, selectArgument, autoLevel, autoStrategy, strategyFits, levelVars,
    renderTemplate, usedVars, missingVars, unknownVars, generate, validateFinal, warnings, checkClaims, derivedReason, getResearch
  };
})();
