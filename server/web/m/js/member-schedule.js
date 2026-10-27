/* 会员端-课表: 私教课(默认) / 团课 两个 tab */
window.Pages.MemberSchedule = {
  data() {
    return {
      tab: this.$route.query.tab === 'group' ? 'group' : 'pt',
      days: H.monthDays(), date: H.today(),
      list: [], loading: true,
      pt: { coaches: [], mine: [], clubs: [], default_club_id: null },
      ptShow: false, ptCur: null, ptCourseId: null, ptCards: null, ptCardId: null, ptClubId: null, ptFrom: null,
      show: false, cur: null,           // 详情弹层
      cards: null, cardId: null, cardLoading: false,
      submitting: false,
    };
  },
  computed: {
    defaultOpen() { const c = (this.pt.clubs || []).find(x => x.id === this.pt.default_club_id) || (this.pt.clubs || [])[0]; return c ? c.open_time : '08:00-21:00'; },
    ptOpen() { const c = (this.pt.clubs || []).find(x => x.id === this.ptClubId); return c ? c.open_time : this.defaultOpen; },
    ptDuration() { const cs = this.ptCur && this.ptCur.coach.courses.find(x => x.id === this.ptCourseId); return cs ? cs.duration : 60; },
    usablePtCards() { return (this.ptCards || []).filter(c => c.usable); },
    usableCards() { return (this.cards || []).filter(c => c.usable); },
    blockedCards() { return (this.cards || []).filter(c => !c.usable); },
    blockedPtCards() { return (this.ptCards || []).filter(c => !c.usable); },
  },
  template: [
    '<div class="page has-tabbar">',
    '  <m-nav title="约课" :back="false"></m-nav>',
    '  <van-tabs v-model:active="tab" color="var(--brand)" title-active-color="var(--brand)" line-width="28" @change="onTab">',
    '    <van-tab title="私教课" name="pt"></van-tab>',
    '    <van-tab title="团课" name="group"></van-tab>',
    '  </van-tabs>',
    '  <div class="day-strip" ref="strip">',
    '    <div v-for="d in days" :key="d.date" class="day-item" :class="{on:d.date===date, past:d.past}" :data-date="d.date" @click="pick(d.date)">',
    '      <div class="w">{{ d.w }}</div><div class="d">{{ d.d }}</div>',
    '    </div>',
    '  </div>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',

    /* ================= 私教课 ================= */
    '  <template v-else-if="tab===\'pt\'">',
    '    <template v-if="pt.mine.length">',
    '      <div class="sec-title">我当天的私教课</div>',
    '      <div v-for="b in pt.mine" :key="b.id" class="course-item" @click="$router.push(\'/my-bookings\')">',
    '        <div class="course-time"><div class="b">{{ b.from_time }}</div><div class="e">{{ b.to_time }}</div></div>',
    '        <div class="flex1" style="min-width:0">',
    '          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">',
    '            <div class="title" style="flex:1;min-width:0">{{ b.course_title || \'私教课\' }}</div>',
    '            <van-tag round :type="ptTag(b).type" style="flex-shrink:0">{{ ptTag(b).text }}</van-tag>',
    '          </div>',
    '          <div class="muted mt4">教练 {{ b.coach_name }}<template v-if="b.club_name"> · {{ b.club_name }}</template></div>',
    '          <div v-if="b.lesson_plan" class="mt4" style="font-size:12px;color:var(--brand);background:var(--brand-soft);padding:2px 8px;border-radius:4px;display:inline-block"><van-icon name="notes-o" style="margin-right:2px"/>计划：{{ planLabel(b.lesson_plan) }}</div>',
    '        </div>',
    '      </div>',
    '    </template>',
    '    <div class="sec-title">选择教练，再选上课时间</div>',
    '    <van-empty v-if="!pt.coaches.length" description="暂无可约私教" />',
    '    <div v-for="c in pt.coaches" :key="c.id" class="card-box pt-coach">',
    '      <div class="flex" @click="$router.push(\'/coach/\'+c.id)">',
    '        <m-avatar :name="c.realname" :size="42"></m-avatar>',
    '        <div class="flex1" style="margin-left:10px;min-width:0">',
    '          <div style="font-size:15px;font-weight:600">{{ c.realname }}',
    '            <van-tag v-if="c.is_main" type="primary" round style="margin-left:4px">主教练</van-tag>',
    '            <van-tag v-else-if="c.is_sub" type="success" plain round style="margin-left:4px">副教练</van-tag>',
    '          </div>',
    '          <div class="muted mt4" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ c.good_at }}</div>',
    '        </div>',
    '        <div style="text-align:right;flex-shrink:0">',

    '        </div>',
    '      </div>',
    '      <m-avail-bar :date="date" :open-time="defaultOpen" :busy="c.busy"></m-avail-bar>',
    '      <div class="pt-coach-foot">',
    '        <span class="pt-free" :class="{none: !c.free}">{{ c.free ? \'黑色为教练空闲时间\' : slotReason(c) }}</span>',
    '        <van-button size="small" type="primary" round :disabled="!c.free" @click="openPt(c)" style="min-width:86px">选时间约课</van-button>',
    '      </div>',
    '    </div>',
    '  </template>',

    /* ================= 团课 ================= */
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="当日暂无排课" />',
    '    <div v-for="it in list" :key="it.id" class="course-item" @click="open(it)">',
    '      <div class="course-time"><div class="b">{{ H.time(it.start_time) }}</div><div class="e">{{ H.time(it.end_time) }}</div></div>',
    '      <div class="flex1">',
    '        <div class="title">{{ it.title }} <span class="stars">{{ H.stars(it.difficulty) }}</span></div>',
    '        <div class="muted mt4">{{ it.coach_name || \'待定\' }} · {{ it.classroom_name }}<template v-if="it.deduct_num"> · 扣{{ it.deduct_num }}次</template></div>',
    '        <div class="mt4" v-if="it.club_name"><van-tag plain color="var(--brand)">{{ it.club_name }}</van-tag></div>',
    '        <div class="mt8">',
    '          <van-tag plain type="primary" v-if="it.my_booked">我已约</van-tag>',
    '          <span class="muted" style="margin-left:4px">已约 {{ it.booked_count }} / 满 {{ it.people_count }}</span>',
    '        </div>',
    '      </div>',
    '      <div style="display:flex;align-items:center">',
    '        <van-button size="small" round :type="btn(it).type||\'primary\'" :disabled="btn(it).disabled" @click.stop="act(it)" style="min-width:74px">{{ btn(it).text }}</van-button>',
    '      </div>',
    '    </div>',
    '  </template>',

    '  <van-popup v-model:show="ptShow" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div v-if="ptCur" class="pop-scroll">',
    '      <div class="pop-head">',
    '        <div style="font-size:17px;font-weight:700">预约私教 · {{ ptCur.coach.realname }}</div>',
    '        <div class="muted mt4">{{ H.day(date) }}</div>',
    '      </div>',
    '      <template v-if="pt.clubs.length">',
    '      <div class="sec-title" style="margin:14px 0 6px">上课门店</div>',
    '      <div class="store-pick">',
    '        <div v-for="c in pt.clubs" :key="c.id" class="store-opt" :class="{on:ptClubId===c.id}" @click="ptClubId=c.id">',
    '          <div class="n">{{ c.name }}</div><div class="a">{{ c.address }}</div>',
    '        </div>',
    '      </div>',
    '      </template>',
    '      <div class="sec-title" style="margin:14px 0 6px">选择上课时间</div>',
    '      <m-time-picker v-model="ptFrom" :date="date" :open-time="ptOpen" :busy="ptCur.coach.busy" :mine="pt.my_busy || []" :duration="ptDuration"></m-time-picker>',
    '      <div class="sec-title" style="margin:14px 0 6px">选择课程</div>',
    '      <van-radio-group v-model="ptCourseId">',
    '        <div v-for="cs in ptCur.coach.courses" :key="cs.id" class="cat-pick flex" :class="{on:ptCourseId===cs.id}" @click="pickCourse(cs.id)">',
    '          <div class="flex1">',
    '            <div style="font-size:14px;font-weight:600">{{ cs.title }}</div>',
    '            <div class="muted mt4">{{ cs.duration }}分钟 · {{ cs.people_count===1 ? \'1对1\' : cs.people_count+\'人小团\' }}</div>',
    '          </div>',
    '          <van-radio :name="cs.id" checked-color="var(--brand)"/>',
    '        </div>',
    '      </van-radio-group>',
    '      <div class="sec-title" style="margin:14px 0 6px">选择支付卡</div>',
    '      <div v-if="ptCards===null" style="text-align:center;padding:14px"><van-loading size="20" color="var(--brand)"/></div>',
    '      <template v-else>',
    '        <van-radio-group v-model="ptCardId">',
    '          <div v-for="c in usablePtCards" :key="c.id" class="cat-pick flex" :class="{on:ptCardId===c.id}" @click="ptCardId=c.id">',
    '            <div class="flex1">',
    '              <div style="font-size:14px;font-weight:600">{{ c.card_type_name }}</div>',
    '              <div class="muted mt4">{{ cardDesc(c) }}<template v-if="c.expire_time"> · {{ H.dateOf(c.expire_time) }}到期</template></div>',
    '            </div>',
    '            <van-radio :name="c.id" checked-color="var(--brand)"/>',
    '          </div>',
    '        </van-radio-group>',
    '        <div v-for="c in blockedPtCards" :key="c.id" class="cat-pick flex dis">',
    '          <div class="flex1">',
    '            <div style="font-size:14px;font-weight:600">{{ c.card_type_name }}</div>',
    '            <div class="mt4" style="font-size:12px;color:var(--danger)">{{ c.reason }}</div>',
    '          </div>',
    '        </div>',
    '        <div v-if="!usablePtCards.length" style="text-align:center;padding:8px 0 2px">',
    '          <div class="muted">{{ blockedPtCards.length ? \'上面的卡都不能约这节课\' : \'您还没有会员卡，购卡后即可预约\' }}</div>',
    '          <van-button type="warning" size="small" round style="margin-top:8px" @click="ptShow=false;$router.push(\'/buy\')">去买卡</van-button>',
    '        </div>',
    '      </template>',
    '      <div class="mt12">',
    '        <van-button type="primary" block round :loading="submitting" :disabled="!ptCourseId || !ptCardId || !ptClubId || !ptFrom" @click="submitPt">提交预约（待教练确认）</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',

    '  <van-popup v-model:show="show" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div v-if="cur" style="padding:20px 18px 24px">',
    '      <div style="font-size:18px;font-weight:700">{{ cur.title }} <span class="stars">{{ H.stars(cur.difficulty) }}</span></div>',
    '      <div class="muted mt8">{{ H.day(cur.start_time) }} {{ H.time(cur.start_time) }}-{{ H.time(cur.end_time) }} · {{ cur.coach_name || \'待定\' }} · {{ cur.classroom_name }}<template v-if="cur.club_name"> · {{ cur.club_name }}</template></div>',
    '      <div class="mt8" style="font-size:13px;color:var(--c-text-2)" v-if="cur.intro">{{ cur.intro }}</div>',
    '      <div class="mt8"><van-tag v-for="t in tags(cur)" :key="t" plain type="success" style="margin-right:6px">{{ t }}</van-tag>',
    '        <span class="muted">已约 {{ cur.booked_count }} / 满 {{ cur.people_count }}<template v-if="cur.deduct_num"> · 次卡扣 {{ cur.deduct_num }} 次</template></span></div>',
    '      <template v-if="btn(cur).action===\'book\'">',
    '        <div class="sec-title" style="margin:16px 0 8px">选择支付卡</div>',
    '        <div v-if="cardLoading" style="text-align:center;padding:14px"><van-loading size="20" color="var(--brand)"/></div>',
    '        <template v-else-if="cards">',
    '          <van-radio-group v-model="cardId">',
    '            <div v-for="c in usableCards" :key="c.id" class="cat-pick flex" :class="{on:cardId===c.id}" @click="cardId=c.id">',
    '              <div class="flex1">',
    '                <div style="font-size:14px;font-weight:600">{{ c.card_type_name }}</div>',
    '                <div class="muted mt4">{{ cardDesc(c) }}<template v-if="c.expire_time"> · {{ H.dateOf(c.expire_time) }}到期</template></div>',
    '              </div>',
    '              <van-radio :name="c.id" checked-color="var(--brand)"/>',
    '            </div>',
    '          </van-radio-group>',
    '          <div v-for="c in blockedCards" :key="c.id" class="cat-pick flex dis">',
    '            <div class="flex1">',
    '              <div style="font-size:14px;font-weight:600">{{ c.card_type_name }}</div>',
    '              <div class="mt4" style="font-size:12px;color:var(--danger)">{{ c.reason }}</div>',
    '            </div>',
    '          </div>',
    '          <div v-if="!usableCards.length" style="text-align:center;padding:8px 0 2px">',
    '            <div class="muted">{{ blockedCards.length ? \'上面的卡都不能约这节课\' : \'您还没有会员卡，购卡后即可预约\' }}</div>',
    '            <van-button type="warning" size="small" round style="margin-top:10px" @click="show=false;$router.push(\'/buy\')">去买卡</van-button>',
    '          </div>',
    '        </template>',
    '      </template>',
    '      <div class="mt12" v-if="!btn(cur).disabled">',
    '        <van-button v-if="btn(cur).action===\'book\'" type="primary" block round :loading="submitting" :disabled="!cardId" @click="doBook">',
    '          {{ cur.booked_count>=cur.people_count ? "满员 · 排队候补" : "确认预约" }}</van-button>',
    '        <van-button v-else-if="btn(cur).action===\'cancel\'" type="danger" plain block round :loading="submitting" @click="doCancel(cur)">取消预约</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    tags(it) { return String(it.tags || '').split(',').filter(Boolean); },
    // 卡的可用额度描述(任何卡种都能约课, 只是扣减方式不同)
    cardDesc(c) {
      if (c.card_kind === 2) return '时间卡不限次';
      if (c.card_kind === 3) return '储值卡余额 ¥' + H.money(c.left_money);
      return '剩余 ' + c.left_counts + ' 次';
    },
    pick(d) { this.date = d; this.load(); this.scrollDay(); },
    // 选中的日期滚到可见区域中间
    scrollDay() {
      this.$nextTick(() => {
        const strip = this.$refs.strip; if (!strip) return;
        const el = strip.querySelector('.day-item.on'); if (!el) return;
        strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
      });
    },
    onTab() { this.$router.replace({ path: '/schedule', query: this.tab === 'group' ? { tab: 'group' } : {} }); this.load(); },
    async load() {
      this.loading = true;
      try {
        if (this.tab === 'pt') this.pt = await API.get('/member/pt-schedule?date=' + this.date);
        else this.list = await API.get('/member/schedule?date=' + this.date);
      } finally { this.loading = false; }
    },
    planLabel(raw) {
      const p = window.parseLessonPlan ? window.parseLessonPlan(raw) : null;
      if (!p) return '';
      if (p.title) return p.title + (p.items && p.items.length ? ' · ' + p.items.length + '动作' : '');
      if (p.legacy_text) return p.legacy_text.length > 20 ? p.legacy_text.slice(0, 20) + '...' : p.legacy_text;
      return '查看计划';
    },
    ptTag(b) {
      if (b.status === 3) return { text: '已完成', type: 'success' };
      if (b.status === 0) return { text: '待教练确认', type: 'warning' };
      if (b.confirm_status === 1) return { text: '待你确认消课', type: 'danger' };
      return { text: '已确认', type: 'primary' };
    },
    slotReason(c) {
      if (this.date < H.today()) return '已过去的日期，仅供查看';
      if ((c.busy || []).some(b => b.type === 'rest' && b.from === '00:00')) return '教练当天休息';
      if (this.date === H.today()) return '今天已没有可约时间';
      return '当天已约满';
    },
    openPt(coach) {
      this.ptCur = { coach };
      this.ptFrom = null; this.ptCourseId = null; this.ptCards = null; this.ptCardId = null;
      if (!this.ptClubId || !this.pt.clubs.some(c => c.id === this.ptClubId)) this.ptClubId = this.pt.default_club_id;
      this.ptShow = true;
      if (coach.courses.length) this.pickCourse(coach.courses[0].id);
    },
    async pickCourse(id) {
      this.ptCourseId = id; this.ptCards = null; this.ptCardId = null;
      this.ptCards = await API.get('/member/my-pt-cards?course_id=' + id);
      const usable = this.usablePtCards;
      if (usable.length) this.ptCardId = usable[0].id;
    },
    async submitPt() {
      const { coach } = this.ptCur;
      const from = this.ptFrom;
      const course = coach.courses.find(x => x.id === this.ptCourseId);
      this.submitting = true;
      try {
        await API.post('/member/pt-bookings', {
          club_id: this.ptClubId, coach_id: coach.id, course_id: this.ptCourseId, date: this.date, from_time: from, card_id: this.ptCardId,
        });
        this.ptShow = false;
        vant.showDialog({
          title: '预约已提交', confirmButtonColor: 'var(--brand)',
          message: H.day(this.date) + ' ' + from + ' · ' + (course ? course.title : '私教课') + '\n已提交给 ' + coach.realname + ' 教练，确认后生效',
        });
        this.load();
      } finally { this.submitting = false; }
    },
    btn(it) {
      if (it.status === 3) return { text: '已结课', disabled: true };
      if (it.status === 2) return { text: '已取消', disabled: true };
      if (H.isPast(it.start_time)) return { text: it.my_booked ? '已预约' : '已开课', disabled: true };
      if (it.my_booked) return { text: '取消预约', type: 'default', action: 'cancel' };
      if (it.booked_count >= it.people_count) return { text: '排队候补', type: 'warning', action: 'book' };
      return { text: '预约', type: 'primary', action: 'book' };
    },
    open(it) {
      this.cur = it; this.show = true; this.cards = null; this.cardId = null;
      if (this.btn(it).action === 'book') this.loadCards(it);
    },
    act(it) {
      const b = this.btn(it);
      if (b.disabled) return;
      this.open(it);
    },
    async loadCards(it) {
      this.cardLoading = true;
      try {
        this.cards = await API.get('/member/schedule/' + it.id + '/available-cards');
        const usable = this.usableCards;
        this.cardId = usable.length ? usable[0].id : null;
      } finally { this.cardLoading = false; }
    },
    async doBook() {
      if (!this.cardId) return vant.showToast('请选择支付卡');
      this.submitting = true;
      try {
        const r = await API.post('/member/schedule/' + this.cur.id + '/book', { card_id: this.cardId });
        this.show = false;
        if (r && r.waitlist) {
          vant.showDialog({ title: '已加入候补', message: '当前课程已满员，您已排队候补第 ' + r.queue_no + ' 位，有人取消将自动转正。', confirmButtonColor: 'var(--brand)' });
        } else {
          vant.showToast({ message: '预约成功', icon: 'success' });
        }
        this.load();
      } finally { this.submitting = false; }
    },
    async doCancel(it) {
      try { await vant.showConfirmDialog({ title: '取消预约', message: '确定取消「' + it.title + '」的预约吗？', confirmButtonColor: 'var(--brand)' }); }
      catch (e) { return; }
      this.submitting = true;
      try {
        const bks = await API.get('/member/my-bookings');
        const bk = (bks.group || []).find(b => b.syllabus_id === it.id && [0, 1].includes(b.status));
        if (!bk) { vant.showToast('未找到预约记录'); return; }
        const r = await API.post('/member/group-bookings/' + bk.id + '/cancel');
        this.show = false;
        if (r && r.penalty) vant.showDialog({ title: '已取消', message: r.penalty, confirmButtonColor: 'var(--brand)' });
        else vant.showToast('已取消预约');
        this.load();
      } finally { this.submitting = false; }
    },
  },
  mounted() { this.load(); this.scrollDay(); },
};
