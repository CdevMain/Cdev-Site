#!/usr/bin/env python3
"""Gera os SQLs de templates do Site Factory a partir das definicoes abaixo.

Rode a partir da raiz do repo:  python3 tools/gen_templates.py
  -> supabase/08_control_center_templates.sql   (instalacao nova: insere, nao sobrescreve)
  -> supabase/11_templates_v2.sql               (atualiza os templates ja existentes para a v2)

Fotos: banco gratuito do Unsplash (licenca Unsplash: uso comercial livre, sem atribuicao obrigatoria).
Todas as URLs foram conferidas. O motor (site-engine.js) ajusta tamanho/qualidade automaticamente.
Para o site final do cliente, troque pelas fotos reais dele no editor do Control Center.
"""
import json, os

def U(photo_id):
    return f"https://images.unsplash.com/photo-{photo_id}"

# Retratos usados como avatar nos depoimentos (w = mulher, m = homem)
PW = [U("1494790108377-be9c29b29330"), U("1438761681033-6461ffad8d80"), U("1544005313-94ddf0286df2")]
PM = [U("1507003211169-0a1dd7228f2d"), U("1500648767791-00dcc994a43e"), U("1472099645785-5658abf4ff4e")]

SECTIONS = ['hero', 'about', 'services', 'gallery', 'testimonials', 'faq', 'cta', 'contact', 'location']

def theme(preset, mode, primary, accent, bg, surface, text, muted, heading, body, radius="12px"):
    return {"preset": preset, "mode": mode,
            "colors": {"primary": primary, "accent": accent, "bg": bg, "surface": surface, "text": text, "muted": muted},
            "fonts": {"heading": heading, "body": body}, "radius": radius}

def stats(*pairs):
    return [{"value": v, "label": l} for v, l in pairs]

def T(key, name, segment, desc, th, brand, *, hero, about, services, gallery, testimonials, faq, cta,
      hours=None, order=None, topbar=False, header_cta="Fale conosco", contact_text="Estamos prontos para atender você.",
      form_title="Envie sua mensagem"):
    hours = hours or [{"label": "Seg a Sex", "value": "09:00 - 18:00"}, {"label": "Sábado", "value": "09:00 - 13:00"}]
    order = order or SECTIONS
    data = {
        "hero": {"variant": hero.get("variant", "split"), "eyebrow": hero.get("eyebrow", segment), "title": hero["title"], "subtitle": hero["subtitle"],
                 "image": hero["image"], "buttonText": hero["button"], "buttonUrl": hero.get("buttonUrl", "whatsapp"),
                 "secondaryText": hero.get("secondary", "Ver serviços"), "secondaryUrl": "#servicos",
                 "stats": hero.get("stats", []), **({"badge": hero["badge"]} if hero.get("badge") else {})},
        "about": {"variant": about.get("variant", "image-left"), "eyebrow": about.get("eyebrow", ""), "title": about["title"], "text": about["text"],
                  "image": about["image"], "image2": about.get("image2", ""), "highlights": about["highlights"], "stats": about.get("stats", []),
                  **({"badge": about["badge"]} if about.get("badge") else {})},
        "services": {"variant": services.get("variant", "cards"), "title": services.get("title", "Serviços"), "subtitle": services.get("subtitle", "O que fazemos por você"),
                     "items": [{"name": i[0], "description": i[1], "price": i[2], "image": i[3] if len(i) > 3 else ""} for i in services["items"]]},
        "gallery": {"variant": gallery.get("variant", "grid"), "title": gallery.get("title", "Galeria"), "subtitle": gallery.get("subtitle", ""),
                    "images": [{"src": s, "alt": a} for s, a in gallery["images"]]},
        "testimonials": {"title": testimonials.get("title", "O que dizem nossos clientes"), "rating": testimonials.get("rating", ""),
                         "items": [{"name": n, "text": t, "role": r, "photo": p} for n, t, r, p in testimonials["items"]]},
        "faq": {"title": "Perguntas frequentes", "items": [{"q": q, "a": a} for q, a in faq]},
        "cta": {"eyebrow": cta.get("eyebrow", ""), "title": cta["title"], "text": cta.get("text", "Fale com a gente agora mesmo pelo WhatsApp."),
                "image": cta.get("image", ""), "buttonText": cta["button"], "buttonUrl": "whatsapp"},
        "contact": {"title": "Contato", "text": contact_text, "formTitle": form_title},
        "location": {"title": "Onde estamos", "text": ""},
    }
    content = {
        "brand": {"name": brand, "tagline": desc, "logo": ""},
        "contact": {"phone": "(51) 99999-0000", "whatsapp": "5551999990000", "email": "contato@exemplo.com.br",
                    "address": "Rua Exemplo, 123 - Centro", "city": "Guaíba - RS", "mapsQuery": "",
                    "hours": hours, "instagram": "@" + key.replace("-", ""), "facebook": ""},
        "settings": {"whatsappFloat": True, "topbar": topbar, "headerCta": header_cta},
        "seo": {"title": f"{brand} | {segment} em Guaíba", "description": desc},
        "sections": [{"id": s, "type": s, "enabled": True, "data": data[s]} for s in order],
    }
    return dict(key=key, name=name, segment=segment, description=desc, sections=order, theme=th, content=content)

TPLS = [
  # ------------------------------------------------------------------ Barbearia
  T("barber-modern", "Barber Modern", "Barbearia", "Corte, barba e estilo com hora marcada.",
    theme("dark-gold", "dark", "#c9a14a", "#e8c776", "#0d0d0f", "#17171b", "#f3efe6", "#9a9387", "Oswald", "Inter", "4px"),
    "Barbearia Alpha", header_cta="Agendar",
    hero=dict(variant="overlay", eyebrow="Barbearia · desde 2014", title="Estilo e tradição em cada corte",
              subtitle="Cortes clássicos e modernos, barba na toalha quente e um ambiente feito para você relaxar.",
              image=U("1585747860715-2ba37e788b70"), button="Agendar horário", secondary="Ver preços",
              stats=stats(("10+", "anos de experiência"), ("4,9★", "avaliação no Google"), ("15 mil", "cortes realizados"))),
    about=dict(eyebrow="A barbearia", title="Mais que um corte, um ritual",
               text="Há mais de 10 anos cuidando do visual dos nossos clientes com técnica, atenção aos detalhes e aquele café passado na hora.\n\nAqui você agenda, chega e é atendido sem espera.",
               image=U("1605497788044-5a32c7078486"), image2=U("1621605815971-fbc98d665033"),
               highlights=["Barbeiros experientes", "Ambiente climatizado com Wi-Fi", "Hora marcada, sem espera"],
               badge={"value": "10+", "label": "anos de tradição"}),
    services=dict(variant="menu", title="Tabela de preços", subtitle="Valores claros, sem surpresa",
                  items=[("Corte", "Tesoura ou máquina, finalizado com pomada.", "R$ 45"), ("Barba", "Toalha quente, navalha e balm.", "R$ 35"),
                         ("Corte + Barba", "O combo completo com desconto.", "R$ 70"), ("Pigmentação", "Acabamento natural para barba e cabelo.", "R$ 30"),
                         ("Sobrancelha", "Na navalha ou pinça.", "R$ 15"), ("Corte infantil", "Até 12 anos.", "R$ 35")]),
    gallery=dict(variant="mosaic", title="Nosso trabalho", subtitle="Alguns cortes e o clima da casa",
                 images=[(U("1503951914875-452162b0f3f1"), "Barba na toalha quente"), (U("1599351431202-1e0f0137899a"), "Degradê com risco"),
                         (U("1622286342621-4bd786c2447c"), "Corte na tesoura"), (U("1512690459411-b9245aed614b"), "Nossa cadeira clássica"),
                         (U("1621605815971-fbc98d665033"), "Ferramentas profissionais"), (U("1605497788044-5a32c7078486"), "Finalização")]),
    testimonials=dict(rating="4,9 no Google", items=[
        ("Rafael Lima", "Melhor barbearia da cidade. Pontualidade no horário e o degradê fica perfeito toda vez.", "Cliente há 3 anos", PM[0]),
        ("Diego Martins", "Ambiente top, atendimento atencioso e a barba na toalha quente é outro nível.", "Google", PM[1]),
        ("Carlos Andrade", "Levo meu filho junto e os dois saem satisfeitos. Recomendo demais.", "Instagram", PM[2])]),
    faq=[("Precisa agendar?", "Recomendamos agendar pelo WhatsApp para garantir seu horário, mas encaixamos quando há vaga."),
         ("Quais formas de pagamento?", "Pix, cartão de débito e crédito."), ("Tem estacionamento?", "Sim, vagas na rua em frente e estacionamento conveniado a 50 m.")],
    cta=dict(eyebrow="Horários disputados", title="Garanta seu horário ainda hoje", image=U("1503951914875-452162b0f3f1"), button="Agendar pelo WhatsApp"),
    hours=[{"label": "Ter a Sex", "value": "09:00 - 20:00"}, {"label": "Sábado", "value": "08:00 - 18:00"}]),

  # ------------------------------------------------------------------ Restaurante
  T("restaurant-flavor", "Restaurante Sabor", "Restaurante", "Comida caseira feita com ingredientes frescos.",
    theme("warm-terracotta", "light", "#b5452b", "#e0892f", "#fbf6ef", "#ffffff", "#2a1f1a", "#7a6a60", "Playfair Display", "Inter"),
    "Restaurante Sabor", header_cta="Reservar", topbar=True,
    hero=dict(variant="center", eyebrow="Cozinha de família", title="Sabor de comida feita em casa",
              subtitle="Almoço executivo, pratos à la carte e sobremesas artesanais todos os dias.",
              image=U("1414235077428-338989a2e8c0"), button="Reservar mesa", secondary="Ver cardápio"),
    about=dict(variant="image-right", eyebrow="Nossa história", title="Receitas de família, servidas com carinho",
               text="Começamos em uma pequena cozinha em 2009. Hoje seguimos com as mesmas receitas, ingredientes de produtores locais e o tempero que fez a casa ficar conhecida.",
               image=U("1555396273-367ea4eb4db5"), image2=U("1504674900247-0877df9cc836"),
               highlights=["Ingredientes de produtores locais", "Opções vegetarianas e sem glúten", "Delivery em toda a região"],
               stats=stats(("15", "anos de casa"), ("120", "lugares"), ("4,8★", "no Google"))),
    services=dict(variant="menu", title="Cardápio", subtitle="Destaques da casa",
                  items=[("Salada da estação", "Folhas, grãos, castanhas e molho de mel e mostarda.", "R$ 34", U("1540189549336-e6e99c3679fe")),
                         ("Pizza artesanal", "Massa de fermentação natural, forno a lenha.", "R$ 59", U("1565299624946-b28f40a0ae38")),
                         ("Bowl do chef", "Salmão, arroz, legumes frescos e gergelim.", "R$ 48", U("1546069901-ba9599a7e63c")),
                         ("Almoço executivo", "Prato do dia com salada e sobremesa.", "R$ 32", U("1504674900247-0877df9cc836"))]),
    gallery=dict(variant="grid", title="O ambiente", subtitle="Venha nos visitar",
                 images=[(U("1517248135467-4c7edcad34c4"), "Salão principal"), (U("1559339352-11d035aa65de"), "Terraço"),
                         (U("1414235077428-338989a2e8c0"), "Pratos autorais"), (U("1504674900247-0877df9cc836"), "Para compartilhar"),
                         (U("1555396273-367ea4eb4db5"), "Jantar"), (U("1540189549336-e6e99c3679fe"), "Opções leves")]),
    testimonials=dict(rating="4,8 no Google", items=[
        ("Fernanda Rocha", "Comida com gosto de casa de vó. O almoço executivo é farto e muito bem servido.", "Google", PW[0]),
        ("Marcos Vieira", "Fizemos a confraternização da empresa aqui e foi impecável do início ao fim.", "Evento corporativo", PM[1]),
        ("Juliana Prado", "A pizza de fermentação natural é a melhor da região. Voltamos toda semana.", "iFood", PW[1])]),
    faq=[("Vocês fazem delivery?", "Sim, pelo WhatsApp e pelos principais aplicativos."), ("Aceitam reservas?", "Sim, reserve pelo WhatsApp com o número de pessoas e horário."),
         ("Têm opções vegetarianas?", "Sim, temos pratos vegetarianos e sem glúten sinalizados no cardápio."), ("Fazem eventos?", "Montamos cardápios para grupos a partir de 15 pessoas.")],
    cta=dict(eyebrow="Mesas limitadas", title="Bateu a fome?", text="Reserve sua mesa ou peça no conforto de casa.", image=U("1517248135467-4c7edcad34c4"), button="Pedir pelo WhatsApp"),
    hours=[{"label": "Seg a Sáb", "value": "11:00 - 15:00"}, {"label": "Qui a Sáb", "value": "19:00 - 23:00"}]),

  # ------------------------------------------------------------------ Clinica
  T("clinic-care", "Clínica Vida", "Clínica", "Saúde e bem-estar com atendimento humanizado.",
    theme("clean-teal", "light", "#0f8b8d", "#43b3ae", "#f5fafa", "#ffffff", "#123033", "#5b7477", "Poppins", "Inter"),
    "Clínica Vida", header_cta="Agendar consulta", topbar=True,
    hero=dict(variant="split", eyebrow="Clínica multidisciplinar", title="Cuidado de verdade com a sua saúde",
              subtitle="Equipe multidisciplinar, estrutura moderna e atendimento humanizado, com consultas no mesmo dia.",
              image=U("1631217868264-e5b90bb7e133"), button="Agendar consulta", secondary="Especialidades",
              stats=stats(("12", "especialidades"), ("20 mil+", "pacientes atendidos"), ("98%", "recomendam")),
              badge={"value": "4,9", "label": "avaliação dos pacientes", "stars": 5}),
    about=dict(eyebrow="Sobre a clínica", title="Estrutura moderna e atendimento acolhedor",
               text="Nosso compromisso é oferecer um atendimento pontual, com escuta atenta e tecnologia a serviço do paciente. Trabalhamos com convênios e atendimento particular.",
               image=U("1519494026892-80bbd2d6fd0d"), image2=U("1576091160550-2173dba999ef"),
               highlights=["Convênios e particular", "Estacionamento próprio", "Acessibilidade total"],
               badge={"value": "15", "label": "anos cuidando de você"}),
    services=dict(variant="cards", title="Especialidades", subtitle="Cuidado completo em um só lugar",
                  items=[("Clínica geral", "Consultas, check-ups e acompanhamento.", "", U("1576091160399-112ba8d25d1d")),
                         ("Odontologia", "Prevenção, estética e implantes.", "", U("1629909613654-28e377c37b09")),
                         ("Exames", "Coleta no local e laudos rápidos.", "", U("1576091160550-2173dba999ef")),
                         ("Check-up completo", "Avaliação anual com vários especialistas.", "", U("1538108149393-fbbd81895907"))]),
    gallery=dict(variant="grid", title="Nossa estrutura",
                 images=[(U("1519494026892-80bbd2d6fd0d"), "Recepção"), (U("1629909613654-28e377c37b09"), "Consultório odontológico"),
                         (U("1538108149393-fbbd81895907"), "Sala de procedimentos"), (U("1631217868264-e5b90bb7e133"), "Atendimento humanizado")]),
    testimonials=dict(rating="4,9 no Google", items=[
        ("Patrícia Gomes", "Fui atendida no horário, com muita atenção. Explicaram tudo com calma.", "Paciente", PW[2]),
        ("Roberto Nunes", "Fiz meu check-up completo em uma manhã só. Organização excelente.", "Google", PM[2]),
        ("Aline Costa", "Levo meus filhos desde pequenos. Equipe acolhedora e muito competente.", "Paciente", PW[0])]),
    faq=[("Atendem convênio?", "Sim. Consulte a lista de convênios pelo WhatsApp."), ("Como agendar?", "Pelo WhatsApp, telefone ou pessoalmente na recepção."),
         ("Tem consulta no mesmo dia?", "Temos horários de encaixe diariamente para clínica geral.")],
    cta=dict(title="Agende sua consulta", text="Resposta rápida pelo WhatsApp em horário comercial.", button="Falar com a recepção"),
    contact_text="Nossa recepção responde rapidamente.", form_title="Solicitar agendamento"),

  # ------------------------------------------------------------------ Advocacia
  T("law-office", "Advocacia Premium", "Advocacia", "Atuação jurídica estratégica e próxima do cliente.",
    theme("navy-classic", "dark", "#b8975a", "#d8bd86", "#0e1624", "#162235", "#eef1f6", "#98a3b5", "Cormorant Garamond", "Inter", "2px"),
    "Silva Advocacia", header_cta="Consulta",
    hero=dict(variant="overlay", eyebrow="Advocacia · OAB/RS", title="Seus direitos em boas mãos",
              subtitle="Consultoria e atuação em direito civil, trabalhista, família e empresarial, com atendimento presencial e online.",
              image=U("1505664194779-8beaceb93744"), button="Agendar atendimento", secondary="Áreas de atuação",
              stats=stats(("20+", "anos de atuação"), ("1.500", "casos conduzidos"), ("100%", "atendimento online"))),
    about=dict(eyebrow="O escritório", title="Estratégia, clareza e proximidade",
               text="Cada caso é conduzido pessoalmente por um advogado sócio. Explicamos cada etapa em linguagem simples e mantemos você informado do começo ao fim.",
               image=U("1507679799987-c73779587ccf"), image2=U("1589829545856-d10d557cf95f"),
               highlights=["Atendimento online em todo o Brasil", "Sigilo absoluto", "Honorários transparentes"]),
    services=dict(variant="features", title="Áreas de atuação", subtitle="Soluções jurídicas para pessoas e empresas",
                  items=[("Direito civil", "Contratos, indenizações, cobranças e responsabilidade civil.", ""),
                         ("Direito trabalhista", "Defesa de empregados e empresas, cálculos e acordos.", ""),
                         ("Família e sucessões", "Divórcio, guarda, pensão, inventário e planejamento sucessório.", ""),
                         ("Empresarial", "Consultoria preventiva, contratos societários e compliance.", ""),
                         ("Imobiliário", "Compra e venda, usucapião e regularização.", ""),
                         ("Consumidor", "Defesa contra cobranças e práticas abusivas.", "")]),
    gallery=dict(variant="grid", title="O escritório",
                 images=[(U("1497366216548-37526070297c"), "Recepção"), (U("1505664194779-8beaceb93744"), "Biblioteca"),
                         (U("1450101499163-c8848c66ca85"), "Contratos"), (U("1589829545856-d10d557cf95f"), "Justiça")]),
    testimonials=dict(items=[
        ("Ana Beatriz", "Resolveram meu inventário com agilidade e sempre me mantiveram informada.", "Família e sucessões", PW[1]),
        ("Ricardo Alves", "Assessoria jurídica da minha empresa há 5 anos. Confiança total.", "Empresarial", PM[0]),
        ("Luciana Freitas", "Atendimento humano e muito claro. Me senti segura em todo o processo.", "Trabalhista", PW[2])]),
    faq=[("A primeira consulta é paga?", "Entre em contato para conhecer as condições da consulta inicial."),
         ("Atendem online?", "Sim, por videochamada, com assinatura digital de documentos."),
         ("Quanto tempo leva um processo?", "Depende do caso. Na consulta explicamos prazos realistas e alternativas de acordo.")],
    cta=dict(eyebrow="Orientação jurídica", title="Precisa de orientação jurídica?", text="Converse com um advogado e entenda seus direitos.",
             image=U("1450101499163-c8848c66ca85"), button="Falar com um advogado"),
    form_title="Descreva brevemente seu caso"),

  # ------------------------------------------------------------------ Imobiliaria
  T("real-estate", "Imobiliária Prime", "Imobiliária", "Compra, venda e locação de imóveis.",
    theme("urban-blue", "light", "#1f5fbf", "#f2a900", "#f6f8fb", "#ffffff", "#15213a", "#5d6b84", "Montserrat", "Inter"),
    "Prime Imóveis", header_cta="Falar com corretor",
    hero=dict(variant="overlay", eyebrow="Imobiliária · CRECI 00000-J", title="Encontre o imóvel ideal para sua família",
              subtitle="Casas, apartamentos e terrenos para comprar ou alugar, com assessoria completa até a entrega das chaves.",
              image=U("1600596542815-ffad4c1539a9"), button="Falar com corretor", secondary="Ver imóveis",
              stats=stats(("350+", "imóveis vendidos"), ("R$ 0", "para avaliar seu imóvel"), ("48h", "para anunciar"))),
    about=dict(eyebrow="Sobre nós", title="Negócio seguro do começo ao fim",
               text="Corretores credenciados, avaliação gratuita, fotos profissionais e acompanhamento jurídico em cada etapa da negociação.",
               image=U("1560518883-ce09059eeffa"), image2=U("1502672260266-1c1ef2d93688"),
               highlights=["Avaliação gratuita", "Simulação de financiamento", "Documentação completa"],
               badge={"value": "12", "label": "anos no mercado"}),
    services=dict(variant="cards", title="Como podemos ajudar", subtitle="Soluções para quem compra, vende ou aluga",
                  items=[("Venda", "Anúncio com fotos profissionais e divulgação nos maiores portais.", "", U("1600585154340-be6161a56a0c")),
                         ("Locação", "Administração completa, com garantia de aluguel.", "", U("1502672260266-1c1ef2d93688")),
                         ("Avaliação", "Laudo de valor de mercado sem custo.", "", U("1512917774080-9991f1c4c750")),
                         ("Financiamento", "Simulação nos principais bancos e assessoria.", "", U("1600607687939-ce8a6c25118c"))]),
    gallery=dict(variant="mosaic", title="Imóveis em destaque", subtitle="Uma seleção do nosso portfólio",
                 images=[(U("1600596542815-ffad4c1539a9"), "Casa com piscina · 4 suítes"), (U("1600585154340-be6161a56a0c"), "Casa contemporânea · 3 quartos"),
                         (U("1512917774080-9991f1c4c750"), "Sobrado em condomínio"), (U("1502672260266-1c1ef2d93688"), "Apartamento decorado"),
                         (U("1564013799919-ab600027ffc6"), "Casa com área gourmet"), (U("1600607687939-ce8a6c25118c"), "Living integrado")]),
    testimonials=dict(rating="4,9 no Google", items=[
        ("Camila e André", "Encontraram exatamente o que procurávamos e cuidaram de toda a papelada.", "Compraram a casa própria", PW[0]),
        ("Sérgio Tavares", "Vendi meu apartamento em 40 dias com um preço justo. Muito profissionais.", "Proprietário", PM[2]),
        ("Beatriz Lopes", "A administração do aluguel é impecável. Nunca tive dor de cabeça.", "Locadora", PW[1])]),
    faq=[("Quanto custa anunciar?", "O anúncio é gratuito; a comissão só é cobrada na venda ou locação."),
         ("Vocês fazem avaliação?", "Sim, gratuitamente e sem compromisso."), ("Ajudam no financiamento?", "Sim, simulamos e acompanhamos todo o processo no banco.")],
    cta=dict(eyebrow="Avaliação gratuita", title="Quer vender ou alugar seu imóvel?", text="Descubra quanto vale seu imóvel em até 48 horas.",
             image=U("1564013799919-ab600027ffc6"), button="Chamar no WhatsApp"),
    form_title="Conte o que você procura"),

  # ------------------------------------------------------------------ Oficina
  T("auto-garage", "Oficina Pro", "Oficina", "Mecânica automotiva com transparência.",
    theme("garage-red", "dark", "#e03a2f", "#ffb627", "#101214", "#1a1d21", "#f1f1f1", "#9aa0a6", "Barlow Condensed", "Inter", "6px"),
    "Oficina Pro", header_cta="Orçamento",
    hero=dict(variant="overlay", eyebrow="Mecânica automotiva", title="Seu carro em boas mãos",
              subtitle="Revisão, suspensão, freios e injeção eletrônica com orçamento sem compromisso e garantia em todos os serviços.",
              image=U("1530046339160-ce3e530c7d2f"), button="Pedir orçamento", secondary="Serviços",
              stats=stats(("90 dias", "de garantia"), ("8.000+", "carros atendidos"), ("24h", "para orçamento"))),
    about=dict(eyebrow="A oficina", title="Transparência em cada serviço",
               text="Mostramos a peça trocada, explicamos o problema e só executamos depois da sua aprovação. Equipe treinada e equipamentos de diagnóstico atualizados.",
               image=U("1619642751034-765dfdf7c58e"), image2=U("1486262715619-67b85e0b08d3"),
               highlights=["Garantia de 90 dias", "Orçamento pelo WhatsApp com fotos", "Leva e traz na região"],
               badge={"value": "18", "label": "anos de oficina"}),
    services=dict(variant="cards", title="Serviços", subtitle="Tudo para seu carro rodar tranquilo",
                  items=[("Revisão completa", "Óleo, filtros e checklist de 40 itens.", "a partir de R$ 189", U("1625047509248-ec889cbff17f")),
                         ("Freios", "Pastilhas, discos e fluido.", "", U("1487754180451-c456f719a1fc")),
                         ("Suspensão", "Amortecedores, alinhamento e balanceamento.", "", U("1486262715619-67b85e0b08d3")),
                         ("Injeção eletrônica", "Diagnóstico com scanner e limpeza de bicos.", "", U("1492144534655-ae79c964c9d7"))]),
    gallery=dict(variant="grid", title="A oficina por dentro",
                 images=[(U("1530046339160-ce3e530c7d2f"), "Box de serviço"), (U("1487754180451-c456f719a1fc"), "Freios"),
                         (U("1619642751034-765dfdf7c58e"), "Mecânicos certificados"), (U("1625047509248-ec889cbff17f"), "Motor"),
                         (U("1486262715619-67b85e0b08d3"), "Peças de qualidade"), (U("1492144534655-ae79c964c9d7"), "Pronto para entrega")]),
    testimonials=dict(rating="4,8 no Google", items=[
        ("Eduardo Pires", "Mandaram foto de cada peça pelo WhatsApp antes de trocar. Confiança total.", "Google", PM[0]),
        ("Renata Dias", "Orçamento justo e carro entregue no prazo. Virei cliente.", "Cliente", PW[2]),
        ("Paulo Henrique", "Resolveram um problema de injeção que outras duas oficinas não acharam.", "Google", PM[1])]),
    faq=[("Fazem orçamento grátis?", "Sim, sem compromisso. Envie fotos ou traga o carro."),
         ("Tem garantia?", "Todos os serviços têm garantia de 90 dias."), ("Atendem todas as marcas?", "Sim, nacionais e importados.")],
    cta=dict(eyebrow="Diagnóstico rápido", title="Barulho estranho no carro?", text="Mande um áudio ou vídeo pelo WhatsApp e receba uma orientação.",
             image=U("1492144534655-ae79c964c9d7"), button="Pedir orçamento"),
    hours=[{"label": "Seg a Sex", "value": "08:00 - 18:00"}, {"label": "Sábado", "value": "08:00 - 12:00"}]),

  # ------------------------------------------------------------------ Salao
  T("beauty-salon", "Salão Bella", "Salão de beleza", "Cabelo, unhas e estética.",
    theme("rose-nude", "light", "#c2587a", "#e8a0b4", "#fdf7f8", "#ffffff", "#3a2430", "#8a6f7a", "Playfair Display", "Inter", "18px"),
    "Studio Bella", header_cta="Agendar",
    hero=dict(variant="split", eyebrow="Studio de beleza", title="Realce a sua beleza natural",
              subtitle="Cortes, coloração, escova, manicure e tratamentos com produtos profissionais e muito carinho.",
              image=U("1522337360788-8b13dee7a37e"), button="Agendar horário", secondary="Serviços",
              badge={"value": "4,9", "label": "+300 avaliações", "stars": 5}),
    about=dict(eyebrow="O studio", title="Um espaço feito para você",
               text="Profissionais apaixonadas pelo que fazem, ambiente acolhedor e produtos de marcas profissionais. Aqui cada atendimento é personalizado.",
               image=U("1560066984-138dadb4c035"), image2=U("1516975080664-ed2fc6a32937"),
               highlights=["Produtos profissionais", "Ambiente aconchegante", "Hora marcada, sem espera"],
               stats=stats(("8", "profissionais"), ("5 mil+", "clientes atendidas"))),
    services=dict(variant="cards", title="Serviços", subtitle="Do cabelo às unhas",
                  items=[("Corte e escova", "Corte personalizado com finalização.", "R$ 80", U("1562322140-8baeececf3df")),
                         ("Coloração", "Tintura, mechas e luzes.", "Sob avaliação", U("1522337360788-8b13dee7a37e")),
                         ("Manicure e pedicure", "Esmaltação tradicional ou em gel.", "R$ 45", U("1604654894610-df63bc536371")),
                         ("Maquiagem", "Social, festas e noivas.", "R$ 120", U("1487412947147-5cebf100ffc2"))]),
    gallery=dict(variant="masonry", title="Nosso trabalho", subtitle="Resultados reais das nossas clientes",
                 images=[(U("1522337360788-8b13dee7a37e"), "Cabelo"), (U("1604654894610-df63bc536371"), "Unhas"),
                         (U("1487412947147-5cebf100ffc2"), "Maquiagem"), (U("1560066984-138dadb4c035"), "O studio"),
                         (U("1562322140-8baeececf3df"), "Escova"), (U("1516975080664-ed2fc6a32937"), "Produtos profissionais")]),
    testimonials=dict(rating="4,9 no Google", items=[
        ("Mariana Souza", "Saí apaixonada pela cor! Me explicaram todo o cuidado para manter.", "Coloração", PW[0]),
        ("Carla Menezes", "Ambiente lindo, café delicioso e manicure caprichada. Meu cantinho preferido.", "Google", PW[1]),
        ("Letícia Ramos", "Fiz a maquiagem do meu casamento aqui e durou a festa inteira.", "Noiva", PW[2])]),
    faq=[("Precisa agendar?", "Sim, pelo WhatsApp ou Instagram."), ("Atendem noivas?", "Sim, com pacotes especiais e prova de maquiagem."),
         ("Quais marcas usam?", "Trabalhamos apenas com linhas profissionais.")],
    cta=dict(title="Hora de se cuidar", text="Escolha o melhor horário e deixe o resto com a gente.", button="Agendar pelo WhatsApp"),
    form_title="Quero agendar"),

  # ------------------------------------------------------------------ Academia
  T("fitness-gym", "Academia Force", "Academia", "Treino com acompanhamento profissional.",
    theme("neon-lime", "dark", "#b4f000", "#00d1ff", "#0a0b0d", "#15171b", "#f5f7fa", "#8e949c", "Bebas Neue", "Inter", "8px"),
    "Force Academia", header_cta="Aula grátis",
    hero=dict(variant="overlay", eyebrow="Academia · aberta 7 dias", title="Seu melhor treino começa aqui",
              subtitle="Musculação, funcional e aulas coletivas com professores qualificados e acompanhamento de verdade.",
              image=U("1517836357463-d25dfeac3438"), button="Agendar aula grátis", secondary="Planos",
              stats=stats(("1.200m²", "de área de treino"), ("30+", "aulas por semana"), ("7 dias", "por semana"))),
    about=dict(eyebrow="A academia", title="Estrutura completa para você evoluir",
               text="Equipamentos modernos, horários flexíveis e professores acompanhando seu treino. Avaliação física inclusa em todos os planos.",
               image=U("1540497077202-7c8a3999166f"), image2=U("1581009146145-b5ef050c2e1e"),
               highlights=["Aula experimental grátis", "Avaliação física inclusa", "App com seu treino"]),
    services=dict(variant="cards", title="Modalidades e planos", subtitle="Escolha como quer treinar",
                  items=[("Musculação", "Plano mensal, trimestral ou anual.", "a partir de R$ 99/mês", U("1534438327276-14e5300c3a48")),
                         ("Funcional", "Turmas em vários horários.", "R$ 129/mês", U("1599058917212-d750089bc07e")),
                         ("Aulas coletivas", "Yoga, spinning, ritmos e mais.", "Incluso no plano", U("1571019613454-1cb2f99b2d8b")),
                         ("Personal", "Treino individual com objetivo definido.", "Sob consulta", U("1581009146145-b5ef050c2e1e"))]),
    gallery=dict(variant="mosaic", title="Por dentro da Force",
                 images=[(U("1540497077202-7c8a3999166f"), "Área de musculação"), (U("1534438327276-14e5300c3a48"), "Pesos livres"),
                         (U("1599058917212-d750089bc07e"), "Funcional"), (U("1571019613454-1cb2f99b2d8b"), "Aulas coletivas"),
                         (U("1581009146145-b5ef050c2e1e"), "Treino de força")]),
    testimonials=dict(rating="4,8 no Google", items=[
        ("Thiago Moreira", "Perdi 12 kg em 6 meses com o acompanhamento dos professores.", "Aluno há 1 ano", PM[1]),
        ("Gabriela Castro", "As aulas de funcional são viciantes. Ambiente motivador demais.", "Funcional", PW[2]),
        ("Lucas Fernandes", "Estrutura impecável e nunca tem fila nos aparelhos.", "Google", PM[0])]),
    faq=[("Tem aula experimental?", "Sim, agende pelo WhatsApp e treine grátis."), ("Qual o horário?", "Seg a Sex 06h-23h, fins de semana 08h-14h."),
         ("Tem fidelidade?", "Temos planos com e sem fidelidade.")],
    cta=dict(eyebrow="Primeira aula grátis", title="Comece hoje", text="Agende sua aula experimental e conheça a estrutura.",
             image=U("1534438327276-14e5300c3a48"), button="Quero treinar"),
    hours=[{"label": "Seg a Sex", "value": "06:00 - 23:00"}, {"label": "Sáb e Dom", "value": "08:00 - 14:00"}]),

  # ------------------------------------------------------------------ Fotografo
  T("photographer", "Fotógrafo Autoral", "Fotografia", "Ensaios, eventos e fotografia de produto.",
    theme("mono-minimal", "light", "#111111", "#8c8c8c", "#fafafa", "#ffffff", "#111111", "#6b6b6b", "DM Serif Display", "Inter", "0px"),
    "Lucas Fotografia", header_cta="Orçamento",
    hero=dict(variant="center", eyebrow="Fotografia autoral", title="Momentos que merecem ser eternos",
              subtitle="Casamentos, ensaios, eventos corporativos e fotografia de produto.",
              image=U("1519741497674-611481863552"), button="Solicitar orçamento", secondary="Ver portfólio"),
    about=dict(variant="image-right", eyebrow="Sobre mim", title="Histórias reais, contadas com luz",
               text="Fotógrafo há 8 anos, com olhar autoral e foco em momentos espontâneos. Cada trabalho é entregue em galeria online, com edição profissional.",
               image=U("1516035069371-29a1b244cc32"), image2=U("1452587925148-ce544e77e70d"),
               highlights=["Entrega em até 10 dias", "Edição profissional", "Galeria online privada"],
               stats=stats(("200+", "casamentos"), ("8", "anos"))),
    services=dict(variant="features", title="Serviços",
                  items=[("Casamentos", "Cobertura completa, do making of à festa.", ""), ("Ensaios", "Individual, casal, gestante e família.", ""),
                         ("Eventos", "Corporativos, formaturas e aniversários.", ""), ("Produtos", "Fotos para e-commerce e redes sociais.", "")]),
    gallery=dict(variant="masonry", title="Portfólio", subtitle="Alguns trabalhos recentes",
                 images=[(U("1511285560929-80b456fea0bc"), "Casamento"), (U("1438761681033-6461ffad8d80"), "Retrato"),
                         (U("1469474968028-56623f02e42e"), "Paisagem"), (U("1519741497674-611481863552"), "Detalhes"),
                         (U("1544005313-94ddf0286df2"), "Ensaio individual"), (U("1506744038136-46273834b3fb"), "Viagem")]),
    testimonials=dict(items=[
        ("Amanda e Felipe", "As fotos do nosso casamento ficaram emocionantes. Revivemos cada momento.", "Casamento", PW[1]),
        ("Bruno Carvalho", "Fotos de produto impecáveis, nossas vendas online aumentaram.", "E-commerce", PM[2]),
        ("Isabela Martins", "Ensaio leve e divertido, me senti super à vontade.", "Ensaio", PW[0])]),
    faq=[("Quanto tempo para entregar?", "Ensaios em até 10 dias e casamentos em até 45 dias."), ("Atende outras cidades?", "Sim, consulte a taxa de deslocamento."),
         ("As fotos vêm editadas?", "Sim, todas as fotos entregues passam por edição profissional.")],
    cta=dict(title="Vamos criar juntos?", text="Conte sua ideia e receba um orçamento personalizado.", image=U("1511285560929-80b456fea0bc"), button="Pedir orçamento"),
    order=['hero', 'gallery', 'about', 'services', 'testimonials', 'faq', 'cta', 'contact', 'location'], form_title="Conte sobre seu evento"),

  # ------------------------------------------------------------------ Autonomo
  T("freelancer", "Profissional Autônomo", "Profissional autônomo", "Serviços profissionais com atendimento direto.",
    theme("cdev-aqua", "dark", "#2b8ba5", "#e07b24", "#080e10", "#111d21", "#e8f2f5", "#6f8d98", "Syne", "Inter", "8px"),
    "João Serviços", header_cta="Orçamento",
    hero=dict(variant="split", eyebrow="Atendimento direto com o profissional", title="Soluções profissionais sob medida",
              subtitle="Atendimento direto, prazos claros e qualidade em cada entrega. Sem intermediários.",
              image=U("1486312338219-ce68d2c6f44d"), button="Solicitar orçamento", secondary="Serviços",
              stats=stats(("150+", "clientes atendidos"), ("24h", "para responder")),
              badge={"value": "5,0", "label": "avaliação dos clientes", "stars": 5}),
    about=dict(eyebrow="Quem sou", title="Experiência e compromisso",
               text="Profissional autônomo com anos de experiência e foco na satisfação de cada cliente. Você fala direto comigo do orçamento à entrega.",
               image=U("1497032628192-86f99bcd76bc"), image2=U("1504384308090-c894fdcc538d"),
               highlights=["Atendimento direto", "Orçamento rápido", "Garantia do serviço"]),
    services=dict(variant="features", title="Serviços", subtitle="Edite com os seus serviços",
                  items=[("Serviço principal", "Descreva aqui o serviço que mais traz clientes.", "a partir de R$ 000"),
                         ("Serviço 2", "Explique o benefício para o cliente, não só a tarefa.", ""),
                         ("Serviço 3", "Inclua prazo médio ou diferencial.", ""), ("Consultoria", "Orientação para quem ainda está decidindo.", "")]),
    gallery=dict(variant="grid", title="Trabalhos recentes",
                 images=[(U("1497032628192-86f99bcd76bc"), "Projeto 1"), (U("1522202176988-66273c2fd55f"), "Projeto 2"),
                         (U("1531482615713-2afd69097998"), "Projeto 3"), (U("1504384308090-c894fdcc538d"), "Projeto 4")]),
    testimonials=dict(items=[
        ("Cliente 1", "Troque por um depoimento real: o que o cliente mais elogiou?", "Google", PW[0]),
        ("Cliente 2", "Depoimentos com nome e foto aumentam muito a confiança.", "WhatsApp", PM[0]),
        ("Cliente 3", "Peça aos clientes satisfeitos uma frase curta.", "Instagram", PW[2])]),
    faq=[("Como funciona o orçamento?", "Envie sua necessidade pelo WhatsApp e respondo em até 24h."), ("Qual a área de atendimento?", "Guaíba e região metropolitana.")],
    cta=dict(title="Vamos conversar?", text="Resposta rápida pelo WhatsApp.", button="Chamar no WhatsApp")),
]

def q(v):
    return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"

def s(v):
    return "'" + str(v).replace("'", "''") + "'"

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

seed = ["-- CDEV CONTROL CENTER - templates iniciais do Site Factory (v2: fotos + layouts por segmento)",
        "-- Gerado por tools/gen_templates.py. Rode depois de 07_control_center.sql.",
        "-- Nao sobrescreve templates ja existentes (on conflict do nothing). Para atualizar, use 11_templates_v2.sql.", ""]
upd = ["-- CDEV CONTROL CENTER - atualiza os 10 templates padrao para a v2 (fotos + layouts por segmento)",
       "-- Gerado por tools/gen_templates.py. Seguro rodar mais de uma vez.",
       "-- Sobrescreve apenas os templates padrao (pelas chaves abaixo). Sites ja criados NAO mudam:",
       "-- cada site guarda sua propria copia do conteudo.", "begin;", ""]
for t in TPLS:
    vals = ",\n  ".join([s(t['key']), s(t['name']), s(t['segment']), s(t['description']), q(t['sections']), q(t['theme']), q(t['content'])])
    seed.append(f"insert into public.templates (key, name, segment, description, sections, theme, content) values (\n  {vals}\n) on conflict (key) do nothing;\n")
    upd.append(f"insert into public.templates (key, name, segment, description, sections, theme, content) values (\n  {vals}\n) on conflict (key) do update set\n"
               "  name = excluded.name, segment = excluded.segment, description = excluded.description,\n"
               "  sections = excluded.sections, theme = excluded.theme, content = excluded.content;\n")
upd.append("commit;\n")
open(os.path.join(root, 'supabase', '08_control_center_templates.sql'), 'w').write("\n".join(seed))
open(os.path.join(root, 'supabase', '11_templates_v2.sql'), 'w').write("\n".join(upd))
print(len(TPLS), 'templates;', len({u for u in json.dumps([t['content'] for t in TPLS]).split('"') if u.startswith('https://images.unsplash')}), 'fotos distintas')
