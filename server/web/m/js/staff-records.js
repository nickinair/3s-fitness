/* 员工端-记录类页面: 消课记录 / 签到记录 / 签到报表 / 短信记录 / 操作日志 (PC 对应 pt-records.js / checkin-records.js / checkin-report.js / sms-logs.js / settings.js#SettingsLogs) */

/* ============ 1. 消课记录 (+补消课) ============ */
window.Pages.StaffPtRecords = {
  data() {
    return {
      query: { month: dayjs().format('YYYY-MM'), coach_id: '', page: 1, size: 20 },
      list: [], total: 0, loading: false, finished: false,
      coaches: [],
      role: (Store.user || {}).role,
      dlg: false, saving: false,
      form: { vip_id: null, member_name: '', card_id: null, coach_id: null, costs: 1, remark: '' },
      memberKw: '', memberResults: [], memberSearching: false, memberCards: [],
      cardPickShow: false, coachPickShow: false,
      H: window.H, DICT: window.DICT,
    };
  },
  computed: {
    canManual() { return ['admin', 'manager'].includes(this.role); },
    monthOptions() {
      const arr = [];
      for (let i = 0; i < 12; i++) {
        const m = dayjs().subtract(i, 'month');
        arr.push({ text: m.format('YYYY年MM月'), value: m.format('YYYY-MM') });
      }
      return arr;
    },
    coachOptions() {
      return [{ text: '全部教练', value: '' }].concat(this.coaches.map(c => ({ text: c.realname, value: c.id })));
    },
    cardLabel() {
      const c = this.memberCards.find(x => x.id === this.form.card_id);
      return c ? (c.card_type_name + '（剩' + c.left_counts + '课时）') : '';
    },
    coachLabel() {
      const c = this.coaches.find(x => x.id === this.form.coach_id);
      return c ? c.realname : '';
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="消课记录"></m-nav>',
    '  <van-dropdown-menu>',
    '    <van-dropdown-item v-model="query.month" :options="monthOptions" @change="applyFilter"></van-dropdown-item>',
    '    <van-dropdown-item v-if="role !== \'coach\'" v-model="query.coach_id" :options="coachOptions" @change="applyFilter"></van-dropdown-item>',
    '  </van-dropdown-menu>',
    '  <div v-if="canManual" class="sr-toolbar"><van-button size="small" type="primary" plain round icon="plus" @click="openManual">补消课</van-button></div>',
    '  <van-empty v-if="!loading && !list.length" description="暂无消课记录"></van-empty>',
    '  <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="loadPage()">',
    '    <div v-for="r in list" :key="r.id" class="rec-item">',
    '      <div class="head">',
    '        <span class="name brand-text" @click="r.vip_id && $router.push(\'/staff/member/\'+r.vip_id)">{{ r.realname }}</span>',
    '        <van-tag :type="r.bespeak_id ? \'primary\' : \'warning\'" round>{{ r.bespeak_id ? \'预约消课\' : \'补消课\' }}</van-tag>',
    '      </div>',
    '      <div class="muted mt4">{{ H.full(r.insert_time) }} · 教练 {{ r.coach_name || \'-\' }}</div>',
    '      <div class="flex mt8" style="justify-content:space-between">',
    '        <span>课时数 <b>{{ r.costs }}</b> · 单价 {{ H.money(r.unit_price) }}</span>',
    '        <span class="price">{{ H.money(r.spend_money) }}</span>',
    '      </div>',
    '      <div class="muted mt4" v-if="r.reception_remark">备注：{{ r.reception_remark }}</div>',
    '    </div>',
    '  </van-list>',

    '  <van-popup v-model:show="dlg" position="bottom" round safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head">补消课（无预约直接扣课时）</div>',
    '      <van-field v-model="memberKw" label="会员" placeholder="姓名/手机号，回车搜索" clearable @keyup.enter="searchMember" @clear="memberResults=[]"></van-field>',
    '      <div v-if="form.vip_id" class="muted" style="padding:0 16px 6px">已选：{{ form.member_name }}</div>',
    '      <div v-if="memberResults.length" class="sr-member-results">',
    '        <div v-for="m in memberResults" :key="m.id" class="sr-member-item" @click="pickMember(m)">{{ m.realname || m.nickname }} · {{ m.phone }}</div>',
    '      </div>',
    '      <van-field :model-value="cardLabel" label="私教卡" placeholder="先选择会员" readonly is-link @click="form.vip_id && (cardPickShow=true)"></van-field>',
    '      <van-field :model-value="coachLabel" label="教练" placeholder="请选择教练" readonly is-link @click="coachPickShow=true"></van-field>',
    '      <van-field label="课时数">',
    '        <template #input><van-stepper v-model="form.costs" :min="1" :max="20"></van-stepper></template>',
    '      </van-field>',
    '      <van-field v-model="form.remark" label="备注" placeholder="补消课原因" maxlength="100"></van-field>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="doManual">确认扣课</van-button></div>',
    '    </div>',
    '  </van-popup>',

    '  <van-popup v-model:show="cardPickShow" position="bottom" round>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head">选择私教卡</div>',
    '      <van-empty v-if="!memberCards.length" description="该会员无私教卡"></van-empty>',
    '      <van-cell v-for="c in memberCards" :key="c.id" :title="c.card_type_name" :label="\'剩\'+c.left_counts+\'课时\'"',
    '        :class="{\'sr-dis\': !([0,1].includes(c.status) && c.left_counts>=1)}" is-link @click="pickCard(c)"></van-cell>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="coachPickShow" position="bottom" round>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head">选择教练</div>',
    '      <van-cell v-for="c in coaches" :key="c.id" :title="c.realname" is-link @click="pickCoach(c)"></van-cell>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async loadPage(reset) {
      if (reset) { this.list = []; this.query.page = 1; this.finished = false; }
      this.loading = true;
      try {
        const d = await API.get('/ptrain-records', this.query);
        this.list = this.list.concat(d.list || []);
        this.total = d.total || 0;
        this.query.page += 1;
        if (this.list.length >= this.total || !(d.list || []).length) this.finished = true;
      } finally { this.loading = false; }
    },
    applyFilter() { this.loadPage(true); },
    openManual() {
      this.form = { vip_id: null, member_name: '', card_id: null, coach_id: null, costs: 1, remark: '' };
      this.memberKw = ''; this.memberResults = []; this.memberCards = [];
      this.dlg = true;
    },
    async searchMember() {
      const kw = this.memberKw.trim();
      if (!kw) { this.memberResults = []; return; }
      this.memberSearching = true;
      try {
        const d = await API.get('/members', { keyword: kw, size: 10 });
        this.memberResults = d.list || [];
      } finally { this.memberSearching = false; }
    },
    async pickMember(m) {
      this.form.vip_id = m.id; this.form.member_name = m.realname || m.nickname;
      this.form.card_id = null; this.memberCards = []; this.memberResults = [];
      const d = await API.get('/cards', { vip_id: m.id, size: 50 });
      this.memberCards = d.list || [];
    },
    pickCard(c) {
      if (!([0, 1].includes(c.status) && c.left_counts >= 1)) return vant.showToast('该卡不可用（状态异常或课时不足）');
      this.form.card_id = c.id; this.cardPickShow = false;
    },
    pickCoach(c) { this.form.coach_id = c.id; this.coachPickShow = false; },
    async doManual() {
      const f = this.form;
      if (!f.vip_id || !f.card_id || !f.coach_id) return vant.showToast('请完整填写会员/私教卡/教练');
      this.saving = true;
      try {
        await API.post('/ptrain-records/manual', { vip_id: f.vip_id, coach_id: f.coach_id, card_id: f.card_id, costs: f.costs, remark: f.remark });
        vant.showToast({ message: '补消课完成', icon: 'success' });
        this.dlg = false;
        this.applyFilter();
      } finally { this.saving = false; }
    },
  },
  async mounted() {
    this.coaches = await API.get('/coaches');
  },
};

/* ============ 2. 签到记录 ============ */
window.Pages.StaffCheckinRecords = {
  data() {
    return {
      query: { date: dayjs().format('YYYY-MM-DD'), keyword: '', page: 1, size: 20 },
      list: [], total: 0, loading: false, finished: false,
      calShow: false, minDate: new Date(2020, 0, 1), maxDate: new Date(),
      H: window.H, DICT: window.DICT,
    };
  },
  template: [
    '<div class="page">',
    '  <m-nav title="签到记录"></m-nav>',
    '  <div class="card-box" style="margin-bottom:0">',
    '    <van-field :model-value="query.date" label="日期" readonly is-link placeholder="选择日期" @click="calShow=true"></van-field>',
    '  </div>',
    '  <van-search v-model="query.keyword" placeholder="姓名/手机号" show-action @search="applyFilter" @clear="applyFilter">',
    '    <template #action><div @click="applyFilter" style="color:var(--brand)">搜索</div></template>',
    '  </van-search>',
    '  <van-calendar v-model:show="calShow" :min-date="minDate" :max-date="maxDate" @confirm="onDateConfirm"></van-calendar>',
    '  <div class="rpt-export-row" @click="exportCsv()">导出本期数据 <van-icon name="arrow" size="11"/></div>',
    '  <van-empty v-if="!loading && !list.length" description="暂无签到记录"></van-empty>',
    '  <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="loadPage()">',
    '    <div v-for="r in list" :key="r.id" class="rec-item">',
    '      <div class="head">',
    '        <span class="name brand-text" @click="r.vip_id && $router.push(\'/staff/member/\'+r.vip_id)">{{ r.realname }}</span>',
    '        <van-tag v-if="!r.check_out_time" type="success" round>在场</van-tag>',
    '        <span v-else class="muted" style="font-size:12px">已出场</span>',
    '      </div>',
    '      <div class="muted mt4">{{ r.phone }}</div>',
    '      <div class="flex mt8" style="justify-content:space-between">',
    '        <span>入场 {{ H.time(r.check_in_time) }}<template v-if="r.check_out_time"> → 出场 {{ H.time(r.check_out_time) }}</template></span>',
    '        <span class="muted">{{ DICT.port[r.port] || \'-\' }}</span>',
    '      </div>',
    '      <div class="muted mt4">{{ r.card_type_name }}<template v-if="r.card_kind"> · {{ DICT.cardKind[r.card_kind] }}</template><template v-if="r.ope_username"> · 经手人 {{ r.ope_username }}</template></div>',
    '    </div>',
    '  </van-list>',
    '</div>',
  ].join('\n'),
  methods: {
    exportCsv() {
      var url = '/api/checkins?date=' + encodeURIComponent(this.query.date) + '&export=csv';
      if (this.query.keyword) url += '&keyword=' + encodeURIComponent(this.query.keyword);
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
    async loadPage(reset) {
      if (reset) { this.list = []; this.query.page = 1; this.finished = false; }
      this.loading = true;
      try {
        const d = await API.get('/checkins', this.query);
        this.list = this.list.concat(d.list || []);
        this.total = d.total || 0;
        this.query.page += 1;
        if (this.list.length >= this.total || !(d.list || []).length) this.finished = true;
      } finally { this.loading = false; }
    },
    applyFilter() { this.loadPage(true); },
    onDateConfirm(date) {
      this.query.date = dayjs(date).format('YYYY-MM-DD');
      this.calShow = false;
      this.applyFilter();
    },
  },
};

/* ============ 3. 签到报表 ============ */
window.Pages.StaffCheckinReport = {
  data() {
    return {
      range: [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
      d: null, loading: false,
      calShow: false, minDate: new Date(2020, 0, 1), maxDate: new Date(),
    };
  },
  computed: {
    rangeLabel() { return this.range[0] + ' 至 ' + this.range[1]; },
    dayChart() {
      const rows = (this.d && this.d.byDay) || [];
      if (!rows.length) return null;
      const W = 336, HT = 170, padL = 10, padR = 10, padT = 16, padB = 26;
      const iw = W - padL - padR, ih = HT - padT - padB;
      const max = Math.max.apply(null, rows.map(r => r.cnt)) || 1;
      const xs = rows.map((r, i) => padL + (rows.length === 1 ? iw / 2 : i * iw / (rows.length - 1)));
      const pts = rows.map((r, i) => ({ x: Math.round(xs[i] * 10) / 10, y: Math.round((padT + ih - (r.cnt / max) * ih) * 10) / 10, v: r.cnt }));
      const path = pts.map(p => p.x + ',' + p.y).join(' ');
      const area = 'M' + padL + ',' + (padT + ih) + ' L' + pts.map(p => p.x + ',' + p.y).join(' L') + ' L' + (padL + iw) + ',' + (padT + ih) + ' Z';
      const step = Math.max(1, Math.ceil(rows.length / 6));
      const labels = rows.map((r, i) => ({ x: xs[i], t: dayjs(r.d).format('MM-DD') })).filter((l, i) => i % step === 0 || i === rows.length - 1);
      return { W, HT, path, area, pts, labels, total: rows.reduce((s, r) => s + r.cnt, 0) };
    },
    hourBars() {
      const map = {};
      ((this.d && this.d.byHour) || []).forEach(x => { map[x.h] = x.cnt; });
      const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00-23:00
      const max = Math.max.apply(null, hours.map(h => map[h] || 0)) || 1;
      return hours.map(h => ({ h, cnt: map[h] || 0, pct: Math.round((map[h] || 0) / max * 100) }));
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="签到报表"></m-nav>',
    '  <div class="card-box" style="margin-bottom:0">',
    '    <van-field :model-value="rangeLabel" label="统计区间" readonly is-link @click="calShow=true"></van-field>',
    '  </div>',
    '  <van-calendar v-model:show="calShow" type="range" :min-date="minDate" :max-date="maxDate" :default-date="[new Date(range[0]), new Date(range[1])]" @confirm="onRangeConfirm"></van-calendar>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="sec-title"><span>每日入场人次</span><span class="more"><span v-if="dayChart">共 {{ dayChart.total }} 人次 · </span><span class="brand-text" @click="exportCsv(\'by_day\')">导出明细 <van-icon name="arrow" size="10"/></span></span></div>',
    '    <div class="card-box" v-if="dayChart">',
    '      <svg :viewBox="\'0 0 \'+dayChart.W+\' \'+dayChart.HT" style="width:100%;display:block">',
    '        <path :d="dayChart.area" stroke="none" style="fill:rgba(var(--brand-rgb),.12)"></path>',
    '        <polyline :points="dayChart.path" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--brand)"></polyline>',
    '        <circle v-for="(p,i) in dayChart.pts" :key="i" :cx="p.x" :cy="p.y" r="2.4" style="fill:var(--brand)"></circle>',
    '        <text v-for="(l,i) in dayChart.labels" :key="\'l\'+i" :x="l.x" :y="dayChart.HT-8" text-anchor="middle" font-size="9" style="fill:var(--c-text-3)">{{ l.t }}</text>',
    '      </svg>',
    '    </div>',
    '    <van-empty v-else description="所选区间暂无签到数据"></van-empty>',

    '    <div class="sec-title"><span>时段分布（高峰识别）</span><span class="more brand-text" @click="exportCsv(\'by_hour\')">导出明细 <van-icon name="arrow" size="10"/></span></div>',
    '    <div class="card-box sr-bars">',
    '      <div v-for="b in hourBars" :key="b.h" class="sr-bar-row">',
    '        <span class="sr-bar-h">{{ b.h }}时</span>',
    '        <div class="sr-bar-track"><div class="sr-bar-fill" :style="{width: b.pct+\'%\'}"></div></div>',
    '        <span class="sr-bar-v">{{ b.cnt }}</span>',
    '      </div>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await API.get('/checkin-report', { from: this.range[0], to: this.range[1] }); }
      finally { this.loading = false; }
    },
    exportCsv(section) {
      var url = '/api/checkin-report?from=' + this.range[0] + '&to=' + this.range[1] + '&export=csv';
      if (section) url += '&section=' + section;
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
    onRangeConfirm(dates) {
      this.range = [dayjs(dates[0]).format('YYYY-MM-DD'), dayjs(dates[1]).format('YYYY-MM-DD')];
      this.calShow = false;
      this.load();
    },
  },
  mounted() { this.load(); },
};

/* ============ 4. 短信记录 ============ */
window.Pages.StaffSmsLogs = {
  data() {
    return {
      query: { scene: '', keyword: '', page: 1, size: 20 },
      list: [], total: 0, monthCount: 0, loading: false, finished: false,
      role: (Store.user || {}).role,
      SMS_SCENE: { buy_card: '购卡成功', lesson_done: '销课确认', card_low: '卡将耗尽', milestone: '里程碑', plan_push: '计划推送', intent: '意向确认', booking_ok: '预约成功', verify_code: '安全验证码' },
      SMS_STATUS: { 0: ['模拟', 'default'], 1: ['成功', 'success'], 2: ['失败', 'danger'] },
      H: window.H,
    };
  },
  computed: {
    allowed() { return ['admin', 'manager'].includes(this.role); },
    sceneOptions() {
      const s = this.SMS_SCENE;
      return [{ text: '全部场景', value: '' }].concat(Object.keys(s).map(k => ({ text: s[k], value: k })));
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="短信记录"></m-nav>',
    '  <van-empty v-if="!allowed" description="暂无权限查看（仅店长/管理员）"></van-empty>',
    '  <template v-else>',
    '    <div class="card-box sr-sms-tip">本月已发送 <b>{{ monthCount }}</b> 条 · 腾讯云短信企业认证后每月免费200条 · 当前为<b>模拟发送模式</b>（未配置短信凭证），正式模板待运营方提供</div>',
    '    <van-dropdown-menu>',
    '      <van-dropdown-item v-model="query.scene" :options="sceneOptions" @change="applyFilter"></van-dropdown-item>',
    '    </van-dropdown-menu>',
    '    <van-search v-model="query.keyword" placeholder="会员/手机号" show-action @search="applyFilter" @clear="applyFilter">',
    '      <template #action><div @click="applyFilter" style="color:var(--brand)">搜索</div></template>',
    '    </van-search>',
    '    <div class="rpt-export-row" @click="exportCsv()">导出本期数据 <van-icon name="arrow" size="11"/></div>',
    '    <van-empty v-if="!loading && !list.length" description="暂无短信记录"></van-empty>',
    '    <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="loadPage()">',
    '      <div v-for="r in list" :key="r.id" class="rec-item">',
    '        <div class="head">',
    '          <span class="name" :class="{\'brand-text\':r.vip_id}" @click="r.vip_id && $router.push(\'/staff/member/\'+r.vip_id)">{{ r.realname || \'-\' }}</span>',
    '          <van-tag :type="(SMS_STATUS[r.status]||[\'未知\',\'default\'])[1]" round>{{ (SMS_STATUS[r.status]||[\'未知\'])[0] }}</van-tag>',
    '        </div>',
    '        <div class="muted mt4">{{ r.phone }} · {{ SMS_SCENE[r.scene] || r.scene }}</div>',
    '        <div class="mt8" style="font-size:13px;color:var(--c-text)">{{ r.content }}</div>',
    '        <div class="muted mt4">{{ H.full(r.insert_time) }}</div>',
    '      </div>',
    '    </van-list>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    async loadPage(reset) {
      if (reset) { this.list = []; this.query.page = 1; this.finished = false; }
      this.loading = true;
      try {
        const d = await API.get('/sms-logs', this.query);
        this.list = this.list.concat(d.list || []);
        this.total = d.total || 0; this.monthCount = d.monthCount || 0;
        this.query.page += 1;
        if (this.list.length >= this.total || !(d.list || []).length) this.finished = true;
      } finally { this.loading = false; }
    },
    exportCsv() {
      var url = '/api/sms-logs?export=csv';
      if (this.query.scene) url += '&scene=' + encodeURIComponent(this.query.scene);
      if (this.query.keyword) url += '&keyword=' + encodeURIComponent(this.query.keyword);
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
    applyFilter() { this.loadPage(true); },
  },
};

/* ============ 5. 操作日志 ============ */
/* 后端 GET /logs 仅返回本商户最近200条, 不支持 page/size/关键词/日期筛选参数,
   因此本页筛选与分页均在这最多200条数据上做前端处理(见文件末尾说明)。 */
window.Pages.StaffOpLogs = {
  data() {
    return {
      raw: [], loading: true,
      role: (Store.user || {}).role,
      keyword: '', range: null, calShow: false,
      minDate: new Date(2020, 0, 1), maxDate: new Date(),
      displayCount: 20, loadingMore: false,
      H: window.H,
    };
  },
  computed: {
    allowed() { return ['admin', 'manager'].includes(this.role); },
    rangeLabel() { return this.range ? (this.range[0] + ' 至 ' + this.range[1]) : '全部时间（近200条）'; },
    filtered() {
      let rows = this.raw;
      if (this.range) {
        const a = this.range[0], b = this.range[1];
        rows = rows.filter(r => { const d = String(r.insert_time || '').slice(0, 10); return d >= a && d <= b; });
      }
      const kw = this.keyword.trim();
      if (kw) rows = rows.filter(r => (r.username || '').includes(kw) || (r.action || '').includes(kw) || (r.detail || '').includes(kw));
      return rows;
    },
    display() { return this.filtered.slice(0, this.displayCount); },
    listFinished() { return this.display.length >= this.filtered.length; },
  },
  watch: {
    keyword() { this.displayCount = 20; },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="操作日志"></m-nav>',
    '  <van-empty v-if="!allowed" description="暂无权限查看（仅店长/管理员）"></van-empty>',
    '  <template v-else>',
    '    <div class="card-box" style="margin-bottom:0">',
    '      <van-field :model-value="rangeLabel" label="时间范围" readonly is-link @click="calShow=true"></van-field>',
    '      <div v-if="range" style="text-align:right;padding-top:4px"><span class="brand-text" style="font-size:12px" @click="range=null; displayCount=20">清除日期筛选</span></div>',
    '    </div>',
    '    <van-calendar v-model:show="calShow" type="range" :min-date="minDate" :max-date="maxDate" @confirm="onRangeConfirm"></van-calendar>',
    '    <van-search v-model="keyword" placeholder="操作人/操作/详情关键词"></van-search>',
    '    <div class="muted" style="padding:0 14px 6px">近200条 · 当前筛选出 {{ filtered.length }} 条</div>',
    '    <div class="rpt-export-row" @click="exportCsv()">导出本期数据 <van-icon name="arrow" size="11"/></div>',
    '    <van-empty v-if="!loading && !display.length" description="暂无操作日志"></van-empty>',
    '    <van-list v-if="display.length" v-model:loading="loadingMore" :finished="listFinished" finished-text="没有更多了" @load="loadMore">',
    '      <div v-for="r in display" :key="r.id" class="rec-item">',
    '        <div class="head"><span class="name">{{ r.username }}</span><van-tag type="primary" round>{{ r.action }}</van-tag></div>',
    '        <div class="muted mt4" v-if="r.detail">{{ r.detail }}</div>',
    '        <div class="muted mt4">{{ H.full(r.insert_time) }}</div>',
    '      </div>',
    '    </van-list>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    onRangeConfirm(dates) {
      this.range = [dayjs(dates[0]).format('YYYY-MM-DD'), dayjs(dates[1]).format('YYYY-MM-DD')];
      this.calShow = false;
      this.displayCount = 20;
    },
    loadMore() {
      this.displayCount = Math.min(this.displayCount + 20, this.filtered.length);
      this.loadingMore = false;
    },
    exportCsv() {
      var url = '/api/logs?export=csv';
      if (this.range) url += '&from=' + this.range[0] + '&to=' + this.range[1];
      var kw = this.keyword.trim();
      if (kw) url += '&keyword=' + encodeURIComponent(kw);
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
  },
  async mounted() {
    if (!this.allowed) { this.loading = false; return; }
    this.loading = true;
    try { this.raw = await API.get('/logs') || []; }
    finally { this.loading = false; }
  },
};

/*
 * 本文件定义的页面 (window.Pages.X) 及建议路由:
 *   StaffPtRecords      -> /staff/pt-records       消课记录 + 补消课(admin/manager)
 *   StaffCheckinRecords -> /staff/checkin-records   签到记录
 *   StaffCheckinReport  -> /staff/checkin-report    签到报表(纯 SVG 折线 + CSS/SVG 条形图)
 *   StaffSmsLogs        -> /staff/sms-logs          短信记录(仅 admin/manager 可查看, 后端 staffAuth 限制)
 *   StaffOpLogs         -> /staff/op-logs           操作日志(仅 admin/manager 可查看, 后端 staffAuth 限制)
 *
 * 接口清单 (均沿用现有后端, 未新增/修改接口):
 *   GET  /ptrain-records          {month, coach_id, page, size} -> {list, total}
 *   POST /ptrain-records/manual   {vip_id, coach_id, card_id, costs, remark}
 *   GET  /coaches                                              -> [{id, realname, ...}]
 *   GET  /members                 {keyword, size}               -> {list, total, stats}
 *   GET  /cards                   {vip_id, kind, size}           -> {list, total}
 *   GET  /checkins                {date, keyword, page, size}   -> {list, total}
 *   GET  /checkin-report          {from, to}                     -> {byDay:[{d,cnt}], byHour:[{h,cnt}]}
 *   GET  /sms-logs                {scene, keyword, page, size}  -> {list, total, monthCount}
 *   GET  /logs                                                   -> [{id, username, action, detail, insert_time}] (最近200条, 不支持筛选/分页参数)
 *
 * 与 PC 端的差异 / 未能实现之处:
 *   1. 操作日志(StaffOpLogs): PC 端 SettingsLogs 本身就没有筛选和分页, 只是把后端 /logs 返回的最近200条整表渲染。
 *      后端 /logs 接口也确实不接受 page/size/关键词/日期等 query 参数(见 server/src/routes/common.js:194)。
 *      为满足移动端规范里"要有筛选条件和分页"的要求, 本页在前端对这最多200条数据做了关键词(操作人/操作/详情)
 *      和日期区间(van-calendar range)的本地过滤, 并用 van-list 做每页20条的本地分页展示; 不是服务端真实分页/筛选。
 *      如需服务端级筛选, 需要修改后端 /logs 路由(未做, 遵循"不要改后端"的要求)。
 *   2. 消课记录(StaffPtRecords)的"补消课"弹窗里, PC 端用 <member-select> 组件做会员选择(带远程搜索下拉),
 *      移动端改为"输入关键词回车搜索 -> 列表里点选"的简化交互, 效果等价但控件形态不同。
 *   3. 教练/月份筛选 PC 端用 el-select / el-date-picker(月), 移动端按规范统一改用 van-dropdown-menu
 *      (月份下拉枚举最近12个月, 与 PC 默认当月一致); 签到记录的单日期筛选、签到报表与操作日志的区间筛选
 *      按规范用 van-calendar(区间用 type="range")。
 *   4. 短信记录/操作日志的角色可见性: PC 菜单里这两个页面本就只对 admin/manager 显示, 且后端接口用
 *      staffAuth('admin','manager') 做了强制校验; 移动端在页面内做了同样的角色判断, 非 admin/manager
 *      进入时直接展示"暂无权限查看"空态, 不发起请求, 避免后端 403 提示体验生硬。
 *   5. 短信记录的场景/状态字典(smsScene/smsStatus) 在移动端全局字典 server/web/m/js/api.js 里尚未定义
 *      (该文件不在本次分配范围内, 未做修改), 因此本页在组件内部用局部字典 SMS_SCENE/SMS_STATUS 承载文案,
 *      取值与 server/web/admin/js/api.js 中的 admin 端字典保持一致。
 */
