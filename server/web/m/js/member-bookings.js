/* 会员端-我的预约 + 待确认消课 */
window.Pages.MemberBookings = {
  data() { return { pt: [], group: [], loading: true, tab: 0 }; },
  computed: {
    // 可操作的(未开始且未取消)排在最前, 取消按钮就在这一段里
    ptUpcoming() { return this.pt.filter(b => this.canCancelPt(b) || (b.status === 1 && b.confirm_status === 1)); },
    ptHistory() { return this.pt.filter(b => !this.ptUpcoming.includes(b)); },
    groupUpcoming() { return this.group.filter(b => this.canCancelGroup(b)); },
    groupHistory() { return this.group.filter(b => !this.groupUpcoming.includes(b)); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="我的预约"></m-nav>',
    '  <van-tabs v-model:active="tab" color="var(--brand)" sticky offset-top="46">',
    '    <van-tab :title="\'私教(\'+pt.length+\')\'">',
    '      <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '      <template v-else>',
    '        <van-empty v-if="!pt.length" description="暂无私教预约"/>',
    '        <div v-if="ptUpcoming.length" class="sec-title">即将到来</div>',
    '        <div v-for="b in ptUpcoming" :key="b.id" class="rec-item">',
    '          <div class="head">',
    '            <span class="name">{{ b.course_title }}</span>',
    '            <span><d-tag dict="ptStatus" :v="b.status"></d-tag>',
    '              <van-tag v-if="b.status===1 && b.confirm_status===1" type="warning" round style="margin-left:4px">待确认消课</van-tag></span>',
    '          </div>',
    '          <div class="muted mt8">{{ H.day(b.date) }}（{{ H.week(b.date) }}）{{ b.from_time }}-{{ b.to_time }} · {{ b.coach_name }} 教练</div>',
    '          <div class="muted mt4">{{ b.card_type_name }} · 扣 {{ b.card_deduct_num }} 课时</div>',
    '          <lesson-plan-card :plan="b.lesson_plan" :booking="b" :can-edit="false"/>',
    '          <div class="foot" v-if="canCancelPt(b) || (b.status===1 && b.confirm_status===1)">',
    '            <van-button v-if="b.status===1 && b.confirm_status===1" size="small" round type="warning" @click="$router.push(\'/pending-confirms\')">去确认消课</van-button>',
    '            <van-button v-if="canCancelPt(b)" size="small" round plain type="danger" @click="cancelPt(b)">取消预约</van-button>',
    '          </div>',
    '        </div>',
    '        <div v-if="ptHistory.length" class="sec-title">历史记录</div>',
    '        <div v-for="b in ptHistory" :key="b.id" class="rec-item dim">',
    '          <div class="head">',
    '            <span class="name">{{ b.course_title }}</span>',
    '            <d-tag dict="ptStatus" :v="b.status"></d-tag>',
    '          </div>',
    '          <div class="muted mt8">{{ H.day(b.date) }}（{{ H.week(b.date) }}）{{ b.from_time }}-{{ b.to_time }} · {{ b.coach_name }} 教练</div>',
    '          <lesson-plan-card :plan="b.lesson_plan" :booking="b" :can-edit="false"/>',
    '        </div>',
    '      </template>',
    '    </van-tab>',
    '    <van-tab :title="\'团课(\'+group.length+\')\'">',
    '      <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '      <template v-else>',
    '        <van-empty v-if="!group.length" description="暂无团课预约"/>',
    '        <div v-if="groupUpcoming.length" class="sec-title">即将到来</div>',
    '        <div v-for="b in groupUpcoming" :key="b.id" class="rec-item">',
    '          <div class="head">',
    '            <span class="name">{{ b.syllabus_title }}</span>',
    '            <span><d-tag dict="groupStatus" :v="b.status"></d-tag>',
    '              <van-tag v-if="b.status===0" plain type="warning" round style="margin-left:4px">第{{ b.queue_no }}位</van-tag></span>',
    '          </div>',
    '          <div class="muted mt8">{{ H.day(b.class_start_time) }}（{{ H.week(b.class_start_time) }}）{{ H.time(b.class_start_time) }}-{{ H.time(b.class_end_time) }}</div>',
    '          <div class="muted mt4">{{ b.card_type_name }}<template v-if="b.card_deduct_num"> · 扣 {{ b.card_deduct_num }} 次</template></div>',
    '          <div class="foot" v-if="canCancelGroup(b)">',
    '            <van-button size="small" round plain type="danger" @click="cancelGroup(b)">取消预约</van-button>',
    '          </div>',
    '        </div>',
    '        <div v-if="groupHistory.length" class="sec-title">历史记录</div>',
    '        <div v-for="b in groupHistory" :key="b.id" class="rec-item dim">',
    '          <div class="head">',
    '            <span class="name">{{ b.syllabus_title }}</span>',
    '            <d-tag dict="groupStatus" :v="b.status"></d-tag>',
    '          </div>',
    '          <div class="muted mt8">{{ H.day(b.class_start_time) }}（{{ H.week(b.class_start_time) }}）{{ H.time(b.class_start_time) }}-{{ H.time(b.class_end_time) }}</div>',
    '        </div>',
    '      </template>',
    '    </van-tab>',
    '  </van-tabs>',
    '</div>',
  ].join('\n'),
  methods: {
    canCancelPt(b) { return [0, 1].includes(b.status) && !H.isPast(H.dateOf(b.date) + ' ' + b.from_time); },
    canCancelGroup(b) { return [0, 1].includes(b.status) && !H.isPast(b.class_start_time); },
    async load() {
      this.loading = true;
      try {
        const d = await API.get('/member/my-bookings');
        this.pt = d.pt || []; this.group = d.group || [];
      } finally { this.loading = false; }
    },
    async cancelPt(b) {
      try { await vant.showConfirmDialog({ title: '取消私教预约', message: '确定取消 ' + H.day(b.date) + ' ' + b.from_time + ' 的「' + b.course_title + '」吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
      await API.post('/member/pt-bookings/' + b.id + '/cancel');
      vant.showToast('已取消');
      this.load();
    },
    async cancelGroup(b) {
      try { await vant.showConfirmDialog({ title: '取消团课预约', message: '确定取消「' + b.syllabus_title + '」吗？临近开课取消可能按规则扣次。', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
      const r = await API.post('/member/group-bookings/' + b.id + '/cancel');
      if (r && r.penalty) vant.showDialog({ title: '已取消', message: r.penalty, confirmButtonColor: 'var(--brand)' });
      else vant.showToast('已取消');
      this.load();
    },
  },
  mounted() { this.load(); },
};

window.Pages.MemberPending = {
  data() { return { list: [], loading: true, doing: 0 }; },
  template: [
    '<div class="page">',
    '  <m-nav title="待确认消课"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="没有待确认的消课"/>',
    '    <div v-else class="muted" style="padding:10px 16px 0">教练已发起消课，请确认课程完成情况，确认后将扣除课时。</div>',
    '    <div v-for="b in list" :key="b.id" class="rec-item">',
    '      <div class="head">',
    '        <span class="name">{{ b.course_title }}</span>',
    '        <van-tag type="warning" round>待确认</van-tag>',
    '      </div>',
    '      <div class="muted mt8">{{ H.day(b.date) }}（{{ H.week(b.date) }}）{{ b.from_time }}-{{ b.to_time }} · {{ b.coach_name }} 教练</div>',
    '      <div class="muted mt4">{{ b.card_type_name }} · 将扣 {{ b.card_deduct_num }} 课时</div>',
    '      <div class="foot">',
    '        <van-button size="small" round type="primary" :loading="doing===b.id" @click="confirm(b)">确认消课</van-button>',
    '      </div>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await API.get('/member/pending-confirms'); }
      finally { this.loading = false; }
    },
    async confirm(b) {
      try { await vant.showConfirmDialog({ title: '确认消课', message: '确认本节课已完成？将从「' + b.card_type_name + '」扣除 ' + b.card_deduct_num + ' 课时。', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
      this.doing = b.id;
      try {
        const r = await API.post('/member/pt-bookings/' + b.id + '/confirm-finish');
        vant.showToast({ message: '已确认消课' + (r && r.spendMoney ? '，耗课 ' + H.money(r.spendMoney) : ''), icon: 'success', duration: 2500 });
        this.load();
      } finally { this.doing = 0; }
    },
  },
  mounted() { this.load(); },
};
