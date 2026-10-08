/* 会员端-训练计划列表/详情 + 共享: 计划长图生成(canvas) */
(function () {

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

    // 背景
    ctx.fillStyle = '#f2f4f6'; ctx.fillRect(0, 0, W, HT);

    // 顶部品牌渐变
    const g = ctx.createLinearGradient(0, 0, W, headH);
    g.addColorStop(0, '#0d5e56'); g.addColorStop(1, '#1fa08f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, headH);
    // 装饰圆
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.beginPath(); ctx.arc(W - 60, 40, 110, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(80, headH - 10, 70, 0, 7); ctx.fill();

    // logo 色块
    ctx.fillStyle = '#fff'; rr(PAD, 40, 64, 64, 14); ctx.fill();
    ctx.fillStyle = '#0d5e56'; ctx.font = F(30, '800'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('3S', PAD + 32, 74);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = F(30, '700');
    ctx.fillText('3S健身', PAD + 80, 62);
    ctx.font = F(20); ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText('私教训练计划', PAD + 80, 92);

    // 标题
    ctx.fillStyle = '#fff'; ctx.font = F(40, '800');
    ctx.fillText(opt.title || '训练计划', PAD, 168);
    ctx.font = F(24); ctx.fillStyle = 'rgba(255,255,255,.9)';
    const sub = [opt.member, opt.coach ? opt.coach + ' 教练' : '', opt.date].filter(Boolean).join(' · ');
    ctx.fillText(sub, PAD, 214);

    // 动作列表
    let y = headH + 24;
    ctx.textBaseline = 'alphabetic';
    items.forEach((it, i) => {
      const h = itemHeights[i];
      ctx.fillStyle = '#fff'; rr(24, y, W - 48, h, 16); ctx.fill();
      // 序号圆
      ctx.fillStyle = '#e9f3f2';
      ctx.beginPath(); ctx.arc(24 + 46, y + 48, 24, 0, 7); ctx.fill();
      ctx.fillStyle = '#0d5e56'; ctx.font = F(24, '700'); ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), 24 + 46, y + 57);
      ctx.textAlign = 'left';
      // 动作名
      ctx.fillStyle = '#1f2329'; ctx.font = F(28, '700');
      ctx.fillText(it.action_name || '动作', 24 + 88, y + 44);
      // 规格
      const spec = [];
      spec.push((it.sets || 1) + ' 组 × ' + (it.reps || 0) + ' ' + (it.unit || '次'));
      if (it.weight) spec.push('重量 ' + it.weight);
      if (it.rest) spec.push('组间歇 ' + it.rest);
      ctx.fillStyle = '#646566'; ctx.font = F(22);
      ctx.fillText(spec.join('   ·   '), 24 + 88, y + 80);
      if (it.remark) {
        ctx.fillStyle = '#969799'; ctx.font = F(20);
        ctx.fillText('备注：' + it.remark, 24 + 88, y + 110);
      }
      y += h + 16;
    });

    // 教练叮嘱
    if (opt.note) {
      ctx.fillStyle = '#fff7e8'; rr(24, y, W - 48, 70, 14); ctx.fill();
      ctx.fillStyle = '#b35c00'; ctx.font = F(22);
      ctx.fillText('📣 教练叮嘱：' + opt.note, 48, y + 43);
      y += noteH;
    }

    // 底部 slogan
    ctx.fillStyle = '#969799'; ctx.font = F(22); ctx.textAlign = 'center';
    ctx.fillText('—— 3S健身 · 与更好的自己相遇 ——', W / 2, HT - 40);

    return cv.toDataURL('image/png');
  };

  /* 解析 items (JSON 字符串) */
  window.parsePlanItems = function (s) {
    if (Array.isArray(s)) return s;
    try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  };

  window.Pages.MemberPlans = {
    data() { return { list: [], loading: true }; },
    template: [
      '<div class="page">',
      '  <m-nav title="训练计划"></m-nav>',
      '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="教练推送训练计划后将展示在这里"/>',
      '    <div v-for="p in list" :key="p.id" class="rec-item flex" @click="$router.push(\'/plan/\'+p.id)">',
      '      <van-icon name="notes-o" size="26" color="#0d5e56"/>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div class="name">{{ p.title }}</div>',
      '        <div class="muted mt4">{{ p.coach_name }} 教练 · {{ H.day(p.plan_date) }}（{{ H.week(p.plan_date) }}）<template v-if="p._count!=null"> · {{ p._count }} 个动作</template></div>',
      '      </div>',
      '      <van-icon name="arrow" color="#c8c9cc"/>',
      '    </div>',
      '  </template>',
      '</div>',
    ].join('\n'),
    async mounted() {
      try {
        const list = await API.get('/member/training-plans');
        this.list = list || [];
        // 列表接口无 items, 并发取详情补动作数
        await Promise.all(this.list.map(async p => {
          try {
            const d = await API.get('/member/training-plans/' + p.id, { silent: true });
            p._count = window.parsePlanItems(d.items).length;
          } catch (e) { /* ignore */ }
        }));
      } finally { this.loading = false; }
    },
  };

  window.Pages.MemberPlanDetail = {
    data() { return { p: null, items: [], loading: true, img: '', imgShow: false }; },
    template: [
      '<div class="page" style="padding-bottom:90px">',
      '  <m-nav title="计划详情"></m-nav>',
      '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
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
      '        <div class="mt4" style="font-size:13px;color:#323233"><b class="brand-text">{{ it.sets||1 }}</b> 组 × <b class="brand-text">{{ it.reps||0 }}</b> {{ it.unit||\'次\' }}',
      '          <template v-if="it.weight"> · 重量 {{ it.weight }}</template>',
      '          <template v-if="it.rest"> · 组间歇 {{ it.rest }}</template>',
      '        </div>',
      '        <div class="muted mt4" v-if="it.remark">备注：{{ it.remark }}</div>',
      '      </div>',
      '    </div>',
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
      genImage() {
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
