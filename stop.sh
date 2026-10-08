#!/bin/bash
# 停止健身房管理系统服务
pkill -f "node src/index.js" && echo "已停止" || echo "服务未在运行"
