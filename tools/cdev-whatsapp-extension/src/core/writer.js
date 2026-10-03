/* CDEV WhatsApp — redação local (sem IA externa).
 * Variáveis, gerador por objetivo/tom/tamanho, reescrita por regras,
 * sugestões de resposta por intenção e montagem de orçamento.
 * Nada aqui envia mensagens: só produz texto para revisão. */
(() => {
  const { util: U } = WAW;

  const pick = (list, seed) => list[Math.abs(seed) % list.length];
  const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
  const greeting = (d = new Date()) => {
    const h = d.getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  };

  /* ---------------- variáveis ---------------- */
  const VARIABLES = {
    nome: "Primeiro nome do contato",
    nomecompleto: "Nome completo",
    empresa: "Empresa do contato",
    cidade: "Cidade",
    segmento: "Segmento",
    telefone: "Telefone",
    saudacao: "Bom dia / Boa tarde / Boa noite",
    meunome: "Seu nome (configurações)",
    minhaempresa: "Sua empresa (configurações)",
    data: "Data de hoje",
    hora: "Hora atual",
  };

  function variableValues(contact) {
    const me = WAW.store?.config?.me || {};
    const now = new Date();
    return {
      nome: firstName(contact?.name),
      nomecompleto: contact?.name || "",
      empresa: contact?.company || "",
      cidade: contact?.city || "",
      segmento: contact?.segment || "",
      telefone: contact?.phone ? U.formatPhone(contact.phone) : "",
      saudacao: greeting(now),
      meunome: me.name || "",
      minhaempresa: me.company || "",
      data: now.toLocaleDateString("pt-BR"),
      hora: U.fmtTime(now.getTime()),
    };
  }

  /** Substitui {{var}}. Retorna {text, missing[]} — variáveis sem valor ficam marcadas. */
  function fillVariables(text, contact, extra = {}) {
    const values = { ...variableValues(contact), ...extra };
    const missing = new Set();
    const out = String(text || "").replace(/\{\{\s*([a-zà-ú_]+)\s*\}\}/gi, (m, raw) => {
      const k = U.norm(raw).replace(/\s+/g, "");
      const v = values[k];
      if (v === undefined) return m;
      if (k in extra) return v;
      if (!v) {
        missing.add(k);
        return `[${k}]`;
      }
      return v;
    });
    return { text: tidy(out), missing: [...missing] };
  }

  /** Limpa artefatos de variáveis vazias: ", !" "da [empresa]" etc. ficam visíveis para revisão. */
  function tidy(t) {
    return t.replace(/ +([,.!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
  }

  /* ---------------- gerador ---------------- */
  const OBJECTIVES = {
    "primeiro-contato": "Primeiro contato",
    "follow-up": "Follow-up",
    cobranca: "Cobrança",
    resposta: "Resposta",
    apresentacao: "Apresentação",
    orcamento: "Orçamento",
    reativacao: "Reativação",
    "pos-venda": "Pós-venda",
  };
  const TONES = {
    amigavel: "Amigável",
    profissional: "Profissional",
    direto: "Direto",
    descontraido: "Descontraído",
    comercial: "Comercial",
  };
  const SIZES = { curta: "Curta", media: "Média", longa: "Longa" };

  const OPENERS = {
    amigavel: ["{{saudacao}}, {{nome}}! Tudo bem?", "Oi, {{nome}}! Tudo certo por aí?", "Olá, {{nome}}! Como você está?"],
    profissional: ["{{saudacao}}, {{nome}}.", "Olá, {{nome}}, tudo bem?", "{{saudacao}}, {{nome}}. Espero que esteja bem."],
    direto: ["{{nome}},", "Oi, {{nome}}.", "{{saudacao}}, {{nome}}."],
    descontraido: ["E aí, {{nome}}! Tudo joia?", "Opa, {{nome}}! Beleza?", "Fala, {{nome}}! Tudo bem?"],
    comercial: ["{{saudacao}}, {{nome}}! Tudo bem?", "Olá, {{nome}}! Tenho uma novidade para você.", "{{saudacao}}, {{nome}}!"],
  };

  const BODIES = {
    "primeiro-contato": [
      "Aqui é {{meunome}}{{minhaempresa_sufixo}}. Conheci o trabalho da {{empresa}} e pensei em uma forma de ajudar a trazer mais clientes.",
      "Meu nome é {{meunome}}. Trabalho ajudando negócios de {{segmento}} a se destacarem na internet e achei que faria sentido conversar com você.",
      "Sou {{meunome}}{{minhaempresa_sufixo}}. Preparei uma ideia rápida pensando na {{empresa}} e gostaria de te mostrar.",
      "Conheci o trabalho da {{empresa}} e tive uma ideia que pode ajudar a atrair mais clientes.",
    ],
    "follow-up": [
      "Passando para saber se você conseguiu ver o que te enviei.",
      "Estou retomando nossa conversa para ver se ficou alguma dúvida.",
      "Queria saber o que você achou da proposta que conversamos.",
    ],
    cobranca: [
      "Estou passando para lembrar do pagamento em aberto.",
      "Notei que o pagamento ainda consta como pendente por aqui.",
      "Queria confirmar a previsão de pagamento da fatura em aberto.",
    ],
    resposta: [
      "Obrigado pela mensagem! Vou verificar e já te retorno.",
      "Entendi perfeitamente. Deixa comigo que eu resolvo isso.",
      "Boa pergunta! Vou te explicar direitinho.",
    ],
    apresentacao: [
      "Sou {{meunome}}{{minhaempresa_sufixo}} e trabalho com soluções para negócios de {{segmento}}.",
      "Quero te apresentar rapidamente como posso ajudar a {{empresa}} a crescer.",
      "Trabalho criando soluções digitais sob medida para empresas como a {{empresa}}.",
    ],
    orcamento: [
      "Conforme conversamos, preparei o orçamento para você.",
      "Segue o orçamento com tudo o que combinamos.",
      "Finalizei o orçamento e já posso te enviar os detalhes.",
    ],
    reativacao: [
      "Faz um tempo que não conversamos e lembrei de você.",
      "Estou retomando alguns contatos e lembrei da nossa conversa.",
      "Tenho novidades que podem interessar a {{empresa}}.",
    ],
    "pos-venda": [
      "Queria saber como está sendo sua experiência até aqui.",
      "Passando para ver se está tudo funcionando como esperado.",
      "Gostaria de saber se ficou satisfeito com a entrega.",
    ],
  };

  const DETAILS = {
    "primeiro-contato": ["Posso te mostrar em 2 minutos, sem compromisso.", "É algo simples e que já funcionou bem para outros negócios parecidos."],
    "follow-up": ["Se preferir, posso te ligar rapidinho para explicar.", "Consigo ajustar o que for preciso para ficar do seu jeito."],
    cobranca: ["Se já realizou o pagamento, pode desconsiderar esta mensagem.", "Se precisar, posso reenviar o boleto ou a chave Pix."],
    resposta: ["Se precisar de mais alguma informação, é só me chamar.", "Fico à disposição para qualquer dúvida."],
    apresentacao: ["Tenho alguns exemplos de trabalhos que posso te mostrar.", "A ideia é facilitar sua rotina e trazer mais resultado."],
    orcamento: ["Qualquer ajuste é só me falar que eu adapto.", "Os valores já incluem tudo o que conversamos."],
    reativacao: ["Tenho condições especiais este mês.", "Se fizer sentido, posso te mostrar o que mudou."],
    "pos-venda": ["Se tiver qualquer sugestão, vou adorar ouvir.", "Estou aqui para o que precisar."],
  };

  const CTAS = {
    amigavel: ["O que acha?", "Posso te mandar mais detalhes?", "Me conta o que achou!"],
    profissional: ["Fico no aguardo do seu retorno.", "Podemos agendar uma conversa?", "Aguardo seu posicionamento."],
    direto: ["Consegue me responder hoje?", "Fechamos?", "Posso seguir?"],
    descontraido: ["Bora?", "Topa dar uma olhada?", "Me fala! 😉"],
    comercial: ["Vamos agendar uma demonstração ainda esta semana?", "Posso reservar essa condição para você?", "Quer que eu envie a proposta agora?"],
  };

  function generate({ objective = "primeiro-contato", tone = "amigavel", size = "media", contact = null, context = "" } = {}) {
    const me = WAW.store?.config?.me || {};
    const extra = { minhaempresa_sufixo: me.company ? `, da ${me.company}` : "" };
    const seedBase = Date.now() % 997;
    const variants = [];
    for (let i = 0; i < 3; i += 1) {
      const seed = seedBase + i * 7;
      const parts = [pick(OPENERS[tone] || OPENERS.amigavel, seed)];
      const bodies = (BODIES[objective] || BODIES.resposta).filter((b) => me.name || !b.includes("{{meunome}}"));
      const body = pick(bodies.length ? bodies : BODIES.resposta, seed + i);
      parts.push(body);
      if (context.trim()) parts.push(context.trim());
      if (size !== "curta") parts.push(pick(DETAILS[objective] || DETAILS.resposta, seed + 1));
      if (size === "longa") {
        const more = (DETAILS[objective] || DETAILS.resposta).filter((d) => !parts.includes(d));
        if (more[0]) parts.push(more[0]);
      }
      parts.push(pick(CTAS[tone] || CTAS.amigavel, seed + 2));
      let raw = size === "curta" ? parts.join(" ") : `${parts[0]}\n\n${parts.slice(1, -1).join(" ")}\n\n${parts[parts.length - 1]}`;
      if (tone === "direto") raw = raw.replace(/\n\n/g, "\n");
      const filled = fillVariables(raw, contact, extra);
      // Remove trechos que ficaram com variáveis vazias de contexto opcional (ex.: "da [empresa]")
      filled.text = filled.text
        .replace(/ (a|da|de|do|em|para|como a) \[(empresa|segmento|cidade)\]/g, "")
        .replace(/, \[nome\]|\[nome\]/g, "");
      variants.push(filled);
    }
    return variants;
  }

  /* ---------------- reescrita ---------------- */
  const REWRITE_STYLES = {
    profissional: "Mais profissional",
    curto: "Mais curto",
    natural: "Mais natural",
    direto: "Mais direto",
    amigavel: "Mais amigável",
    comercial: "Mais comercial",
  };

  const INFORMAL = [
    [/\bvc\b/gi, "você"],
    [/\bvcs\b/gi, "vocês"],
    [/\bpq\b/gi, "porque"],
    [/\btb\b|\btbm\b/gi, "também"],
    [/\bblz\b/gi, "certo"],
    [/\bmsg\b/gi, "mensagem"],
    [/\bqdo\b/gi, "quando"],
    [/\bqto\b/gi, "quanto"],
    [/\bhj\b/gi, "hoje"],
    [/\bamanha\b/gi, "amanhã"],
    [/\bobg\b/gi, "obrigado"],
    [/\bvlw\b/gi, "obrigado"],
    [/\bpfv\b|\bpfvr\b|\bpf\b/gi, "por favor"],
    [/\bmto\b/gi, "muito"],
    [/\bmt\b/gi, "muito"],
    [/\bta\b/gi, "está"],
    [/\bto\b/gi, "estou"],
    [/\bpra\b/gi, "para"],
    [/\bokay\b|\bok\b/gi, "certo"],
    [/\bkkk+\b/gi, ""],
    [/\brs+\b/gi, ""],
  ];
  const FILLERS = /\b(só|apenas|basicamente|realmente|na verdade|tipo assim|meio que|eu acho que|acho que|então|né)\b[,]?\s*/gi;

  const sentences = (t) =>
    String(t)
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ensurePunct = (s) => (/[.!?…]$/.test(s) ? s : `${s}.`);
  const stripEmoji = (s) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?/gu, "").replace(/\s{2,}/g, " ").trim();

  function rewrite(text, style) {
    let t = String(text || "").trim();
    if (!t) return "";
    const clean = (s) => INFORMAL.reduce((acc, [re, rep]) => acc.replace(re, rep), s).replace(/\s{2,}/g, " ").trim();

    switch (style) {
      case "profissional": {
        t = stripEmoji(clean(t)).replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?");
        t = sentences(t).map((s) => ensurePunct(capFirst(s))).join(" ");
        t = t.replace(/^(oi|opa|e aí|fala)[,!]?\s*/i, "Olá, ");
        if (!/(atenciosamente|fico à disposição|no aguardo)/i.test(t)) t += "\n\nFico à disposição.";
        return capFirst(t);
      }
      case "curto": {
        const ss = sentences(clean(t).replace(FILLERS, ""));
        const keep = ss.length <= 2 ? ss : [ss[0], ss.find((s) => /\?$/.test(s)) || ss[ss.length - 1]];
        return [...new Set(keep)].map((s) => capFirst(s)).join(" ");
      }
      case "natural": {
        t = t
          .replace(/\bprezad[oa]\b,?\s*/gi, "Oi, ")
          .replace(/\batenciosamente,?\s*/gi, "")
          .replace(/\bvenho por meio desta\b\s*/gi, "")
          .replace(/\bsolicito\b/gi, "peço")
          .replace(/\bgostaria de informar que\b/gi, "")
          .replace(/\binformo que\b/gi, "")
          .replace(/\bencontro-me\b/gi, "estou")
          .replace(/\bpermaneço à disposição\b/gi, "qualquer coisa me chama");
        return sentences(t).map((s) => capFirst(s)).join(" ");
      }
      case "direto": {
        const ss = sentences(clean(t).replace(FILLERS, "")).filter(
          (s) => !/^(tudo bem|como vai|espero que esteja bem|oi|olá|bom dia|boa tarde|boa noite)[,.!?]*$/i.test(s),
        );
        return ss.map((s) => capFirst(s.replace(/^(então|bom|enfim)[,]?\s*/i, ""))).join(" ");
      }
      case "amigavel": {
        t = clean(t);
        const hasGreeting = /^(oi|olá|bom dia|boa tarde|boa noite|e aí)/i.test(t);
        const out = `${hasGreeting ? "" : "Oi! "}${t}`.replace(/\.$/, "!");
        return /😊|🙂|🙌/.test(out) ? out : `${out} 😊`;
      }
      case "comercial": {
        t = clean(t);
        const ss = sentences(t).map((s) => ensurePunct(capFirst(s)));
        const hasCta = /\?$/.test(ss[ss.length - 1] || "");
        if (!hasCta) ss.push("Posso te enviar a proposta agora para garantirmos essa condição?");
        return ss.join(" ");
      }
      default:
        return t;
    }
  }

  /* ---------------- sugestões de resposta ---------------- */
  const INTENTS = [
    { id: "preco", re: /(quanto|valor|preço|preco|custa|orçamento|orcamento|investimento|tabela)/i },
    { id: "prazo", re: /(prazo|quando fica|quanto tempo|demora|entrega|dias)/i },
    { id: "pagamento", re: /(pix|boleto|pagamento|pagar|paguei|comprovante|parcel|cartão|cartao)/i },
    { id: "agenda", re: /(reuni|agendar|horário|horario|ligar|call|conversar amanhã|disponível|disponivel)/i },
    { id: "reclamacao", re: /(problema|erro|não funciona|nao funciona|parou|reclama|insatisfeit|demorando|bug)/i },
    { id: "agradecimento", re: /(obrigad|valeu|agradeço|agradeco|show|perfeito|top)/i },
    { id: "pensar", re: /(vou pensar|vou ver|depois te falo|te retorno|analisar|ver com)/i },
    { id: "interesse", re: /(tenho interesse|quero|gostei|me interessa|pode mandar|manda|como funciona)/i },
    { id: "saudacao", re: /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|opa)\b/i },
  ];

  const REPLIES = {
    preco: [
      "{{saudacao}}, {{nome}}! O valor depende de alguns detalhes. Posso te fazer 2 perguntas rápidas para montar o orçamento certinho?",
      "Oi, {{nome}}! Te passo sim. Para eu montar a proposta ideal, me conta rapidinho o que você precisa?",
      "Claro, {{nome}}! Tenho opções a partir de valores bem acessíveis. Quer que eu te envie as opções agora?",
    ],
    prazo: [
      "Oi, {{nome}}! O prazo médio é de alguns dias úteis após a aprovação. Te passo a data exata assim que fecharmos os detalhes.",
      "{{nome}}, consigo te entregar rapidinho. Posso confirmar a data certinha e te retorno ainda hoje?",
      "Boa pergunta! Depende do escopo, mas normalmente é bem ágil. Quer que eu monte um cronograma?",
    ],
    pagamento: [
      "Perfeito, {{nome}}! Assim que confirmar por aqui eu te aviso. Obrigado!",
      "Oi, {{nome}}! Aceito Pix, boleto e cartão. Qual fica melhor para você?",
      "Obrigado, {{nome}}! Vou verificar o pagamento e te confirmo em instantes.",
    ],
    agenda: [
      "Claro, {{nome}}! Qual horário fica melhor para você?",
      "Pode ser! Tenho disponibilidade amanhã pela manhã ou à tarde. O que prefere?",
      "Combinado, {{nome}}! Me passa um horário e eu já reservo aqui.",
    ],
    reclamacao: [
      "Poxa, {{nome}}, sinto muito pelo transtorno. Já estou verificando e te retorno o quanto antes.",
      "Entendi, {{nome}}. Pode me mandar um print ou mais detalhes para eu resolver mais rápido?",
      "Obrigado por avisar, {{nome}}. Vou priorizar isso agora e te mantenho informado.",
    ],
    agradecimento: [
      "Eu que agradeço, {{nome}}! Qualquer coisa estou por aqui.",
      "Por nada, {{nome}}! Foi um prazer. 😊",
      "Imagina, {{nome}}! Conte comigo sempre.",
    ],
    pensar: [
      "Claro, {{nome}}, sem pressa! Posso te chamar em alguns dias para ver o que achou?",
      "Tranquilo, {{nome}}! Se surgir alguma dúvida enquanto analisa, é só me chamar.",
      "Fica à vontade, {{nome}}. Quer que eu te envie um resumo para facilitar a decisão?",
    ],
    interesse: [
      "Que ótimo, {{nome}}! Vou te explicar como funciona e já te mando os detalhes.",
      "Show, {{nome}}! Posso te enviar uma demonstração agora?",
      "Perfeito! Me conta um pouco mais sobre o que você precisa para eu te passar a melhor opção.",
    ],
    saudacao: [
      "{{saudacao}}, {{nome}}! Tudo bem? Como posso te ajudar?",
      "Oi, {{nome}}! Tudo ótimo por aqui. Em que posso ajudar?",
      "Olá, {{nome}}! Que bom falar com você. Me conta!",
    ],
    geral: [
      "Entendi, {{nome}}! Vou verificar e já te retorno.",
      "Perfeito, {{nome}}. Obrigado por me avisar!",
      "Certo, {{nome}}! Me dá só um minutinho que eu te respondo com calma.",
    ],
  };

  /** Usa apenas o texto fornecido pelo usuário (selecionado ou colado). */
  function suggestReplies(incoming, contact) {
    const text = String(incoming || "");
    const hits = INTENTS.filter((i) => i.re.test(text)).map((i) => i.id);
    const primary = hits.find((h) => h !== "saudacao") || hits[0] || "geral";
    const pool = [...REPLIES[primary]];
    // Se houver uma segunda intenção, troca a última sugestão por ela.
    const secondary = hits.find((h) => h !== primary && h !== "saudacao");
    if (secondary) pool[2] = REPLIES[secondary][0];
    return {
      intent: primary,
      intents: hits,
      replies: pool.slice(0, 3).map((r) => fillVariables(r, contact).text.replace(/, \[nome\]/g, "").replace(/\[nome\]/g, "")),
    };
  }

  /* ---------------- orçamento ---------------- */
  function buildQuote(items, contact, { intro = "", outro = "" } = {}) {
    const lines = items.map((i) => `• ${i.name}${i.qty > 1 ? ` (x${i.qty})` : ""}: ${U.money(i.price * (i.qty || 1))}`);
    const total = items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0);
    const hello = contact?.name ? `Olá, ${firstName(contact.name)}!` : "Olá!";
    return [
      hello,
      "",
      intro || "Segue a proposta:",
      "",
      ...lines,
      "",
      `*Total: ${U.money(total)}*`,
      ...(outro ? ["", outro] : ["", "Qualquer dúvida estou à disposição."]),
    ].join("\n");
  }

  WAW.writer = {
    VARIABLES,
    OBJECTIVES,
    TONES,
    SIZES,
    REWRITE_STYLES,
    fillVariables,
    variableValues,
    generate,
    rewrite,
    suggestReplies,
    buildQuote,
    greeting,
    firstName,
  };
})();
