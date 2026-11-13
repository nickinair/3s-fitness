---
description: 记录 GitHub 仓库、生产服务器、数据库、域名入口信息，以及每次开发完成后同步合入 GitHub 的强制规范。
---

# 开发与生产环境部署规范 (Git & Production Deployment)

## ⚠️ 每次开发必执行动作（强制规则）
每次完成代码开发或修改后，**必须**将本地代码同步合入到 GitHub 上，提交后确保本地代码和 GitHub 上代码保持一致：
1. `git add -A && git commit -m "<提交说明>"`
2. `git pull --rebase origin claude/eloquent-gates-6z9vrk`
3. `git push origin claude/eloquent-gates-6z9vrk`
4. 确认 `git status` 干净且本地 `HEAD` 与 `origin/claude/eloquent-gates-6z9vrk` 完全一致。

## 1. GitHub 代码仓库
- **仓库地址**: `https://github.com/nickinair/3s-fitness.git`
- **当前主开发/部署分支**: `claude/eloquent-gates-6z9vrk`
- **本地项目路径**: `/Users/apple/Desktop/fitness-app`（兼容 `/Users/nickni/Desktop/fitness-app`）

## 2. 云服务器（Ubuntu）
- **公网 IP**: `1.14.47.160`
- **SSH 端口**: `22`
- **用户名**: `ubuntu`
- **密码**: `Nickis_2323`
- **服务端部署目录**: `/opt/fitness-app/server`
- **上传文件存储目录（COS 挂载/静态持久层）**: `/data/uploads`（映射 URL：`/uploads/...`）
- **Systemd 服务名**: `fitness-app.service`（配置文件：`/etc/systemd/system/fitness-app.service`）
- **Node 监听端口**: `8090`（由 Nginx 反向代理至 `80` / `443`）
- **常用运维命令**:
  ```bash
  sudo systemctl status fitness-app
  sudo systemctl restart fitness-app
  sudo journalctl -u fitness-app -f
  ```

## 3. 数据库（腾讯云 CynosDB MySQL）
- **数据库名**: `fitness_app`
- **用户名**: `root`
- **密码**: `Nickis-2323`（注意中间是短横线 `-`）
- **内网连接**: `10.6.0.6:3306`
- **外网连接**: `cd-cynosdbmysql-grp-333otp80.sql.tencentcdb.com:29057`
- **配置文件位置**: `server/src/config.js`

## 4. 域名、各端访问入口与微信小程序
- **正式域名**: `https://3s-fitness.cn`
- **移动端 H5（会员端 / 员工手机端）**: `https://3s-fitness.cn/m/`
- **门店 PC 管理后台**: `https://3s-fitness.cn/admin/`
- **平台总控后台（SaaS）**: `https://3s-fitness.cn/platform/`
- **健康检查接口**: `https://3s-fitness.cn/api/health`（或 `http://1.14.47.160:8090/api/health`）
- **微信小程序 AppID**: `wxc8f451cab5ffa843`（配置见 `miniprogram/project.config.json` 与 `miniprogram/config.js`）

## 5. 一键拉取并发布命令
```bash
export SSHPASS='Nickis_2323'
bash deploy/deploy.sh ubuntu@1.14.47.160
```
当用户要求“发布”、“上线”或“更新到线上服务器”时，请自动应用上述部署命令，无需再向用户询问服务器的密码。
