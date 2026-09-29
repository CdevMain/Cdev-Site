# Sistema de mensagens de prospecção (WhatsApp)

Control Center → abrir um lead → aba **Mensagem** (abre por padrão).
Templates: menu **Mensagens** (`#/mensagens`).

## Fluxo
1. Escolha **Estratégia**, **Tom**, **Tamanho**, **Template** e **Personalização** (ou deixe tudo em Automático) → **Gerar mensagem**.
2. Aparecem até 3 versões, cada uma com **Usar** e **Copiar**. A primeira já entra no editor.
3. Edite livremente. O texto gerado e o texto final são guardados separados.
4. **Salvar** (GERADA/EDITADA) · **Copiar** (COPIADA) · **Abrir WhatsApp** (WHATSAPP_ABERTO).
5. Depois de enviar de fato no WhatsApp, clique **Marcar como enviada** (ENVIADA). Só aí o lead vira
   CONTATADO (ou DEMO_ENVIADA se a mensagem tinha o link da demo) e o follow-up é agendado para 3 dias.

## Regras
- Geração por regras, R$0, sem IA paga: só usa dados do lead. Nunca inventa nada.
- Template que usa uma variável vazia no lead é bloqueado (mostra quais faltam). Nenhuma mensagem sai com `{{...}}`.
- Não repete o texto da última mensagem; se não houver alternativa, oferece **Gerar mesmo assim**.
- Nichos, estratégias, regras da escolha automática, CTAs e blocos ficam centralizados em
  `assets/js/control/messaging.js` (objeto `CONFIG`). Para um novo nicho: adicione em `NICHES` e crie templates.

## Dados do lead que liberam personalização avançada
Editar cadastro → "Personalização da mensagem": gancho, problema detectado, oportunidade, motivo do contato,
especialidade, serviço principal, diferencial, observação. Preencha só o que você verificou.

## WhatsApp
- Função única `CC.openWhatsAppContact(phone, message)` (core.js). Telefone normalizado para 55+DDD+número.
- Abre sempre na janela nomeada `CDEV_WHATSAPP` (`window.open(url, 'CDEV_WHATSAPP')`): a 1ª vez cria a aba,
  as próximas reaproveitam a mesma aba. Uma aba do WhatsApp aberta manualmente por você não é reaproveitada
  (limitação do navegador).
- Desktop usa web.whatsapp.com/send; celular usa wa.me (setting `whatsapp_mode`: auto | web | app).
- Se o navegador bloquear pop-up, aparece o aviso; libere pop-ups para o domínio do CDEV.
- Não há automação do envio nem leitura das conversas.

Banco: `supabase/14_mensagens.sql` (tabela `lead_messages`, colunas novas em `leads` e `message_templates`).
