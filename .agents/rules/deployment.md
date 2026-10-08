---
description: 记录生产服务器部署相关信息，避免重复向用户询问。
---

# 生产环境部署信息 (Production Deployment)

本项目的正式线上服务器信息如下：
- **IP / 域名**: `1.14.47.160` (也可以用 `3s-fitness.cn`)
- **用户名**: `ubuntu`
- **SSH密码**: `Nickis_2323`

## 部署方法
使用项目中自带的 `deploy/deploy.sh` 脚本进行部署。该脚本支持通过环境变量传入密码来实现自动化部署：

```bash
cd /Users/nickni/Desktop/fitness-app
export SSHPASS='Nickis_2323'
bash deploy/deploy.sh ubuntu@1.14.47.160
```
*(注意：macOS 下执行上述命令前需要确保已通过 `brew install sshpass` 安装了 `sshpass` 工具。)*

当用户要求“发布”、“上线”或“更新到线上服务器”时，请自动应用上述部署命令，无需再向用户询问服务器的密码。
