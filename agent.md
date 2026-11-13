# 3S 健身房管理系统 - Agent 开发与部署规范 (agent.md)

## ⚠️ 每次开发必执行规则（最高优先级）

1. **代码同步与合入 GitHub（每次开发/修改完代码必须执行）**：
   - 每次在本地完成代码开发或修改后，**必须**将本地代码同步合入到 GitHub 远端仓库（分支：`claude/eloquent-gates-6z9vrk`），提交后确保本地代码与 GitHub 上的代码完全保持一致。
   - **标准执行步骤**：
     ```bash
     # 1. 查看本地改动状态
     git status

     # 2. 暂存并提交本地修改
     git add -A
     git commit -m "<清晰的提交说明>"

     # 3. 拉取远端最新代码并变基/合并，防止冲突或落后于远端
     git pull --rebase origin claude/eloquent-gates-6z9vrk

     # 4. 推送至 GitHub 远端分支
     git push origin claude/eloquent-gates-6z9vrk

     # 5. 校验本地与远端提交哈希一致且工作区干净
     git status
     git rev-parse HEAD origin/claude/eloquent-gates-6z9vrk
     ```
2. **线上部署**：
   - 当用户要求“发布”、“上线”或“更新到线上服务器”时，自动使用下方记录的服务器凭证与一键发布命令执行部署，并验证健康检查接口，无需重复向用户索要 IP 或密码。

---

## 1. GitHub 代码仓库

- **仓库地址**：`https://github.com/nickinair/3s-fitness.git`
- **当前主开发/部署分支**：`claude/eloquent-gates-6z9vrk`
- **本地项目路径**：`/Users/apple/Desktop/fitness-app`（原记录路径：`/Users/nickni/Desktop/fitness-app`）

---

## 2. 云服务器（Ubuntu）

- **公网 IP**：`1.14.47.160`
- **SSH 端口**：`22`
- **用户名**：`ubuntu`
- **密码**：`Nickis_2323`
- **服务端部署目录**：`/opt/fitness-app/server`
- **上传文件存储目录（COS 挂载/静态持久层）**：`/data/uploads`（映射 URL：`/uploads/...`）
- **Systemd 服务名**：`fitness-app.service`（配置文件：`/etc/systemd/system/fitness-app.service`）
- **Node 监听端口**：`8090`（由 Nginx 反向代理至 `80` / `443`）
- **常用运维命令**：
  ```bash
  # 查看服务状态
  sudo systemctl status fitness-app
  # 重启服务
  sudo systemctl restart fitness-app
  # 查看实时日志
  sudo journalctl -u fitness-app -f
  ```

---

## 3. 数据库（腾讯云 CynosDB MySQL）

- **数据库名（Database）**：`fitness_app`
- **用户名（User）**：`root`
- **密码（Password）**：`Nickis-2323`（注意中间是短横线 `-`）
- **内网连接（云服务器同 VPC 自动使用）**：
  - **Host**：`10.6.0.6`
  - **Port**：`3306`
- **外网连接（本地电脑直连/远程调试使用）**：
  - **Host**：`cd-cynosdbmysql-grp-333otp80.sql.tencentcdb.com`
  - **Port**：`29057`
- **配置文件位置**：`server/src/config.js`

---

## 4. 域名、各端访问入口与微信小程序

- **正式域名**：https://3s-fitness.cn
- **移动端 H5（会员端 / 员工手机端）**：https://3s-fitness.cn/m/
- **门店 PC 管理后台**：https://3s-fitness.cn/admin/
- **平台总控后台（SaaS）**：https://3s-fitness.cn/platform/
- **健康检查接口**：https://3s-fitness.cn/api/health （或 `http://1.14.47.160:8090/api/health`）
- **微信小程序 AppID**：`wxc8f451cab5ffa843`（配置见 `miniprogram/project.config.json` 与 `miniprogram/config.js`）

---

## 5. 一键拉取并发布命令

### 方式 A：本地同步 GitHub 后，通过部署脚本一键发布到云服务器
```bash
export SSHPASS='Nickis_2323'
bash deploy/deploy.sh ubuntu@1.14.47.160
```

### 方式 B：云服务器直接拉取 GitHub 最新分支并重启服务
```bash
export SSHPASS='Nickis_2323'
sshpass -e ssh -p 22 -o StrictHostKeyChecking=accept-new ubuntu@1.14.47.160 "cd /opt/fitness-app && git fetch origin && git checkout claude/eloquent-gates-6z9vrk && git reset --hard origin/claude/eloquent-gates-6z9vrk && cd /opt/fitness-app/server && npm install --omit=dev --registry=https://registry.npmmirror.com && sudo systemctl restart fitness-app && sleep 2 && curl -s http://localhost:8090/api/health"
```
