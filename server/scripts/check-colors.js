/* 扫描前端里写死的颜色 (UI 改版用)
 * 用法: node scripts/check-colors.js [--list]
 *   默认输出各文件写死色值的数量; --list 逐条列出位置。
 * 配色只应定义在 web/static/theme.css (以及后台 app.css 的 :root / html.dark 变量块),
 * 页面与组件里应写 var(--xxx), JS 里需要实际色值时用 H.color() / themeColor()。
 */
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const SKIP_DIRS = ['uploads'];
const SKIP_FILES = [path.join('static', 'theme.css')];
const COLOR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;
// 纯白/纯黑与半透明黑白遮罩不算问题色
const ALLOW = /^(#fff|#ffffff|#000|#000000|rgba?\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255))$/i;

function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (!SKIP_DIRS.includes(f)) walk(p, out); }
    else if (/\.(css|js|html)$/.test(f)) out.push(p);
  }
  return out;
}

const list = process.argv.includes('--list');
let total = 0;
const perFile = [];
for (const file of walk(WEB, [])) {
  const rel = path.relative(WEB, file);
  if (SKIP_FILES.includes(rel)) continue;
  let text = fs.readFileSync(file, 'utf8');
  // 变量定义块本身不算
  text = text.replace(/(:root|html\.dark)\s*\{[^}]*\}/g, (m) => m.replace(/[^\n]/g, ' '));
  let n = 0;
  text.split('\n').forEach((line, i) => {
    for (const m of line.match(COLOR) || []) {
      if (ALLOW.test(m)) continue;
      n++;
      if (list) console.log(`${rel}:${i + 1}  ${m}`);
    }
  });
  if (n) perFile.push([rel, n]);
  total += n;
}
if (!list) perFile.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(String(n).padStart(5), f));
console.log(`共 ${total} 处写死的颜色`);
