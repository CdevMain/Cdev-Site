# CDEV Monitor (VPS)

Worker simples que faz o monitoramento **externo** dos sites (HTTP/HTTPS, status, tempo de resposta, SSL)
e roda a verificação de vencimentos (pagamentos, domínios, hospedagens, SSL, backups, follow-up de leads).
Os sites dos clientes podem estar em qualquer hospedagem: a VPS da CDEV só faz requisições HTTP para eles.

Sem Redis, filas ou serviços pagos. Node ≥ 18, zero dependências.

## Instalação (Ubuntu, uma vez)

```bash
# 1. Node (se ainda não tiver)
sudo apt install -y nodejs && node -v        # precisa ser >= 18

# 2. Usuário sem privilégios para o worker
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cdev-monitor

# 3. Segredos (fora do repositório)
sudo cp /var/www/cdev-site/ops/monitor/cdev-monitor.env.example /etc/cdev-monitor.env
sudo nano /etc/cdev-monitor.env               # SUPABASE_URL + SUPABASE_SERVICE_KEY
sudo chown root:root /etc/cdev-monitor.env && sudo chmod 600 /etc/cdev-monitor.env

# 4. Teste manual
node /var/www/cdev-site/ops/monitor/cdev-monitor.mjs --check https://cdev.com.br
sudo -u cdev-monitor env $(sudo cat /etc/cdev-monitor.env | xargs) node /var/www/cdev-site/ops/monitor/cdev-monitor.mjs

# 5. Agendar (a cada 1 minuto; cada projeto respeita o próprio intervalo)
sudo cp /var/www/cdev-site/ops/monitor/cdev-monitor.service /var/www/cdev-site/ops/monitor/cdev-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cdev-monitor.timer
systemctl list-timers | grep cdev
journalctl -u cdev-monitor -n 50 --no-pager
```

> Ajuste `/var/www/cdev-site` no `.service` para o caminho real do clone na VPS.

### Alternativa com cron

```
* * * * * cdev-monitor . /etc/cdev-monitor.env; SUPABASE_URL=$SUPABASE_URL SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY /usr/bin/node /var/www/cdev-site/ops/monitor/cdev-monitor.mjs >> /var/log/cdev-monitor.log 2>&1
```

## Como funciona

1. `cc_monitor_targets()` devolve os projetos com monitoramento ligado cujo intervalo venceu.
2. Para cada um: até N tentativas (config. **Tentativas**) com timeout (config. **Timeout**).
3. Lê a data de expiração do certificado TLS.
4. `cc_record_check()` grava o check e compara com o estado anterior:
   - `ONLINE → OFFLINE`: abre incidente + alerta 🔴
   - `OFFLINE → ONLINE`: fecha incidente + alerta 🟢 com a duração
   - demais checks: só histórico (uptime), sem alerta.
5. A cada `DUE_CHECK_EVERY_MIN` minutos chama `cc_run_due_checks()` (vencimentos, sem duplicar alertas).
6. Opcional: encaminha alertas novos para o Telegram.

## Segurança

- A service key fica só em `/etc/cdev-monitor.env` (600). O navegador nunca a recebe.
- As funções `cc_monitor_targets` e `cc_record_check` só podem ser executadas pela service role.

## Futuro: CDEV Agent

A arquitetura já comporta um agente instalado nos servidores da CDEV (CPU, RAM, disco, Docker, Nginx…):
basta um endpoint/RPC `cc_record_agent_metrics` e uma tabela de métricas. O MVP não depende disso.
