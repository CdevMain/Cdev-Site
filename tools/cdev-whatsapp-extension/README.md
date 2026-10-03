# CDEV WhatsApp 3.0 (versão pessoal, integrada ao CRM CDEV)

Esta é a sua versão da antiga “WA Workspace / WA Atalhos”, com novo nome e ícone. Ela continua sendo uma camada de produtividade sobre o WhatsApp Web: status, tags, notas, lembretes, follow-up, mensagens rápidas e orçamento. A novidade é que agora ela **conversa com o CRM** em `cdev.com.br/control`.

> A extensão só envia mensagens sozinha quando **você agendou** o envio, no CRM ou no WhatsApp. Fora isso, ela abre a conversa e preenche o texto, e quem aperta enviar é você.

## Instalação (substituindo a versão antiga)

1. **Faça o backup na versão antiga:** Configurações › Backup › Exportar tudo.
2. Em `chrome://extensions`, **desative** a “WA Workspace”. As duas juntas duplicariam os botões.
3. Ative o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha esta pasta (`tools/cdev-whatsapp-extension`).
4. Na nova extensão: Configurações › Backup › **Importar** o arquivo do passo 1. Status, tags, contatos e mensagens voltam como estavam.
5. Recarregue a aba do WhatsApp Web e a aba do CRM. No topo do CRM deve aparecer o indicador verde **WhatsApp**.

## Como os dois sistemas conversam

| Você faz | O que acontece |
|---|---|
| Clica em WhatsApp no CRM (card, ficha ou estúdio) | A conversa abre **na aba já aberta do WhatsApp Web, sem recarregar**, com a mensagem colada no campo. Para um contato novo, ainda não salvo, a aba vai para o link do número. |
| Envia a mensagem no WhatsApp | O CRM marca a mensagem como **Enviada** e move o lead para **Mensagem enviada**. No WhatsApp, o contato recebe o status “Novo contato” (ou “Primeiro contato”) automaticamente. |
| O lead responde | O CRM recebe uma **notificação**, registra a resposta e move o lead para **Respondeu**. No WhatsApp aparecem o aviso fixo e o som, e o status vira “Em conversa”. |
| Muda a etapa no CRM | O status/cor do contato no WhatsApp acompanha a etapa (mapa em Configurações › CRM CDEV). |
| Muda o status no WhatsApp | A etapa no CRM acompanha. “Cliente” é exceção: a conversão continua sendo feita no CRM. |
| Agenda uma mensagem (CRM: estúdio › Agendar; WhatsApp: relógio na barra da conversa ou paleta) | No horário, a extensão abre a conversa, cola o texto e **envia**. O CRM mostra o agendamento como Agendada e depois como Enviada, e move o lead. |

- **CRM fechado:** os eventos ficam numa fila na extensão (ícone com ↑) e são entregues quando você abrir o CRM. Nada se perde.
- **Identificação:** o lead é encontrado pelo telefone (DDD + 8 últimos dígitos). Quando a conversa é aberta pelo CRM, o id do lead fica gravado no contato. Isso é necessário porque o WhatsApp às vezes esconde o número.
- **Mensagem digitada direto no WhatsApp para um lead em “Lead”** também conta como enviada. Você pode desligar isso nas opções.

## Mensagens agendadas — regras de segurança

- O Chrome precisa estar aberto no horário. Se a aba do WhatsApp estiver fechada, a extensão abre uma.
- Os envios respeitam um intervalo mínimo entre si (padrão 25 s).
- Se você estiver digitando, a extensão espera e tenta de novo.
- Um agendamento que atrasou além do limite (padrão 3 h, por exemplo com o PC desligado) **não é enviado atrasado**. Ele aparece como **Falhou**, com notificação no CRM.
- A extensão confere se abriu a conversa certa pelo número antes de enviar. Se abrir outra conversa, ela não envia.
- **Lista de agendadas:**
  - No CRM: clique no indicador WhatsApp do topo.
  - No WhatsApp: relógio da conversa ou paleta › “Mensagens agendadas”.
  - Nas opções: Configurações › CRM CDEV.
  - Cancelar em um lado cancela no outro.

## Configurações › CRM CDEV

Se os seus status importados tiverem outros nomes, ajuste os mapas aqui. A extensão reconhece sozinha um status chamado “Novo contato”.

Aqui ficam o estado da conexão (CRM aberto, leads sincronizados, fila), o status a aplicar ao enviar e ao receber resposta, as regras dos agendamentos e os mapas Etapa do CRM ↔ Status do WhatsApp.

---

## Novidades da 2.3

- **Esconder a lista de conversas** (`Alt+L`, botão na barra lateral ou paleta): o chat ocupa a largura toda. Encoste o mouse na borda esquerda para espiar a lista por cima. Ela fecha ao sair com o mouse ou ao abrir uma conversa. Configurável em Aparência.
- **Abrir conversas de verdade**:
  - A extensão tenta vários gestos (mousedown no título, clique completo, Enter) e confere no cabeçalho se a conversa certa abriu.
  - Se a conversa não está visível na lista, usa a busca do WhatsApp (por nome e por número).
  - Funciona com a lista escondida.
- **Contatos favoritos (♥)** viram botões com as iniciais na barra lateral e abrem a conversa com um clique.
- **Listas corrigidas**: o botão “Mais listas” agora é encontrado mesmo sem rótulo acessível e com listas personalizadas na linha de filtros. Isso cobre o caso comum em que o último filtro visível não é “Grupos”. Se a lista pedida já aparece como filtro, a extensão clica direto nela. O menu é reconhecido também no formato `role=application > ul > li`.

## Novidades da 2.2 — Orçamento e contrato em PDF

- **Orçamento em PDF formal**, gerado dentro da extensão (jsPDF, texto vetorial, sem servidor):
  - logo, dados da empresa, número automático (ORC-0001…), data e validade;
  - dados do cliente, tabela de itens, totais em destaque;
  - condições de pagamento, observações, assinatura (imagem ou desenhada), linha de aceite do cliente;
  - rodapé com numeração de páginas e marca d'água opcional.
- **Contrato editável** (CT-0001…):
  - qualificação das partes (contratante e contratada), cláusulas numeradas (PRIMEIRA, SEGUNDA…) e valor por extenso;
  - assinaturas das duas partes e testemunhas.
  - No WhatsApp, os dados do contratante e **cada cláusula podem ser editados antes de gerar**. O modelo padrão é editado nas Configurações.
  - Pode ser gerado a partir do orçamento atual ou de qualquer orçamento do histórico.
- **Editor visual** em Configurações › Orçamento e contrato: blocos reordenáveis com **arrastar e soltar** (⠿), liga/desliga de cada bloco, textos com variáveis, cores, fonte, papel, margens e pré-visualização real do PDF ao lado.
- No WhatsApp (painel › Ferramentas › Orçamento): **Gerar PDF** / **Gerar contrato** → Visualizar, Baixar ou **Anexar na conversa**. O anexo abre a janela de envio do próprio WhatsApp; o envio é sempre seu.
- Cada documento fica no histórico do contato (com nota automática). Opcionalmente, o status muda para “Proposta enviada” ou “Fechado”.
- O gerador de PDF só é carregado na primeira vez que você gera um documento, para não pesar o WhatsApp.
- O contrato padrão é um **modelo genérico**: revise-o com um advogado antes de usar.

## Novidades da 2.1

- **Workspace Admin**: embutido, não pode ser removido e é o padrão. Dá acesso a todos os botões, todas as abas, uma ficha de contato completa (reunindo o conteúdo de todos os modos) e ao diagnóstico.
- **Seguir** (botão na barra da conversa, na ficha, na paleta e na barra lateral, atalho `Alt+S`):
  - Avisa com som e notificação quando o contato fica **online** ou está **digitando**. O WhatsApp só mostra isso para a **conversa aberta**.
  - Quando chega **mensagem nova** (card com não lidas ou mensagem recebida na conversa aberta), fixa um aviso no topo da tela. O som se repete até você clicar **Vi** ou **Abrir conversa**. Com o Chrome em segundo plano, também aparece uma notificação do Chrome que só some quando você clica nela.
- **★ Prioridade fixa a conversa**: usa o menu nativo do WhatsApp (“Fixar conversa”). O WhatsApp permite no máximo 3 conversas fixadas. Além disso, a barra **★ Prioridades** no topo da lista mantém todas as prioritárias à mão, sem esse limite.
- **Sons** em todos os avisos, com volume ajustável e botão de teste em Preferências. Quando o WhatsApp não está aberto, os lembretes tocam som mesmo assim.
- **Menu lateral móvel**: segure o ⠿ e arraste com a mão; clique no ⠿ para ajustar a **opacidade** e a posição. O painel também pode ser solto (arrastando o topo) e tem opacidade própria.
- Correções: marcador de status e ★ não duplicam mais nos cards (cards aninhados do WhatsApp); valores do orçamento alinhados.

## Instalação

1. Extraia o ZIP.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `wa-workspace`.
4. Se a versão 1.1.7 estiver instalada, remova-a antes. **Os botões, status e cores dos contatos da 1.1.7 são migrados automaticamente** no primeiro carregamento.

## Onde está cada coisa

| Onde | O que |
|---|---|
| Barra de botões (no rail do WhatsApp) | Seus botões, grupos recolhíveis, favoritos, perfil ativo, painel, paleta e configurações |
| Card da conversa (lista) | Bolinha de status no avatar (clique para trocar), cor conforme o estilo escolhido, tags, 📌 notas, 🔔 retorno de hoje, ★ prioridade |
| Barra dentro da conversa | Status, tags, “Último contato / Sem resposta há…”, nota fixada, lembretes do dia com **Concluir / Adiar / Editar / Excluir**, timer |
| Painel lateral (`Alt+P`) | **Painel** (funil, retornos de hoje, contadores), **Contato** (ficha, notas, lembretes, tarefas, checklist, timer, ações contextuais), **Follow-up** (atrasados/hoje/próximos), **Contatos** (busca, filtros combináveis, favoritos, prioridades, recentes), **Mensagens** (rápidas, gerar, reescrever, sugerir), **Ferramentas** (orçamento/calculadora, catálogo, links, abas, histórico, diagnóstico) |
| Paleta (`Ctrl+K`) | Qualquer ação, botão, status, tag, mensagem, link, contato, modo ou perfil |
| Ícone da extensão | Abrir WhatsApp sem duplicar aba, retornos de hoje, atalhos para painel/paleta |
| Configurações | Botões, grupos, perfis, teclado (com detecção de conflitos), status, tags, aparência, mensagens, catálogo, links, checklist, contatos, backup e diagnóstico |

## Atalhos padrão

`Ctrl+K` paleta · `Alt+P` painel · `Alt+N` nota · `Alt+R` lembrete · `Alt+M` mensagens · `Alt+F` modo Foco · `Alt+4` configurações · `Alt+1..3` botões. Todos editáveis.

## Modos de trabalho

- **Foco**: só contato atual, status, nota, lembrete, próxima tarefa e mensagens rápidas; barra mostra só favoritos.
- **Prospecção**: dados do lead, gerar/inserir mensagem, abrir demo (link com “demo” no nome), marcar interessado, criar follow-up.
- **Atendimento**: timer, notas, tarefas, respostas de suporte, histórico interno do contato.
- **Cobrança**: mensagens de lembrete, vencimento, vencido, segunda cobrança e confirmação — sempre com revisão.

## Identificação de contatos

- Preferência pelo identificador estável da conversa (lido do `data-id` das mensagens, ex.: `5551…@c.us`).
- Sem identificador, usa o nome — mas **nunca assume que o nome é único**: se dois contatos têm o mesmo nome, o card mostra “?” e nada é aplicado até a conversa ser aberta e identificada.
- Um registro criado só pelo nome é promovido automaticamente para o ID assim que ele aparece (mantendo status, notas etc.).
- “Último contato / Sem resposta há…” usa apenas os horários das mensagens que a extensão conseguiu ver na conversa.

## Mensagens e “IA” local

Tudo é gerado localmente, sem enviar dados para servidores:
- Variáveis: `{{nome}} {{nomecompleto}} {{empresa}} {{cidade}} {{segmento}} {{telefone}} {{saudacao}} {{meunome}} {{minhaempresa}} {{data}} {{hora}}`. Variáveis sem valor são destacadas na revisão.
- **Gerar**: objetivo × tom × tamanho → 3 opções.
- **Reescrever**: mais profissional, curto, natural, direto, amigável ou comercial.
- **Sugerir resposta**: usa só o texto que você cola/seleciona (ou a última mensagem recebida, se você pedir) → 3 sugestões.
- Qualquer resultado pode ser copiado, inserido (após revisão) ou salvo como mensagem rápida.

## Lembretes

Agendados com `chrome.alarms`: geram notificação do Chrome (com **Abrir conversa** e **Adiar 1 hora**), aviso dentro do WhatsApp e contador no ícone da extensão.

## Listas nativas e segurança de cliques

“Abrir listas” e “Abrir lista específica” reproduzem o gesto do usuário: localizar **Mais listas** → clicar → esperar o menu → clicar no nome exato. Os candidatos são pontuados (texto, posição, tamanho, `aria-label`, ícone, vizinhança com o último filtro). Se a confiança for baixa, **não clica** e registra o motivo no diagnóstico. Filtros como *Grupos*, *Favoritas*, *Não lidas* e controles como *Configurações* ou *Nova conversa* são excluídos explicitamente.

## Modo diagnóstico

Ative em Configurações › Preferências. No painel › Ferramentas › Diagnóstico:
- **Capturar elemento**: clique em qualquer elemento do WhatsApp; registra tag, class, role, aria-label, title, data-testid, data-icon, posição, pais, HTML resumido, seletores sugeridos e a sequência `pointerdown/mousedown/pointerup/mouseup/click` (o clique não é repassado ao WhatsApp).
- **Testar “Mais listas”**: mostra candidatos e pontuações.
- **Copiar relatório**: estado da detecção (lista, conversa, campo de texto, rail) + logs.

## Backup

Configurações › Backup: exporta JSON escolhendo seções (botões, status, tags, mensagens, perfis, catálogo, links, checklist, preferências, contatos, histórico) e importa escolhendo o que restaurar (contatos: mesclar ou substituir).

## Arquitetura

```
manifest.json
background.js            service worker: abas (abrir/reutilizar/listar/ativar), alarms, notificações, badge
src/core/ns.js           namespace WAW, utilitários, datas, atalhos, debounce/throttle, logs, eventos
src/core/icons.js        ícones SVG
src/core/store.js        chrome.storage.local, padrões, normalização, migração v1, backup
src/core/crm.js          contatos: identidade, status, tags, notas, lembretes, tarefas, follow-up, busca, histórico, contadores, timer
src/core/writer.js       variáveis, gerador, reescrita, sugestões, orçamento (local)
src/wa/dom.js            adaptadores do DOM do WhatsApp (lista, conversa, JID, horários, campo de texto, busca, pontuação de candidatos)
src/wa/lists.js          “Mais listas” → lista específica com limiar de confiança
src/wa/diagnostic.js     captura de elementos e relatório
src/ui/*.js              kit (toast/modal/revisão/popover), rail, lista, barra da conversa, painel, paleta
src/features/*.js        contato atual, diálogos, registro de ações
src/main.js              boot, teclado, MutationObserver com debounce/throttle
options/, popup/         configurações e popup
```

Os módulos compartilham o namespace `WAW` (content scripts carregados em ordem pelo manifest; o options e o popup reutilizam `core/`).

## Desempenho

Um único `MutationObserver` com debounce/throttle por tarefa; cards só são redesenhados quando a assinatura (status/tags/notas/lembrete) muda; eventos por delegação; nada de `setInterval` agressivo (apenas relógio de 1 min para “há X min” e 1 s para o cronômetro visível).

## Limitações conhecidas

- O DOM do WhatsApp Web muda com frequência. Os seletores usam `id`/`role`/`aria`/`data-*`/estrutura com fallbacks; quando algo quebrar, use o modo diagnóstico.
- “Abrir conversa por telefone” navega para `web.whatsapp.com/send?phone=…` (recarrega a aba). Abrir contatos salvos tenta primeiro pela lista/busca, sem recarregar.
- O painel acoplado reduz a largura do `#app` do WhatsApp; se alguma versão do WhatsApp não se ajustar bem, desative “Painel lateral empurra o WhatsApp” em Preferências (o painel passa a flutuar).
