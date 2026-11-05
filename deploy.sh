#!/bin/bash
# 一键部署/更新健身房管理系统到云服务器 (Ubuntu, 普通用户+sudo)
# 用法: ./deploy/deploy.sh ubuntu@1.14.47.160 [ssh端口]
# 密码认证可先: export SSHPASS='密码' 并把下方 SSH/SCP 换成 sshpass -e ssh/scp
set -e
TARGET="$1"
PORT="${2:-22}"
[ -z "$TARGET" ] && { echo "用法: ./deploy/deploy.sh user@服务器IP [ssh端口]"; exit 1; }

if [ -d "$(dirname "$0")/server" ]; then
  ROOT="$(cd "$(dirname "$0")" && pwd)"
else
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi
SSHOPTS="-p $PORT -o StrictHostKeyChecking=accept-new"
if [ -n "$SSHPASS" ]; then SSH="sshpass -e ssh $SSHOPTS"; SCP="sshpass -e scp -P $PORT"; else SSH="ssh $SSHOPTS"; SCP="scp -P $PORT"; fi

echo "==> 1/4 打包并上传"
TARBALL="/tmp/fitness-app-$(date +%s).tar.gz"
tar -czf "$TARBALL" -C "$ROOT" \
  --exclude 'server/node_modules' --exclude 'server/logs' --exclude '.DS_Store' --exclude '._*' \
  --exclude 'server/web/uploads' \
  server start.sh stop.sh README.md
$SCP "$TARBALL" "$TARGET:/tmp/fitness-app.tar.gz"
rm -f "$TARBALL"

echo "==> 2/4 远端安装/更新"
$SSH "$TARGET" 'bash -s' <<'REMOTE'
set -e
sudo mkdir -p /opt/fitness-app
sudo tar -xzf /tmp/fitness-app.tar.gz -C /opt/fitness-app 2>/dev/null && rm -f /tmp/fitness-app.tar.gz
sudo chown -R $(whoami) /opt/fitness-app

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - >/dev/null 2>&1
  sudo apt-get install -y nodejs >/dev/null 2>&1
fi
cd /opt/fitness-app/server
npm install --omit=dev --registry=https://registry.npmmirror.com 2>&1 | tail -1

# 同 VPC 用内网库, 否则外网
DB_HOST="cd-cynosdbmysql-grp-333otp80.sql.tencentcdb.com"; DB_PORT=29057
if timeout 3 bash -c '</dev/tcp/10.6.0.6/3306' 2>/dev/null; then DB_HOST="10.6.0.6"; DB_PORT=3306; fi
echo "DB -> $DB_HOST:$DB_PORT"

sudo tee /etc/systemd/system/fitness-app.service >/dev/null <<EOF
[Unit]
Description=3S Fitness App Server
After=network.target

[Service]
User=$(whoami)
WorkingDirectory=/opt/fitness-app/server
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=3
Environment=PORT=8090
Environment=DB_HOST=$DB_HOST
Environment=DB_PORT=$DB_PORT

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable fitness-app >/dev/null 2>&1
sudo systemctl restart fitness-app
sleep 3
REMOTE

echo "==> 3/4 健康检查"
$SSH "$TARGET" 'curl -s http://localhost:8090/api/health && echo'

echo "==> 4/4 完成: http://$(echo "$TARGET" | cut -d@ -f2):8090/"
