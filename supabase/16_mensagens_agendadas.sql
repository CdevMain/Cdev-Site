-- 16 · Mensagens agendadas (CRM + extensao CDEV WhatsApp)
-- A mensagem agendada e uma linha de lead_messages com status AGENDADA e scheduled_at.
-- Quem envia e a extensao (pelo WhatsApp Web, no horario); ao enviar ela avisa o CRM e a linha vira ENVIADA.

alter table public.lead_messages add column if not exists scheduled_at timestamptz;
alter table public.lead_messages add column if not exists schedule_source text;   -- 'crm' | 'whatsapp'
alter table public.lead_messages add column if not exists schedule_error text;

alter table public.lead_messages drop constraint if exists lead_messages_status_check;
alter table public.lead_messages add constraint lead_messages_status_check
  check (status in ('GERADA','EDITADA','COPIADA','WHATSAPP_ABERTO','ENVIADA','AGENDADA','FALHOU','CANCELADA'));

create index if not exists lead_messages_scheduled_idx on public.lead_messages (scheduled_at) where status = 'AGENDADA';
