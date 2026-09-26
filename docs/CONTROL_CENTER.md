# CDEV Control Center

Site Factory + CRM + financeiro recorrente + monitoramento, **dentro do painel existente** da CDEV.
Custo adicional: **R$0** (Supabase atual + VPS atual + bibliotecas abertas).

---

## 1. Fase 1: análise do projeto existente

| Item | O que existe | Decisão |
|---|---|---|
| Frontend | HTML estático + Tailwind CDN + JS vanilla (`admin.html`, `dashboard.html`, `login.html`) | Mesmo padrão: `control.html` + módulos JS sem build |
| Backend | Supabase (Postgres + Auth + RLS + Realtime + Edge Function `admin-users`) | Reutilizado. Nenhum backend novo |
| Banco | `public.users`, `system_settings`, `property_spreadsheets*` | Mesmo banco, novas tabelas via migration `07_` |
| Autenticação | Supabase Auth + `cdev-auth.js` (`requireAccess`) | Reutilizada: `requireAccess({ admin: true, settingKey: 'control_center_enabled' })` |
| Autorização | `public.is_admin()` + RLS + toggles em `system_settings` | Toda tabela nova: RLS `is_admin()`. Novo toggle `control_center_enabled` aparece sozinho em Admin → Toggles |
| Layout / tema | Dark tone-on-tone, Syne + DM Mono, `#2b8ba5`/`#e07b24`, `.btn`, `.panel`, `.field`… | Mesmos tokens e classes em `assets/css/control.css` |
| Notificações | Toasts no dashboard; realtime em `system_settings` | Tabela `notifications` + realtime + toasts |
| Migrations | Arquivos SQL numerados em `supabase/` rodados no SQL Editor | `07_`, `08_`, `09_` no mesmo padrão |
| Deploy | VPS (Ubuntu, Nginx, Let's Encrypt), `git pull` | Igual. Worker por systemd timer. Nginx para demos/domínios |
| Docker | Não existe | Não introduzido |

Nada foi duplicado: não há segundo login, segundo painel nem segundo banco.
`control.html` é mais uma página do painel (links em Dashboard/Admin) protegida pelo mesmo guardião.

---

## 2. Arquitetura

```
CDEV (repositório único, servido pelo Nginx da VPS)
│
├── Painel existente
│   ├── login.html · dashboard.html · admin.html      (inalterados, + link "Control Center")
│   └── control.html  ← CDEV CONTROL CENTER
│       ├── Control Center (Central de Pendências, próximas ações, alertas, sites, atividade)
│       ├── Clientes (+ página única do cliente com ações rápidas)
│       ├── Leads / CRM · Mensagens
│       ├── Projetos / Sites (editor por formulário + preview ao vivo) · Templates
│       ├── Pagamentos (recorrência) · Domínios · Hospedagens
│       ├── Monitoramento · Incidentes · Backups
│       └── Configurações · Alertas · Pesquisa global
│
├── SITE ENGINE
│   ├── site.html                     ponto de entrada único de TODOS os sites
│   └── assets/js/site-engine.js      componentes + temas (Header, Hero, About, Services, Gallery,
│                                     Testimonials, FAQ, CTA, Contact, WhatsApp, Location, Footer)
│
├── Supabase (existente)
│   ├── tabelas + RLS + views + RPCs (07_control_center.sql)
│   └── templates iniciais (08_control_center_templates.sql)
│
└── VPS
    ├── ops/monitor/cdev-monitor.mjs  worker HTTP/SSL + vencimentos (systemd, 1/min)
    └── ops/nginx/                    *.sites.cdev.com.br + domínios de clientes → site.html
```

### Site = Template + Theme + Content + Client + Project + Domain + Hosting

- **templates**: seções padrão, tema padrão, conteúdo exemplo (10 segmentos). Novo template = novo registro.
- **projects**: uma linha por site. Guarda `theme` e `content` (JSON) próprios, `client_id`, `template_id`, `hosting_id`, status, monitoramento.
- **domains**: um ou mais por projeto; o domínio `ATIVO` do projeto `PUBLICADO` é resolvido pelo `site.html`.
- Demo → cliente: só muda `client_id`/`status`/domínio. Nenhum código é duplicado.

Resolução no `site.html`: `?slug=` → `<slug>.sites.cdev.com.br` → domínio do cliente → `?template=` (admin) → `postMessage` do editor.

### Providers (sem acoplamento a serviços externos)

`assets/js/control/providers.js`

| Tipo | Implementações no MVP | Futuro (opcional) |
|---|---|---|
| LeadProvider | `manual`, `csv` | web, Google (respeitando termos: sem scraping agressivo/bypass) |
| MessageProvider | `whatsapp_manual` (wa.me com texto pronto), `email_manual` (mailto) | WhatsApp oficial |
| NotificationProvider | `internal` (tabela + toast + notificação do navegador) | Telegram já suportado no worker (grátis) |
| DomainProvider / HostingProvider | `manual` (abre o link do painel) | APIs de registrador/provedor |
| StorageProvider | `url` (arquivos em `/media` na VPS ou links) | S3/R2 etc. |

---

## 3. Banco de dados (`supabase/07_control_center.sql`)

Tabelas: `cc_settings`, `clients`, `templates`, `hostings`, `projects`, `domains`, `payments`,
`notifications`, `monitoring_checks`, `incidents`, `backups`, `leads`, `lead_activities`,
`message_templates`, `activity_log`.

> `payment_recurrences` foi incorporada em `payments` (`recurrence`, `recurrence_day`, `previous_payment_id`):
> cada cobrança paga gera a próxima, e o histórico fica encadeado.

Views (`security_invoker`, respeitam RLS): `payments_view` (estado calculado PENDENTE/VENCENDO/VENCE_HOJE/ATRASADO/PAGO),
`client_overview` (pendências por cliente), `incidents_view` (duração).

RPCs:

| Função | Quem chama | O que faz |
|---|---|---|
| `cc_pending_summary()` | painel | contadores da Central de Pendências + próximas ações |
| `cc_search(q)` | painel | busca global (nome, empresa, domínio, telefone, WhatsApp, e-mail, projeto, lead) |
| `cc_mark_payment_paid(id, data, forma, valor)` | painel | marca pago, gera a próxima cobrança, renova domínio/hospedagem vinculados, encerra alertas |
| `cc_convert_lead(id)` | painel | lead → cliente (e move a demo para o cliente) sem recadastro |
| `cc_uptime_summary()` | painel | uptime 24h/7d/30d/90d calculado a partir dos checks reais |
| `cc_run_due_checks()` | worker / pg_cron / botão | marca atrasados e emite alertas de vencimento, SSL, backup e follow-up |
| `cc_monitor_targets()` | worker (service role) | projetos cujo intervalo de check venceu |
| `cc_record_check(...)` | worker (service role) | grava check, compara estado, abre/fecha incidente, alerta só na mudança |
| `cc_public_site(host, slug)` | `site.html` (anon) | só dados de apresentação de sites DEMO/PUBLICADO |

Histórico do cliente: triggers gravam em `activity_log` (cliente criado, projeto/demo criado, site publicado,
domínio cadastrado/renovado, hospedagem, pagamento, offline/recuperado, backup, template alterado).

### Notificações sem spam

`notifications.dedupe_key` é único. Chaves por limiar, ex.: `payment:<id>:before:7`, `payment:<id>:after:3`,
`site:<id>:down:<epoch>`. Rodar a verificação 1.000 vezes gera o alerta uma única vez.
Um alerta novo da mesma entidade encerra o anterior (30 → 15 → 7 dias). Pagou/cancelou → alertas encerrados e
os próximos limiares deixam de ser emitidos. Monitoramento alerta apenas `ONLINE → OFFLINE` e `OFFLINE → ONLINE`.

---

## 4. Instalação

1. **Banco** (Supabase SQL Editor, nesta ordem):
   1. `supabase/07_control_center.sql`
   2. `supabase/08_control_center_templates.sql`
   3. opcional: `supabase/09_control_center_cron.sql` (pg_cron verifica vencimentos mesmo sem a VPS)
2. **Deploy**: `git pull` na VPS (o painel já passa a ter `control.html`).
3. **Worker**: seguir `ops/monitor/README.md` (Node ≥ 18, systemd timer, service key em `/etc/cdev-monitor.env`).
4. **Demos**: DNS `*.sites` → IP da VPS e bloco Nginx de `ops/nginx/cdev-sites.conf.example`.
5. **Domínio de cliente**: `sudo CERTBOT_EMAIL=... ops/nginx/add-client-domain.sh cliente.com.br`.
6. Bloqueie `/supabase`, `/ops`, `/tools` e `/.git` no server block do cdev.com.br (exemplo no arquivo do Nginx).

---

## 5. Status das fases

| Fase | Conteúdo | Status |
|---|---|---|
| 1 | Análise do projeto | ✅ (seção 1) |
| 2 | Clientes, Projetos, Sites, Templates | ✅ CRUD, página do cliente, Site Engine, 10 templates, editor por formulário, preview ao vivo |
| 3 | Domínios, Hospedagens | ✅ valor, vencimento, link do painel, status, cobrança recorrente automática |
| 4 | Pagamentos, Recorrência, Vencimentos | ✅ mensal/trimestral/semestral/anual, fim de mês tratado, renovação de serviço |
| 5 | Central de Pendências, Notificações, Filtros, Busca, Ordenação | ✅ |
| 6 | Monitoramento HTTP/HTTPS, Incidentes, Uptime, SSL | ✅ worker + RPCs + telas |
| 7 | CRM, Leads, CSV, Mensagens, Demos | ✅ pipeline com arrastar, score, importação validada, wa.me, demo em 1 clique, conversão |
| 8 | Backups, Histórico, Auditoria | ✅ registro + pendência por idade; histórico por triggers |

Cada tela tem: persistência no Supabase, validação no front e constraints no banco, estados vazios,
skeleton de carregamento, toasts de sucesso/erro com mensagens em português, e permissão admin (RLS).

### Testes realizados

- Migration aplicada 2× (idempotente) em Postgres local com stub do Supabase Auth.
- Cenários SQL: dedupe de alertas, recorrência (31/01 → 28/02 → 31/03; 29/02 anual), renovação de domínio,
  incidentes, RLS (usuário comum vê 0 linhas; anon só acessa `cc_public_site`).
- E2E com PostgREST real + Chromium headless: todas as rotas sem erro de JS e 26 fluxos
  (pagar cobrança, validação, cliente, site por template, preview ao vivo, tema, domínio + cobrança,
  lead → demo → mensagem → cliente, importação CSV 5/3/2, busca, monitoramento, configurações, site público).
- Worker contra o mesmo stack: transições de estado, incidente, alertas e bloqueio para anon.

---

## 6. Segurança

- Nenhuma senha/token de cliente é armazenada: apenas provedor, URL do painel, identificador e observações.
- Service key só no servidor (`/etc/cdev-monitor.env`, 600). O navegador usa apenas a anon key com RLS.
- `cc_public_site` nunca devolve cliente, valores ou notas.
- HTML sempre escapado; links passam por `safeUrl` (bloqueia `javascript:`); preview usa `postMessage` com checagem de origem.

## 7. Próximos passos sugeridos (opcionais)

- Upload de mídia para a VPS (StorageProvider local com um endpoint mínimo) ou Supabase Storage (plano gratuito).
- Pré-renderização estática dos sites publicados para SEO (hoje o render é client-side).
- CDEV Agent (CPU/RAM/disco/serviços) usando a mesma tabela de checks/incidentes.
- Telegram como NotificationProvider já está no worker: basta preencher o token.
