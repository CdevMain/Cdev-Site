#!/usr/bin/env bash
# Publica um dominio de cliente no Site Engine da VPS (R$0: Nginx + Let's Encrypt).
# Uso: sudo CERTBOT_EMAIL=voce@email.com ./add-client-domain.sh barbeariaalpha.com.br [/var/www/cdev-site]
# Pre-requisitos: DNS do dominio (A e www) apontando para esta VPS; dominio cadastrado no
# Control Center (Dominios, status ATIVO) e vinculado ao projeto PUBLICADO.
set -euo pipefail
DOMAIN="${1:?informe o dominio, ex.: cliente.com.br}"
ROOT="${2:-/var/www/cdev-site}"
EMAIL="${CERTBOT_EMAIL:?defina CERTBOT_EMAIL=seu@email antes de rodar}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "dominio invalido"; exit 1; }
CONF="/etc/nginx/sites-available/site-$DOMAIN"
cat > "$CONF" <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    root $ROOT;
    location /assets/ { try_files \$uri =404; expires 7d; }
    location ~ ^/(admin|control|dashboard|login)(\.html)?/?\$ { return 404; }
    location ~ ^/(supabase|ops|tools|\.git)/ { return 404; }
    location / { try_files /site.html =404; }
}
NGINX
ln -sf "$CONF" "/etc/nginx/sites-enabled/site-$DOMAIN"
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --redirect --non-interactive --agree-tos -m "$EMAIL" || echo "certbot falhou: confira o DNS e rode novamente"
echo "OK: https://$DOMAIN -> $ROOT/site.html"
