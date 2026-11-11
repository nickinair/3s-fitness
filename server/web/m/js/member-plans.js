/* 会员端-训练计划列表/详情 + 共享: 计划长图生成(canvas) */
(function () {

  /* 长图素材: 首页视频首帧(同源, 不污染 canvas) + 白色 Logo。脚本加载即预热, 生成前 await PlanImage.ready
     每张首帧配一个低饱和色调: [图片名, 压暗用的 rgb, 序号/点缀色(前景), 序号底色] */
  const PLAN_POSTERS = [
    ['hanteln2', '18,34,46', '#4F6B80', '#E3EAF0'],   // 钢蓝
    ['dumbbell', '26,34,32', '#5F7566', '#E5ECE6'],   // 灰绿
    ['21Run01', '34,30,46', '#66678A', '#E8E7EF'],    // 灰紫
    ['21Run01', '46,32,26', '#8A6A55', '#F0E7E0'],    // 暖陶(同一素材换色调; MR8 首帧近乎全黑, 不用于长图)
  ];
  const planImgs = {};
  const loadImg = (k, src) => new Promise((resolve) => {
    const im = new Image();
    im.onload = () => { planImgs[k] = im; resolve(); };
    im.onerror = () => resolve();
    im.src = src;
  });
  const planReady = Promise.race([
    Promise.all(PLAN_POSTERS.map(p => loadImg(p[0], '/static/videos/' + p[0] + '-poster.jpg')).concat(loadImg('logo', '/static/logo-white.png'))),
    new Promise(r => setTimeout(r, 2500)), // 弱网兜底: 最多等 2.5s, 没加载完就退回纯色渐变
  ]);
  // 同一份计划(标题+日期)每次生成用同一张图, 不同计划自动错开
  const planTone = (seed) => {
    let h = 2166136261; const s = String(seed || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; // FNV-1a + 末尾扰动, 相似标题也能均匀分到 4 种色调
    return PLAN_POSTERS[(h >>> 0) % PLAN_POSTERS.length];
  };

  /* 生成品牌风格计划长图, 返回 dataURL
     opt: {title, member, coach, date, note, items:[{action_name,sets,reps,unit,weight,rest,remark}]} */
  window.PlanImage = function (opt) {
    const W = 750, PAD = 36;
    const items = opt.items || [];
    const dpr = 2;

    // 预计算每个动作卡片高度
    const itemHeights = items.map(it => 96 + (it.remark ? 30 : 0));
    const noteH = opt.note ? 86 : 0;
    const headH = 268;
    const listH = itemHeights.reduce((a, b) => a + b + 16, 0);
    const HT = headH + 24 + listH + noteH + 96;

    const cv = document.createElement('canvas');
    cv.width = W * dpr / 2; cv.height = HT * dpr / 2; // dpr=2 但基准就用 W, 简化: 直接 2x
    cv.width = W; cv.height = HT;
    const ctx = cv.getContext('2d');
    const rr = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    const F = (s, w) => (w || '') + ' ' + s + 'px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';

    // 背景: 极浅暖灰, 比纯灰更柔和
    ctx.fillStyle = '#F3F2EF'; ctx.fillRect(0, 0, W, HT);

    // 顶部 Banner: 视频首帧(cover 裁切) + 低饱和色调压暗 + 斜向高光; 素材未就绪时退回品牌渐变
    const tone = planTone((opt.title || '') + '|' + (opt.date || ''));
    const poster = planImgs[tone[0]];
    if (poster) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, headH); ctx.clip();
      const s = Math.max(W / poster.width, headH / poster.height);
      const dw = poster.width * s, dh = poster.height * s;
      ctx.drawImage(poster, (W - dw) / 2, (headH - dh) / 2, dw, dh);
      ctx.restore();
      const ov = ctx.createLinearGradient(0, 0, W, 0);
      ov.addColorStop(0, 'rgba(' + tone[1] + ',.82)');
      ov.addColorStop(0.55, 'rgba(' + tone[1] + ',.58)');
      ov.addColorStop(1, 'rgba(' + tone[1] + ',.30)');
      ctx.fillStyle = ov; ctx.fillRect(0, 0, W, headH);
      const shine = ctx.createLinearGradient(0, 0, W * 0.6, headH);
      shine.addColorStop(0, 'rgba(255,255,255,.14)'); shine.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = shine; ctx.fillRect(0, 0, W, headH);
      const btm = ctx.createLinearGradient(0, headH * 0.55, 0, headH);
      btm.addColorStop(0, 'rgba(0,0,0,0)'); btm.addColorStop(1, 'rgba(0,0,0,.28)');
      ctx.fillStyle = btm; ctx.fillRect(0, 0, W, headH);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, headH);
      g.addColorStop(0, 'rgb(' + tone[1] + ')'); g.addColorStop(1, tone[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, headH);
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.beginPath(); ctx.arc(W - 60, 40, 110, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(80, headH - 10, 70, 0, 7); ctx.fill();
    }

    // 品牌: 白色 Logo + 右上角磨砂胶囊「私教训练计划」
    const logo = planImgs.logo;
    if (logo) {
      const lh = 74, lw = lh * logo.width / logo.height;
      ctx.drawImage(logo, PAD - 8, 26, lw, lh);
    } else {
      ctx.fillStyle = '#fff'; rr(PAD, 40, 64, 64, 14); ctx.fill();
      ctx.fillStyle = 'rgb(' + tone[1] + ')'; ctx.font = F(30, '800'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('3S', PAD + 32, 74);
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = F(30, '700');
      ctx.fillText('3S运动', PAD + 80, 74);
    }
    ctx.font = F(20, '600'); ctx.textBaseline = 'middle';
    const tagTxt = '私教训练计划', tagW = ctx.measureText(tagTxt).width + 36;
    ctx.fillStyle = 'rgba(255,255,255,.16)'; rr(W - PAD - tagW, 46, tagW, 36, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1.5; rr(W - PAD - tagW, 46, tagW, 36, 18); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(tagTxt, W - PAD - tagW / 2, 64);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // 标题
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff'; ctx.font = F(40, '800');
    ctx.fillText(opt.title || '训练计划', PAD, 168);
    ctx.font = F(24); ctx.fillStyle = 'rgba(255,255,255,.9)';
    const sub = [opt.member, opt.coach ? opt.coach + ' 教练' : '', opt.date].filter(Boolean).join(' · ');
    ctx.fillText(sub, PAD, 214);
    ctx.restore();

    // 动作列表
    let y = headH + 24;
    ctx.textBaseline = 'alphabetic';
    items.forEach((it, i) => {
      const h = itemHeights[i];
      ctx.fillStyle = '#fff'; rr(24, y, W - 48, h, 16); ctx.fill();
      // 序号圆: 与 Banner 同色调的低饱和底色
      ctx.fillStyle = tone[3];
      ctx.beginPath(); ctx.arc(24 + 46, y + 48, 24, 0, 7); ctx.fill();
      ctx.fillStyle = tone[2]; ctx.font = F(24, '700'); ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), 24 + 46, y + 57);
      ctx.textAlign = 'left';
      // 动作名
      ctx.fillStyle = H.color('--c-title'); ctx.font = F(28, '700');
      ctx.fillText(it.action_name || '动作', 24 + 88, y + 44);
      // 规格
      const spec = [];
      spec.push((it.sets || 1) + ' 组 × ' + (it.reps || 0) + ' ' + (it.unit || '次'));
      if (it.weight) spec.push('重量 ' + it.weight);
      if (it.rest) spec.push('组间歇 ' + it.rest);
      ctx.fillStyle = H.color('--c-text-2'); ctx.font = F(22);
      ctx.fillText(spec.join('   ·   '), 24 + 88, y + 80);
      if (it.remark) {
        ctx.fillStyle = H.color('--c-text-3'); ctx.font = F(20);
        ctx.fillText('备注：' + it.remark, 24 + 88, y + 110);
      }
      // 右侧动作示意图(匹配得到才画)
      if (window.ActionFig) ActionFig.draw(ctx, it.action_name, W - 24 - 132, y + 4, 124, 88, H.color('--c-title'));
      y += h + 16;
    });

    // 教练叮嘱
    if (opt.note) {
      ctx.fillStyle = tone[3]; rr(24, y, W - 48, 70, 14); ctx.fill();
      ctx.fillStyle = tone[2]; rr(24, y, 6, 70, 3); ctx.fill();
      ctx.fillStyle = H.color('--c-text-2'); ctx.font = F(22);
      ctx.fillText('📣 教练叮嘱：' + opt.note, 48, y + 43);
      y += noteH;
    }

    // 底部 slogan
    ctx.fillStyle = H.color('--c-text-3'); ctx.font = F(22); ctx.textAlign = 'center';
    ctx.fillText('—— 3S运动 · 与更好的自己相遇 ——', W / 2, HT - 40);

    return cv.toDataURL('image/jpeg', 0.86);
  };
  window.PlanImage.ready = planReady;

  /* 动作示意图: 缩略图组件 + 点开放大(动画 + 动作要领) —— 图形由 /static/action-figs.js 生成 */
  // 本店自定义动作的示意图(AI 识别 / 人工指定)表, 按登录身份懒加载一次; figStore.v 变化让缩略图重新渲染
  const figStore = Vue.reactive({ v: 0 });
  let figLoadedFor = '';
  window.loadActionFigs = async function (force) {
    if (!window.ActionFig || !Store.token || (!force && figLoadedFor === Store.token)) return;
    figLoadedFor = Store.token;
    try {
      const map = await API.get(Store.type === 'staff' ? '/action-figs' : '/member/action-figs', { silent: true });
      ActionFig.setCustom(map || {});
      figStore.v++;
    } catch (e) { figLoadedFor = ''; }
  };
  window.showActionFig = function (name, desc, fig) {
    const m = window.ActionFig && ActionFig.match(name, fig == null ? undefined : fig);
    if (!m) return;
    const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    vant.showDialog({
      title: name,
      allowHtml: true,
      className: 'afig-dialog',
      message: '<div class="afig-big">' + ActionFig.svg(m) + '</div>'
        + '<div class="afig-cue"><b>动作要领</b>' + esc(m.cue) + '</div>'
        + (desc ? '<div class="afig-desc">' + esc(desc) + '</div>' : '')
        + '<div class="afig-tip">示意图仅供参考，具体动作以教练现场指导为准</div>',
      confirmButtonText: '知道了',
      confirmButtonColor: H.color('--brand'),
    });
  };
  (window.MComponents = window.MComponents || {})['action-fig'] = {
    // fig: 动作库里存的示意图类型(有就用它, 没有按 AI 识别表/内置规则)
    props: { name: String, desc: String, fig: { type: String, default: undefined }, size: { type: Number, default: 56 }, anim: { type: Boolean, default: false } },
    computed: {
      html() {
        if (!window.ActionFig || figStore.v < 0) return '';
        const m = ActionFig.match(this.name, this.fig == null ? undefined : this.fig);
        return m ? ActionFig.svg(m, { anim: this.anim }) : '';
      },
    },
    mounted() { window.loadActionFigs(); },
    template: '<span v-if="html" class="afig-thumb" :style="{width: size + \'px\', height: Math.round(size * 0.75) + \'px\'}" v-html="html" @click.stop="open" title="查看动作示意"></span>',
    methods: { open() { window.showActionFig(this.name, this.desc, this.fig); } },
  };

  /* 解析 items (JSON 字符串) */
  window.parsePlanItems = function (s) {
    if (Array.isArray(s)) return s;
    try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  };

  /* 解析 lesson_plan 字段 (JSON 字符串 / 纯图片URL / 存量纯文本) */
  window.parseLessonPlan = function (s) {
    if (!s) return null;
    if (typeof s === 'object') return s;
    const str = String(s).trim();
    if (!str) return null;
    if (str.startsWith('{') && str.endsWith('}')) {
      try {
        const obj = JSON.parse(str);
        if (obj && typeof obj === 'object') {
          if (!Array.isArray(obj.items)) obj.items = window.parsePlanItems(obj.items);
          return obj;
        }
      } catch (e) { /* fallback */ }
    }
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/uploads/') || str.startsWith('data:image/')) {
      return { title: '训练计划', img_url: str, items: [] };
    }
    return { title: '训练计划', legacy_text: str, note: str, items: [] };
  };

  /* DataURL 转 Blob (用于上传 canvas 生成的海报图片) */
  window.dataURLtoBlob = function (dataurl) {
    const arr = dataurl.split(',');
    const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  window.MComponents = window.MComponents || {};

  /* 通用组件: 训练计划图片缩略图展示卡片 (学员/教练端共用) */
  window.MComponents['lesson-plan-card'] = {
    props: {
      plan: [String, Object],
      booking: Object,
      canEdit: { type: Boolean, default: false },
    },
    emits: ['edit'],
    data() {
      return { localImg: '' };
    },
    computed: {
      parsed() {
        return window.parseLessonPlan(this.plan);
      },
      imgUrl() {
        return (this.parsed && this.parsed.img_url) || this.localImg;
      },
    },
    watch: {
      plan: { immediate: true, handler() { this.ensurePoster(); } },
    },
    methods: {
      /* 只有动作、还没有海报的计划(如小S写入的): 用与「制定计划」同一套 canvas 生成海报显示;
         员工端顺手上传并回写 img_url, 之后会员端也直接看到这张图 */
      async ensurePoster() {
        const p = this.parsed;
        this.localImg = '';
        if (!p || p.img_url || !Array.isArray(p.items) || !p.items.length || !window.PlanImage) return;
        const bk = this.booking || {};
        const raw = bk.rawBooking || {};
        const id = bk.id || raw.id;
        try {
          await window.PlanImage.ready;
          const dataUrl = window.PlanImage({
            title: p.title || '训练计划',
            member: bk.realname || bk.studentName || raw.realname || '',
            coach: bk.coach_name || raw.coach_name || '',
            date: H.dateOf(bk.date || bk.dateStr || raw.date) || H.today(),
            note: p.note || '',
            items: p.items,
          });
          this.localImg = dataUrl;
          const done = window.__planPosterSaved || (window.__planPosterSaved = {});
          if (Store.type !== 'staff' || !id || done[id]) return;
          done[id] = true;
          const blob = window.dataURLtoBlob(dataUrl);
          const imgUrl = await API.upload(new File([blob], 'plan-' + id + '-' + Date.now() + '.jpg', { type: 'image/jpeg' }));
          if (!imgUrl) return;
          await API.put('/ptrain-bookings/' + id + '/lesson-plan', {
            lesson_plan: JSON.stringify(Object.assign({}, p, { img_url: imgUrl, updated_at: new Date().toISOString() })),
          }, { silent: true });
        } catch (e) { /* 生成失败时退回动作清单显示 */ }
      },
      preview(url) {
        if (!url) return;
        vant.showImagePreview({
          images: [url],
          closeable: true,
          showIndex: false,
        });
      },
      onEdit() {
        this.$emit('edit', this.booking);
      },
    },
    template: [
      '<div class="lesson-plan-box" v-if="parsed || canEdit">',
      // 情况1: 包含生成的计划海报图片 (图片缩略图卡片)
      '  <template v-if="parsed && imgUrl">',
      '    <div class="lesson-plan-head">',
      '      <span class="lesson-plan-head-title"><van-icon name="notes-o"/> 本节课训练计划</span>',
      '      <van-button v-if="canEdit" size="mini" round plain type="primary" @click.stop="onEdit">编辑计划</van-button>',
      '    </div>',
      '    <div class="plan-thumb-card" @click="preview(imgUrl)">',
      '      <div class="plan-thumb-media">',
      '        <img :src="imgUrl" class="plan-thumb-img" alt="训练计划"/>',
      '        <div class="plan-thumb-zoom-tag">点击放大</div>',
      '      </div>',
      '      <div class="plan-thumb-desc">',
      '        <div class="plan-thumb-title">{{ parsed.title || "训练计划" }}</div>',
      '        <div class="plan-thumb-count" v-if="parsed.items && parsed.items.length">',
      '          <van-icon name="fire-o"/> {{ parsed.items.length }} 个动作安排',
      '        </div>',
      '        <div class="plan-thumb-note" v-if="parsed.note">叮嘱：{{ parsed.note }}</div>',
      '        <div class="plan-thumb-tip"><van-icon name="search" size="11"/> 点击缩略图放大查看高清大图</div>',
      '      </div>',
      '    </div>',
      '  </template>',
      // 情况2: 存量纯文本计划
      '  <template v-else-if="parsed && parsed.legacy_text">',
      '    <div class="lesson-plan-head">',
      '      <span class="lesson-plan-head-title"><van-icon name="notes-o"/> 本节课训练计划</span>',
      '      <van-button v-if="canEdit" size="mini" round plain type="primary" @click.stop="onEdit">升级为图表计划</van-button>',
      '    </div>',
      '    <div class="plan-legacy-card">',
      '      <div class="plan-legacy-text">{{ parsed.legacy_text }}</div>',
      '    </div>',
      '  </template>',
      // 情况2b: 有结构化动作但还没生成海报(如小S写入的计划), 直接列出动作
      '  <template v-else-if="parsed && parsed.items && parsed.items.length">',
      '    <div class="lesson-plan-head">',
      '      <span class="lesson-plan-head-title"><van-icon name="notes-o"/> 本节课训练计划</span>',
      '      <van-button v-if="canEdit" size="mini" round plain type="primary" @click.stop="onEdit">编辑计划</van-button>',
      '    </div>',
      '    <div class="plan-legacy-card">',
      '      <div class="plan-items-title">{{ parsed.title || "训练计划" }}</div>',
      '      <div v-for="(it, i) in parsed.items" :key="i" class="plan-items-row"><action-fig :name="it.action_name" :size="28" style="vertical-align:middle;margin-right:4px"/>{{ i + 1 }}. {{ it.action_name }} {{ it.sets }}组×{{ it.reps }}{{ it.unit || "次" }}<span v-if="it.weight"> · {{ it.weight }}{{ /kg|公斤/i.test(String(it.weight)) ? "" : "kg" }}</span></div>',
      '      <div v-if="parsed.note" class="plan-items-note">叮嘱：{{ parsed.note }}</div>',
      '    </div>',
      '  </template>',
      // 情况3: 暂无计划但教练可编辑新建
      '  <template v-else-if="canEdit">',
      '    <div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--c-bg-2);border-radius:6px;border:1px dashed var(--brand-soft-2);">',
      '      <span class="muted" style="font-size:12px">暂未填写训练计划</span>',
      '      <van-button size="mini" round plain type="primary" @click.stop="onEdit">+ 制定计划</van-button>',
      '    </div>',
      '  </template>',
      '</div>',
    ].join('\n'),
  };

  /* 全局组件: 图二能力的训练计划编辑器弹窗 (AI一句话生成 + 动作清单 + 自动生成长图并上传保存) */
  window.MComponents['plan-editor-popup'] = {
    props: {
      modelValue: { type: Boolean, default: false },
      booking: Object,
    },
    emits: ['update:modelValue', 'saved'],
    data() {
      return {
        saving: false,
        form: { title: '', plan_date: '', note: '' },
        items: [],
        aiText: '',
        aiLoading: false,
        listening: false,
        aiStatus: { llm: false, asr: false },
        recBars: [],
        recSec: 0,
        sugFor: -1,
        sugs: [],
        tplShow: false,
        tplLoading: false,
        tplList: [],
        tplRecent: [],
        saveTpl: false,
      };
    },
    computed: {
      units() { return ['次', '秒', '分钟']; },
      recTime() {
        const m = Math.floor(this.recSec / 60), sec = this.recSec % 60;
        return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
      },
    },
    watch: {
      modelValue(val) {
        if (val) this.initData();
        else this.cleanup();
      },
    },
    beforeUnmount() {
      this.cleanup();
    },
    methods: {
      cleanup() {
        if (this._waveTimer) { clearInterval(this._waveTimer); this._waveTimer = null; }
        if (this._rec) { try { this._rec.stop(); } catch(e){} this._rec = null; }
        this.listening = false;
        this.recBars = [];
        this.recSec = 0;
      },
      bkMeta() {
        const bk = this.booking || {};
        const raw = bk.rawBooking || {};
        return {
          id: bk.id || raw.id,
          vip_id: bk.vip_id || bk.vipId || raw.vip_id || 0,
          realname: bk.realname || bk.studentName || raw.realname || '',
          coach_id: bk.coach_id || raw.coach_id || ((Store.user && Store.user.coach_id) || 0),
          coach_name: bk.coach_name || raw.coach_name || (Store.user && Store.user.realname) || '',
          date: H.dateOf(bk.date || bk.dateStr || raw.date) || H.today(),
          lesson_plan: bk.lesson_plan || raw.lesson_plan || '',
        };
      },
      initData() {
        this.cleanup();
        const m = this.bkMeta();
        const mName = m.realname || '学员';
        const parsed = window.parseLessonPlan(m.lesson_plan);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length) {
          let t = parsed.title || (mName + ' 私教训练');
          if (m.realname && /^学员\s*(私教训练|训练计划)$/.test(String(t).trim())) t = m.realname + ' 私教训练';
          this.form = {
            title: t,
            plan_date: m.date,
            note: parsed.note || '',
          };
          this.items = parsed.items.map(it => ({
            action_name: it.action_name || '',
            sets: Number(it.sets) || 1,
            reps: Number(it.reps) || 12,
            unit: it.unit || '次',
            weight: it.weight || '',
            rest: it.rest || '',
            remark: it.remark || '',
            part: it.part || '',
          }));
          this.aiText = '';
        } else if (parsed && parsed.legacy_text) {
          this.form = {
            title: mName + ' 训练计划',
            plan_date: m.date,
            note: parsed.legacy_text,
          };
          this.items = [];
          this.aiText = parsed.legacy_text;
        } else {
          this.form = {
            title: mName + ' 私教训练',
            plan_date: m.date,
            note: '',
          };
          this.items = [];
          this.aiText = '';
        }
        API.get('/ai/status', { silent: true }).then(s => { this.aiStatus = s || {}; }).catch(() => {});
      },
      close() {
        this.$emit('update:modelValue', false);
      },
      /* 从模板选择: 我的模板 + 该学员最近的计划(教练接口自动只返回本人的) */
      async openTpl() {
        this.tplShow = true;
        this.tplLoading = true;
        const m = this.bkMeta();
        try {
          const [t, r] = await Promise.all([
            API.get('/training-plans?is_template=1&size=50', { silent: true }),
            m.vip_id ? API.get('/training-plans?is_template=0&size=5&vip_id=' + m.vip_id, { silent: true }) : Promise.resolve({ list: [] }),
          ]);
          const pick = (p) => {
            let items = [];
            try { items = JSON.parse(p.items || '[]'); } catch (e) { items = []; }
            return { id: p.id, title: p.title, note: p.note || '', date: p.plan_date ? H.dateOf(p.plan_date) : '', items,
              brief: items.length + '个动作：' + items.slice(0, 3).map(x => x.action_name).join('、') + (items.length > 3 ? '…' : '') };
          };
          this.tplList = ((t && t.list) || []).map(pick).filter(p => p.items.length);
          this.tplRecent = ((r && r.list) || []).map(pick).filter(p => p.items.length);
        } catch (e) { this.tplList = []; this.tplRecent = []; }
        finally { this.tplLoading = false; }
      },
      async useTpl(p, isTpl) {
        if (this.items.length) {
          try {
            await vant.showConfirmDialog({ title: '使用「' + p.title + '」', message: '将替换当前已添加的 ' + this.items.length + ' 个动作', confirmButtonColor: 'var(--brand)' });
          } catch (e) { return; }
        }
        this.items = p.items.map(it => ({
          action_name: it.action_name || '', sets: Number(it.sets) || 1, reps: Number(it.reps) || 12, unit: it.unit || '次',
          weight: it.weight || '', rest: it.rest || '', remark: it.remark || '', part: it.part || '',
        }));
        // 模板名作为本节课标题; 沿用学员历史计划时保留原标题
        if (isTpl || !String(this.form.title || '').trim() || /私教训练$|训练计划$/.test(this.form.title)) this.form.title = p.title;
        if (p.note && !String(this.form.note || '').trim()) this.form.note = p.note;
        this.saveTpl = false;
        this.tplShow = false;
        vant.showToast({ message: '已带入 ' + this.items.length + ' 个动作，可继续修改', icon: 'success' });
      },
      addItem() {
        this.items.push({ action_name: '', sets: 4, reps: 12, unit: '次', weight: '', rest: '', remark: '', part: '' });
      },
      hideSug() { setTimeout(() => { this.sugFor = -1; }, 150); },
      async suggest(i) {
        const kw = (this.items[i].action_name || '').trim();
        this.sugFor = i;
        if (kw.length < 1) { this.sugs = []; return; }
        try {
          const list = await API.get('/training-actions?keyword=' + encodeURIComponent(kw), { silent: true });
          this.sugs = (list || []).filter(a => a.name !== kw).slice(0, 5);
        } catch (e) { this.sugs = []; }
      },
      pickSug(i, s) {
        this.items[i].action_name = s.name;
        this.items[i].part = s.part;
        this.sugFor = -1;
        this.sugs = [];
      },
      startWave(real) {
        const N = 11;
        this.recBars = new Array(N).fill(0.06);
        this.recSec = 0;
        const t0 = Date.now();
        this._waveTimer = setInterval(() => {
          const lv = real && window.WavRecorder ? (WavRecorder.level || 0) : (0.12 + Math.random() * 0.12);
          const h = Math.max(0.06, Math.min(1, lv + (Math.random() - 0.5) * 0.06));
          const arr = this.recBars.slice(1);
          arr.push(h);
          this.recBars = arr;
          this.recSec = Math.floor((Date.now() - t0) / 1000);
        }, 90);
      },
      stopWave() {
        clearInterval(this._waveTimer);
        this._waveTimer = null;
        this.recBars = [];
        this.recSec = 0;
      },
      async voice() {
        if (this.aiStatus && this.aiStatus.asr) {
          const hint = window.WavRecorder && WavRecorder.secureHint();
          if (hint) return vant.showToast(hint);
          if (!window.WavRecorder || !WavRecorder.supported()) return vant.showToast('当前浏览器不支持录音');
          if (this.listening) {
            this.listening = false;
            this.stopWave();
            const t = vant.showLoadingToast({ message: '识别中…', duration: 0 });
            try {
              const { base64, seconds } = await WavRecorder.stop();
              if (seconds < 0.6) return vant.showToast('录音太短，请重试');
              const d = await API.post('/asr/recognize', { audio_base64: base64, format: 'wav' });
              this.aiText = (this.aiText ? this.aiText + '，' : '') + d.text;
              vant.showToast({ message: '识别完成', icon: 'success' });
            } finally { t.close(); }
            return;
          }
          try {
            await WavRecorder.start();
            this.listening = true;
            this.startWave(true);
          } catch (e) {
            vant.showToast(e.name === 'NotAllowedError' ? '请允许麦克风权限' : '无法开启麦克风');
          }
          return;
        }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return vant.showToast('当前浏览器不支持语音输入，请直接键入');
        if (this.listening && this._rec) { this._rec.stop(); return; }
        const rec = new SR();
        this._rec = rec;
        rec.lang = 'zh-CN'; rec.interimResults = false; rec.continuous = false;
        this.startWave(false);
        rec.onresult = (e) => {
          let t = '';
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
          this.aiText = (this.aiText ? this.aiText + '，' : '') + t;
        };
        rec.onerror = () => { this.listening = false; this.stopWave(); vant.showToast('语音识别失败，请重试或直接键入'); };
        rec.onend = () => { this.listening = false; this.stopWave(); };
        this.listening = true;
        rec.start();
      },
      async aiParse() {
        const text = this.aiText.trim();
        if (!text) return vant.showToast('请先说出或输入训练安排');
        this.aiLoading = true;
        try {
          const d = await API.post('/training-plans/parse', { text });
          const items = (d && d.items) || [];
          if (!items.length) return vant.showToast('未识别到动作，请换个说法');
          items.forEach(it => {
            this.items.push({
              action_name: it.action_name,
              sets: it.sets || 1,
              reps: it.reps || 12,
              unit: it.unit || '次',
              weight: it.weight || '',
              rest: it.rest || '',
              remark: it.remark || '',
              part: it.part || '',
            });
          });
          let msg = '已识别 ' + items.length + ' 个动作';
          if (d.title && !String(this.form.title || '').trim()) {
            this.form.title = d.title;
            msg += '，标题已生成';
          }
          vant.showToast({ message: msg, icon: 'success' });
        } finally { this.aiLoading = false; }
      },
      async save() {
        if (!this.booking || !this.booking.id) return vant.showToast('预约信息无效');
        if (!this.form.title.trim()) return vant.showToast('请填写计划标题');
        if (!this.items.length) return vant.showToast('请至少添加一个动作');
        if (this.items.some(it => !String(it.action_name || '').trim())) return vant.showToast('有动作未填写名称');

        const bk = this.booking;
        const m = this.bkMeta();
        const t = vant.showLoadingToast({ message: '生成图片并保存中...', duration: 0, forbidClick: true });
        this.saving = true;
        try {
          const itemsClean = this.items.map(it => ({
            action_name: String(it.action_name).trim(),
            sets: Number(it.sets) || 1,
            reps: Number(it.reps) || 0,
            unit: it.unit || '次',
            weight: it.weight || '',
            rest: it.rest || '',
            remark: it.remark || '',
            part: it.part || '',
          }));

          // 1. 调用已有能力生成品牌长图(先等 Banner 素材就绪)
          await window.PlanImage.ready;
          const dataUrl = window.PlanImage({
            title: this.form.title.trim(),
            member: m.realname || '',
            coach: m.coach_name || '',
            date: this.form.plan_date || m.date || H.today(),
            note: this.form.note ? this.form.note.trim() : '',
            items: itemsClean,
          });

          // 2. 转成 Blob 上传获取永久图片 URL
          const blob = window.dataURLtoBlob(dataUrl);
          const file = new File([blob], 'plan-' + bk.id + '-' + Date.now() + '.jpg', { type: 'image/jpeg' });
          const imgUrl = await API.upload(file);

          // 3. 构建存入 lesson_plan 的结构化数据 (带图片缩略图及原始结构)
          const planPayload = {
            title: this.form.title.trim(),
            note: this.form.note ? this.form.note.trim() : '',
            items: itemsClean,
            img_url: imgUrl,
            updated_at: new Date().toISOString(),
          };
          const rawStr = JSON.stringify(planPayload);

          // 4. 保存到本节课 (后端会自动同步/更新至 biz_training_plan 表)
          const savedRes = await API.put('/ptrain-bookings/' + bk.id + '/lesson-plan', {
            lesson_plan: rawStr,
          });
          const finalRaw = (savedRes && savedRes.lesson_plan) || rawStr;
          if (this.saveTpl) {
            try {
              await API.post('/training-plans', { title: planPayload.title, items: itemsClean, note: planPayload.note, vip_id: 0, is_template: 1 }, { silent: true });
            } catch (e) { vant.showToast('计划已保存，但存为模板失败'); }
          }

          t.close();
          vant.showToast({ message: this.saveTpl ? '计划已保存，并存为模板' : '计划已生成并保存', icon: 'success' });
          this.$emit('saved', { booking: bk, plan: planPayload, raw: finalRaw });
          this.close();
        } catch (e) {
          t.close();
          vant.showToast({ message: e.message || '保存失败', icon: 'fail' });
        } finally {
          this.saving = false;
        }
      },
    },
    template: [
      '<van-popup :show="modelValue" @update:show="$emit(\'update:modelValue\', $event)" position="bottom" round safe-area-inset-bottom style="height:90%;max-height:92vh;display:flex;flex-direction:column;background:var(--c-bg)">',
      '  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fff;border-bottom:1px solid var(--c-line);flex-shrink:0">',
      '    <div style="font-size:16px;font-weight:700;color:var(--brand);display:flex;align-items:center;gap:6px">',
      '      <van-icon name="edit"/> 制定本节课训练计划',
      '    </div>',
      '    <van-icon name="cross" size="20" color="var(--c-text-3)" @click="close" style="cursor:pointer;padding:4px"/>',
      '  </div>',
      '  <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px 20px">',
      /* 从模板选择 */
      '    <div class="tpl-entry" @click="openTpl">',
      '      <van-icon name="description" size="18"/>',
      '      <div class="flex1"><b>从模板选择</b><div class="muted">用我的模板，或沿用这位学员之前的计划</div></div>',
      '      <van-icon name="arrow" color="var(--c-text-4)"/>',
      '    </div>',
      /* AI 一句话生成 (图二顶部卡片) */
      '    <div class="ai-box" style="margin:0 0 12px">',
      '      <div class="flex"><van-icon name="bulb-o" color="var(--c-title)"/><b style="margin-left:6px;font-size:14px">AI 一句话生成</b><span class="muted flex1" style="margin-left:8px">说出或输入整套安排</span></div>',
      '      <textarea v-model="aiText" rows="2" class="ai-ta" placeholder="例：练背：引体向上4组8次，杠铃划船4组10次60kg，最后划船机15分钟"></textarea>',
      '      <div class="flex" style="gap:8px;margin-top:8px">',
      '        <button v-if="!listening" type="button" class="vc-btn" @click="voice">',
      '          <svg class="vc-mic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"/><path d="M18 11a6 6 0 0 1-12 0"/><path d="M12 17v4"/><path d="M9 21h6"/></svg>',
      '          <span>语音录入</span>',
      '        </button>',
      '        <button v-else type="button" class="vc-btn rec" @click="voice">',
      '          <span class="rec-dot"></span>',
      '          <span class="rec-wave">',
      '            <i v-for="(h, i) in recBars" :key="i" :style="{ height: (3 + h * 15) + \'px\' }"></i>',
      '          </span>',
      '          <span class="rec-time">{{ recTime }}</span>',
      '          <span class="rec-stop"><i></i></span>',
      '        </button>',
      '        <van-button size="small" round type="primary" style="flex:1" :loading="aiLoading" loading-text="解析中..." @click="aiParse">',
      '          <i class="ai-ico"></i>AI 解析',
      '        </van-button>',
      '      </div>',
      '    </div>',
      /* 基本信息卡片 */
      '    <div class="card-box" style="margin:0 0 12px;padding:6px 0">',
      '      <van-field v-model="form.title" label="计划标题" placeholder="如：胸背超级组 / 核心强化" />',
      '      <van-field :model-value="bkMeta().realname || \'学员\'" label="学员" readonly />',
      '      <van-field label="上课日期">',
      '        <template #input><input type="date" v-model="form.plan_date" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text)"/></template>',
      '      </van-field>',
      '      <van-field v-model="form.note" label="教练叮嘱" placeholder="随计划生成海报，展示给学员" :border="false"/>',
      '    </div>',
      /* 动作列表 (图二下部) */
      '    <div class="sec-title" style="margin:12px 4px 8px">动作列表（{{ items.length }}）<span class="more brand-text" @click="addItem"><van-icon name="add-o"/> 添加动作</span></div>',
      '    <van-empty v-if="!items.length" description="用上方 AI 解析，或手动添加动作" image-size="60"/>',
      '    <div v-for="(it,i) in items" :key="i" class="rec-item" style="padding:10px 12px;margin-bottom:8px">',
      '      <div class="flex">',
      '        <div class="plan-idx">{{ i+1 }}</div>',
      '        <div class="flex1" style="margin:0 8px;position:relative">',
      '          <input v-model="it.action_name" placeholder="动作名 (如：杠铃深蹲)" class="plan-input" @input="suggest(i)" @blur="hideSug"/>',
      '          <div v-if="sugFor===i && sugs.length" class="sug-pop">',
      '            <div v-for="s in sugs" :key="s.id" class="sug-item" @mousedown.prevent="pickSug(i,s)">{{ s.name }}<span class="muted" style="margin-left:6px">{{ s.part }}</span></div>',
      '          </div>',
      '        </div>',
      '        <action-fig :name="it.action_name" :size="40" style="margin-right:6px"/>',
      '        <van-icon name="cross" color="var(--c-text-4)" size="18" @click="items.splice(i,1)"/>',
      '      </div>',
      '      <div class="flex mt8" style="gap:10px;flex-wrap:wrap">',
      '        <div class="flex"><span class="muted" style="margin-right:4px">组数</span><van-stepper v-model="it.sets" min="1" max="20" integer button-size="22"/></div>',
      '        <div class="flex"><span class="muted" style="margin-right:4px">{{ it.unit===\'次\' ? \'次数\' : \'数值\' }}</span><van-stepper v-model="it.reps" min="1" max="999" integer button-size="22"/></div>',
      '        <div class="unit-seg"><span v-for="u in units" :key="u" :class="{on:it.unit===u}" @click="it.unit=u">{{ u }}</span></div>',
      '      </div>',
      '      <div class="flex mt8" style="gap:8px">',
      '        <input v-model="it.weight" placeholder="重量(如 60kg)" class="plan-input" style="flex:1"/>',
      '        <input v-model="it.rest" placeholder="组间歇(如 90秒)" class="plan-input" style="flex:1"/>',
      '      </div>',
      '    </div>',
      '  </div>',
      /* 底部保存按钮 */
      '  <div style="flex-shrink:0;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -2px 10px rgba(0,0,0,.05);border-top:1px solid var(--c-line)">',
      '    <div class="tpl-save" @click="saveTpl=!saveTpl"><van-checkbox :model-value="saveTpl" icon-size="16px" checked-color="var(--brand)" @click.stop="saveTpl=!saveTpl"/><span>同时存为我的模板，下次直接选</span></div>',
      '    <van-button type="primary" block round :loading="saving" loading-text="正在生成海报图片..." @click="save">生成计划海报并保存</van-button>',
      '  </div>',
      /* 模板选择弹层 */
      '  <van-popup v-model:show="tplShow" position="bottom" round safe-area-inset-bottom teleport="body" style="max-height:75vh;display:flex;flex-direction:column">',
      '    <div class="pop-head" style="flex-shrink:0;padding:16px 16px 4px;text-align:center">从模板选择</div>',
      '    <div style="flex:1;overflow-y:auto;padding:0 12px 16px">',
      '      <div v-if="tplLoading" style="text-align:center;padding:30px 0"><van-loading color="var(--brand)"/></div>',
      '      <template v-else>',
      '        <div class="tpl-sec">我的模板（{{ tplList.length }}）</div>',
      '        <div v-if="!tplList.length" class="muted" style="padding:6px 4px 10px;font-size:12px">还没有模板，保存计划时勾选「同时存为我的模板」即可</div>',
      '        <div v-for="p in tplList" :key="\'t\'+p.id" class="tpl-item" @click="useTpl(p, true)">',
      '          <div class="flex1"><div class="n">{{ p.title }}</div><div class="s">{{ p.brief }}</div></div><van-icon name="arrow" color="var(--c-text-4)"/>',
      '        </div>',
      '        <template v-if="tplRecent.length">',
      '          <div class="tpl-sec">{{ bkMeta().realname || \'学员\' }} 之前的计划</div>',
      '          <div v-for="p in tplRecent" :key="\'r\'+p.id" class="tpl-item" @click="useTpl(p, false)">',
      '            <div class="flex1"><div class="n">{{ p.date }} {{ p.title }}</div><div class="s">{{ p.brief }}</div></div><van-icon name="arrow" color="var(--c-text-4)"/>',
      '          </div>',
      '        </template>',
      '      </template>',
      '    </div>',
      '  </van-popup>',
      '</van-popup>',
    ].join('\n'),
  };

  window.Pages.MemberPlans = {
    data() { return { list: [], loading: true }; },
    template: [
      '<div class="page">',
      '  <m-nav title="训练计划"></m-nav>',
      '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="教练推送训练计划后将展示在这里"/>',
      '    <div v-for="p in list" :key="p.id" class="rec-item flex" @click="$router.push(\'/plan/\'+p.id)">',
      '      <van-icon name="notes-o" size="26" color="var(--brand)"/>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div class="name">{{ p.title }}</div>',
      '        <div class="muted mt4">{{ p.coach_name }} 教练 · {{ H.day(p.plan_date) }}（{{ H.week(p.plan_date) }}）<template v-if="p.item_count!=null"> · {{ p.item_count }} 个动作</template></div>',
      '      </div>',
      '      <van-icon name="arrow" color="var(--c-text-4)"/>',
      '    </div>',
      '  </template>',
      '</div>',
    ].join('\n'),
    async mounted() {
      try {
        const list = await API.get('/member/training-plans');
        this.list = list || [];
      } finally { this.loading = false; }
    },
  };

  window.Pages.MemberPlanDetail = {
    data() { return { p: null, items: [], loading: true, img: '', imgShow: false }; },
    template: [
      '<div class="page" style="padding-bottom:90px">',
      '  <m-nav title="计划详情"></m-nav>',
      '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else-if="p">',
      '    <div class="home-hero" style="padding-bottom:20px">',
      '      <div style="font-size:20px;font-weight:800">{{ p.title }}</div>',
      '      <div style="font-size:12px;opacity:.88;margin-top:8px">{{ p.coach_name }} 教练 · {{ H.dateOf(p.plan_date) }}（{{ H.week(p.plan_date) }}）</div>',
      '    </div>',
      '    <div class="pending-bar" v-if="p.note"><van-icon name="volume-o"/><span style="margin-left:8px">教练叮嘱：{{ p.note }}</span></div>',
      '    <div class="sec-title">动作清单（{{ items.length }}）</div>',
      '    <div v-for="(it,i) in items" :key="i" class="rec-item flex">',
      '      <div class="plan-idx">{{ i+1 }}</div>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div class="name">{{ it.action_name }} <van-tag v-if="it.part" plain type="primary" style="margin-left:4px">{{ it.part }}</van-tag></div>',
      '        <div class="mt4" style="font-size:13px;color:var(--c-text)"><b class="brand-text">{{ it.sets||1 }}</b> 组 × <b class="brand-text">{{ it.reps||0 }}</b> {{ it.unit||\'次\' }}',
      '          <template v-if="it.weight"> · 重量 {{ it.weight }}</template>',
      '          <template v-if="it.rest"> · 组间歇 {{ it.rest }}</template>',
      '        </div>',
      '        <div class="muted mt4" v-if="it.remark">备注：{{ it.remark }}</div>',
      '      </div>',
      '      <action-fig :name="it.action_name" :size="72" anim/>',
      '    </div>',
      '    <div class="muted" style="font-size:11px;text-align:center;margin:4px 0 0">点动作示意图可放大查看动作要领</div>',
      '    <div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -2px 10px rgba(0,0,0,.05);z-index:110">',
      '      <van-button type="primary" block round icon="photo-o" @click="genImage">生成图片分享</van-button>',
      '    </div>',
      '  </template>',
      '  <van-popup v-model:show="imgShow" round closeable style="width:86%;max-width:420px;background:transparent" :style="{overflow:\'visible\'}">',
      '    <div style="background:#fff;border-radius:14px;padding:12px 12px 16px">',
      '      <img :src="img" style="width:100%;display:block;border-radius:10px"/>',
      '      <div class="muted" style="text-align:center;margin-top:10px">长按图片保存 / 发送给好友</div>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      async genImage() {
        await window.PlanImage.ready;
        this.img = window.PlanImage({
          title: this.p.title, member: this.p.realname || (Store.user && Store.user.realname) || '',
          coach: this.p.coach_name, date: H.dateOf(this.p.plan_date), note: this.p.note, items: this.items,
        });
        this.imgShow = true;
      },
    },
    async mounted() {
      try {
        this.p = await API.get('/member/training-plans/' + this.$route.params.id);
        this.items = window.parsePlanItems(this.p.items);
      } finally { this.loading = false; }
    },
  };
})();
