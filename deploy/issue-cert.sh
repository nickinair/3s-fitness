#!/bin/bash
# 自动签发 HTTPS 证书: 优先 HTTP-01(需80), 回落 TLS-ALPN-01(需443)
# 在服务器上执行: sudo bash issue-cert.sh <域名>
set -e
DOMAIN="${1:-1-14-47-160.sslip.io}"
command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx; }

port_open() { timeout 3 bash -c "</dev/tcp/127.0.0.1/$1" 2>/dev/null; }

echo "==> 尝试 HTTP-01 验证 (端口80)"
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
     --register-unsafely-without-email --redirect 2>&1 | tee /tmp/certbot.log | tail -4; then
  if grep -q "Successfully received certificate\|Certificate not yet due for renewal\|Successfully deployed" /tmp/certbot.log; then
    echo "✅ HTTP-01 签发成功"; exit 0
  fi
fi

CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [ ! -f "$CERT" ]; then
  echo "❌ 证书签发失败。Let's Encrypt 侧原因:"
  grep -E "Detail:" /var/log/letsencrypt/letsencrypt.log | tail -1
  echo "   → 「Timeout during connect」= 80 端口入站被安全组/防火墙拦截, 请放行 TCP:80 后重试"
  exit 1
fi

echo "==> 配置 nginx HTTPS"
cat > /etc/nginx/sites-available/fitness-app <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/fitness-app /etc/nginx/sites-enabled/fitness-app
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "✅ HTTPS 已就绪: https://$DOMAIN/"
