/* 员工端-数据看板(店长) + 顾问业绩 */
window.Pages.StaffDashboard = {
  data() { return { d: null, loading: true, mode: 'day', month: dayjs().format('YYYY-MM') }; },
  computed: {
    isMonth() { return this.mode === 'month'; },
    canNext() { return this.month < dayjs().format('YYYY-MM'); },
    kpis() {
      if (!this.d) return [];
      const t = this.d.today, y = this.d.yesterday;
      if (this.isMonth) {
        return [
          { l: '本月新增', v: t.new_members, y: Number(y.new_members), c: Number(t.new_members) },
          { l: '本月预收', v: H.money(t.recharge_money), y: Number(y.recharge_money), c: Number(t.recharge_money), money: true },
          { l: '本月耗卡', v: H.money(t.spend_money), y: Number(y.spend_money), c: Number(t.spend_money), money: true },
          { l: '月活跃', v: t.active_members, y: Number(y.active_members), c: Number(t.active_members) },
        ];
      }
      return [
        { l: '今日预收', v: H.money(t.recharge_money), y: Number(y.recharge_money), c: Number(t.recharge_money), money: true },
        { l: '今日耗卡', v: H.money(t.spend_money), y: Number(y.spend_money), c: Number(t.spend_money), money: true },
        { l: '到店人次', v: t.checkins, y: Number(y.checkins), c: Number(t.checkins) },
        { l: '新增会员', v: t.new_members, y: Number(y.new_members), c: Number(t.new_members) },
      ];
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="数据看板"></m-nav>',
    '  <div style="padding:12px 16px 0">',
    '    <van-tabs v-model:active="mode" type="card" color="#0d5e56" @change="onMode">',
    '      <van-tab title="日报" name="day"></van-tab>',
    '      <van-tab title="月报" name="month"></van-tab>',
    '    </van-tabs>',
    '  </div>',
    '  <div v-if="isMonth" class="flex" style="justify-content:center;gap:18px;padding:12px 0 0">',
    '    <van-icon name="arrow-left" size="16" color="#0d5e56" @click="shiftMonth(-1)"/>',
    '    <b style="font-size:15px">{{ month }}</b>',
    '    <van-icon name="arrow" size="16" :color="canNext?\'#0d5e56\':\'#c8c9cc\'" @click="canNext && shiftMonth(1)"/>',
    '  </div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="muted" style="padding:12px 16px 0">{{ isMonth ? (month+\' · 与上月对比\') : (d.date+\' · 与昨日对比\') }}</div>',
    '    <div class="kpi-grid">',
    '      <div class="kpi" v-for="k in kpis" :key="k.l">',
    '        <div class="l">{{ k.l }}</div>',
    '        <div class="v">{{ k.v }}</div>',
    '        <div class="c">{{ isMonth ? \'较上月\' : \'昨日\' }} {{ k.money ? H.money(k.y) : k.y }}',
    '          <span v-if="k.c>k.y" class="up">↑</span><span v-else-if="k.c<k.y" class="down">↓</span><span v-else class="muted">—</span>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div class="stat-row" style="margin-top:0">',
    '      <div class="stat-cell"><div class="v">{{ d.today.group_classes }}</div><div class="l">{{ isMonth?\'本月团课\':\'今日团课\' }}</div></div>',
    '      <div class="stat-cell"><div class="v">{{ d.today.pt_lessons }}</div><div class="l">私教消课</div></div>',
    '      <div class="stat-cell"><div class="v">{{ d.today.checkins }}</div><div class="l">到店人次</div></div>',
    '      <div class="stat-cell"><div class="v">{{ d.today.active_members }}</div><div class="l">{{ isMonth?\'月活跃\':\'到店会员数\' }}</div></div>',
    '    </div>',
    '    <div class="rpt-export-row" @click="exportCsv(\'summary\')">导出指标汇总 <van-icon name="arrow" size="11"/></div>',
    '    <template v-if="!isMonth">',
    '    <div class="sec-title"><span>今日课程</span><span class="more brand-text" @click="exportCsv(\'classes\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '    <van-empty v-if="!(d.classes||[]).length" description="今日暂无排课" image-size="70"/>',
    '    <div class="card-box" v-else style="padding:2px 8px">',
    '      <van-cell v-for="c in d.classes" :key="c.id" :title="H.time(c.start_time)+\' \'+c.title" :label="(c.coach_name||\'\')+\' · \'+(c.classroom_name||\'\')" is-link @click="$router.push(\'/staff/group/\'+c.id)">',
    '        <template #value><span class="muted">{{ c.booked_count }}/{{ c.people_count }}</span> <d-tag dict="syllabusStatus" :v="c.status"></d-tag></template>',
    '      </van-cell>',
    '    </div>',
    '    <div class="sec-title"><span>今日私教（{{ (d.ptToday||[]).length }}）</span><span class="more brand-text" @click="exportCsv(\'pt\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '    <van-empty v-if="!(d.ptToday||[]).length" description="今日暂无私教预约" image-size="70"/>',
    '    <div class="card-box" v-else style="padding:2px 8px;margin-bottom:20px">',
    '      <van-cell v-for="p in d.ptToday" :key="p.id" :title="p.from_time+\' \'+p.realname" :label="(p.course_title||\'私教课\')+\' · \'+p.coach_name">',
    '        <template #value><d-tag dict="ptStatus" :v="p.status"></d-tag></template>',
    '      </van-cell>',
    '    </div>',
    '    </template>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    onMode() { this.load(); },
    exportCsv(section) {
      var url = '/api/finance/dashboard?export=csv';
      if (this.isMonth) url += '&mode=month&month=' + this.month;
      if (section) url += '&section=' + section;
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
    shiftMonth(n) {
      this.month = dayjs(this.month + '-01').add(n, 'month').format('YYYY-MM');
      this.load();
    },
    async load() {
      this.loading = true;
      try {
        const url = this.isMonth ? '/finance/dashboard?mode=month&month=' + this.month : '/finance/dashboard';
        this.d = await API.get(url);
      } finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};

window.Pages.StaffSales = {
  data() { return { d: null, loading: true, isSale: (Store.user || {}).role === 'membership' }; },
  computed: {
    mine() {
      if (!this.d) return null;
      if (this.isSale) return (this.d.list || [])[0] || { orders: 0, money: 0, new_orders: 0, renew_money: 0 };
      return null;
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav :title="isSale ? \'我的业绩\' : \'顾问业绩\'"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="muted" style="padding:12px 16px 0">{{ d.month }} 月度统计</div>',
    '    <div class="kpi-grid" v-if="mine">',
    '      <div class="kpi"><div class="l">本月成单数</div><div class="v">{{ mine.orders||0 }} <span style="font-size:12px;font-weight:400">单</span></div></div>',
    '      <div class="kpi"><div class="l">本月实收金额</div><div class="v">{{ H.money(mine.money) }}</div></div>',
    '      <div class="kpi"><div class="l">新客成单</div><div class="v">{{ mine.new_orders||0 }} <span style="font-size:12px;font-weight:400">单</span></div></div>',
    '      <div class="kpi"><div class="l">续卡金额</div><div class="v">{{ H.money(mine.renew_money) }}</div></div>',
    '    </div>',
    '    <template v-if="!isSale">',
    '      <div class="sec-title">业绩排行</div>',
    '      <van-empty v-if="!(d.list||[]).length" description="本月暂无成单" image-size="70"/>',
    '      <div class="card-box" v-else style="padding:2px 8px">',
    '        <van-cell v-for="(r,i) in d.list" :key="i" :title="(i+1)+\'. \'+r.name" :label="\'成单 \'+r.orders+\' · 新客 \'+(r.new_orders||0)">',
    '          <template #value><span class="price">{{ H.money(r.money) }}</span></template>',
    '        </van-cell>',
    '      </div>',
    '    </template>',
    '    <div class="sec-title">成单明细（{{ (d.details||[]).length }}）</div>',
    '    <van-empty v-if="!(d.details||[]).length" description="本月暂无明细" image-size="70"/>',
    '    <div class="card-box" v-else style="padding:2px 8px;margin-bottom:20px">',
    '      <van-cell v-for="r in d.details" :key="r.id" :title="r.realname+\' · \'+r.card_type_name" :label="(DICT.rechargeType[r.type]||\'\')+\' · \'+(DICT.payMethod[r.pay_method]||r.pay_method)+\' · \'+H.full(r.insert_time)">',
    '        <template #value><span class="price">{{ H.money(r.actual_money) }}</span></template>',
    '      </van-cell>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  async mounted() {
    try { this.d = await API.get('/finance/sales'); }
    finally { this.loading = false; }
  },
};
