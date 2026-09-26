#!/usr/bin/env python3
"""Gera supabase/08_control_center_templates.sql a partir das definicoes abaixo.
Rode: python3 tools/gen_templates.py  (a partir da raiz do repo)"""
import json, os

SECTIONS = ['hero','about','services','gallery','testimonials','faq','cta','contact','location']

def T(key, name, segment, desc, theme, brand, hero, about, services, faq, cta_title, cta_btn, testimonials=None, hours=None, order=None):
    testimonials = testimonials or [
        {"name": "Cliente satisfeito", "text": "Atendimento excelente do início ao fim. Recomendo muito!", "role": "Google"},
        {"name": "Cliente recorrente", "text": "Profissionais atenciosos e resultado acima do esperado.", "role": "Instagram"},
        {"name": "Novo cliente", "text": "Fui muito bem recebido e já marquei a próxima visita.", "role": "WhatsApp"},
    ]
    hours = hours or [{"label": "Seg a Sex", "value": "09:00 - 18:00"}, {"label": "Sábado", "value": "09:00 - 13:00"}]
    order = order or SECTIONS
    data = {
        "hero": {"eyebrow": segment, "title": hero[0], "subtitle": hero[1], "image": "", "buttonText": hero[2], "buttonUrl": "#contato",
                 "secondaryText": "Ver serviços", "secondaryUrl": "#servicos"},
        "about": {"title": about[0], "text": about[1], "image": "", "highlights": about[2]},
        "services": {"title": "Serviços", "subtitle": "O que fazemos por você", "items": [{"name": n, "description": d, "price": p} for n, d, p in services]},
        "gallery": {"title": "Galeria", "images": []},
        "testimonials": {"title": "O que dizem", "items": testimonials},
        "faq": {"title": "Perguntas frequentes", "items": [{"q": q, "a": a} for q, a in faq]},
        "cta": {"title": cta_title, "text": "Fale com a gente agora mesmo pelo WhatsApp.", "buttonText": cta_btn, "buttonUrl": "whatsapp"},
        "contact": {"title": "Contato", "text": "Estamos prontos para atender você."},
        "location": {"title": "Onde estamos", "text": ""},
    }
    content = {
        "brand": {"name": brand, "tagline": desc, "logo": ""},
        "contact": {"phone": "(51) 99999-0000", "whatsapp": "5551999990000", "email": "contato@exemplo.com.br",
                    "address": "Rua Exemplo, 123 - Centro", "city": "Guaiba - RS", "mapsQuery": "",
                    "hours": hours, "instagram": "", "facebook": ""},
        "settings": {"whatsappFloat": True},
        "seo": {"title": brand + " | " + segment, "description": desc},
        "sections": [{"id": s, "type": s, "enabled": True, "data": data[s]} for s in order],
    }
    return dict(key=key, name=name, segment=segment, description=desc, sections=order, theme=theme, content=content)

def theme(preset, mode, primary, accent, bg, surface, text, muted, heading, body, radius="12px"):
    return {"preset": preset, "mode": mode,
            "colors": {"primary": primary, "accent": accent, "bg": bg, "surface": surface, "text": text, "muted": muted},
            "fonts": {"heading": heading, "body": body}, "radius": radius}

TPLS = [
  T("barber-modern", "Barber Modern", "Barbearia", "Corte, barba e estilo com hora marcada.",
    theme("dark-gold", "dark", "#c9a14a", "#e8c776", "#0d0d0f", "#17171b", "#f3efe6", "#9a9387", "Oswald", "Inter", "4px"),
    "Barbearia Alpha",
    ("Estilo e tradição em cada corte", "Cortes clássicos e modernos, barba na toalha quente e um ambiente feito para você relaxar.", "Agendar horário"),
    ("Sobre a barbearia", "Mais de 10 anos cuidando do visual dos nossos clientes com tecnica, atenção e aquele café passado na hora.", ["Profissionais experientes", "Ambiente climatizado", "Hora marcada sem espera"]),
    [("Corte", "Tesoura ou máquina, finalizado com produto.", "R$ 45"), ("Barba", "Toalha quente e navalha.", "R$ 35"), ("Corte + Barba", "O combo completo.", "R$ 70"), ("Pigmentação", "Acabamento natural.", "R$ 30")],
    [("Precisa agendar?", "Recomendamos agendar pelo WhatsApp para garantir seu horário."), ("Quais formas de pagamento?", "Pix, cartão de débito e crédito.")],
    "Garanta seu horário", "Agendar pelo WhatsApp",
    hours=[{"label": "Ter a Sex", "value": "09:00 - 20:00"}, {"label": "Sábado", "value": "08:00 - 18:00"}]),
  T("restaurant-flavor", "Restaurante Sabor", "Restaurante", "Comida caseira feita com ingredientes frescos.",
    theme("warm-terracotta", "light", "#b5452b", "#e0892f", "#fbf6ef", "#ffffff", "#2a1f1a", "#7a6a60", "Playfair Display", "Inter"),
    "Restaurante Sabor",
    ("Sabor de comida feita em casa", "Almoço executivo, pratos à la carte e sobremesas artesanais todos os dias.", "Reservar mesa"),
    ("Nossa cozinha", "Receitas de família, ingredientes frescos e muito carinho em cada prato servido.", ["Ingredientes locais", "Opções vegetarianas", "Delivery na região"]),
    [("Almoço executivo", "Prato do dia com salada e sobremesa.", "R$ 32"), ("A la carte", "Carnes, massas e peixes.", "a partir de R$ 48"), ("Sobremesas", "Doces artesanais da casa.", "R$ 14"), ("Eventos", "Cardápio para grupos e confraternizações.", "Sob consulta")],
    [("Vocês fazem delivery?", "Sim, pelo WhatsApp e aplicativos."), ("Aceitam reservas?", "Sim, reserve pelo WhatsApp.")],
    "Bateu a fome?", "Pedir pelo WhatsApp",
    hours=[{"label": "Seg a Sáb", "value": "11:00 - 15:00"}, {"label": "Qui a Sáb", "value": "19:00 - 23:00"}]),
  T("clinic-care", "Clínica Vida", "Clínica", "Saúde e bem-estar com atendimento humanizado.",
    theme("clean-teal", "light", "#0f8b8d", "#43b3ae", "#f5fafa", "#ffffff", "#123033", "#5b7477", "Poppins", "Inter"),
    "Clínica Vida",
    ("Cuidado de verdade com a sua saúde", "Equipe multidisciplinar, estrutura moderna e atendimento humanizado.", "Agendar consulta"),
    ("Sobre a clínica", "Nosso compromisso é oferecer um atendimento acolhedor, com pontualidade e tecnologia.", ["Convênios e particular", "Estacionamento", "Acessibilidade"]),
    [("Clínica geral", "Consultas e check-ups.", ""), ("Pediatria", "Acompanhamento infantil.", ""), ("Exames", "Coleta e laudos rápidos.", ""), ("Fisioterapia", "Reabilitação e prevenção.", "")],
    [("Atendem convenio?", "Sim, consulte a lista de convênios pelo WhatsApp."), ("Como agendar?", "Pelo WhatsApp ou telefone.")],
    "Agende sua consulta", "Falar com a recepção"),
  T("law-office", "Advocacia Premium", "Advocacia", "Atuação jurídica estratégica e próxima do cliente.",
    theme("navy-classic", "dark", "#b8975a", "#d8bd86", "#0e1624", "#162235", "#eef1f6", "#98a3b5", "Cormorant Garamond", "Inter", "2px"),
    "Silva Advocacia",
    ("Seus direitos em boas mãos", "Consultoria e atuação em direito civil, trabalhista, família e empresarial.", "Agendar atendimento"),
    ("O escritório", "Atendimento personalizado, comunicação clara e compromisso com cada caso.", ["Atendimento online", "Sigilo absoluto", "Atuação em todo o RS"]),
    [("Direito civil", "Contratos, indenizações e cobranças.", ""), ("Direito trabalhista", "Defesa de empregados e empresas.", ""), ("Familia", "Divórcio, guarda e inventário.", ""), ("Empresarial", "Consultoria preventiva.", "")],
    [("A primeira consulta é paga?", "Entre em contato para conhecer as condições."), ("Atendem online?", "Sim, por videochamada.")],
    "Precisa de orientação jurídica?", "Falar com um advogado"),
  T("real-estate", "Imobiliária Prime", "Imobiliária", "Compra, venda e locação de imóveis.",
    theme("urban-blue", "light", "#1f5fbf", "#f2a900", "#f6f8fb", "#ffffff", "#15213a", "#5d6b84", "Montserrat", "Inter"),
    "Prime Imoveis",
    ("Encontre o imóvel ideal", "Casas, apartamentos e terrenos para comprar ou alugar na sua região.", "Falar com corretor"),
    ("Sobre nós", "Corretores credenciados, avaliação gratuita e acompanhamento até a entrega das chaves.", ["Avaliação gratuita", "Financiamento", "Documentação completa"]),
    [("Venda", "Anuncie seu imóvel conosco.", ""), ("Locação", "Administração completa de aluguéis.", ""), ("Avaliação", "Laudo de valor de mercado.", ""), ("Financiamento", "Simulação e assessoria.", "")],
    [("Quanto custa anunciar?", "Consulte nossas condições."), ("Vocês fazem avaliação?", "Sim, gratuitamente.")],
    "Quer vender ou alugar?", "Chamar no WhatsApp"),
  T("auto-garage", "Oficina Pro", "Oficina", "Mecânica automotiva com transparência.",
    theme("garage-red", "dark", "#e03a2f", "#ffb627", "#101214", "#1a1d21", "#f1f1f1", "#9aa0a6", "Barlow Condensed", "Inter", "6px"),
    "Oficina Pro",
    ("Seu carro em boas mãos", "Revisão, suspensão, freios, injeção eletrônica e orçamento sem compromisso.", "Pedir orçamento"),
    ("A oficina", "Equipe treinada, peças de qualidade e garantia em todos os serviços.", ["Garantia de 90 dias", "Orçamento no WhatsApp", "Leva e traz"]),
    [("Revisão", "Óleo, filtros e checklist completo.", ""), ("Freios", "Pastilhas, discos e fluido.", ""), ("Suspensão", "Amortecedores e alinhamento.", ""), ("Injeção eletrônica", "Diagnóstico com scanner.", "")],
    [("Fazem orçamento grátis?", "Sim, sem compromisso."), ("Tem garantia?", "Todos os serviços têm garantia.")],
    "Barulho estranho no carro?", "Pedir orçamento"),
  T("beauty-salon", "Salão Bella", "Salão de beleza", "Cabelo, unhas e estética.",
    theme("rose-nude", "light", "#c2587a", "#e8a0b4", "#fdf7f8", "#ffffff", "#3a2430", "#8a6f7a", "Playfair Display", "Inter", "18px"),
    "Studio Bella",
    ("Realce a sua beleza", "Cortes, coloração, escova, manicure e tratamentos com produtos profissionais.", "Agendar horário"),
    ("O studio", "Um espaço acolhedor para você cuidar de si com profissionais apaixonadas pelo que fazem.", ["Produtos profissionais", "Ambiente aconchegante", "Hora marcada"]),
    [("Corte feminino", "Corte e finalização.", "R$ 80"), ("Coloração", "Tintura, mechas e luzes.", "Sob avaliação"), ("Manicure", "Mãos e pés.", "R$ 45"), ("Tratamentos", "Hidratação e reconstrução.", "R$ 90")],
    [("Precisa agendar?", "Sim, pelo WhatsApp."), ("Atendem noivas?", "Sim, com pacotes especiais.")],
    "Hora de se cuidar", "Agendar pelo WhatsApp"),
  T("fitness-gym", "Academia Force", "Academia", "Treino com acompanhamento profissional.",
    theme("neon-lime", "dark", "#b4f000", "#00d1ff", "#0a0b0d", "#15171b", "#f5f7fa", "#8e949c", "Bebas Neue", "Inter", "8px"),
    "Force Academia",
    ("Seu melhor treino começa aqui", "Musculação, funcional e aulas coletivas com professores qualificados.", "Agendar aula grátis"),
    ("A academia", "Equipamentos modernos, horários flexiveis e acompanhamento para você evoluir com segurança.", ["Aula experimental grátis", "Aberta 7 dias", "Avaliação física"]),
    [("Musculação", "Planos mensais e anuais.", "a partir de R$ 99"), ("Funcional", "Turmas em vários horários.", ""), ("Aulas coletivas", "Spinning, ritmos e mais.", ""), ("Personal", "Treino individual.", "Sob consulta")],
    [("Tem aula experimental?", "Sim, agende pelo WhatsApp."), ("Qual o horário?", "Seg a Sex 06h-23h, fins de semana 08h-14h.")],
    "Comece hoje", "Quero treinar",
    hours=[{"label": "Seg a Sex", "value": "06:00 - 23:00"}, {"label": "Sáb e Dom", "value": "08:00 - 14:00"}]),
  T("photographer", "Fotógrafo Autoral", "Fotografia", "Ensaios, eventos e fotografia de produto.",
    theme("mono-minimal", "light", "#111111", "#8c8c8c", "#fafafa", "#ffffff", "#111111", "#6b6b6b", "DM Serif Display", "Inter", "0px"),
    "Lucas Fotografia",
    ("Momentos que merecem ser eternos", "Ensaios, casamentos, eventos corporativos e fotos de produto.", "Solicitar orçamento"),
    ("Sobre mim", "Fotógrafo há 8 anos, com olhar autoral e foco em contar histórias reais.", ["Entrega rápida", "Edição profissional", "Galeria online"]),
    [("Ensaios", "Individual, casal e família.", ""), ("Casamentos", "Cobertura completa.", ""), ("Eventos", "Corporativos e sociais.", ""), ("Produtos", "Fotos para e-commerce.", "")],
    [("Quanto tempo para entregar?", "Ensaios em até 10 dias."), ("Atende outras cidades?", "Sim, consulte.")],
    "Vamos criar juntos?", "Pedir orçamento",
    order=['hero','gallery','about','services','testimonials','faq','cta','contact','location']),
  T("freelancer", "Profissional Autônomo", "Profissional autônomo", "Serviços profissionais com atendimento direto.",
    theme("cdev-aqua", "dark", "#2b8ba5", "#e07b24", "#080e10", "#111d21", "#e8f2f5", "#6f8d98", "Syne", "Inter", "8px"),
    "Joao Serviços",
    ("Soluções profissionais sob medida", "Atendimento direto, prazos claros e qualidade em cada entrega.", "Solicitar orçamento"),
    ("Quem sou", "Profissional autônomo com experiência e compromisso com a satisfação de cada cliente.", ["Atendimento direto", "Orçamento rapido", "Garantia do serviço"]),
    [("Serviço 1", "Descreva o serviço principal.", ""), ("Serviço 2", "Descreva outro serviço.", ""), ("Serviço 3", "Mais um serviço.", "")],
    [("Como funciona o orçamento?", "Envie sua necessidade pelo WhatsApp."), ("Qual a área de atendimento?", "Guaíba e região.")],
    "Vamos conversar?", "Chamar no WhatsApp"),
]

def q(v):
    return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"

def s(v):
    return "'" + str(v).replace("'", "''") + "'"

out = ["-- CDEV CONTROL CENTER - templates iniciais do Site Factory",
       "-- Gerado por tools/gen_templates.py. Rode depois de 07_control_center.sql.",
       "-- Nao sobrescreve templates ja existentes (on conflict do nothing).", ""]
for t in TPLS:
    out.append("insert into public.templates (key, name, segment, description, sections, theme, content) values (\n  "
               + ",\n  ".join([s(t['key']), s(t['name']), s(t['segment']), s(t['description']), q(t['sections']), q(t['theme']), q(t['content'])])
               + "\n) on conflict (key) do nothing;\n")
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
open(os.path.join(root, 'supabase', '08_control_center_templates.sql'), 'w').write("\n".join(out))
print(len(TPLS), 'templates')
