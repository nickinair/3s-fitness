#!/bin/bash
# 启动健身房管理系统服务 (端口 8090)
cd "$(dirname "$0")/server"
if lsof -i :8090 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "服务已在运行: http://localhost:8090"
  exit 0
fi
mkdir -p logs
nohup node src/index.js >> logs/server.log 2>&1 &
echo $! > logs/server.pid
sleep 2
if curl -s localhost:8090/api/health >/dev/null; then
  echo "✅ 服务已启动: http://localhost:8090"
  echo "   门户页:     http://localhost:8090/"
  echo "   商户后台:   http://localhost:8090/admin/"
  echo "   平台总后台: http://localhost:8090/platform/"
  echo "   移动端H5:   http://localhost:8090/m/"
else
  echo "❌ 启动失败, 查看 server/logs/server.log"
  exit 1
fi
