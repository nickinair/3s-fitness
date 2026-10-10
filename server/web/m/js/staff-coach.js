/* 员工端-教练: 我的课表 / 预约管理 / 我的学员 / 我的业绩 / 休息设置 */
(function () {
  // 管理员没有教练档案, 选一位教练后即可使用教练的全部功能
  let picked = 0;
  let selfChecked = false;   // 本次打开是否已向服务端核实过本人教练身份
  const selfId = () => (Store.user && Store.user.coach_id) || 0;
  const coachId = () => selfId() || picked || 0;

  const CoachPick = {
    data() { return { coachList: [], coachPick: false, myPick: 0, needPick: !selfId() }; },
    computed: {
      coachCols() { return this.coachList.map(c => ({ text: c.realname, value: c.id })); },
      curCoachName() {
        const id = this.myPick || coachId();
        const c = this.coachList.find(x => x.id === id);
        return c ? c.realname : '请选择教练';
      },
    },
    methods: {
      // 页面 load 前调用: 管理员首次进入时拉教练列表并默认选中第一位
      async ensureCoach() {
        // 登录后才绑定教练档案时本地缓存里 coach_id 还是 0, 先向服务端核实, 有档案就只看本人
        if (!selfId() && !selfChecked) {
          selfChecked = true;
          try {
            const me = await API.get('/coaches/me', { silent: true });
            if (me && me.id) Store.user = Object.assign({}, Store.user, { coach_id: me.id });
          } catch (e) { /* 纯管理岗无档案, 走教练选择 */ }
        }
        this.needPick = !selfId();
        if (!this.needPick) return true;
        if (!this.coachList.length) {
          const d = await API.get('/coaches');
          this.coachList = (d && d.list) || d || [];
        }
        if (!picked && this.coachList.length) picked = this.coachList[0].id;
        this.myPick = coachId();
        return !!coachId();
      },
      onPickCoach(v) {
        const val = v && v.selectedValues ? v.selectedValues[0] : v;
        picked = val; this.myPick = val; this.coachPick = false;
        if (this.load) this.load();
      },
    },
  };

  // 顶部"当前教练"切换条 + 选择弹层, 仅管理员可见
  const PICK_BAR = [
    '  <div v-if="needPick" class="coach-pick" @click="coachPick=true">',
    '    <van-icon name="manager-o"/><span style="margin-left:6px">当前教练</span>',
    '    <div class="flex1"></div><b>{{ curCoachName }}</b><van-icon name="exchange" style="margin-left:6px"/>',
    '  </div>',
    '  <van-popup v-model:show="coachPick" position="bottom" round>',
    '    <van-picker title="选择教练" :columns="coachCols" @confirm="onPickCoach" @cancel="coachPick=false"/>',
    '  </van-popup>',
  ].join('\n');

  window.Pages.CoachSchedule = {
    data() { return { days: H.monthDays(), date: H.today(), d: null, loading: true }; },
    computed: {
      items() {
        if (!this.d) return [];
        const arr = [];
        (this.d.bookings || []).forEach(b => arr.push({
          key: 'pt' + b.id, time: b.from_time, timeEnd: b.to_time, kind: 'pt',
          title: b.course_title || '私教课', sub: '学员 ' + b.realname, status: b.status, confirm: b.confirm_status,
        }));
        (this.d.classes || []).forEach(c => arr.push({
          key: 'g' + c.id, time: H.time(c.start_time), timeEnd: H.time(c.end_time), kind: 'group',
          title: c.title, sub: (c.classroom_name || '') + ' · ' + c.booked_count + '/' + c.people_count + '人',
        }));
        return arr.sort((a, b) => a.time < b.time ? -1 : 1);
      },
      rests() { return (this.d && this.d.rests) || []; },
    },
    template: [
      '<div class="page">',
      '  <m-nav :title="needPick ? \'教练课表\' : \'我的课表\'"></m-nav>',
      PICK_BAR,
      '  <div class="day-strip" ref="strip">',
      '    <div v-for="dd in days" :key="dd.date" class="day-item" :class="{on:dd.date===date, past:dd.past}" @click="pick(dd.date)">',
      '      <div class="w">{{ dd.w }}</div><div class="d">{{ dd.d }}</div>',
      '    </div>',
      '  </div>',
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <div class="pending-bar" v-for="r in rests" :key="r.id" style="background:#f0f9f8;border-color:#9fc6c1;color:#0d5e56">',
      '      <van-icon name="underway-o"/><span style="margin-left:8px">休息：{{ r.from_time ? (r.from_time+\' - \'+r.to_time) : \'全天\' }}{{ r.remark? \' · \'+r.remark : \'\' }}</span>',
      '    </div>',
      '    <van-empty v-if="!items.length" description="当日暂无课程安排"/>',
      '    <div v-for="it in items" :key="it.key" class="course-item">',
      '      <div class="course-time"><div class="b">{{ it.time }}</div><div class="e">{{ it.timeEnd }}</div></div>',
      '      <div class="flex1">',
      '        <div class="title">{{ it.title }} <van-tag :type="it.kind===\'pt\'?\'primary\':\'success\'" plain>{{ it.kind===\'pt\'?\'私教\':\'团课\' }}</van-tag></div>',
      '        <div class="muted mt4">{{ it.sub }}</div>',
      '      </div>',
      '      <div style="display:flex;align-items:center" v-if="it.kind===\'pt\'">',
      '        <d-tag dict="ptStatus" :v="it.status"></d-tag>',
      '      </div>',
      '    </div>',
      '  </template>',
      '</div>',
    ].join('\n'),
    methods: {
      pick(d) { this.date = d; this.load(); this.scrollDay(); },
      scrollDay() {
        this.$nextTick(() => {
          const strip = this.$refs.strip; if (!strip) return;
          const el = strip.querySelector('.day-item.on'); if (!el) return;
          strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2, behavior: 'auto' });
        });
      },
      async load() {
        this.loading = true;
        try {
          if (!(await this.ensureCoach())) { this.d = null; return; }
          this.d = await API.get('/coaches/' + coachId() + '/schedule?from=' + this.date + '&to=' + this.date);
        } finally { this.loading = false; }
      },
    },
    mixins: [CoachPick],
    mounted() { this.load(); this.scrollDay(); },
  };

  window.Pages.CoachBookings = {
    data() { return { days: H.monthDays(), date: H.today(), list: [], loading: true, doing: 0 }; },
    template: [
      '<div class="page">',
      '  <m-nav title="预约管理"></m-nav>',
      '  <div class="day-strip" ref="strip">',
      '    <div v-for="dd in days" :key="dd.date" class="day-item" :class="{on:dd.date===date, past:dd.past}" @click="pick(dd.date)">',
      '      <div class="w">{{ dd.w }}</div><div class="d">{{ dd.d }}</div>',
      '    </div>',
      '  </div>',
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" :description="H.day(date) + \'暂无预约\'"/>',
      '    <div v-for="b in list" :key="b.id" class="rec-item">',
      '      <div class="head">',
      '        <span class="name">{{ b.realname }} <span class="muted" style="font-weight:400;font-size:12px">{{ b.course_title }}</span></span>',
      '        <span><d-tag dict="ptStatus" :v="b.status"></d-tag>',
      '          <van-tag v-if="b.status===1 && b.confirm_status===1" type="warning" round style="margin-left:4px">待学员确认</van-tag></span>',
      '      </div>',
      '      <div class="bk-time mt8"><van-icon name="clock-o" size="13"/> <b>{{ b.from_time }}-{{ b.to_time }}</b>',
      '        <span class="bk-day">{{ H.day(b.date) }}（{{ H.week(b.date) }}）</span></div>',
      '      <div class="mt4"><van-icon name="manager-o" size="13"/> 上课教练：<b>{{ b.coach_name || \'未指定\' }}</b></div>',
      '      <div class="muted mt4">{{ b.card_type_name }} · 扣{{ b.card_deduct_num }}课时</div>',
      '      <div class="muted mt4" v-if="b.remark">备注：{{ b.remark }}</div>',
      '      <div class="foot" v-if="b.status===0 || b.status===1">',
      '        <template v-if="b.status===0">',
      '          <van-button size="small" round plain @click="cancel(b)">拒绝</van-button>',
      '          <van-button size="small" round type="primary" :loading="doing===b.id" @click="confirm(b)">确认预约</van-button>',
      '        </template>',
      '        <template v-else>',
      '          <template v-if="b.confirm_status!==1">',
      '            <van-button v-if="isPast(b)" size="small" round plain type="danger" @click="noshow(b)">标记爽约</van-button>',
      '            <van-button v-if="isPast(b)" size="small" round plain type="warning" @click="startFinish(b)">发起学员确认</van-button>',
      '            <van-button v-if="isPast(b)" size="small" round type="primary" :loading="doing===b.id" @click="finishNow(b)">确认销课</van-button>',
      '          </template>',
      '          <van-button size="small" round plain @click="cancel(b)">取消预约</van-button>',
      '        </template>',
      '      </div>',
      '    </div>',
      '  </template>',
      '</div>',
    ].join('\n'),
    methods: {
      isPast(b) { return H.isPast(H.dateOf(b.date) + ' ' + b.to_time); },
      qs() { return 'date=' + this.date + '&order=asc'; },   // 单日视图, 按上课时间从早到晚
      pick(d) { this.date = d; this.load(); this.scrollDay(); },
      scrollDay() {
        this.$nextTick(() => {
          const strip = this.$refs.strip; if (!strip) return;
          const el = strip.querySelector('.day-item.on'); if (!el) return;
          strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2, behavior: 'auto' });
        });
      },
      async load() {
        this.loading = true;
        try {
          const d = await API.get('/ptrain-bookings?size=100&' + this.qs());
          this.list = d.list || [];
        } finally { this.loading = false; }
      },
      async confirm(b) {
        this.doing = b.id;
        try {
          await API.post('/ptrain-bookings/' + b.id + '/confirm');
          vant.showToast({ message: '已确认预约', icon: 'success' });
          this.load();
        } finally { this.doing = 0; }
      },
      async cancel(b) {
        // 原因留给后端按当前操作人兜底(管理员代取消时不会错记成教练)
        let reason = '';
        try {
          const r = await vant.showDialog({
            title: '取消预约', confirmButtonColor: '#0d5e56', showCancelButton: true,
            message: b.realname + ' ' + H.day(b.date) + ' ' + b.from_time + '\n取消后该时段释放；课时在销课时才扣，不受影响',
          });
          reason = (r && r.value) || '';
        } catch (e) { return; }
        await API.post('/ptrain-bookings/' + b.id + '/cancel', reason ? { reason } : {});
        vant.showToast('已取消');
        this.load();
      },
      // 教练直接销课(纪要4.1现状: 教练手动点销课、课时随之扣减); 学员确认为可选双保险
      async finishNow(b) {
        try { await vant.showConfirmDialog({ title: '确认销课', message: b.realname + ' ' + H.day(b.date) + ' ' + b.from_time + ' 本节课已上完？将扣减 ' + (b.card_deduct_num || 1) + ' 课时并短信通知学员。', confirmButtonColor: '#0d5e56' }); } catch (e) { return; }
        this.doing = b.id;
        try {
          await API.post('/ptrain-bookings/' + b.id + '/finish', {});
          vant.showToast({ message: '已销课', icon: 'success' });
          this.load();
        } finally { this.doing = 0; }
      },
      async noshow(b) {
        try { await vant.showConfirmDialog({ title: '标记爽约', message: '确定将 ' + b.realname + ' 本节课标记为爽约吗？', confirmButtonColor: '#0d5e56' }); } catch (e) { return; }
        await API.post('/ptrain-bookings/' + b.id + '/noshow');
        vant.showToast('已标记爽约');
        this.load();
      },
      async startFinish(b) {
        try { await vant.showConfirmDialog({ title: '发起消课', message: '向 ' + b.realname + ' 发起本节课消课确认？学员确认后自动扣课时。', confirmButtonColor: '#0d5e56' }); } catch (e) { return; }
        this.doing = b.id;
        try {
          const r = await API.post('/ptrain-bookings/' + b.id + '/start-finish');
          vant.showDialog({ title: '已发起消课', message: (r && r.msg) || '请学员在小程序「待确认消课」中确认', confirmButtonColor: '#0d5e56' });
          this.load();
        } finally { this.doing = 0; }
      },
    },
    mounted() { this.load(); this.scrollDay(); },
  };

  window.Pages.CoachStudents = {
    data() { return { list: [], loading: true }; },
    template: [
      '<div class="page">',
      '  <m-nav :title="needPick ? \'学员管理\' : \'我的学员\'"></m-nav>',
      PICK_BAR,
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="暂无学员"/>',
      '    <div v-for="s in list" :key="s.card_id" class="rec-item flex">',
      '      <m-avatar :name="s.realname" :size="44"></m-avatar>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div class="name">{{ s.realname }}',
      '          <van-tag v-if="!s.lessons_30d" color="#fff7e8" text-color="#b35c00" style="margin-left:4px">30天未上课</van-tag>',
      '        </div>',
      '        <div class="muted mt4">{{ s.phone }} · {{ s.card_type_name }}</div>',
      '        <div class="muted mt4">剩余 <b class="brand-text">{{ s.left_counts }}</b>/{{ s.counts }} 课时 · 近30天 {{ s.lessons_30d }} 节 · 最近 {{ s.last_lesson_time ? H.day(s.last_lesson_time) : \'从未上课\' }}</div>',
      '      </div>',
      '    </div>',
      '  </template>',
      '</div>',
    ].join('\n'),
    mixins: [CoachPick],
    methods: {
      async load() {
        this.loading = true;
        try {
          if (!(await this.ensureCoach())) { this.list = []; return; }
          this.list = await API.get('/coaches/' + coachId() + '/students');
        } finally { this.loading = false; }
      },
    },
    mounted() { this.load(); },
  };

  window.Pages.CoachPerf = {
    data() { return { rows: [], loading: true, month: dayjs().format('YYYY-MM'), isCoach: (Store.user || {}).role === 'coach' }; },
    computed: {
      mine() { return this.rows.find(r => r.id === coachId()) || { lessons: 0, spend_money: 0, sales_money: 0, sales_orders: 0 }; },
    },
    template: [
      '<div class="page">',
      '  <m-nav :title="isCoach ? \'我的业绩\' : \'教练业绩\'"></m-nav>',
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <div class="muted" style="padding:12px 16px 0">{{ month }} 月度统计</div>',
      '    <template v-if="isCoach">',
      '      <div class="kpi-grid">',
      '        <div class="kpi"><div class="l">本月消课课时</div><div class="v">{{ H.num(mine.lessons) }} <span style="font-size:12px;font-weight:400">节</span></div></div>',
      '        <div class="kpi"><div class="l">本月耗课金额</div><div class="v">{{ H.money(mine.spend_money) }}</div></div>',
      '        <div class="kpi"><div class="l">名下卖卡业绩</div><div class="v">{{ H.money(mine.sales_money) }}</div></div>',
      '        <div class="kpi"><div class="l">卖卡成单</div><div class="v">{{ mine.sales_orders }} <span style="font-size:12px;font-weight:400">单</span></div></div>',
      '      </div>',
      '    </template>',
      '    <div class="sec-title" v-if="!isCoach">课时排行</div>',
      '    <div class="card-box" v-if="!isCoach" style="padding:2px 8px">',
      '      <van-cell v-for="(r,i) in rows" :key="r.id" :title="(i+1)+\'. \'+r.realname" :label="\'耗课 \'+H.money(r.spend_money)+\' · 卖卡 \'+H.money(r.sales_money)">',
      '        <template #value><b>{{ H.num(r.lessons) }} 节</b></template>',
      '      </van-cell>',
      '    </div>',
      '    <div class="rpt-export-row" @click="exportCsv()">导出本期数据 <van-icon name="arrow" size="11"/></div>',
      '  </template>',
      '</div>',
    ].join('\n'),
    methods: {
      exportCsv() {
        var url = '/api/coaches/performance?month=' + this.month + '&export=csv';
        window.open(url + '&token=' + encodeURIComponent(Store.token));
      },
    },
    async mounted() {
      try { this.rows = await API.get('/coaches/performance?month=' + this.month); }
      finally { this.loading = false; }
    },
  };

  window.Pages.CoachRests = {
    data() {
      return {
        list: [], loading: true,
        show: false, form: { rest_date: '', allDay: true, from_time: '10:00', to_time: '12:00', remark: '' },
        saving: false,
      };
    },
    template: [
      '<div class="page">',
      '  <m-nav :title="needPick ? \'教练休息设置\' : \'休息设置\'"></m-nav>',
      PICK_BAR,
      '  <div class="muted" style="padding:12px 16px 0">设置休息后，对应时段会员将无法预约{{ needPick ? \'该教练\' : \'您\' }}的私教课。</div>',
      '  <div style="margin:12px 16px"><van-button type="primary" block round icon="plus" @click="openAdd">新增休息</van-button></div>',
      '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="暂无休息安排"/>',
      '    <div v-for="r in list" :key="r.id" class="rec-item flex">',
      '      <van-icon name="underway-o" size="24" color="#0d5e56"/>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div class="name">{{ H.day(r.rest_date) }}（{{ H.week(r.rest_date) }}）</div>',
      '        <div class="muted mt4">{{ r.from_time ? (r.from_time+\' - \'+r.to_time) : \'全天休息\' }}{{ r.remark ? \' · \'+r.remark : \'\' }}</div>',
      '      </div>',
      '      <van-button size="small" round plain type="danger" @click="del(r)">删除</van-button>',
      '    </div>',
      '  </template>',
      '  <van-popup v-model:show="show" position="bottom" round safe-area-inset-bottom>',
      '    <div style="padding:20px 16px 24px">',
      '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">新增休息</div>',
      '      <van-field label="日期">',
      '        <template #input><input type="date" v-model="form.rest_date" style="border:none;outline:none;background:transparent;font-size:14px"/></template>',
      '      </van-field>',
      '      <van-field label="全天休息">',
      '        <template #input><van-switch v-model="form.allDay" size="20" active-color="#0d5e56"/></template>',
      '      </van-field>',
      '      <template v-if="!form.allDay">',
      '        <van-field label="开始时间"><template #input><input type="time" v-model="form.from_time" style="border:none;outline:none;background:transparent;font-size:14px"/></template></van-field>',
      '        <van-field label="结束时间"><template #input><input type="time" v-model="form.to_time" style="border:none;outline:none;background:transparent;font-size:14px"/></template></van-field>',
      '      </template>',
      '      <van-field v-model="form.remark" label="备注" placeholder="选填" :border="false"/>',
      '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      openAdd() { this.form = { rest_date: H.today(), allDay: true, from_time: '10:00', to_time: '12:00', remark: '' }; this.show = true; },
      async load() {
        this.loading = true;
        try {
          if (!(await this.ensureCoach())) { this.list = []; return; }
          this.list = await API.get('/coach-rests?coach_id=' + coachId() + '&from=' + dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
        } finally { this.loading = false; }
      },
      async save() {
        if (!this.form.rest_date) return vant.showToast('请选择日期');
        if (!this.form.allDay && (!this.form.from_time || !this.form.to_time)) return vant.showToast('请选择时段');
        this.saving = true;
        try {
          await API.post('/coach-rests', {
            coach_id: coachId(), rest_date: this.form.rest_date,
            from_time: this.form.allDay ? '' : this.form.from_time,
            to_time: this.form.allDay ? '' : this.form.to_time,
            remark: this.form.remark,
          });
          this.show = false;
          vant.showToast({ message: '已添加', icon: 'success' });
          this.load();
        } finally { this.saving = false; }
      },
      async del(r) {
        try { await vant.showConfirmDialog({ title: '删除休息', message: '确定删除 ' + H.day(r.rest_date) + ' 的休息安排吗？', confirmButtonColor: '#0d5e56' }); } catch (e) { return; }
        await API.del('/coach-rests/' + r.id);
        vant.showToast('已删除');
        this.load();
      },
    },
    mixins: [CoachPick],
    mounted() { this.load(); },
  };
})();
