/* 员工端-代约课: 管理员/店长可为任意教练代约, 教练只能约到自己名下
 * 私教课 -> POST /ptrain-bookings (直接确认)
 * 团课   -> POST /syllabus/:id/book
 */
window.Pages.StaffBook = {
  data() {
    return {
      tab: 'pt',
      // 会员选择
      kw: '', results: [], searching: false, rPage: 1, rTotal: 0, kwTimer: null, vip: null,
      // 日期
      days: H.monthDays(), date: H.today(),
      // 私教
      loadingPt: false, pt: null, coachId: null, courseId: null, clubId: null, fromTime: null, cardId: null,
      // 团课
      loadingG: false, glist: [], gCur: null, gCards: null, gCardId: null, gShow: false,
      submitting: false,
    };
  },
  computed: {
    isCoach() { return (Store.user || {}).role === 'coach'; },
    coach() { return this.pt ? (this.pt.coaches || []).find(c => c.id === this.coachId) : null; },
    courses() { return this.coach ? this.coach.courses : []; },
    course() { return this.courses.find(c => c.id === this.courseId) || null; },
    duration() { return this.course ? this.course.duration : 60; },
    openTime() {
      const c = this.pt ? (this.pt.clubs || []).find(x => x.id === this.clubId) : null;
      return c ? c.open_time : '08:00-21:00';
    },
    ptCards() {
      const all = (this.pt ? (this.pt.cards || []) : []).filter(c => c.usable !== false);
      if (!this.course) return all;
      let scope = [];
      try { scope = JSON.parse(this.course.card_scope || '[]'); } catch (e) { scope = []; }
      return scope.length ? all.filter(c => scope.includes(c.card_type_id)) : all;
    },
    canSubmitPt() { return !!(this.vip && this.coachId && this.courseId && this.clubId && this.fromTime && this.cardId); },
  },
  template: [
    '<div class="page" style="padding-bottom:88px">',
    '  <m-nav title="代约课"></m-nav>',

    /* ---------- 1. 选择会员 ---------- */
    '  <div class="sec-title">1. 选择会员</div>',
    '  <div class="card-box" style="padding:10px 12px">',
    '    <template v-if="!vip">',
    '      <van-search v-model="kw" placeholder="姓名 / 手机号，留空显示最近添加的会员" style="padding:0 0 4px" @update:model-value="onKw" @search="search(true)"/>',
    '      <div class="muted" style="padding:0 4px 6px">共 {{ rTotal }} 人，按添加时间从新到旧</div>',
    '      <div class="oc-members">',
    '        <div v-for="m in results" :key="m.id" class="cat-pick flex" @click="pickVip(m)">',
    '          <div class="flex1"><b>{{ m.realname || \'未命名\' }}</b> <span class="muted">{{ m.phone }}</span>',
    '            <van-tag v-if="m.is_black" type="danger" style="margin-left:4px">黑名单</van-tag></div>',
    '          <van-icon name="arrow" color="#bbb" size="14"/>',
    '        </div>',
    '        <div v-if="searching" style="text-align:center;padding:8px"><van-loading size="20" color="var(--brand)"/></div>',
    '        <van-empty v-else-if="!results.length" description="没有匹配的会员" image-size="60"/>',
    '        <div v-else-if="results.length < rTotal" style="text-align:center;padding:6px 0 2px" @click="search(false)"><span class="brand-text" style="font-size:13px">加载更多（还有 {{ rTotal - results.length }} 人）</span></div>',
    '      </div>',
    '    </template>',
    '    <div v-else class="flex">',
    '      <m-avatar :name="vip.realname" :size="40"></m-avatar>',
    '      <div class="flex1" style="margin-left:10px;min-width:0">',
    '        <div style="font-size:15px;font-weight:600">{{ vip.realname || \'未命名\' }}</div>',
    '        <div class="muted mt4">{{ vip.phone }}<template v-if="pt && pt.mine && pt.mine.length"> · 当天已有 {{ pt.mine.length }} 节课</template></div>',
    '      </div>',
    '      <van-button size="small" round plain @click="clearVip">更换</van-button>',
    '    </div>',
    '  </div>',

    '  <template v-if="vip">',
    '  <div class="sec-title">2. 选择课程类型</div>',
    '  <div class="card-box" style="padding:10px 12px">',
    '    <van-tabs v-model:active="tab" type="card" color="var(--brand)" @change="onTab">',
    '      <van-tab title="私教课" name="pt"></van-tab>',
    '      <van-tab title="团课" name="group"></van-tab>',
    '    </van-tabs>',
    '  </div>',

    '  <div class="day-strip" ref="strip">',
    '    <div v-for="d in days" :key="d.date" class="day-item" :class="{on:d.date===date, past:d.past}" @click="pickDate(d.date)">',
    '      <div class="w">{{ d.w }}</div><div class="d">{{ d.d }}</div>',
    '    </div>',
    '  </div>',

    /* ---------- 私教 ---------- */
    '  <template v-if="tab===\'pt\'">',
    '    <div v-if="loadingPt" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '    <template v-else-if="pt">',
    '      <div v-if="pt.mine && pt.mine.length" class="card-box" style="padding:10px 12px">',
    '        <div class="muted" style="margin-bottom:6px">该会员 {{ H.day(date) }} 已有安排</div>',
    '        <div v-for="b in pt.mine" :key="b.id" class="flex" style="font-size:13px;padding:3px 0">',
    '          <span class="brand-text" style="width:92px">{{ b.from_time }}-{{ b.to_time }}</span>',
    '          <span class="flex1">{{ b.course_title || \'私教课\' }} · {{ b.coach_name }}</span>',
    '        </div>',
    '      </div>',
    '      <template v-if="pt.clubs && pt.clubs.length>1">',
    '        <div class="sec-title">上课门店</div>',
    '        <div class="card-box" style="padding:10px 12px"><div class="store-pick">',
    '          <div v-for="c in pt.clubs" :key="c.id" class="store-opt" :class="{on:clubId===c.id}" @click="clubId=c.id">',
    '            <div class="n">{{ c.name }}</div><div class="a">{{ c.address }}</div>',
    '          </div>',
    '        </div></div>',
    '      </template>',
    '      <div class="sec-title">选择教练<span v-if="isCoach" class="muted" style="font-weight:400;margin-left:6px">（只能约到自己名下）</span></div>',
    '      <div class="card-box" style="padding:8px 12px">',
    '        <van-empty v-if="!pt.coaches.length" description="暂无可代约的教练" image-size="60"/>',
    '        <div class="bk-coach-pick">',
    '          <div v-for="c in pt.coaches" :key="c.id" class="bk-coach-opt" :class="{on:coachId===c.id}" @click="pickCoach(c)">',
    '            {{ c.realname }}<van-tag v-if="c.is_main" type="primary" round style="margin-left:4px">主教练</van-tag>',
    '          </div>',
    '        </div>',
    '      </div>',
    '      <template v-if="coach">',
    '        <div class="sec-title">选择课程</div>',
    '        <div class="card-box" style="padding:6px 12px 10px">',
    '          <div v-for="cs in courses" :key="cs.id" class="cat-pick flex" :class="{on:courseId===cs.id}" @click="pickCourse(cs.id)">',
    '            <div class="flex1"><div style="font-size:14px;font-weight:600">{{ cs.title }}</div>',
    '              <div class="muted mt4">{{ cs.duration }}分钟 · {{ cs.people_count===1 ? \'1对1\' : cs.people_count+\'人小团\' }}</div></div>',
    '            <van-icon v-if="courseId===cs.id" name="checked" color="var(--brand)" size="20"/>',
    '          </div>',
    '        </div>',
    '        <div class="sec-title">选择时间</div>',
    '        <div class="card-box" style="padding:10px 12px">',
    '          <m-time-picker v-model="fromTime" :date="date" :open-time="openTime" :busy="coach.busy" :mine="pt.member_busy || []" :duration="duration" :allow-past="true"></m-time-picker>',
    '        </div>',
    '        <div class="sec-title">选择支付卡（会员本人的卡，任意卡种均可）</div>',
    '        <div class="card-box" style="padding:6px 12px 10px">',
    '          <van-empty v-if="!ptCards.length" description="该会员没有可用于此课程的会员卡" image-size="60"/>',
    '          <div v-for="c in ptCards" :key="c.id" class="cat-pick flex" :class="{on:cardId===c.id}" @click="cardId=c.id">',
    '            <div class="flex1"><div style="font-size:14px;font-weight:600">{{ c.card_type_name }}</div>',
    '              <div class="muted mt4">{{ cardDesc(c) }}<template v-if="c.expire_time"> · {{ H.dateOf(c.expire_time) }}到期</template></div></div>',
    '            <van-icon v-if="cardId===c.id" name="checked" color="var(--brand)" size="20"/>',
    '          </div>',
    '        </div>',
    '      </template>',
    '    </template>',
    '  </template>',

    /* ---------- 团课 ---------- */
    '  <template v-else>',
    '    <div v-if="loadingG" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '    <template v-else>',
    '      <van-empty v-if="!glist.length" description="当日暂无排课" />',
    '      <div v-for="it in glist" :key="it.id" class="course-item" @click="openGroup(it)">',
    '        <div class="course-time"><div class="b">{{ H.time(it.start_time) }}</div><div class="e">{{ H.time(it.end_time) }}</div></div>',
    '        <div class="flex1">',
    '          <div class="title">{{ it.title }}</div>',
    '          <div class="muted mt4">{{ it.coach_name || \'待定\' }} · {{ it.classroom_name }}<template v-if="it.deduct_num"> · 扣{{ it.deduct_num }}次</template></div>',
    '          <div class="mt4 muted">已约 {{ it.booked_count }} / 满 {{ it.people_count }}</div>',
    '        </div>',
    '        <div style="display:flex;align-items:center">',
    '          <van-button size="small" round type="primary" :disabled="it.status!==1" @click.stop="openGroup(it)" style="min-width:74px">',
    '            {{ it.status!==1 ? \'不可约\' : (it.booked_count>=it.people_count ? \'候补\' : \'代约\') }}</van-button>',
    '        </div>',
    '      </div>',
    '    </template>',
    '  </template>',
    '  </template>',

    /* 团课代约弹层 */
    '  <van-popup v-model:show="gShow" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div v-if="gCur" style="padding:20px 18px 24px">',
    '      <div style="font-size:17px;font-weight:700">{{ gCur.title }}</div>',
    '      <div class="muted mt8">{{ H.day(gCur.start_time) }} {{ H.time(gCur.start_time) }}-{{ H.time(gCur.end_time) }} · {{ gCur.coach_name || \'待定\' }} · {{ gCur.classroom_name }}</div>',
    '      <div class="muted mt4">代约会员：<b class="brand-text">{{ vip && vip.realname }}</b> {{ vip && vip.phone }}</div>',
    '      <div class="sec-title" style="margin:16px 0 8px">选择扣课卡</div>',
    '      <div v-if="gCards===null" style="text-align:center;padding:14px"><van-loading size="20" color="var(--brand)"/></div>',
    '      <van-empty v-else-if="!gCards.length" description="该会员无可用会员卡" image-size="60"/>',
    '      <template v-else>',
    '        <div v-for="c in gCards" :key="c.id" class="cat-pick flex" :class="{on:gCardId===c.id}" @click="gCardId=c.id">',
    '          <div class="flex1">{{ c.card_type_name }}<span class="muted" style="margin-left:6px">{{ cardDesc(c) }}</span></div>',
    '          <van-icon v-if="gCardId===c.id" name="checked" color="var(--brand)" size="20"/>',
    '        </div>',
    '      </template>',
    '      <div class="mt12"><van-button type="primary" block round :loading="submitting" :disabled="!gCardId" @click="doBookGroup">',
    '        {{ gCur.booked_count>=gCur.people_count ? \'满员 · 排队候补\' : \'确认代约\' }}</van-button></div>',
    '    </div>',
    '  </van-popup>',

    /* 私教提交栏 */
    '  <div v-if="vip && tab===\'pt\'" class="bk-bar">',
    '    <div class="flex1 muted" style="font-size:12px">',
    '      <template v-if="fromTime && course">{{ H.day(date) }} {{ fromTime }} · {{ course.title }}</template>',
    '      <template v-else>请选择教练 / 课程 / 时间 / 私教卡</template>',
    '    </div>',
    '    <van-button type="primary" round :loading="submitting" :disabled="!canSubmitPt" @click="doBookPt" style="min-width:120px">确认代约</van-button>',
    '  </div>',
    '</div>',
  ].join('\n'),
  methods: {
    cardDesc(c) {
      if (c.card_kind === 2) return '时间卡不限次';
      if (c.card_kind === 3) return '余额 ¥' + H.money(c.left_money);
      return '剩 ' + c.left_counts + ' 次';
    },
    /* ---- 会员 ---- */
    async search(reset = true) {
      if (reset) this.rPage = 1;
      this.searching = true;
      try {
        const d = await API.get('/members?keyword=' + encodeURIComponent(this.kw.trim()) + '&page=' + this.rPage + '&size=15&status=all');
        this.results = reset ? (d.list || []) : this.results.concat(d.list || []);
        this.rTotal = d.total || 0; this.rPage += 1;
      } finally { this.searching = false; }
    },
    onKw(v) { this.kw = v; clearTimeout(this.kwTimer); this.kwTimer = setTimeout(() => this.search(true), 350); },
    pickVip(m) {
      if (m.is_black) return vant.showToast('该会员在黑名单中，禁止预约');
      this.vip = m;
      this.load();
      this.scrollDay();   // 日期条此时才渲染出来, 需把"今天"滚到可见位置
    },
    clearVip() { this.vip = null; this.pt = null; this.glist = []; this.resetPt(); this.search(true); },
    /* ---- 通用 ---- */
    onTab() { this.load(); },
    pickDate(d) { this.date = d; this.fromTime = null; this.load(); this.scrollDay('smooth'); },
    scrollDay(behavior) {
      this.$nextTick(() => {
        const strip = this.$refs.strip; if (!strip) return;
        const el = strip.querySelector('.day-item.on'); if (!el) return;
        strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2, behavior: behavior || 'auto' });
      });
    },
    load() { return this.tab === 'pt' ? this.loadPt() : this.loadGroup(); },
    resetPt() { this.coachId = null; this.courseId = null; this.fromTime = null; this.cardId = null; },
    /* ---- 私教 ---- */
    async loadPt() {
      if (!this.vip) return;
      this.loadingPt = true;
      try {
        const keepCoach = this.coachId;
        const d = await API.get('/agent-booking/pt?vip_id=' + this.vip.id + '&date=' + this.date);
        this.pt = d;
        if (!this.clubId) this.clubId = d.default_club_id || ((d.clubs || [])[0] || {}).id || null;
        const list = d.coaches || [];
        const keep = list.find(c => c.id === keepCoach);
        this.coachId = keep ? keep.id : (d.locked_coach_id || (list[0] || {}).id || null);
        this.fromTime = null;
        const cs = this.courses;
        if (!cs.some(c => c.id === this.courseId)) this.courseId = (cs[0] || {}).id || null;
        if (!this.ptCards.some(c => c.id === this.cardId)) this.cardId = (this.ptCards[0] || {}).id || null;
      } finally { this.loadingPt = false; }
    },
    pickCoach(c) {
      if (this.coachId === c.id) return;
      this.coachId = c.id; this.fromTime = null;
      const cs = this.courses;
      if (!cs.some(x => x.id === this.courseId)) this.courseId = (cs[0] || {}).id || null;
      this.syncCard();
    },
    pickCourse(id) { this.courseId = id; this.fromTime = null; this.syncCard(); },
    syncCard() { if (!this.ptCards.some(c => c.id === this.cardId)) this.cardId = (this.ptCards[0] || {}).id || null; },
    async doBookPt() {
      if (!this.canSubmitPt) return;
      this.submitting = true;
      try {
        await API.post('/ptrain-bookings', {
          vip_id: this.vip.id, coach_id: this.coachId, course_id: this.courseId, club_id: this.clubId,
          date: this.date, from_time: this.fromTime, card_id: this.cardId,
        });
        vant.showToast('代约成功，已为会员确认');
        this.fromTime = null;
        await this.loadPt();
      } finally { this.submitting = false; }
    },
    /* ---- 团课 ---- */
    async loadGroup() {
      if (!this.vip) return;
      this.loadingG = true;
      try {
        const rows = await API.get('/syllabus?from=' + this.date + '&to=' + this.date);
        this.glist = rows || [];
      } finally { this.loadingG = false; }
    },
    async openGroup(it) {
      if (it.status !== 1) return vant.showToast('该课程不可预约');
      this.gCur = it; this.gCards = null; this.gCardId = 0; this.gShow = true;
      const d = await API.get('/cards?vip_id=' + this.vip.id + '&size=50', { silent: true });
      this.gCards = (d.list || []).filter(c => [0, 1].includes(c.status) && (![1, 4].includes(c.card_kind) || c.left_counts > 0) && (c.card_kind !== 3 || Number(c.left_money) > 0));
      if (this.gCards.length) this.gCardId = this.gCards[0].id;
    },
    async doBookGroup() {
      if (!this.gCardId) return;
      this.submitting = true;
      try {
        const d = await API.post('/syllabus/' + this.gCur.id + '/book', { vip_id: this.vip.id, card_id: this.gCardId });
        vant.showToast(d && d.waitlist ? ('课程已满员，已进入候补队列（第' + d.queue_no + '位）') : '代约成功');
        this.gShow = false;
        this.loadGroup();
      } finally { this.submitting = false; }
    },
  },
  mounted() {
    const q = this.$route.query || {};
    if (q.tab === 'group') this.tab = 'group';
    if (q.vip_id) {
      API.get('/members/' + q.vip_id, { silent: true })
        .then(d => { this.vip = d.vip || d; this.load(); })
        .catch(() => this.search(true));
    } else {
      this.search(true);
    }
  },
};
