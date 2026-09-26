-- CDEV CONTROL CENTER - agendamento OPCIONAL dentro do proprio Supabase (pg_cron, gratuito)
--
-- O worker da VPS (ops/monitor/cdev-monitor.mjs) ja chama cc_run_due_checks() a cada execucao.
-- Use este arquivo apenas se quiser que os vencimentos sejam verificados mesmo com a VPS fora do ar.
-- O monitoramento HTTP/SSL continua sendo feito pelo worker (checagem externa real).
--
-- Pre-requisito: habilitar a extensao pg_cron em Database > Extensions.

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'cdev-due-checks';

-- A cada hora, no minuto 7 (horario UTC do servidor)
select cron.schedule('cdev-due-checks', '7 * * * *', $$select public.cc_run_due_checks();$$);

select jobid, jobname, schedule, command from cron.job where jobname = 'cdev-due-checks';
