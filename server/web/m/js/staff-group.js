/* 员工端-今日团课核销 / 排课详情 / 今日预约 */
window.Pages.StaffGroupToday = {
  data() { return { list: [], loading: true }; },
  template: [
    '<div class="page">',
    '  <m-nav title="今日团课核销"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="今日暂无团课"/>',
    '    <div v-for="s in list" :key="s.id" class="course-item" @click="$router.push(\'/staff/group/\'+s.id)">',
    '      <div class="course-time"><div class="b">{{ H.time(s.start_time) }}</div><div class="e">{{ H.time(s.end_time) }}</div></div>',
    '      <div class="flex1">',
    '        <div class="title">{{ s.title }}</div>',
    '        <div class="muted mt4">{{ s.coach_name || \'待定\' }} · {{ s.classroom_name }}</div>',
    '        <div class="muted mt4">已约 {{ s.booked_count }} / 满 {{ s.people_count }}</div>',
    '      </div>',
    '      <div style="display:flex;align-items:center;gap:6px">',
    '        <d-tag dict="syllabusStatus" :v="s.status"></d-tag>',
    '        <van-icon name="arrow" color="#c8c9cc"/>',
    '      </div>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  async mounted() {
    const t = H.today();
    try { this.list = await API.get('/syllabus?from=' + t + '&to=' + t); }
    finally { this.loading = false; }
  },
};

window.Pages.StaffGroupDetail = {
  data() { return { s: null, bookings: [], loading: true, doing: 0, settling: false }; },
  computed: {
    canSettle() { return this.s && this.s.status === 1 && H.isPast(this.s.end_time); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="预约名单"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else-if="s">',
    '    <div class="card-box">',
    '      <div class="flex">',
    '        <div class="flex1">',
    '          <div style="font-size:17px;font-weight:700">{{ s.title }}</div>',
    '          <div class="muted mt4">{{ H.day(s.start_time) }} {{ H.time(s.start_time) }}-{{ H.time(s.end_time) }} · {{ s.coach_name }} · {{ s.classroom_name }}</div>',
    '          <div class="muted mt4">已约 {{ s.booked_count }} / 满 {{ s.people_count }}<template v-if="s.deduct_num"> · 次卡扣 {{ s.deduct_num }} 次</template></div>',
    '        </div>',
    '        <d-tag dict="syllabusStatus" :v="s.status"></d-tag>',
    '      </div>',
    '      <div class="mt12" v-if="canSettle">',
    '        <van-button type="warning" block round :loading="settling" @click="settle">课后结算（未到自动记爽约）</van-button>',
    '      </div>',
    '    </div>',
    '    <div class="sec-title">预约名单（{{ bookings.length }}）</div>',
    '    <van-empty v-if="!bookings.length" description="暂无预约"/>',
    '    <div v-for="b in bookings" :key="b.id" class="rec-item flex">',
    '      <m-avatar :name="b.realname" :size="40"></m-avatar>',
    '      <div class="flex1" style="margin-left:12px">',
    '        <div class="name" style="font-size:14px">{{ b.realname }}',
    '          <van-tag v-if="b.status===0" plain type="warning" style="margin-left:4px">候补第{{ b.queue_no }}位</van-tag></div>',
    '        <div class="muted mt4">{{ b.phone }} · {{ b.card_type_name }}</div>',
    '      </div>',
    '      <d-tag dict="groupStatus" :v="b.status" style="margin-right:8px"></d-tag>',
    '      <van-button v-if="[0,1].includes(b.status)" size="small" round plain style="margin-right:6px" @click="cancelBooking(b)">取消</van-button>',
    '      <van-button v-if="b.status===1" size="small" round type="primary" :loading="doing===b.id" @click="checkin(b)">核销</van-button>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await API.get('/syllabus/' + this.$route.params.id);
        this.s = d.syllabus; this.bookings = d.bookings || [];
      } finally { this.loading = false; }
    },
    // 管理员/教练代会员取消团课预约(预约不扣次, 核销才扣, 故无需退次); 释放名额后候补自动转正
    async cancelBooking(b) {
      try {
        await vant.showConfirmDialog({
          title: '取消预约', confirmButtonColor: '#0d5e56',
          message: '确定取消 ' + b.realname + ' 的预约吗？\n名额释放后候补会员将自动转正；课时在核销时才扣，不受影响',
        });
      } catch (e) { return; }
      await API.post('/syllabus-bookings/' + b.id + '/cancel', {});
      vant.showToast({ message: b.realname + ' 预约已取消', icon: 'success' });
      this.load();
    },
    async checkin(b) {
      this.doing = b.id;
      try {
        await API.post('/syllabus-bookings/' + b.id + '/checkin');
        vant.showToast({ message: b.realname + ' 已核销', icon: 'success' });
        this.load();
      } finally { this.doing = 0; }
    },
    async settle() {
      try { await vant.showConfirmDialog({ title: '课后结算', message: '未核销的「已预约」会员将标记为爽约，候补自动取消。确认结算？', confirmButtonColor: '#0d5e56' }); } catch (e) { return; }
      this.settling = true;
      try {
        const r = await API.post('/syllabus/' + this.s.id + '/settle');
        vant.showDialog({ title: '结算完成', message: '本节课已结课，爽约 ' + ((r && r.noshow) || 0) + ' 人。', confirmButtonColor: '#0d5e56' });
        this.load();
      } finally { this.settling = false; }
    },
  },
  mounted() { this.load(); },
};

window.Pages.StaffTodayBookings = {
  data() { return { tab: 0, pt: [], group: [], loading: true }; },
  template: [
    '<div class="page">',
    '  <m-nav title="今日预约"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <van-tabs v-else v-model:active="tab" color="#0d5e56" sticky offset-top="46">',
    '    <van-tab :title="\'私教(\'+pt.length+\')\'">',
    '      <van-empty v-if="!pt.length" description="今日暂无私教预约"/>',
    '      <div v-for="b in pt" :key="b.id" class="rec-item">',
    '        <div class="head"><span class="name">{{ b.from_time }} {{ b.realname }}</span>',
    '          <span><d-tag dict="ptStatus" :v="b.status"></d-tag>',
    '          <van-tag v-if="b.status===1 && b.confirm_status===1" type="warning" round style="margin-left:4px">待学员确认</van-tag></span></div>',
    '        <div class="muted mt8">{{ b.course_title }} · {{ b.coach_name }} 教练 · {{ b.card_type_name }}</div>',
    '      </div>',
    '    </van-tab>',
    '    <van-tab :title="\'团课(\'+group.length+\')\'">',
    '      <van-empty v-if="!group.length" description="今日暂无团课预约"/>',
    '      <div v-for="b in group" :key="b.id" class="rec-item">',
    '        <div class="head"><span class="name">{{ H.time(b.class_start_time) }} {{ b.realname }}</span><d-tag dict="groupStatus" :v="b.status"></d-tag></div>',
    '        <div class="muted mt8">{{ b.syllabus_title }} · {{ b.card_type_name }}</div>',
    '      </div>',
    '    </van-tab>',
    '  </van-tabs>',
    '</div>',
  ].join('\n'),
  async mounted() {
    const t = H.today();
    try {
      const [p, g] = await Promise.all([
        API.get('/ptrain-bookings?date=' + t + '&size=100'),
        API.get('/syllabus-bookings?date=' + t + '&size=100'),
      ]);
      this.pt = p.list || []; this.group = g.list || [];
    } finally { this.loading = false; }
  },
};
