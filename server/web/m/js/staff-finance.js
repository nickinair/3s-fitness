/* 员工端-财务与经营报表: 月度经营报表 / 收款明细 / 耗卡明细 / 教练消耗统计 / 会员概况
   对应 PC: server/web/admin/js/pages/finance-monthly.js finance-recharges.js finance-spends.js coach-consume.js member-overview.js
   移动端无 ECharts, 图表均用纯 SVG 柱状图绘制(参考 member-milestones.js 的 SVG 写法) */

/* ============ 1. 月度经营报表 /staff/finance-monthly ============ */
window.Pages.StaffFinanceMonthly = {
  data() { return { month: dayjs().format('YYYY-MM'), d: null, loading: true }; },
  computed: {
    canNext() { return this.month < dayjs().format('YYYY-MM'); },
    coreMetrics() {
      if (!this.d) return [];
      const c = this.d.cur || {}; const p = this.d.prev || {};
      const items = [
        { label: '月营收', key: 'revenue', money: true },
        { label: '新用户营收', key: 'new_user_revenue', money: true },
        { label: '复购营收', key: 'repeat_revenue', money: true },
        { label: '耗卡金额', key: 'spend_money', money: true },
        { label: '开卡数', key: 'open_cards', money: false },
        { label: '成单数', key: 'orders', money: false },
        { label: '新增会员', key: 'new_members', money: false },
      ];
      return items.map(it => {
        const cur = Number(c[it.key] || 0); const prev = Number(p[it.key] || 0);
        const pct = prev > 0 ? Math.abs((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);
        return Object.assign({}, it, {
          value: it.money ? H.money(cur) : cur,
          pct: pct.toFixed(1),
          dir: cur - prev > 0 ? 'up' : (cur - prev < 0 ? 'down' : 'flat'),
        });
      });
    },
    revenueChart() {
      if (!this.d) return null;
      const months = []; const m0 = dayjs(this.month + '-01').subtract(11, 'month');
      for (let i = 0; i < 12; i++) months.push(m0.add(i, 'month').format('YYYY-MM'));
      const revMap = {}; (this.d.revenueTrend || []).forEach(x => { revMap[x.m] = Number(x.money || 0); });
      const pairs = months.map(m => ({ label: m.slice(5), value: revMap[m] || 0 }));
      return this.buildBars(pairs, 336, 176);
    },
    newMembers12() { return (this.d && this.d.memberTrend || []).reduce((s, x) => s + Number(x.cnt || 0), 0); },
    cardTypeRows() {
      const list = (this.d && this.d.byCardType) || [];
      const max = Math.max(1, ...list.map(x => Number(x.money || 0)));
      return list.map(x => ({ name: x.name, cnt: x.cnt, money: Number(x.money || 0), pct: Math.round(Number(x.money || 0) / max * 100) }));
    },
    sceneRows() {
      const list = (this.d && this.d.spendByScene) || [];
      const max = Math.max(1, ...list.map(x => Number(x.money || 0)));
      return list.map(x => ({ name: DICT.spendScene[x.scene] || ('场景' + x.scene), cnt: x.cnt, money: Number(x.money || 0), pct: Math.round(Number(x.money || 0) / max * 100) }));
    },
    salesRows() {
      const list = (this.d && this.d.sales) || [];
      const max = Math.max(1, ...list.map(x => Number(x.money || 0)));
      return list.map(x => ({ name: x.name, cnt: x.orders, money: Number(x.money || 0), pct: Math.round(Number(x.money || 0) / max * 100) }));
    },
    coachRows() {
      const list = (this.d && this.d.coachHours) || [];
      const max = Math.max(1, ...list.map(x => Number(x.money || 0)));
      return list.map(x => ({ name: x.name, lessons: Number(x.lessons || 0), money: Number(x.money || 0), pct: Math.round(Number(x.money || 0) / max * 100) }));
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="月度经营报表"></m-nav>',
    '  <div class="fin-monthbar">',
    '    <van-icon name="arrow-left" size="16" color="var(--brand)" @click="shiftMonth(-1)"/>',
    '    <b>{{ month }}</b>',
    '    <van-icon name="arrow" size="16" :color="canNext?\'var(--brand)\':\'var(--c-text-4)\'" @click="canNext && shiftMonth(1)"/>',
    '  </div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="muted" style="padding:0 16px">环比上月</div>',
    '    <div class="kpi-grid">',
    '      <div class="kpi" v-for="m in coreMetrics" :key="m.label">',
    '        <div class="l">{{ m.label }}</div>',
    '        <div class="v">{{ m.value }}</div>',
    '        <div class="c">环比',
    '          <span v-if="m.dir===\'up\'" class="up">▲{{ m.pct }}%</span>',
    '          <span v-else-if="m.dir===\'down\'" class="down">▼{{ m.pct }}%</span>',
    '          <span v-else class="muted">— 持平</span>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div class="rpt-export-row" @click="exportCsv(\'summary\')">导出本期数据 <van-icon name="arrow" size="11"/></div>',

    '    <div class="card-box" v-if="revenueChart">',
    '      <div class="sec-title" style="margin:0 0 8px"><span>近12月营收趋势</span><span class="more brand-text" @click="exportCsv(\'revenue_trend\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '      <svg :viewBox="\'0 0 \'+revenueChart.W+\' \'+revenueChart.HT" style="width:100%;display:block">',
    '        <g v-for="(b,i) in revenueChart.bars" :key="i">',
    '          <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h||1" rx="2" style="fill:var(--brand)"/>',
    '          <text v-if="!revenueChart.hideValue && b.val>0" :x="b.x+b.w/2" :y="b.y-4" text-anchor="middle" font-size="8" style="fill:var(--brand)">{{ H.num(b.val) }}</text>',
    '          <text v-if="i%revenueChart.labelStep===0 || i===revenueChart.bars.length-1" :x="b.x+b.w/2" :y="revenueChart.HT-8" text-anchor="middle" font-size="8" style="fill:var(--c-text-3)">{{ b.label }}</text>',
    '        </g>',
    '      </svg>',
    '      <div class="muted mt8">近12月累计新增会员 {{ newMembers12 }} 人 <span class="brand-text" style="margin-left:6px" @click="exportCsv(\'member_trend\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '    </div>',

    '    <div class="card-box">',
    '      <div class="sec-title" style="margin:0 0 10px"><span>开卡构成（按卡类型）</span><span class="more brand-text" @click="exportCsv(\'by_card_type\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '      <van-empty v-if="!cardTypeRows.length" description="本月暂无开卡数据" image-size="60"/>',
    '      <div v-else class="fin-hbar-row" v-for="r in cardTypeRows" :key="r.name">',
    '        <div class="hd"><span>{{ r.name }} <span class="muted">{{ r.cnt }}单</span></span><b>{{ H.money(r.money) }}</b></div>',
    '        <div class="bar"><i :style="{width:r.pct+\'%\'}"></i></div>',
    '      </div>',
    '    </div>',

    '    <div class="card-box">',
    '      <div class="sec-title" style="margin:0 0 10px"><span>耗卡构成（按场景）</span><span class="more brand-text" @click="exportCsv(\'spend_scene\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '      <van-empty v-if="!sceneRows.length" description="本月暂无耗卡数据" image-size="60"/>',
    '      <div v-else class="fin-hbar-row" v-for="r in sceneRows" :key="r.name">',
    '        <div class="hd"><span>{{ r.name }} <span class="muted">{{ r.cnt }}笔</span></span><b>{{ H.money(r.money) }}</b></div>',
    '        <div class="bar"><i :style="{width:r.pct+\'%\'}"></i></div>',
    '      </div>',
    '      <div style="text-align:right;margin-top:8px"><span class="more brand-text" @click="exportCsv(\'spend_trend\')">导出耗卡趋势 <van-icon name="arrow" size="10"/></span></div>',
    '    </div>',

    '    <div class="card-box">',
    '      <div class="sec-title" style="margin:0 0 10px"><span>顾问业绩</span><span class="more brand-text" @click="exportCsv(\'sales\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '      <van-empty v-if="!salesRows.length" description="本月暂无成单数据" image-size="60"/>',
    '      <div v-else class="fin-hbar-row" v-for="r in salesRows" :key="r.name">',
    '        <div class="hd"><span>{{ r.name }} <span class="muted">{{ r.cnt }}单</span></span><b>{{ H.money(r.money) }}</b></div>',
    '        <div class="bar"><i :style="{width:r.pct+\'%\'}"></i></div>',
    '      </div>',
    '    </div>',

    '    <div class="card-box">',
    '      <div class="sec-title" style="margin:0 0 10px"><span>教练课时</span><span class="more brand-text" @click="exportCsv(\'coach_hours\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '      <van-empty v-if="!coachRows.length" description="本月暂无教练消课数据" image-size="60"/>',
    '      <div v-else class="fin-hbar-row" v-for="r in coachRows" :key="r.name">',
    '        <div class="hd"><span>{{ r.name }} <span class="muted">{{ r.lessons }}节</span></span><b>{{ H.money(r.money) }}</b></div>',
    '        <div class="bar"><i :style="{width:r.pct+\'%\'}"></i></div>',
    '      </div>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    buildBars(pairs, W, HT) {
      const padT = 18, padB = 26; const n = Math.max(1, pairs.length);
      const gap = n > 20 ? 2 : 6;
      const bw = Math.max(2, (W - gap * (n - 1)) / n);
      const max = Math.max(1, ...pairs.map(p => Number(p.value || 0)));
      let x = 0;
      const bars = pairs.map(p => {
        const val = Number(p.value || 0);
        const h = Math.round(val / max * (HT - padT - padB));
        const bar = { x, y: HT - padB - h, w: bw, h: val > 0 ? Math.max(h, 1) : 0, val, label: p.label };
        x += bw + gap;
        return bar;
      });
      return { W, HT, bars, hideValue: n > 14, labelStep: Math.max(1, Math.ceil(n / 8)) };
    },
    exportCsv(section) {
      var url = '/api/finance/monthly?month=' + this.month + '&export=csv';
      if (section) url += '&section=' + section;
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
    shiftMonth(n) {
      const nm = dayjs(this.month + '-01').add(n, 'month').format('YYYY-MM');
      if (n > 0 && nm > dayjs().format('YYYY-MM')) return;
      this.month = nm; this.load();
    },
    async load() {
      this.loading = true;
      try { this.d = await API.get('/finance/monthly?month=' + this.month); }
      finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};

/* ============ 2. 收款明细 /staff/recharges ============ */
window.Pages.StaffRecharges = {
  data() {
    return {
      range: [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
      calShow: false, minDate: dayjs().subtract(2, 'year').toDate(), maxDate: new Date(),
      type: '', payMethod: '', kw: '',
      list: [], total: 0, sum: 0, pageNo: 1, size: 20, loading: false, finished: false,
    };
  },
  computed: {
    calDefault() { return [new Date(this.range[0]), new Date(this.range[1])]; },
    typeOptions() { return [{ text: '全部类型', value: '' }].concat(Object.keys(DICT.rechargeType).map(k => ({ text: DICT.rechargeType[k], value: k }))); },
    payOptions() { return [{ text: '全部支付方式', value: '' }].concat(Object.keys(DICT.payMethod).map(k => ({ text: DICT.payMethod[k], value: k }))); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="收款明细"></m-nav>',
    '  <div class="fin-daterange" @click="calShow=true">',
    '    <span class="txt"><van-icon name="calendar-o"/> {{ range[0] }} ~ {{ range[1] }}</span>',
    '    <van-icon name="arrow" color="var(--c-text-4)"/>',
    '  </div>',
    '  <van-calendar v-model:show="calShow" type="range" color="var(--brand)" :default-date="calDefault" :min-date="minDate" :max-date="maxDate" @confirm="onRange"/>',
    '  <van-dropdown-menu>',
    '    <van-dropdown-item v-model="type" :options="typeOptions" @change="search"/>',
    '    <van-dropdown-item v-model="payMethod" :options="payOptions" @change="search"/>',
    '  </van-dropdown-menu>',
    '  <van-search v-model="kw" placeholder="会员姓名 / 手机号" @search="search" @clear="search"/>',
    '  <div class="stat-row" style="margin-top:12px">',
    '    <div class="stat-cell"><div class="v">{{ H.money(sum) }}</div><div class="l">合计金额</div></div>',
    '    <div class="stat-cell"><div class="v">{{ total }}</div><div class="l">笔流水</div></div>',
    '  </div>',
    '  <van-empty v-if="!loading && !list.length" description="暂无收款记录"/>',
    '  <van-list v-else v-model:loading="loading" :finished="finished" finished-text="没有更多了" :immediate-check="false" @load="loadMore">',
    '    <div v-for="r in list" :key="r.id" class="rec-item">',
    '      <div class="head">',
    '        <span class="name">{{ r.realname || \'未命名\' }} <span class="muted" style="font-weight:400">{{ r.phone }}</span></span>',
    '        <d-tag dict="rechargeType" :v="r.type"></d-tag>',
    '      </div>',
    '      <div class="mt8" style="font-size:13px">{{ r.card_type_name }}</div>',
    '      <div class="flex mt8" style="justify-content:space-between">',
    '        <span class="muted">{{ H.full(r.insert_time) }}</span>',
    '        <span class="price" :style="Number(r.actual_money)<0?\'color:var(--down)\':\'\'">{{ H.money(r.actual_money) }}</span>',
    '      </div>',
    '      <div class="muted mt4">{{ DICT.payMethod[r.pay_method] || r.pay_method }} · {{ r.membership_name || \'未归属\' }}<template v-if="r.ope_username"> · 经手 {{ r.ope_username }}</template></div>',
    '      <div class="muted mt4" v-if="r.remark">备注：{{ r.remark }}</div>',
    '    </div>',
    '  </van-list>',
    '</div>',
  ].join('\n'),
  methods: {
    onRange(dates) {
      this.range = [dayjs(dates[0]).format('YYYY-MM-DD'), dayjs(dates[1]).format('YYYY-MM-DD')];
      this.calShow = false; this.search();
    },
    qs() {
      const o = { from: this.range[0], to: this.range[1], type: this.type || undefined, pay_method: this.payMethod || undefined,
        keyword: this.kw.trim() || undefined, page: this.pageNo, size: this.size };
      const parts = Object.keys(o).filter(k => o[k] !== undefined && o[k] !== '').map(k => k + '=' + encodeURIComponent(o[k]));
      return parts.length ? '?' + parts.join('&') : '';
    },
    search() { this.pageNo = 1; this.list = []; this.finished = false; this.loadMore(); },
    async loadMore() {
      this.loading = true;
      try {
        const d = await API.get('/finance/recharges' + this.qs());
        const rows = d.list || [];
        this.list = this.pageNo === 1 ? rows : this.list.concat(rows);
        this.total = d.total || 0; this.sum = d.sum || 0;
        this.finished = this.list.length >= this.total || rows.length < this.size;
        this.pageNo++;
      } finally { this.loading = false; }
    },
  },
  mounted() { this.search(); },
};

/* ============ 3. 耗卡明细 /staff/spends ============ */
window.Pages.StaffSpends = {
  data() {
    return {
      range: [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
      calShow: false, minDate: dayjs().subtract(2, 'year').toDate(), maxDate: new Date(),
      scene: '', kw: '',
      list: [], total: 0, sum: 0, pageNo: 1, size: 20, loading: false, finished: false,
    };
  },
  computed: {
    calDefault() { return [new Date(this.range[0]), new Date(this.range[1])]; },
    sceneOptions() { return [{ text: '全部场景', value: '' }].concat(Object.keys(DICT.spendScene).map(k => ({ text: DICT.spendScene[k], value: k }))); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="耗卡明细"></m-nav>',
    '  <div class="fin-daterange" @click="calShow=true">',
    '    <span class="txt"><van-icon name="calendar-o"/> {{ range[0] }} ~ {{ range[1] }}</span>',
    '    <van-icon name="arrow" color="var(--c-text-4)"/>',
    '  </div>',
    '  <van-calendar v-model:show="calShow" type="range" color="var(--brand)" :default-date="calDefault" :min-date="minDate" :max-date="maxDate" @confirm="onRange"/>',
    '  <van-dropdown-menu>',
    '    <van-dropdown-item v-model="scene" :options="sceneOptions" @change="search"/>',
    '  </van-dropdown-menu>',
    '  <van-search v-model="kw" placeholder="会员姓名 / 手机号" @search="search" @clear="search"/>',
    '  <div class="stat-row" style="margin-top:12px">',
    '    <div class="stat-cell"><div class="v">{{ H.money(sum) }}</div><div class="l">合计耗卡</div></div>',
    '    <div class="stat-cell"><div class="v">{{ total }}</div><div class="l">笔流水</div></div>',
    '  </div>',
    '  <van-empty v-if="!loading && !list.length" description="暂无耗卡记录"/>',
    '  <van-list v-else v-model:loading="loading" :finished="finished" finished-text="没有更多了" :immediate-check="false" @load="loadMore">',
    '    <div v-for="r in list" :key="r.id" class="rec-item">',
    '      <div class="head">',
    '        <span class="name">{{ r.realname || \'未命名\' }} <span class="muted" style="font-weight:400">{{ r.phone }}</span></span>',
    '        <d-tag dict="spendScene" :v="r.scene"></d-tag>',
    '      </div>',
    '      <div class="mt8" style="font-size:13px">{{ r.card_type_name }}</div>',
    '      <div class="flex mt8" style="justify-content:space-between">',
    '        <span class="muted">{{ H.full(r.insert_time) }}</span>',
    '        <span class="price">{{ H.money(r.spend_money) }}</span>',
    '      </div>',
    '      <div class="muted mt4">扣减 {{ r.costs }} 次<template v-if="r.coach_name"> · 教练 {{ r.coach_name }}</template></div>',
    '      <div class="muted mt4" v-if="r.remark">备注：{{ r.remark }}</div>',
    '    </div>',
    '  </van-list>',
    '</div>',
  ].join('\n'),
  methods: {
    onRange(dates) {
      this.range = [dayjs(dates[0]).format('YYYY-MM-DD'), dayjs(dates[1]).format('YYYY-MM-DD')];
      this.calShow = false; this.search();
    },
    qs() {
      const o = { from: this.range[0], to: this.range[1], scene: this.scene || undefined,
        keyword: this.kw.trim() || undefined, page: this.pageNo, size: this.size };
      const parts = Object.keys(o).filter(k => o[k] !== undefined && o[k] !== '').map(k => k + '=' + encodeURIComponent(o[k]));
      return parts.length ? '?' + parts.join('&') : '';
    },
    search() { this.pageNo = 1; this.list = []; this.finished = false; this.loadMore(); },
    async loadMore() {
      this.loading = true;
      try {
        const d = await API.get('/finance/spends' + this.qs());
        const rows = d.list || [];
        this.list = this.pageNo === 1 ? rows : this.list.concat(rows);
        this.total = d.total || 0; this.sum = d.sum || 0;
        this.finished = this.list.length >= this.total || rows.length < this.size;
        this.pageNo++;
      } finally { this.loading = false; }
    },
  },
  mounted() { this.search(); },
};

/* ============ 4. 教练消耗统计 /staff/coach-consume ============ */
window.Pages.StaffCoachConsume = {
  data() {
    return {
      range: [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
      calShow: false, minDate: dayjs().subtract(2, 'year').toDate(), maxDate: new Date(),
      d: null, loading: true,
    };
  },
  computed: {
    calDefault() { return [new Date(this.range[0]), new Date(this.range[1])]; },
    rankRows() {
      const list = (this.d && this.d.ranking) || [];
      const max = Math.max(1, ...list.map(x => Number(x.lessons || 0)));
      return list.map(x => ({ name: x.name, lessons: Number(x.lessons || 0), money: Number(x.money || 0),
        group_classes: Number(x.group_classes || 0), pct: Math.round(Number(x.lessons || 0) / max * 100) }));
    },
    dailyPairs() {
      const raw = (this.d && this.d.daily) || [];
      const map = {};
      raw.forEach(x => { map[x.d] = (map[x.d] || 0) + Number(x.lessons || 0); });
      let days = Object.keys(map).sort();
      if (!days.length) return [];
      if (days.length > 31) {
        const wmap = {};
        days.forEach(day => { const wk = dayjs(day).startOf('week').format('MM-DD'); wmap[wk] = (wmap[wk] || 0) + map[day]; });
        return Object.keys(wmap).sort().map(w => ({ label: w + '周', value: wmap[w] }));
      }
      return days.map(day => ({ label: day.slice(5), value: map[day] }));
    },
    dailyChart() { return this.dailyPairs.length ? this.buildBars(this.dailyPairs, 336, 160) : null; },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="教练消耗统计"></m-nav>',
    '  <div class="fin-daterange" @click="calShow=true">',
    '    <span class="txt"><van-icon name="calendar-o"/> {{ range[0] }} ~ {{ range[1] }}</span>',
    '    <van-icon name="arrow" color="var(--c-text-4)"/>',
    '  </div>',
    '  <van-calendar v-model:show="calShow" type="range" color="var(--brand)" :default-date="calDefault" :min-date="minDate" :max-date="maxDate" @confirm="onRange"/>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="card-box">',
    '      <div class="sec-title" style="margin:0 0 10px">教练消耗排名 <span class="muted" style="font-weight:400;font-size:11px">按消课课时</span></div>',
    '      <van-empty v-if="!rankRows.length" description="该时段暂无消耗数据" image-size="60"/>',
    '      <div v-else class="fin-hbar-row" v-for="(r,i) in rankRows" :key="r.name">',
    '        <div class="hd"><span>{{ i+1 }}. {{ r.name }}</span><b>{{ r.lessons }} 节</b></div>',
    '        <div class="bar"><i :style="{width:r.pct+\'%\'}"></i></div>',
    '        <div class="muted mt4" style="font-size:11px">耗课金额 {{ H.money(r.money) }} · 团课 {{ r.group_classes }} 节</div>',
    '      </div>',
    '    </div>',
    '    <div class="card-box" v-if="dailyChart">',
    '      <div class="sec-title" style="margin:0 0 8px">按日消耗趋势 <span class="muted" style="font-weight:400;font-size:11px">全部教练合计课时/日</span></div>',
    '      <svg :viewBox="\'0 0 \'+dailyChart.W+\' \'+dailyChart.HT" style="width:100%;display:block">',
    '        <g v-for="(b,i) in dailyChart.bars" :key="i">',
    '          <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h||1" rx="2" style="fill:var(--brand)"/>',
    '          <text v-if="!dailyChart.hideValue && b.val>0" :x="b.x+b.w/2" :y="b.y-4" text-anchor="middle" font-size="8" style="fill:var(--brand)">{{ b.val }}</text>',
    '          <text v-if="i%dailyChart.labelStep===0 || i===dailyChart.bars.length-1" :x="b.x+b.w/2" :y="dailyChart.HT-8" text-anchor="middle" font-size="8" style="fill:var(--c-text-3)">{{ b.label }}</text>',
    '        </g>',
    '      </svg>',
    '    </div>',
    '    <van-empty v-else description="该时段暂无按日数据" image-size="60"/>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    buildBars(pairs, W, HT) {
      const padT = 18, padB = 26; const n = Math.max(1, pairs.length);
      const gap = n > 20 ? 2 : 6;
      const bw = Math.max(2, (W - gap * (n - 1)) / n);
      const max = Math.max(1, ...pairs.map(p => Number(p.value || 0)));
      let x = 0;
      const bars = pairs.map(p => {
        const val = Number(p.value || 0);
        const h = Math.round(val / max * (HT - padT - padB));
        const bar = { x, y: HT - padB - h, w: bw, h: val > 0 ? Math.max(h, 1) : 0, val, label: p.label };
        x += bw + gap;
        return bar;
      });
      return { W, HT, bars, hideValue: n > 14, labelStep: Math.max(1, Math.ceil(n / 8)) };
    },
    onRange(dates) {
      this.range = [dayjs(dates[0]).format('YYYY-MM-DD'), dayjs(dates[1]).format('YYYY-MM-DD')];
      this.calShow = false; this.load();
    },
    async load() {
      this.loading = true;
      try { this.d = await API.get('/finance/coach-consume?from=' + this.range[0] + '&to=' + this.range[1]); }
      finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};

/* ============ 5. 会员概况 /staff/members-overview ============ */
window.Pages.StaffMemberOverview = {
  data() { return { d: null, loading: true }; },
  computed: {
    trendChart() {
      if (!this.d) return null;
      const pairs = (this.d.trend || []).map(x => ({ label: String(x.month).slice(5), value: Number(x.cnt || 0) }));
      return pairs.length ? this.buildBars(pairs, 336, 150) : null;
    },
    byCardRows() {
      const list = (this.d && this.d.byCard) || [];
      const max = Math.max(1, ...list.map(x => Number(x.cnt || 0)));
      return list.map(x => ({ name: x.name, cnt: Number(x.cnt || 0), pct: Math.round(Number(x.cnt || 0) / max * 100) }));
    },
    bySourceRows() {
      const list = (this.d && this.d.bySource) || [];
      const max = Math.max(1, ...list.map(x => Number(x.cnt || 0)));
      return list.map(x => ({ name: x.name, cnt: Number(x.cnt || 0), pct: Math.round(Number(x.cnt || 0) / max * 100) }));
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员概况"></m-nav>',
    '  <div class="stat-row" v-if="d" style="margin-top:12px">',
    '    <div class="stat-cell"><div class="v">{{ d.counts.total||0 }}</div><div class="l">会员总数</div></div>',
    '    <div class="stat-cell"><div class="v" style="color:var(--brand)">{{ d.counts.active||0 }}</div><div class="l">在籍会员</div></div>',
    '    <div class="stat-cell"><div class="v" style="color:var(--danger)">{{ d.counts.expired||0 }}</div><div class="l">过期召回池</div></div>',
    '    <div class="stat-cell"><div class="v" style="color:var(--c-text-3)">{{ d.counts.none||0 }}</div><div class="l">无卡会员</div></div>',
    '  </div>',
    '  <div class="rpt-export-row" v-if="d" @click="exportCsv(\'counts\')">导出会员构成 <van-icon name="arrow" size="11"/></div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="card-box" v-if="trendChart">',
    '      <div class="sec-title" style="margin:0 0 8px"><span>近12月新增会员趋势</span><span class="more brand-text" @click="exportCsv(\'trend\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '      <svg :viewBox="\'0 0 \'+trendChart.W+\' \'+trendChart.HT" style="width:100%;display:block">',
    '        <g v-for="(b,i) in trendChart.bars" :key="i">',
    '          <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h||1" rx="2" style="fill:var(--brand)"/>',
    '          <text v-if="!trendChart.hideValue && b.val>0" :x="b.x+b.w/2" :y="b.y-4" text-anchor="middle" font-size="8" style="fill:var(--brand)">{{ b.val }}</text>',
    '          <text v-if="i%trendChart.labelStep===0 || i===trendChart.bars.length-1" :x="b.x+b.w/2" :y="trendChart.HT-8" text-anchor="middle" font-size="8" style="fill:var(--c-text-3)">{{ b.label }}</text>',
    '        </g>',
    '      </svg>',
    '    </div>',
    '    <div class="card-box">',
    '      <div class="sec-title" style="margin:0 0 10px"><span>持卡类型分布</span><span class="more brand-text" @click="exportCsv(\'by_card\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '      <van-empty v-if="!byCardRows.length" description="暂无数据" image-size="60"/>',
    '      <div v-else class="fin-hbar-row" v-for="r in byCardRows" :key="r.name">',
    '        <div class="hd"><span>{{ r.name }}</span><b>{{ r.cnt }} 人</b></div>',
    '        <div class="bar"><i :style="{width:r.pct+\'%\'}"></i></div>',
    '      </div>',
    '    </div>',
    '    <div class="card-box">',
    '      <div class="sec-title" style="margin:0 0 10px"><span>来源渠道分布</span><span class="more brand-text" @click="exportCsv(\'by_source\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '      <van-empty v-if="!bySourceRows.length" description="暂无数据" image-size="60"/>',
    '      <div v-else class="fin-hbar-row" v-for="r in bySourceRows" :key="r.name">',
    '        <div class="hd"><span>{{ r.name }}</span><b>{{ r.cnt }} 人</b></div>',
    '        <div class="bar"><i :style="{width:r.pct+\'%\'}"></i></div>',
    '      </div>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    buildBars(pairs, W, HT) {
      const padT = 18, padB = 26; const n = Math.max(1, pairs.length);
      const gap = n > 20 ? 2 : 6;
      const bw = Math.max(2, (W - gap * (n - 1)) / n);
      const max = Math.max(1, ...pairs.map(p => Number(p.value || 0)));
      let x = 0;
      const bars = pairs.map(p => {
        const val = Number(p.value || 0);
        const h = Math.round(val / max * (HT - padT - padB));
        const bar = { x, y: HT - padB - h, w: bw, h: val > 0 ? Math.max(h, 1) : 0, val, label: p.label };
        x += bw + gap;
        return bar;
      });
      return { W, HT, bars, hideValue: n > 14, labelStep: Math.max(1, Math.ceil(n / 8)) };
    },
    exportCsv(section) {
      var url = '/api/members/overview?export=csv';
      if (section) url += '&section=' + section;
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
    async load() {
      this.loading = true;
      try { this.d = await API.get('/members/overview'); }
      finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};

/* ==================================================================
 * 本文件定义的页面与建议路由(路由需在 m/js/app.js 中接入, 本文件不改路由):
 *   window.Pages.StaffFinanceMonthly  -> /staff/finance-monthly   月度经营报表
 *   window.Pages.StaffRecharges       -> /staff/recharges         收款明细
 *   window.Pages.StaffSpends          -> /staff/spends            耗卡明细
 *   window.Pages.StaffCoachConsume    -> /staff/coach-consume     教练消耗统计
 *   window.Pages.StaffMemberOverview  -> /staff/members-overview  会员概况
 * ================================================================== */

/* 剩余卡价值（预收负债）: 门店核算「还欠会员多少服务」与分成结算的底数 */
window.Pages.StaffCardBalance = {
  data() {
    return { d: null, loading: true, clubId: '', kind: '', kw: '', clubs: [], tab: 0 };
  },
  computed: {
    clubOptions() { return [{ text: '全部门店', value: '' }].concat(this.clubs.map(c => ({ text: c.name, value: c.id }))); },
    kindOptions() { return [{ text: '全部卡种', value: '' }].concat(Object.keys(DICT.cardKind).map(k => ({ text: DICT.cardKind[k], value: Number(k) }))); },
    groups() {
      if (!this.d) return [];
      return [
        { t: '按门店', rows: this.d.byClub || [] },
        { t: '按卡种', rows: this.d.byKind || [] },
        { t: '按卡类型', rows: this.d.byType || [] },
      ];
    },
    // 已消耗 = 累计实收 − 剩余价值, 给个消耗进度让门店有体感
    usedPct() {
      const t = this.d && this.d.total; if (!t || !Number(t.paid)) return 0;
      return Math.min(100, Math.round((1 - Number(t.value) / Number(t.paid)) * 100));
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="剩余卡价值"></m-nav>',
    '  <van-dropdown-menu>',
    '    <van-dropdown-item v-model="clubId" :options="clubOptions" @change="load"/>',
    '    <van-dropdown-item v-model="kind" :options="kindOptions" @change="load"/>',
    '  </van-dropdown-menu>',
    '  <van-search v-model="kw" placeholder="会员姓名 / 手机号" @search="load" @clear="load"/>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="cb-hero">',
    '      <div class="l">当前剩余卡价值</div>',
    '      <div class="v">{{ H.money(d.total.value) }}</div>',
    '      <div class="s">{{ d.total.cards }} 张在用卡 · {{ d.total.members }} 位会员</div>',
    '      <div class="bar"><i :style="{width: usedPct+\'%\'}"></i></div>',
    '      <div class="s">累计实收 {{ H.money(d.total.paid) }}，已消耗 {{ usedPct }}%</div>',
    '    </div>',
    '    <div class="tip-box">口径：计次卡＝剩余次数×实收单价；期卡＝实收×剩余天数÷总天数；储值卡＝余额+赠额。已过期/停用/退卡的卡不计入。</div>',
    '    <van-tabs v-model:active="tab" color="var(--brand)">',
    '      <van-tab v-for="g in groups" :key="g.t" :title="g.t">',
    '        <div class="card-box" style="padding:2px 12px">',
    '          <div v-for="(row,i) in g.rows" :key="i" class="cb-row">',
    '            <div class="flex1">',
    '              <div class="n">{{ row.name || \'未分配\' }}</div>',
    '              <div class="muted mt4">{{ row.cards }} 张 · {{ row.members }} 人</div>',
    '            </div>',
    '            <div class="val">{{ H.money(row.value) }}</div>',
    '          </div>',
    '          <van-empty v-if="!g.rows.length" description="暂无数据" image-size="60"/>',
    '        </div>',
    '      </van-tab>',
    '    </van-tabs>',
    '    <div class="sec-title">剩余价值最高的卡<span class="more">前 {{ (d.list||[]).length }} 张</span></div>',
    '    <div v-for="c in d.list" :key="c.id" class="rec-item flex" @click="$router.push(\'/staff/card/\'+c.id)">',
    '      <div class="flex1">',
    '        <div class="name">{{ c.realname }} <span class="muted" style="font-weight:400">{{ c.phone }}</span></div>',
    '        <div class="muted mt4">{{ c.card_type_name }} · {{ c.club_name }}</div>',
    '        <div class="muted mt4">',
    '          <template v-if="c.counts>0">剩 {{ c.left_counts }}/{{ c.counts }} 次 × {{ H.money(c.unit_price) }}</template>',
    '          <template v-else-if="c.card_kind===3">余额 {{ H.money(c.left_money) }}</template>',
    '          <template v-else>剩 {{ c.left_days }} 天 / 共 {{ c.expire_days }} 天</template>',
    '        </div>',
    '      </div>',
    '      <div class="val">{{ H.money(c.remain_value) }}</div>',
    '    </div>',
    '    <div class="rpt-export-row" @click="exportCsv">导出全部明细 <van-icon name="arrow" size="11"/></div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    qs() {
      const q = {};
      if (this.clubId) q.club_id = this.clubId;
      if (this.kind) q.kind = this.kind;
      if (this.kw && this.kw.trim()) q.keyword = this.kw.trim();
      return Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
    },
    exportCsv() {
      const q = this.qs();
      window.open('/api/finance/card-balance?export=csv' + (q ? '&' + q : '') + '&token=' + encodeURIComponent(Store.token));
    },
    async load() {
      this.loading = true;
      try {
        const q = this.qs();
        this.d = await API.get('/finance/card-balance' + (q ? '?' + q : ''));
      } finally { this.loading = false; }
    },
  },
  async mounted() {
    try { this.clubs = (await API.get('/clubs', { silent: true }) || []).filter(c => c.status !== 0); } catch (e) { /* ignore */ }
    this.load();
  },
};
