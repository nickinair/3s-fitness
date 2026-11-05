const express = require('express');
const path = require('path');
const cors = require('cors');
const { fail } = require('./util');

const app = express();
app.use(cors({ exposedHeaders: ['X-Renew-Token'] }));   // 前端要能读到续签后的新 token
app.use(express.json({ limit: '15mb' }));

// API 路由
app.use('/api/auth', require('./routes/auth'));
// 会员端 / 平台端路由自带整体鉴权(r.use), 必须挂在独立前缀下, 不能挂到 /api 根上
app.use('/api/member', require('./routes/member'));
app.use('/api/platform', require('./routes/platform'));
app.use('/api', require('./routes/common'));
app.use('/api', require('./routes/members'));
app.use('/api', require('./routes/segments'));
app.use('/api', require('./routes/cards'));
app.use('/api', require('./routes/coaches'));
app.use('/api', require('./routes/group'));
app.use('/api', require('./routes/checkin'));
app.use('/api', require('./routes/finance'));
app.use('/api', require('./routes/report'));
app.use('/api', require('./routes/growth'));
// 按钮配置: 前端调用 /api/userButtonConfig/...; 挂在根上时 /:userId/:role/:pageType 会吞掉所有未匹配的三段式 GET
app.use('/api/userButtonConfig', require('./routes/userButtonConfig'));

app.get('/api/health', (req, res) => res.json({ code: 0, msg: 'ok', ts: Date.now() }));
// 未匹配的接口统一返回 JSON, 前端能提示具体原因而不是笼统的「服务异常」
app.use('/api', (req, res) => res.status(404).json(fail(`接口不存在: ${req.method} ${req.originalUrl.split('?')[0]}`, 404)));

// 静态资源: 三个前端 + 门户页
// 缓存策略: index.html 不缓存(no-store); js/css 每次协商(no-cache+ETag); 本地脚本自动带启动版本号, 每次部署重启后浏览器必拿新文件
const web = path.join(__dirname, '..', 'web');
const ASSET_VER = Date.now().toString(36);
const fs = require('fs');
const noCache = { etag: true, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, must-revalidate') };
const indexCache = {};
function serveIndex(app_) {
  return (req, res) => {
    if (!indexCache[app_]) {
      let html = fs.readFileSync(path.join(web, app_, 'index.html'), 'utf8');
      html = html.replace(/((?:src|href)=")((?:js|css)\/[^"?]+)(\?[^"]*)?"/g, `$1$2?v=${ASSET_VER}"`);
      indexCache[app_] = html;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(indexCache[app_]);
  };
}
app.use('/static', express.static(path.join(web, 'static')));
app.use('/uploads', express.static(path.join(web, 'uploads')));
for (const a of ['admin', 'platform', 'm']) {
  // 无尾斜杠 → 302 到带斜杠(保证相对路径 js/css 正确); 带斜杠 → 注入版本号的 index.html
  app.get(`/${a}`, (req, res) => (req.originalUrl.split('?')[0].endsWith('/') ? serveIndex(a)(req, res) : res.redirect(`/${a}/`)));
  app.get(`/${a}/index.html`, serveIndex(a));
  app.use(`/${a}`, express.static(path.join(web, a), { ...noCache, index: false }));
  app.get(`/${a}/*path`, serveIndex(a));
}
app.use('/', express.static(path.join(web, 'portal'), noCache));

// 错误处理
app.use((err, req, res, next) => {
  if (err && err.biz) return res.json(fail(err.message, err.code));
  console.error('[ERROR]', req.method, req.url, err);
  res.status(500).json(fail('服务器内部错误: ' + (err.message || 'unknown'), 500));
});

module.exports = app;
