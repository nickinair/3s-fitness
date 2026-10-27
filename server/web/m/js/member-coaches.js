/* 会员端-教练列表 + 教练主页(私教预约) */
window.Pages.MemberCoaches = {
  data() { return { list: [], myId: 0, mySubId: 0, loading: true }; },
  computed: {
    sorted() {
      const rank = c => c.id === this.myId ? 0 : (c.id === this.mySubId ? 1 : 2);
      return this.list.slice().sort((a, b) => rank(a) - rank(b));
    },
  },
  template: [
    '<div class="page has-tabbar">',
    '  <m-nav title="私教教练" :back="false"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!sorted.length" description="暂无教练" />',
    '    <div v-for="c in sorted" :key="c.id" class="coach-row" @click="$router.push(\'/coach/\'+c.id)">',
    '      <img v-if="c.avatar" class="cr-face" :src="c.avatar" alt=""/>',
    '      <div v-else class="cr-face cr-letter">{{ (c.realname||\'?\').slice(0,1) }}</div>',
    '      <div class="flex1" style="margin-left:12px;min-width:0">',
    '        <div class="cr-name">{{ c.realname }}',
    '          <van-tag v-if="c.id===myId" type="primary" style="margin-left:5px">主教练</van-tag>',
    '          <van-tag v-else-if="c.id===mySubId" type="success" style="margin-left:5px">副教练</van-tag>',
    '        </div>',
    '        <div class="cr-tag">{{ c.good_at || \'全能教练\' }}</div>',
    '        <div class="cr-desc">{{ c.desc }}</div>',
    '        <div class="cr-foot"><van-icon name="medal-o" size="12"/> 累计授课 {{ c.lesson_total }} 节',
    '          <span v-if="Number(c.lesson_price)>0" class="cr-price">{{ H.money(c.lesson_price) }}/节</span>',
    '        </div>',
    '      </div>',
    '      <van-icon name="arrow" color="var(--c-text-4)"/>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  async mounted() {
    try {
      const d = await API.get('/member/coaches');
      this.list = (d && d.list) || (Array.isArray(d) ? d : []);
      this.myId = (d && d.my_coach_id) || 0;
      this.mySubId = (d && d.my_sub_coach_id) || 0;
    } finally { this.loading = false; }
  },
};

window.Pages.MemberCoachDetail = {
  data() {
    return {
      coach: null, courses: [], loading: true, clubs: [], clubId: null,
      show: false, course: null,
      days: H.monthDays(), date: H.today(),
      busy: [], myBusy: [], slotLoading: false, from: null,
      cards: null, cardId: null,
      submitting: false,
    };
  },
  computed: {
    openTime() { const c = this.clubs.find(x => x.id === this.clubId); return c ? c.open_time : '08:00-21:00'; },
    usableCards() { return (this.cards || []).filter(c => c.usable); },
    blockedCards() { return (this.cards || []).filter(c => !c.usable); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="教练主页"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="coach">',
    '    <div class="home-hero coach-hero" :class="{cover: coach.cover}" :style="coach.cover ? {backgroundImage:\'linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.82)),url(\'+coach.cover+\')\'} : {}">',
    '      <div class="flex">',
    '        <img v-if="coach.avatar" class="coach-face" :src="coach.avatar" alt=""/>',
    '        <m-avatar v-else :name="coach.realname" :size="58"></m-avatar>',
    '        <div class="flex1" style="margin-left:14px">',
    '          <div style="font-size:19px;font-weight:700">{{ coach.realname }}</div>',
    '          <div style="font-size:12px;opacity:.85;margin-top:4px">{{ coach.good_at }}</div>',
    '          <div v-if="Number(coach.lesson_price)>0" style="font-size:15px;font-weight:700;margin-top:6px">{{ H.money(coach.lesson_price) }}<span style="font-size:12px;font-weight:400;opacity:.85">/节</span></div>',
    '        </div>',
    '      </div>',
    '      <div style="font-size:12px;opacity:.85;margin-top:12px">{{ coach.desc }}</div>',
    '    </div>',
    '    <div class="card-box" v-if="coach.detail">',
    '      <div style="font-size:14px;font-weight:600;margin-bottom:6px">教练简介</div>',
    '      <div style="font-size:13px;color:var(--c-text-2);line-height:1.8">{{ coach.detail }}</div>',
    '    </div>',
    '    <div class="sec-title">可约课程</div>',
    '    <van-empty v-if="!courses.length" description="该教练暂无可约课程" image-size="70"/>',
    '    <div v-for="cs in courses" :key="cs.id" class="rec-item flex">',
    '      <div class="flex1">',
    '        <div class="name">{{ cs.title }}</div>',
    '        <div class="muted mt4">{{ cs.duration }}分钟 / 节 · {{ cs.people_count===1?\'1对1\':cs.people_count+\'人小团\' }}</div>',
    '        <div class="muted mt4" v-if="cs.intro">{{ cs.intro }}</div>',
    '      </div>',
    '      <van-button type="primary" size="small" round style="min-width:70px" @click="openBook(cs)">预约</van-button>',
    '    </div>',
    '  </template>',

    '  <van-popup v-model:show="show" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div v-if="course" class="pop-scroll">',
    '      <div class="pop-head">',
    '        <div style="font-size:17px;font-weight:700">预约 · {{ course.title }}</div>',
    '        <div class="muted mt4">教练 {{ coach.realname }} · {{ course.duration }}分钟</div>',
    '      </div>',
    '      <template v-if="clubs.length">',
    '      <div class="sec-title" style="margin:14px 0 6px">上课门店</div>',
    '      <div class="store-pick">',
    '        <div v-for="c in clubs" :key="c.id" class="store-opt" :class="{on:clubId===c.id}" @click="clubId=c.id">',
    '          <div class="n">{{ c.name }}</div><div class="a">{{ c.address }}</div>',
    '        </div>',
    '      </div>',
    '      </template>',
    '      <div class="sec-title" style="margin:14px 0 6px">选择日期</div>',
    '      <div class="day-strip" ref="strip" style="padding:4px 0;background:transparent">',
    '        <div v-for="d in days" :key="d.date" class="day-item" :class="{on:d.date===date, past:d.past}" @click="pickDate(d.date)">',
    '          <div class="w">{{ d.w }}</div><div class="d">{{ d.d }}</div>',
    '        </div>',
    '      </div>',
    '      <div class="sec-title" style="margin:12px 0 6px">选择上课时间</div>',
    '      <div v-if="slotLoading" style="text-align:center;padding:14px"><van-loading size="20" color="var(--brand)"/></div>',
    '      <m-time-picker v-else v-model="from" :date="date" :open-time="openTime" :busy="busy" :mine="myBusy" :duration="course.duration || 60"></m-time-picker>',
    '      <div class="sec-title" style="margin:14px 0 6px">选择支付卡</div>',
    '      <template v-if="cards">',
    '        <van-radio-group v-model="cardId">',
    '          <div v-for="c in usableCards" :key="c.id" class="cat-pick flex" :class="{on:cardId===c.id}" @click="cardId=c.id">',
    '            <div class="flex1">',
    '              <div style="font-size:14px;font-weight:600">{{ c.card_type_name }}</div>',
    '              <div class="muted mt4">{{ cardDesc(c) }}<template v-if="c.expire_time"> · {{ H.dateOf(c.expire_time) }}到期</template></div>',
    '            </div>',
    '            <van-radio :name="c.id" checked-color="var(--brand)"/>',
    '          </div>',
    '        </van-radio-group>',
    '        <div v-for="c in blockedCards" :key="c.id" class="cat-pick flex dis">',
    '          <div class="flex1">',
    '            <div style="font-size:14px;font-weight:600">{{ c.card_type_name }}</div>',
    '            <div class="mt4" style="font-size:12px;color:var(--danger)">{{ c.reason }}</div>',
    '          </div>',
    '        </div>',
    '        <div v-if="!usableCards.length" style="text-align:center;padding:8px 0 2px">',
    '          <div class="muted">{{ blockedCards.length ? \'上面的卡都不能约这节课\' : \'您还没有会员卡，购卡后即可预约\' }}</div>',
    '          <van-button type="warning" size="small" round style="margin-top:8px" @click="show=false;$router.push(\'/buy\')">去买卡</van-button>',
    '        </div>',
    '      </template>',
    '      <div class="mt12">',
    '        <van-button type="primary" block round :loading="submitting" :disabled="!from || !cardId || !clubId" @click="submit">提交预约（待教练确认）</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    cardDesc(c) {
      if (c.card_kind === 2) return '时间卡不限次';
      if (c.card_kind === 3) return '储值卡余额 ¥' + H.money(c.left_money);
      return '剩余 ' + c.left_counts + ' 次';
    },
    async load() {
      try {
        const d = await API.get('/member/coaches/' + this.$route.params.id);
        this.coach = d.coach; this.courses = d.courses || [];
        this.clubs = d.clubs || []; this.clubId = d.default_club_id || (this.clubs[0] || {}).id || null;
      } finally { this.loading = false; }
    },
    openBook(cs) {
      this.course = cs; this.show = true;
      this.from = null; this.cards = null; this.cardId = null;
      this.date = H.today();
      this.loadBusy(); this.loadCards();
    },
    pickDate(d) { this.date = d; this.from = null; this.loadBusy(); this.scrollDay(); },
    scrollDay() {
      this.$nextTick(() => {
        const strip = this.$refs.strip; if (!strip) return;
        const el = strip.querySelector('.day-item.on'); if (!el) return;
        strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2, behavior: 'auto' });
      });
    },
    async loadBusy() {
      this.slotLoading = true;
      try {
        const d = await API.get('/member/coaches/' + this.coach.id + '/busy?date=' + this.date);
        this.busy = d.busy || []; this.myBusy = d.my_busy || [];
      } finally { this.slotLoading = false; }
    },
    async loadCards() {
      this.cards = await API.get('/member/my-pt-cards?course_id=' + this.course.id);
      const usable = this.usableCards;
      if (usable.length) this.cardId = usable[0].id;
    },
    async submit() {
      this.submitting = true;
      try {
        await API.post('/member/pt-bookings', {
          club_id: this.clubId, coach_id: this.coach.id, course_id: this.course.id,
          date: this.date, from_time: this.from, card_id: this.cardId,
        });
        this.show = false;
        await vant.showDialog({
          title: '预约已提交', confirmButtonColor: 'var(--brand)', confirmButtonText: '查看我的预约',
          message: H.day(this.date) + ' ' + this.from + ' · ' + this.course.title + '\n已提交给 ' + this.coach.realname + ' 教练，确认后生效',
        });
        this.$router.push('/my-bookings');
      } finally { this.submitting = false; }
    },
  },
  mounted() { this.load(); this.scrollDay(); },
};
