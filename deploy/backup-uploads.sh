#!/bin/bash
# 备份服务器上的用户上传图片到本地 (建议定期执行)
# 用法: ./deploy/backup-uploads.sh [ubuntu@1.14.47.160]
set -e
T="${1:-ubuntu@1.14.47.160}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/backups/uploads-$(date +%Y%m%d-%H%M)"
mkdir -p "$OUT"
if [ -n "$SSHPASS" ]; then SCP="sshpass -e scp"; else SCP="scp"; fi
$SCP -r "$T:/opt/fitness-app/server/web/uploads/*" "$OUT/" 2>/dev/null || echo "(服务器暂无上传文件)"
echo "✅ 已备份到 $OUT"
