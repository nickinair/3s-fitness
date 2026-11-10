/* 会员端-饮食日记: 小S 拍照识别后「记入饮食」的记录在这里查看/修改/删除
 * 数据: GET /member/ai/meals?date= ; PUT /member/ai/meals/:id {meal_type} ; DELETE /member/ai/meals/:id */
(function () {
  const MEALS = [
    { key: 'breakfast', name: '早餐', icon: '🌅' },
    { key: 'lunch', name: '午餐', icon: '☀️' },
    { key: 'dinner', name: '晚餐', icon: '🌙' },
    { key: 'snack', name: '加餐', icon: '🍎' },
  ];
  const WEEK = '日一二三四五六';
  const pad = n => (n < 10 ? '0' : '') + n;
  const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const m = String(s).split('-'); return new Date(+m[0], +m[1] - 1, +m[2]); };

  window.Pages.MemberMeals = {
    data() {
      return {
        date: (this.$route.query && this.$route.query.date) || fmt(new Date()),
        d: null, loading: true, sheet: false, sheetMeal: null, calShow: false,
        mealActions: MEALS.map(m => ({ name: m.name, key: m.key })),
      };
    },
    computed: {
      today() { return fmt(new Date()); },
      calMin() { const d = new Date(); d.setDate(d.getDate() - 180); return d; },
      calMax() { return new Date(); },
      calCur() { return parse(this.date); },
      isToday() { return this.date === this.today; },
      dateText() {
        const d = parse(this.date);
        const diff = Math.round((d - parse(this.today)) / 86400000);
        const head = diff === 0 ? '今天' : diff === -1 ? '昨天' : diff === -2 ? '前天' : (d.getMonth() + 1) + '月' + d.getDate() + '日';
        return head + ' · 周' + WEEK[d.getDay()];
      },
      groups() {
        const list = (this.d && this.d.meals) || [];
        return MEALS.map(m => {
          const items = list.filter(x => x.meal_type === m.key);
          return Object.assign({}, m, { items, kcal: items.reduce((s, x) => s + x.kcal, 0) });
        }).filter(g => g.items.length);
      },
      ring() {
        const t = this.d && this.d.target;
        const eaten = (this.d && this.d.total.kcal) || 0;
        const goal = t ? t.kcal : 0;
        const pct = goal ? Math.min(1, eaten / goal) : 0;
        const R = 52, C = 2 * Math.PI * R;
        return { R, C, dash: (C * pct).toFixed(1), over: goal && eaten > goal, eaten, goal, left: goal ? goal - eaten : null };
      },
      macros() {
        const tt = (this.d && this.d.total) || { protein: 0, carbs: 0, fat: 0 };
        const t = this.d && this.d.target;
        const pGoal = t ? t.protein_g : 0;
        // 碳水/脂肪目标按建议热量的 50% / 25% 估算
        const cGoal = t ? Math.round(t.kcal * 0.5 / 4) : 0;
        const fGoal = t ? Math.round(t.kcal * 0.25 / 9) : 0;
        const mk = (label, v, g, cls) => ({ label, v, g, cls, pct: g ? Math.min(100, Math.round(v / g * 100)) : 0 });
        return [mk('蛋白质', tt.protein, pGoal, 'p'), mk('碳水', tt.carbs, cGoal, 'c'), mk('脂肪', tt.fat, fGoal, 'f')];
      },
      chart() {
        const tr = (this.d && this.d.trend) || [];
        if (!tr.length) return null;
        const goal = (this.d.target && this.d.target.kcal) || 0;
        const max = Math.max(goal, ...tr.map(x => x.kcal), 500) * 1.12;
        const W = 336, HT = 150, padB = 34, padT = 18, bw = 26;
        const ih = HT - padB - padT;
        const step = (W - 24) / tr.length;
        const bars = tr.map((x, i) => {
          const h = Math.round((x.kcal / max) * ih);
          return {
            x: 12 + i * step + (step - bw) / 2, y: padT + ih - h, h: Math.max(h, x.kcal ? 3 : 0), w: bw,
            cx: 12 + i * step + step / 2, label: x.label, week: x.week, kcal: x.kcal, date: x.date,
            on: x.date === this.date, over: goal && x.kcal > goal,
          };
        });
        return { W, HT, bars, goalY: goal ? padT + ih - (goal / max) * ih : null, goal, base: padT + ih };
      },
    },
    watch: {
      '$route.query.date'(v) { if (v && v !== this.date) { this.date = v; this.load(); } },
    },
    created() {
      this._onMealLogged = () => this.load();
      window.addEventListener('ai-meal-logged', this._onMealLogged);
      this.load();
    },
    unmounted() {
      if (this._onMealLogged) window.removeEventListener('ai-meal-logged', this._onMealLogged);
    },
    methods: {
      async load() {
        this.loading = !this.d;
        try {
          this.d = await API.get('/member/ai/meals', { date: this.date });
        } finally { this.loading = false; }
      },
      shift(n) {
        const d = parse(this.date); d.setDate(d.getDate() + n);
        const s = fmt(d);
        if (s > this.today) return;
        this.go(s);
      },
      go(s) {
        if (!s || s > this.today) return;
        this.date = s;
        this.$router.replace({ path: '/meals', query: s === this.today ? {} : { date: s } });
        this.load();
      },
      onCal(v) { this.calShow = false; this.go(fmt(v)); },
      img(u) { return u || ''; },
      preview(u) { if (u) vant.showImagePreview({ images: [this.img(u)], closeable: true }); },
      foodsText(m) { return (m.foods || []).map(f => f.name + (f.grams ? ' ' + f.grams + 'g' : '')).join('、') || '—'; },
      openSheet(m) { this.sheetMeal = m; this.sheet = true; },
      async onPickMeal(a) {
        const m = this.sheetMeal; this.sheet = false;
        if (!m || a.key === m.meal_type) return;
        await API.put('/member/ai/meals/' + m.id, { meal_type: a.key });
        vant.showToast('已改为' + a.name);
        this.load();
      },
      async remove(m) {
        try {
          await vant.showConfirmDialog({ title: '删除这条记录？', message: m.meal_name + ' ' + m.kcal + ' kcal', confirmButtonText: '删除', confirmButtonColor: '#000' });
        } catch (e) { return; }
        await API.del('/member/ai/meals/' + m.id);
        vant.showToast('已删除');
        this.load();
      },
      // 拍照记一餐: 直接在当前页侧边滑出小S AI抽屉，并同步拉起手机相册/相机上传识别
      snap() {
        if (window.AI && window.AI.openWithPhoto) {
          window.AI.openWithPhoto();
          return;
        }
        if (window.MP && MP.ready() && MP.home('?ai=1')) return;
      },
    },
    template: [
      '<div class="page ml-page">',
      '  <m-nav title="饮食日记" :inline-ai="true"></m-nav>',

      // 日期切换 (左侧内置 [🏠] [🤖 小S] 入口)
      '  <div class="ml-date">',
      '    <div class="ml-ai-left"><ai-entry :home="true"/></div>',
      '    <div class="ml-arrow" @click="shift(-1)"><van-icon name="arrow-left"/></div>',
      '    <div class="ml-dt" @click="calShow=true">{{ dateText }} <van-icon name="calendar-o"/></div>',
      '    <div class="ml-arrow" :class="{dis:isToday}" @click="shift(1)"><van-icon name="arrow"/></div>',
      '    <div v-if="!isToday" class="ml-today" @click="go(today)">回到今天</div>',
      '    <div v-else class="ml-today cam" @click="snap">📷 记一餐</div>',
      '  </div>',

      '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else-if="d">',

      // 汇总
      '    <div class="ml-sum">',
      '      <svg class="ml-ring" viewBox="0 0 128 128">',
      '        <circle cx="64" cy="64" :r="ring.R" class="bg"/>',
      '        <circle cx="64" cy="64" :r="ring.R" class="fg" :class="{over:ring.over}" :stroke-dasharray="ring.dash + \' \' + ring.C" transform="rotate(-90 64 64)"/>',
      '      </svg>',
      '      <div class="ml-ring-t">',
      '        <div class="n">{{ ring.eaten }}</div><div class="u">已摄入 kcal</div>',
      '      </div>',
      '      <div class="ml-sum-r">',
      '        <template v-if="ring.goal">',
      '          <div class="ml-goal">建议 <b>{{ ring.goal }}</b> kcal<span class="tag">{{ d.target.goal }}</span></div>',
      '          <div class="ml-left" :class="{over:ring.over}">{{ ring.left >= 0 ? (\'还可以吃 \' + ring.left + \' kcal\') : (\'已超出 \' + (-ring.left) + \' kcal\') }}</div>',
      '        </template>',
      '        <div v-else class="ml-goal muted">完善体重/目标体重后可计算每日建议热量</div>',
      '        <div class="ml-mac" v-for="x in macros" :key="x.label">',
      '          <div class="ml-mac-h"><span>{{ x.label }}</span><span>{{ x.v }}<template v-if="x.g"> / {{ x.g }}</template> g</span></div>',
      '          <div class="ml-mac-b"><i :class="x.cls" :style="{width: x.pct + \'%\'}"></i></div>',
      '        </div>',
      '      </div>',
      '    </div>',

      // 各餐
      '    <div class="sec-title"><span>{{ isToday ? \'今日饮食\' : \'当天饮食\' }}</span><span class="ml-add-pill" @click="snap">📷 拍照记一餐</span></div>',
      '    <div v-if="!groups.length" class="ml-empty" @click="snap">',
      '      <div class="e1">🍽</div>',
      '      <div class="e2">{{ isToday ? \'今天还没有记录\' : \'这天没有饮食记录\' }}</div>',
      '      <div class="e3">点此拍一张餐食照片，小S 帮你估算热量 ›</div>',
      '    </div>',
      '    <div v-for="g in groups" :key="g.key" class="ml-group">',
      '      <div class="ml-gh"><span>{{ g.icon }} {{ g.name }}</span><span class="k">{{ g.kcal }} kcal</span></div>',
      '      <van-swipe-cell v-for="m in g.items" :key="m.id">',
      '        <div class="ml-item">',
      '          <div class="ml-img" v-if="m.image" @click="preview(m.image)"><img :src="img(m.image)" loading="lazy"/></div>',
      '          <div class="ml-img none" v-else>🍱</div>',
      '          <div class="ml-info">',
      '            <div class="ml-foods">{{ foodsText(m) }}</div>',
      '            <div class="ml-meta">蛋白 {{ m.protein }}g · 碳水 {{ m.carbs }}g · 脂肪 {{ m.fat }}g</div>',
      '            <div class="ml-meta">{{ m.time }} 记录</div>',
      '          </div>',
      '          <div class="ml-kcal"><b>{{ m.kcal }}</b><span>kcal</span>',
      '            <div class="ml-more" @click.stop="openSheet(m)">改餐次</div>',
      '          </div>',
      '        </div>',
      '        <div v-if="m.comment" class="ml-comment">💬 {{ m.comment }}</div>',
      '        <template #right><van-button square type="danger" class="ml-del" text="删除" @click="remove(m)"/></template>',
      '      </van-swipe-cell>',
      '    </div>',
      '    <div v-if="groups.length" class="ml-hint">左滑可删除记录 · 热量为 AI 估算值，仅供参考</div>',

      // 7天趋势
      '    <div class="sec-title">近 7 天热量</div>',
      '    <div class="card-box ml-chart" v-if="chart">',
      '      <svg :viewBox="\'0 0 \' + chart.W + \' \' + chart.HT" style="width:100%;display:block">',
      '        <line x1="8" :x2="chart.W-8" :y1="chart.base" :y2="chart.base" style="stroke:var(--c-line)" stroke-width="1"/>',
      '        <g v-for="b in chart.bars" :key="b.date" @click="go(b.date)" style="cursor:pointer">',
      '          <rect :x="b.cx-20" y="0" width="40" :height="chart.HT" fill="transparent"/>',
      '          <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="5" :class="[\'bar\', {on:b.on, over:b.over}]"/>',
      '          <text v-if="b.kcal" :x="b.cx" :y="b.y-5" text-anchor="middle" font-size="9" style="fill:var(--c-text-2)">{{ b.kcal }}</text>',
      '          <text :x="b.cx" :y="chart.HT-18" text-anchor="middle" font-size="10" :style="{fill: b.on ? \'var(--c-title)\' : \'var(--c-text-3)\', fontWeight: b.on ? 700 : 400}">{{ b.label }}</text>',
      '          <text :x="b.cx" :y="chart.HT-5" text-anchor="middle" font-size="9" style="fill:var(--c-text-4)">周{{ b.week }}</text>',
      '        </g>',
      '        <template v-if="chart.goalY">',
      '          <line x1="8" :x2="chart.W-8" :y1="chart.goalY" :y2="chart.goalY" stroke-dasharray="4 3" stroke-width="1" style="stroke:#7cbf1e"/>',
      '          <text :x="chart.W-8" :y="chart.goalY-4" text-anchor="end" font-size="9" style="fill:#5a9a0c">建议 {{ chart.goal }}</text>',
      '        </template>',
      '      </svg>',
      '      <div class="muted" style="text-align:center;font-size:11px">点击柱子查看当天明细 · 已累计记录 {{ d.logged_days }} 天</div>',
      '    </div>',
      '    <div style="height:84px"></div>',
      '  </template>',

      '  <div class="ml-fab" @click="snap"><span>📷</span> 拍照记一餐</div>',
      '  <van-action-sheet v-model:show="sheet" :actions="mealActions" cancel-text="取消" description="改为哪一餐" @select="onPickMeal"/>',
      '  <van-calendar v-model:show="calShow" :min-date="calMin" :max-date="calMax" :default-date="calCur" color="#000" :show-confirm="false" @confirm="onCal"/>',
      '</div>',
    ].join('\n'),
  };
})();
