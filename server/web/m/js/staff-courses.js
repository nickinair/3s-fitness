/* 员工端-排课表(管理) / 团课课程库 / 教室管理 / 私教课程类型
   对应 PC: admin/js/pages/schedule.js, group-courses.js(含 Classrooms), coaches.js(含 PtCourses) */

/* ================= 排课表(管理) ================= */
window.Pages.StaffSchedule = {
  data() {
    const monday = dayjs().subtract((dayjs().day() + 6) % 7, 'day').format('YYYY-MM-DD');
    return {
      weekStart: monday, date: monday,
      list: [], loading: true,
      coaches: [], courses: [], classrooms: [], clubs: [],
      coachFilter: 0,
      role: (Store.user || {}).role,
      // 详情
      show: false, detail: null, detailLoading: false,
      bookKw: '', bookResults: [], bookForm: { vip_id: 0, realname: '' }, memberCards: null, cardId: 0, booking: false,
      checkinDoing: 0,
      cancelClassShow: false, cancelClassReason: '', cancelling: false,
      cancelBkShow: false, cancelBkTarget: null, cancelBkReason: '', cancellingBk: false,
      settling: false,
      // 新增排课
      addShow: false, addForm: {}, addDate: '', addTime: '10:00', saving: false,
      pickerShow: false, pickerType: '', pickerColumns: [],
    };
  },
  computed: {
    canManage() { return ['admin', 'manager'].includes(this.role); },
    canOperate() { return ['admin', 'manager', 'reception'].includes(this.role); },
    days() {
      const names = ['一', '二', '三', '四', '五', '六', '日'];
      return Array.from({ length: 7 }, (_, i) => {
        const d = dayjs(this.weekStart).add(i, 'day');
        const dt = d.format('YYYY-MM-DD');
        const diff = d.startOf('day').diff(dayjs().startOf('day'), 'day');
        return {
          date: dt, d: d.format('MM-DD'),
          w: diff === 0 ? '今天' : (diff === 1 ? '明天' : (diff === -1 ? '昨天' : '周' + names[i])),
        };
      });
    },
    weekLabel() { return dayjs(this.weekStart).format('MM月DD日') + ' - ' + dayjs(this.weekStart).add(6, 'day').format('MM月DD日'); },
    dayList() {
      return this.list.filter(s => dayjs(s.start_time).format('YYYY-MM-DD') === this.date)
        .sort((a, b) => a.start_time < b.start_time ? -1 : 1);
    },
    activeCourses() { return this.courses.filter(c => c.status === 1); },
    coachOptions() { return [{ text: '全部教练', value: 0 }].concat(this.coaches.map(c => ({ text: c.realname, value: c.id }))); },
    isEnded() { return this.detail && H.isPast(this.detail.syllabus.end_time); },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="排课表"></m-nav>',
    '  <div class="flex" style="justify-content:space-between;padding:10px 14px 0">',
    '    <van-icon name="arrow-left" size="18" @click="shiftWeek(-1)"/>',
    '    <span style="font-size:14px;font-weight:600;color:var(--c-title)" @click="goToday">{{ weekLabel }}</span>',
    '    <van-icon name="arrow" size="18" @click="shiftWeek(1)"/>',
    '  </div>',
    '  <van-dropdown-menu v-if="coaches.length" style="box-shadow:none">',
    '    <van-dropdown-item v-model="coachFilter" :options="coachOptions" @change="load"/>',
    '  </van-dropdown-menu>',
    '  <div class="day-strip">',
    '    <div v-for="d in days" :key="d.date" class="day-item" :class="{on:d.date===date}" @click="date=d.date">',
    '      <div class="w">{{ d.w }}</div><div class="d">{{ d.d }}</div>',
    '    </div>',
    '  </div>',
    '  <div class="flex" style="padding:0 12px 4px;gap:8px" v-if="canManage">',
    '    <van-button size="small" round plain style="flex:1" @click="copyLastWeek">复制上周排课</van-button>',
    '    <van-button size="small" round type="primary" style="flex:1" @click="openAdd">新增排课</van-button>',
    '  </div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!dayList.length" description="当天暂无排课"/>',
    '    <div v-for="s in dayList" :key="s.id" class="course-item" @click="openDetail(s)">',
    '      <div class="course-time"><div class="b">{{ H.time(s.start_time) }}</div><div class="e">{{ H.time(s.end_time) }}</div></div>',
    '      <div class="flex1">',
    '        <div class="title">{{ s.title }}',
    '          <van-tag v-if="s.status===2" type="default" plain round style="margin-left:4px">已取消</van-tag>',
    '          <van-tag v-else-if="s.status===3" type="primary" plain round style="margin-left:4px">已结课</van-tag>',
    '        </div>',
    '        <div class="muted mt4">{{ s.coach_name || \'未排教练\' }} · {{ s.classroom_name || \'未排教室\' }}</div>',
    '        <div class="muted mt4">已约 {{ s.booked_count }} / 满员 {{ s.people_count }}</div>',
    '      </div>',
    '      <van-icon name="arrow" color="var(--c-text-4)"/>',
    '    </div>',
    '  </template>',

    /* 课程详情 */
    '  <van-popup v-model:show="show" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div class="pop-scroll" v-if="detail">',
    '      <div class="pop-head">',
    '        <div style="font-size:17px;font-weight:700">{{ detail.syllabus.title }}</div>',
    '        <div class="muted mt4">{{ H.day(detail.syllabus.start_time) }} {{ H.time(detail.syllabus.start_time) }}-{{ H.time(detail.syllabus.end_time) }}',
    '          · {{ detail.syllabus.coach_name || \'未排教练\' }} · {{ detail.syllabus.classroom_name || \'未排教室\' }}</div>',
    '        <div class="muted mt4">已约 {{ detail.syllabus.booked_count }} / 满员 {{ detail.syllabus.people_count }}<template v-if="detail.syllabus.deduct_num"> · 扣卡 {{ detail.syllabus.deduct_num }} 次</template></div>',
    '      </div>',
    '      <div v-if="detailLoading" style="text-align:center;padding:20px"><van-loading size="20" color="var(--brand)"/></div>',
    '      <template v-else>',
    '        <div class="sec-title" style="margin:10px 0 6px">预约名单（{{ detail.bookings.length }}）</div>',
    '        <van-empty v-if="!detail.bookings.length" description="暂无预约" image-size="60"/>',
    '        <div v-for="b in detail.bookings" :key="b.id" class="rec-item" style="margin:0 0 8px;padding:10px 12px">',
    '          <div class="flex">',
    '            <div class="flex1">',
    '              <div class="name" style="font-size:14px">{{ b.realname }}',
    '                <van-tag v-if="b.status===0" plain type="warning" style="margin-left:4px">候补第{{ b.queue_no }}位</van-tag></div>',
    '              <div class="muted mt4">{{ b.phone }} · {{ b.card_type_name }}</div>',
    '            </div>',
    '            <d-tag dict="groupStatus" :v="b.status" style="margin-right:8px"></d-tag>',
    '          </div>',
    '          <div class="foot" v-if="canOperate && [0,1].includes(b.status)">',
    '            <van-button v-if="b.status===1" size="small" round type="primary" :loading="checkinDoing===b.id" @click="checkin(b)">核销</van-button>',
    '            <van-button v-if="[0,1].includes(b.status)" size="small" round plain @click="openCancelBk(b)">取消</van-button>',
    '          </div>',
    '        </div>',

    '        <template v-if="detail.syllabus.status===1 && canOperate">',
    '          <div class="sec-title" style="margin:14px 0 6px">代约会员</div>',
    '          <van-search :model-value="bookKw" placeholder="搜索会员姓名/手机号" @update:model-value="onBookKw" @search="searchMember"></van-search>',
    '          <div v-if="bookResults.length" class="sug-pop" style="position:static;margin-top:6px">',
    '            <div v-for="m in bookResults" :key="m.id" class="sug-item" @click="pickMember(m)">{{ m.realname||m.nickname }}<span class="muted" style="margin-left:6px">{{ m.phone }}</span></div>',
    '          </div>',
    '          <div v-if="bookForm.vip_id" class="cat-pick flex on" style="margin-top:8px">',
    '            <div class="flex1">已选会员：{{ bookForm.realname }}</div>',
    '            <van-icon name="cross" @click="clearMember"/>',
    '          </div>',
    '          <template v-if="bookForm.vip_id">',
    '            <div class="sec-title" style="margin:10px 0 6px">选择扣课卡</div>',
    '            <div v-if="memberCards===null" style="text-align:center;padding:10px"><van-loading size="18" color="var(--brand)"/></div>',
    '            <van-empty v-else-if="!memberCards.length" description="该会员无可用会员卡" image-size="50"/>',
    '            <van-radio-group v-model="cardId" v-else>',
    '              <div v-for="c in memberCards" :key="c.id" class="cat-pick flex" :class="{on:cardId===c.id}" @click="cardId=c.id">',
    '                <div class="flex1">{{ c.card_type_name }}<span class="muted" style="margin-left:6px">{{ c.card_kind===2 ? \'时间卡不限次\' : (c.card_kind===3 ? (\'余额 ¥\'+H.money(c.left_money)) : (\'剩\'+c.left_counts+\'次\')) }}</span></div>',
    '                <van-radio :name="c.id" checked-color="var(--brand)"/>',
    '              </div>',
    '            </van-radio-group>',
    '          </template>',
    '          <div class="mt12"><van-button type="primary" block round :loading="booking" :disabled="!bookForm.vip_id || !cardId" @click="doBook">代约</van-button></div>',
    '        </template>',

    '        <div class="flex mt12" style="gap:10px" v-if="canOperate && detail.syllabus.status===1">',
    '          <van-button v-if="canManage" type="danger" plain round style="flex:1" @click="cancelClassReason=\'\';cancelClassShow=true">取消课程</van-button>',
    '          <van-button v-if="isEnded" type="warning" plain round style="flex:1" :loading="settling" @click="settle">课后结算</van-button>',
    '        </div>',
    '      </template>',
    '    </div>',
    '  </van-popup>',

    /* 取消课程 */
    '  <van-popup v-model:show="cancelClassShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:6px">取消课程</div>',
    '      <div class="muted" style="margin-bottom:10px">取消课程将释放全部预约（已约会员自动取消）</div>',
    '      <van-field v-model="cancelClassReason" type="textarea" rows="2" label="原因" placeholder="选填" :border="false"/>',
    '      <div class="mt12"><van-button type="danger" block round :loading="cancelling" @click="doCancelClass">确认取消课程</van-button></div>',
    '    </div>',
    '  </van-popup>',

    /* 取消预约 */
    '  <van-popup v-model:show="cancelBkShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px" v-if="cancelBkTarget">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:6px">取消「{{ cancelBkTarget.realname }}」的预约</div>',
    '      <div class="muted" style="margin-bottom:10px">候补将自动转正</div>',
    '      <van-field v-model="cancelBkReason" type="textarea" rows="2" label="原因" placeholder="选填" :border="false"/>',
    '      <div class="mt12"><van-button type="danger" block round :loading="cancellingBk" @click="doCancelBk">确认取消</van-button></div>',
    '    </div>',
    '  </van-popup>',

    /* 新增排课 */
    '  <van-popup v-model:show="addShow" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head"><div style="font-size:17px;font-weight:700">新增排课</div></div>',
    '      <van-field v-if="clubs.length>1 && role===\'admin\'" :model-value="clubName(addForm.club_id)" label="排课门店" placeholder="请选择" required readonly is-link @click="openPicker(\'club\')"/>',
    '      <van-field :model-value="courseName(addForm.group_id)" label="团课课程" placeholder="请选择" required readonly is-link @click="openPicker(\'course\')"/>',
    '      <van-field :model-value="coachName(addForm.coach_id) || \'不指定\'" label="教练" readonly is-link @click="openPicker(\'coach\')"/>',
    '      <van-field :model-value="roomName(addForm.classroom_id) || \'不指定\'" label="教室" readonly is-link @click="openPicker(\'room\')"/>',
    '      <van-field label="开课日期" required>',
    '        <template #input><input type="date" v-model="addDate" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text)"/></template>',
    '      </van-field>',
    '      <van-field label="开课时间" required>',
    '        <template #input><input type="time" v-model="addTime" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text)"/></template>',
    '      </van-field>',
    '      <van-field label="满员人数"><template #input><van-stepper v-model="addForm.people_count" min="1" button-size="22"/></template></van-field>',
    '      <van-field label="开课下限"><template #input><van-stepper v-model="addForm.lower_limit" min="0" button-size="22"/></template></van-field>',
    '      <van-field label="扣卡次数"><template #input><van-stepper v-model="addForm.deduct_num" min="0" button-size="22"/></template></van-field>',
    '      <van-field label="会员可自约"><template #input><van-switch v-model="addForm.is_vipuser_sub" :active-value="1" :inactive-value="0" size="20" active-color="var(--brand)"/></template></van-field>',
    '      <van-field label="会员可自取消" :border="false"><template #input><van-switch v-model="addForm.self_cancel" :active-value="1" :inactive-value="0" size="20" active-color="var(--brand)"/></template></van-field>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="doAdd">保存排课</van-button></div>',
    '    </div>',
    '  </van-popup>',

    '  <van-popup v-model:show="pickerShow" position="bottom" round><van-picker :columns="pickerColumns" @confirm="onPicker" @cancel="pickerShow=false" confirm-button-text="确定"/></van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    dayjs,
    clubName(id) { const c = this.clubs.find(x => x.id === id); return c ? c.name : ''; },
    courseName(id) { const c = this.courses.find(x => x.id === id); return c ? c.title + '（' + c.duration + '分钟）' : ''; },
    coachName(id) { const c = this.coaches.find(x => x.id === id); return c ? c.realname : ''; },
    roomName(id) { const c = this.classrooms.find(x => x.id === id); return c ? c.title + '（容纳' + c.capacity + '人）' : ''; },
    shiftWeek(n) { this.weekStart = dayjs(this.weekStart).add(n * 7, 'day').format('YYYY-MM-DD'); this.date = this.weekStart; this.load(); },
    goToday() {
      this.weekStart = dayjs().subtract((dayjs().day() + 6) % 7, 'day').format('YYYY-MM-DD');
      this.date = H.today();
      this.load();
    },
    async load() {
      this.loading = true;
      try {
        let url = '/syllabus?from=' + this.weekStart + '&to=' + dayjs(this.weekStart).add(6, 'day').format('YYYY-MM-DD');
        if (this.coachFilter) url += '&coach_id=' + this.coachFilter;
        this.list = await API.get(url);
      } finally { this.loading = false; }
    },
    async loadDicts() {
      try {
        const [coaches, courses, rooms] = await Promise.all([
          API.get('/coaches', { silent: true }), API.get('/group-courses', { silent: true }), API.get('/classrooms', { silent: true }),
        ]);
        this.coaches = coaches || []; this.courses = courses || []; this.classrooms = rooms || [];
      } catch (e) { /* ignore */ }
      if (this.canManage) {
        try { this.clubs = await API.get('/clubs', { silent: true }); } catch (e) { this.clubs = []; }
      }
    },
    async openDetail(s) {
      this.show = true; this.detail = null; this.detailLoading = true;
      this.bookKw = ''; this.bookResults = []; this.bookForm = { vip_id: 0, realname: '' }; this.memberCards = null; this.cardId = 0;
      try { this.detail = await API.get('/syllabus/' + s.id); } finally { this.detailLoading = false; }
    },
    async refreshDetail() {
      if (!this.detail) return;
      this.detail = await API.get('/syllabus/' + this.detail.syllabus.id);
      this.load();
    },
    async checkin(b) {
      this.checkinDoing = b.id;
      try {
        await API.post('/syllabus-bookings/' + b.id + '/checkin');
        vant.showToast({ message: b.realname + ' 已核销', icon: 'success' });
        this.refreshDetail();
      } finally { this.checkinDoing = 0; }
    },
    openCancelBk(b) { this.cancelBkTarget = b; this.cancelBkReason = ''; this.cancelBkShow = true; },
    async doCancelBk() {
      this.cancellingBk = true;
      try {
        const r = await API.post('/syllabus-bookings/' + this.cancelBkTarget.id + '/cancel', { reason: this.cancelBkReason || '' });
        vant.showToast(r && r.penalty ? r.penalty : '已取消');
        this.cancelBkShow = false;
        this.refreshDetail();
      } finally { this.cancellingBk = false; }
    },
    onBookKw(v) { this.bookKw = v; this.searchMember(); },
    async searchMember() {
      const kw = this.bookKw.trim();
      if (!kw) { this.bookResults = []; return; }
      try { const d = await API.get('/members?keyword=' + encodeURIComponent(kw) + '&size=8', { silent: true }); this.bookResults = d.list || []; }
      catch (e) { this.bookResults = []; }
    },
    clearMember() { this.bookForm = { vip_id: 0, realname: '' }; this.memberCards = null; this.cardId = 0; },
    async pickMember(m) {
      this.bookForm = { vip_id: m.id, realname: m.realname || m.nickname }; this.bookResults = []; this.bookKw = '';
      this.memberCards = null; this.cardId = 0;
      const d = await API.get('/cards?vip_id=' + m.id + '&size=50', { silent: true });
      this.memberCards = (d.list || []).filter(c => [0, 1].includes(c.status) && (![1, 4].includes(c.card_kind) || c.left_counts > 0) && (c.card_kind !== 3 || Number(c.left_money) > 0));
      if (this.memberCards.length) this.cardId = this.memberCards[0].id;
    },
    async doBook() {
      if (!this.bookForm.vip_id || !this.cardId) return vant.showToast('请选择会员与扣课卡');
      this.booking = true;
      try {
        const d = await API.post('/syllabus/' + this.detail.syllabus.id + '/book', { vip_id: this.bookForm.vip_id, card_id: this.cardId });
        vant.showToast(d && d.waitlist ? ('课程已满员，已进入候补队列（第' + d.queue_no + '位）') : '代约成功');
        this.clearMember();
        this.refreshDetail();
      } finally { this.booking = false; }
    },
    async doCancelClass() {
      this.cancelling = true;
      try {
        await API.post('/syllabus/' + this.detail.syllabus.id + '/cancel', { reason: this.cancelClassReason || '' });
        vant.showToast('课程已取消');
        this.cancelClassShow = false; this.show = false;
        this.load();
      } finally { this.cancelling = false; }
    },
    async settle() {
      try { await vant.showConfirmDialog({ title: '课后结算', message: '未核销的已约会员将标记为爽约，候补作废，课程结课。', confirmButtonColor: 'var(--brand)' }); }
      catch (e) { return; }
      this.settling = true;
      try {
        const d = await API.post('/syllabus/' + this.detail.syllabus.id + '/settle');
        vant.showToast('已结算，爽约 ' + ((d && d.noshow) || 0) + ' 人');
        this.refreshDetail();
      } finally { this.settling = false; }
    },
    copyLastWeek() {
      const from = dayjs(this.weekStart).subtract(7, 'day').format('YYYY-MM-DD');
      vant.showConfirmDialog({
        title: '复制上周排课', confirmButtonColor: 'var(--brand)',
        message: '将 ' + from + ' 起一周的排课复制到本周（' + this.weekStart + ' 起），已过期与重复课程自动跳过。',
      }).then(async () => {
        const d = await API.post('/syllabus/copy-week', { from_week_start: from, to_week_start: this.weekStart });
        vant.showToast('复制完成，新增 ' + ((d && d.created) || 0) + ' 节课');
        this.load();
      }).catch(() => {});
    },
    openAdd() {
      // 默认排到当前选中的那天; 若该天已过则顺延到明天
      const tmr = dayjs().add(1, 'day');
      const sel = dayjs(this.date);
      this.addDate = (sel.isValid() && !sel.isBefore(dayjs(), 'day') ? sel : tmr).format('YYYY-MM-DD');
      this.addTime = '10:00';
      this.addForm = {
        club_id: this.clubs.length ? this.clubs[0].id : null,
        group_id: 0, coach_id: 0, classroom_id: 0,
        people_count: 20, lower_limit: 0, deduct_num: 1, is_vipuser_sub: 1, self_cancel: 1,
      };
      this.addShow = true;
    },
    openPicker(type) {
      this.pickerType = type;
      if (type === 'club') this.pickerColumns = this.clubs.map(c => ({ text: c.name, value: c.id }));
      else if (type === 'course') this.pickerColumns = this.activeCourses.map(c => ({ text: c.title + '（' + c.duration + '分钟）', value: c.id }));
      else if (type === 'coach') this.pickerColumns = [{ text: '不指定', value: 0 }].concat(this.coaches.map(c => ({ text: c.realname, value: c.id })));
      else if (type === 'room') this.pickerColumns = [{ text: '不指定', value: 0 }].concat(this.classrooms.map(c => ({ text: c.title + '（容纳' + c.capacity + '人）', value: c.id })));
      this.pickerShow = true;
    },
    onPicker(v) {
      const val = v.selectedOptions[0].value;
      if (this.pickerType === 'club') this.addForm.club_id = val;
      else if (this.pickerType === 'course') {
        this.addForm.group_id = val;
        const c = this.courses.find(x => x.id === val);
        if (c) this.addForm.deduct_num = c.deduct_num;
      } else if (this.pickerType === 'coach') this.addForm.coach_id = val;
      else if (this.pickerType === 'room') {
        this.addForm.classroom_id = val;
        const r = this.classrooms.find(x => x.id === val);
        if (r) this.addForm.people_count = r.capacity;
      }
      this.pickerShow = false;
    },
    async doAdd() {
      if (this.role === 'admin' && !this.addForm.club_id) return vant.showToast('请选择排课门店');
      if (!this.addForm.group_id) return vant.showToast('请选择团课课程');
      if (!this.addDate || !this.addTime) return vant.showToast('请选择开课时间');
      this.saving = true;
      try {
        const body = {
          group_id: this.addForm.group_id, coach_id: this.addForm.coach_id, classroom_id: this.addForm.classroom_id,
          start_time: this.addDate + ' ' + this.addTime + ':00',
          people_count: this.addForm.people_count, lower_limit: this.addForm.lower_limit, deduct_num: this.addForm.deduct_num,
          is_vipuser_sub: this.addForm.is_vipuser_sub, self_cancel: this.addForm.self_cancel,
        };
        if (this.role === 'admin') body.club_id = this.addForm.club_id;
        await API.post('/syllabus', body);
        vant.showToast({ message: '排课成功', icon: 'success' });
        this.addShow = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); this.loadDicts(); },
};

/* ================= 团课课程库 ================= */
window.Pages.StaffGroupCourses = {
  data() {
    return {
      list: [], loading: true, groupCards: [],
      role: (Store.user || {}).role,
      show: false, form: {}, saving: false,
    };
  },
  computed: { canManage() { return ['admin', 'manager'].includes(this.role); } },
  template: [
    '<div class="page">',
    '  <m-nav title="团课课程库"></m-nav>',
    '  <div style="padding:10px 12px 0" v-if="canManage"><van-button type="primary" round block icon="plus" @click="openAdd">新增团课</van-button></div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无团课课程"/>',
    '    <div v-for="c in list" :key="c.id" class="rec-item" @click="canManage && openEdit(c)">',
    '      <div class="head">',
    '        <span class="name">{{ c.title }} <span class="stars">{{ H.stars(c.difficulty) }}</span></span>',
    '        <van-tag :type="c.status===1?\'success\':\'default\'" plain round>{{ c.status===1?\'启用\':\'停用\' }}</van-tag>',
    '      </div>',
    '      <div class="muted mt8">{{ c.duration }}分钟 · 耗卡{{ c.deduct_num }}次<template v-if="c.tags"> · {{ c.tags }}</template></div>',
    '      <div class="mt4" v-if="parseIds(c.card_scope).length">',
    '        <van-tag v-for="id in parseIds(c.card_scope)" :key="id" plain type="primary" style="margin-right:4px">{{ cardName(id) }}</van-tag>',
    '      </div>',
    '      <div class="muted mt4" v-else>适用：全部次卡/时间卡</div>',
    '    </div>',
    '  </template>',

    '  <van-popup v-model:show="show" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head"><div style="font-size:17px;font-weight:700">{{ form.id ? \'编辑团课\' : \'新增团课\' }}</div></div>',
    '      <van-field v-model="form.title" label="课程名称" placeholder="必填" required/>',
    '      <van-field label="时长(分钟)"><template #input><van-stepper v-model="form.duration" min="15" step="15" button-size="22"/></template></van-field>',
    '      <van-field label="难度星级">',
    '        <template #input>',
    '          <div class="stc-stars">',
    '            <span v-for="i in 5" :key="i" class="stc-star" :class="{on:i<=form.difficulty}" @click="form.difficulty=i">★</span>',
    '          </div>',
    '        </template>',
    '      </van-field>',
    '      <van-field label="耗卡次数"><template #input><van-stepper v-model="form.deduct_num" min="0" button-size="22"/></template></van-field>',
    '      <div class="sec-title" style="margin:12px 0 4px">适用卡（不选=全部次卡/时间卡）</div>',
    '      <div v-for="c in groupCards" :key="c.id" class="cat-pick flex" :class="{on:form.card_scope.includes(c.id)}" @click="toggleCard(c.id)">',
    '        <div class="flex1">{{ c.title }} <span class="muted">（{{ DICT.cardKind[c.card_kind] }}）</span></div>',
    '        <van-icon v-if="form.card_scope.includes(c.id)" name="checked" color="var(--brand)" size="18"/>',
    '      </div>',
    '      <van-field v-model="form.tags" label="标签" placeholder="逗号分隔，如：燃脂,搏击"/>',
    '      <van-field v-model="form.intro" type="textarea" rows="2" label="简介" placeholder="选填"/>',
    '      <van-field label="状态" :border="false"><template #input><van-switch v-model="form.status" :active-value="1" :inactive-value="0" size="20" active-color="var(--brand)"/></template></van-field>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    parseIds(v) { try { return JSON.parse(v || '[]'); } catch (e) { return []; } },
    cardName(id) { const c = this.groupCards.find(x => x.id === id); return c ? c.title : '#' + id; },
    toggleCard(id) {
      const i = this.form.card_scope.indexOf(id);
      if (i >= 0) this.form.card_scope.splice(i, 1); else this.form.card_scope.push(id);
    },
    async load() {
      this.loading = true;
      try { this.list = await API.get('/group-courses'); } finally { this.loading = false; }
    },
    async loadDicts() {
      try {
        const cats = await API.get('/card-categories', { silent: true });
        this.groupCards = cats || [];
      } catch (e) { this.groupCards = []; }
    },
    openAdd() {
      if (!this.canManage) return;
      this.form = { title: '', duration: 60, difficulty: 3, deduct_num: 1, card_scope: [], tags: '', intro: '', status: 1 };
      this.show = true;
    },
    openEdit(row) {
      this.form = Object.assign(JSON.parse(JSON.stringify(row)), { card_scope: this.parseIds(row.card_scope) });
      this.show = true;
    },
    async save() {
      if (!this.form.title.trim()) return vant.showToast('请填写课程名称');
      this.saving = true;
      try {
        if (this.form.id) await API.put('/group-courses/' + this.form.id, this.form);
        else await API.post('/group-courses', this.form);
        vant.showToast({ message: '保存成功', icon: 'success' });
        this.show = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); this.loadDicts(); },
};

/* ================= 教室管理 ================= */
window.Pages.StaffClassrooms = {
  data() {
    return {
      list: [], loading: true,
      role: (Store.user || {}).role,
      show: false, form: {}, saving: false,
    };
  },
  computed: { canManage() { return ['admin', 'manager'].includes(this.role); } },
  template: [
    '<div class="page">',
    '  <m-nav title="教室管理"></m-nav>',
    '  <div style="padding:10px 12px 0" v-if="canManage"><van-button type="primary" round block icon="plus" @click="openAdd">新增教室</van-button></div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无教室"/>',
    '    <div v-for="c in list" :key="c.id" class="rec-item">',
    '      <div class="head"><span class="name">{{ c.title }}</span><span class="muted">容纳 {{ c.capacity }} 人</span></div>',
    '      <div class="foot" v-if="canManage">',
    '        <van-button size="small" round plain @click="openEdit(c)">编辑</van-button>',
    '        <van-button size="small" round plain type="danger" @click="disable(c)">停用</van-button>',
    '      </div>',
    '    </div>',
    '  </template>',

    '  <van-popup v-model:show="show" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">{{ form.id ? \'编辑教室\' : \'新增教室\' }}</div>',
    '      <van-field v-model="form.title" label="教室名称" placeholder="必填" required/>',
    '      <van-field label="容纳人数"><template #input><van-stepper v-model="form.capacity" min="1" button-size="22"/></template></van-field>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await API.get('/classrooms'); } finally { this.loading = false; }
    },
    openAdd() {
      if (!this.canManage) return;
      this.form = { title: '', capacity: 20 };
      this.show = true;
    },
    openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.show = true; },
    async save() {
      if (!this.form.title.trim()) return vant.showToast('请填写教室名称');
      this.saving = true;
      try {
        if (this.form.id) await API.put('/classrooms/' + this.form.id, this.form);
        else await API.post('/classrooms', this.form);
        vant.showToast({ message: '保存成功', icon: 'success' });
        this.show = false;
        this.load();
      } finally { this.saving = false; }
    },
    async disable(row) {
      try { await vant.showConfirmDialog({ title: '停用教室', message: '确定停用教室「' + row.title + '」？', confirmButtonColor: 'var(--brand)' }); }
      catch (e) { return; }
      await API.put('/classrooms/' + row.id, { title: row.title, capacity: row.capacity, status: 0 });
      vant.showToast('已停用');
      this.load();
    },
  },
  mounted() { this.load(); },
};

/* ================= 私教课程类型 ================= */
window.Pages.StaffPtCourses = {
  data() {
    return {
      list: [], loading: true, coaches: [], ptCards: [],
      role: (Store.user || {}).role,
      show: false, form: {}, saving: false,
    };
  },
  computed: { canManage() { return ['admin', 'manager'].includes(this.role); } },
  template: [
    '<div class="page">',
    '  <m-nav title="私教课程"></m-nav>',
    '  <div style="padding:10px 12px 0" v-if="canManage"><van-button type="primary" round block icon="plus" @click="openAdd">新增私教课程</van-button></div>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无私教课程"/>',
    '    <div v-for="c in list" :key="c.id" class="rec-item" @click="canManage && openEdit(c)">',
    '      <div class="head">',
    '        <span class="name">{{ c.title }}</span>',
    '        <van-tag :type="c.status===1?\'success\':\'default\'" plain round>{{ c.status===1?\'启用\':\'停用\' }}</van-tag>',
    '      </div>',
    '      <div class="muted mt8">{{ c.duration }}分钟</div>',
    '      <div class="mt4">',
    '        <span class="muted" v-if="!parseIds(c.coach_ids).length">授课教练：全部教练</span>',
    '        <template v-else><van-tag v-for="id in parseIds(c.coach_ids)" :key="id" plain type="primary" style="margin-right:4px">{{ coachName(id) }}</van-tag></template>',
    '      </div>',
    '      <div class="mt4">',
    '        <span class="muted" v-if="!parseIds(c.card_scope).length">适用私教卡：全部私教卡</span>',
    '        <template v-else><van-tag v-for="id in parseIds(c.card_scope)" :key="id" plain type="warning" style="margin-right:4px">{{ cardName(id) }}</van-tag></template>',
    '      </div>',
    '    </div>',
    '  </template>',

    '  <van-popup v-model:show="show" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div class="pop-scroll">',
    '      <div class="pop-head"><div style="font-size:17px;font-weight:700">{{ form.id ? \'编辑私教课程\' : \'新增私教课程\' }}</div></div>',
    '      <van-field v-model="form.title" label="课程名称" placeholder="必填" required/>',
    '      <van-field label="时长(分钟)"><template #input><van-stepper v-model="form.duration" min="15" step="15" button-size="22"/></template></van-field>',
    '      <div class="sec-title" style="margin:12px 0 4px">授课教练（不选=全部教练）</div>',
    '      <div v-for="c in coaches" :key="c.id" class="cat-pick flex" :class="{on:form.coach_ids.includes(c.id)}" @click="toggleCoach(c.id)">',
    '        <div class="flex1">{{ c.realname }}</div>',
    '        <van-icon v-if="form.coach_ids.includes(c.id)" name="checked" color="var(--brand)" size="18"/>',
    '      </div>',
    '      <div class="sec-title" style="margin:12px 0 4px">适用私教卡（不选=全部私教卡）</div>',
    '      <div v-for="c in ptCards" :key="c.id" class="cat-pick flex" :class="{on:form.card_scope.includes(c.id)}" @click="toggleCard(c.id)">',
    '        <div class="flex1">{{ c.title }}</div>',
    '        <van-icon v-if="form.card_scope.includes(c.id)" name="checked" color="var(--brand)" size="18"/>',
    '      </div>',
    '      <van-field v-model="form.intro" type="textarea" rows="2" label="简介" placeholder="选填"/>',
    '      <van-field label="排序"><template #input><van-stepper v-model="form.sort" min="0" button-size="22"/></template></van-field>',
    '      <van-field label="状态" :border="false"><template #input><van-switch v-model="form.status" :active-value="1" :inactive-value="0" size="20" active-color="var(--brand)"/></template></van-field>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    parseIds(v) { try { return JSON.parse(v || '[]'); } catch (e) { return []; } },
    coachName(id) { const c = this.coaches.find(x => x.id === id); return c ? c.realname : '#' + id; },
    cardName(id) { const c = this.ptCards.find(x => x.id === id); return c ? c.title : '#' + id; },
    toggleCoach(id) {
      const i = this.form.coach_ids.indexOf(id);
      if (i >= 0) this.form.coach_ids.splice(i, 1); else this.form.coach_ids.push(id);
    },
    toggleCard(id) {
      const i = this.form.card_scope.indexOf(id);
      if (i >= 0) this.form.card_scope.splice(i, 1); else this.form.card_scope.push(id);
    },
    async load() {
      this.loading = true;
      try { this.list = await API.get('/ptrain-courses'); } finally { this.loading = false; }
    },
    async loadDicts() {
      try {
        const [coaches, cards] = await Promise.all([API.get('/coaches', { silent: true }), API.get('/card-categories', { silent: true })]);
        this.coaches = coaches || []; this.ptCards = cards || [];
      } catch (e) { /* ignore */ }
    },
    openAdd() {
      if (!this.canManage) return;
      this.form = { title: '', duration: 60, coach_ids: [], card_scope: [], intro: '', sort: 0, status: 1 };
      this.show = true;
    },
    openEdit(row) {
      this.form = Object.assign(JSON.parse(JSON.stringify(row)), {
        coach_ids: this.parseIds(row.coach_ids), card_scope: this.parseIds(row.card_scope),
      });
      this.show = true;
    },
    async save() {
      if (!this.form.title.trim()) return vant.showToast('请填写课程名称');
      this.saving = true;
      try {
        if (this.form.id) await API.put('/ptrain-courses/' + this.form.id, this.form);
        else await API.post('/ptrain-courses', this.form);
        vant.showToast({ message: '保存成功', icon: 'success' });
        this.show = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); this.loadDicts(); },
};

/* ============ 本文件定义的页面 / 建议路由 ============
  window.Pages.StaffSchedule     -> /staff/schedule-admin  (排课表, /staff/schedule 已被"教练我的课表"占用)
  window.Pages.StaffGroupCourses -> /staff/group-courses   (团课课程库)
  window.Pages.StaffClassrooms   -> /staff/classrooms      (教室管理)
  window.Pages.StaffPtCourses    -> /staff/pt-courses      (私教课程类型)
   以上路由需在 m/js/app.js 的 routes 数组中手动接入（本文件未修改 app.js）。
*/
