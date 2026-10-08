#!/bin/bash
# 域名备案通过后, 一键配置 Nginx 反向代理 + 免费 HTTPS 证书 (Let's Encrypt)
# 前提: 域名已解析到本服务器公网IP, 安全组已放行 80/443
# 用法(在服务器上执行): sudo bash nginx-setup.sh gym.yourdomain.com
set -e
DOMAIN="$1"
[ -z "$DOMAIN" ] && { echo "用法: sudo bash nginx-setup.sh <域名>"; exit 1; }

echo "==> 1/4 安装 nginx + certbot"
apt-get update -qq && apt-get install -y -qq nginx certbot python3-certbot-nginx

echo "==> 2/4 移除 80 端口 iptables 重定向 (交给 nginx)"
iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8090 2>/dev/null || true
netfilter-persistent save >/dev/null 2>&1 || true

echo "==> 3/4 配置反向代理"
cat > /etc/nginx/sites-available/fitness-app <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 10m;
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
nginx -t && systemctl restart nginx

echo "==> 4/4 申请并安装 HTTPS 证书 (自动续期)"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo ""
echo "✅ 完成! 访问: https://$DOMAIN/"
echo "   会员/员工端: https://$DOMAIN/m/   (小程序 web-view 用这个)"
echo "   商户后台:    https://$DOMAIN/admin/"
echo "   平台总台:    https://$DOMAIN/platform/"
echo "证书 90 天自动续期(certbot.timer), 无需人工干预"
