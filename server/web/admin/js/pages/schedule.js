/* 排课表周视图 */
window.AppPages.Schedule = {
  name: 'SchedulePage',
  data() {
    const monday = dayjs().subtract((dayjs().day() + 6) % 7, 'day').format('YYYY-MM-DD');
    return {
      weekStart: monday,
      list: [], loading: false,
      coachFilter: '',
      coaches: [], courses: [], classrooms: [], clubs: [],
      allStores: (Auth.getUser() || {}).role === 'admin' && (!Auth.getClubId() || Auth.getClubId() === 'all'),
      // 详情抽屉
      drawer: false, detail: null, detailLoading: false,
      // 代约
      bookForm: { vip_id: null, card_id: null }, memberCards: [], booking: false,
      // 新增排课
      addDlg: false, addForm: {}, saving: false,
      Fmt: window.Fmt, DICT: window.DICT,
      role: (Auth.getUser() || {}).role,
    };
  },
  computed: {
    canManage() { return ['admin', 'manager'].includes(this.role); },
    days() {
      const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      return Array.from({ length: 7 }, (_, i) => {
        const d = dayjs(this.weekStart).add(i, 'day');
        return {
          date: d.format('YYYY-MM-DD'),
          label: names[i],
          dayNum: d.format('MM-DD'),
          isToday: d.format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD'),
        };
      });
    },
    byDay() {
      const map = {};
      this.days.forEach(d => { map[d.date] = []; });
      this.list.forEach(s => {
        const d = dayjs(s.start_time).format('YYYY-MM-DD');
        if (map[d]) map[d].push(s);
      });
      return map;
    },
    weekLabel() {
      return dayjs(this.weekStart).format('YYYY年MM月DD日') + ' - ' + dayjs(this.weekStart).add(6, 'day').format('MM月DD日');
    },
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar" style="margin-bottom:8px">
        <el-button-group>
          <el-button @click="shiftWeek(-1)"><el-icon><ArrowLeft /></el-icon> 上一周</el-button>
          <el-button @click="goToday">本周</el-button>
          <el-button @click="shiftWeek(1)">下一周 <el-icon><ArrowRight /></el-icon></el-button>
        </el-button-group>
        <span style="font-weight:600;color:var(--text-main);margin-left:8px">{{ weekLabel }}</span>
        <el-select v-model="coachFilter" placeholder="全部教练" clearable style="width:130px;margin-left:8px" @change="load">
          <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
        </el-select>
        <div style="flex:1"></div>
        <el-dropdown @command="exportCsv">
          <el-button><el-icon><Download /></el-icon>&nbsp;导出CSV<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="syllabus">排课表</el-dropdown-item>
            <el-dropdown-item command="bookings">团课预约名单</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <template v-if="canManage">
          <el-button @click="copyLastWeek"><el-icon><CopyDocument /></el-icon>&nbsp;复制上周排课</el-button>
          <el-button type="primary" @click="openAdd">新增排课</el-button>
        </template>
      </div>
      <div class="week-grid" v-loading="loading">
        <div v-for="d in days" :key="d.date" class="week-day" :class="{ today: d.isToday }">
          <div class="day-head">{{ d.label }}<b>{{ d.dayNum }}</b></div>
          <div v-for="s in byDay[d.date]" :key="s.id" class="class-card"
            :class="{ cancelled: s.status === 2, finished: s.status === 3, full: s.booked_count >= s.people_count && s.status === 1 }"
            @click="openDetail(s)">
            <div class="tm">{{ dayjs(s.start_time).format('HH:mm') }}-{{ dayjs(s.end_time).format('HH:mm') }}
              <el-tag v-if="s.status === 2" type="info" size="small">已取消</el-tag>
              <el-tag v-else-if="s.status === 3" type="primary" size="small">已结课</el-tag>
            </div>
            <div class="tt">{{ s.title }}</div>
            <div class="sub">{{ s.coach_name || '未排教练' }} · {{ s.classroom_name || '未排教室' }}</div>
            <div v-if="allStores && clubs.length > 1" class="sub" style="color:var(--brand)">{{ (clubs.find(c => c.id === s.club_id) || {}).name }}</div>
            <div class="cnt">已约 {{ s.booked_count }} / 满员 {{ s.people_count }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 课程详情抽屉 -->
    <el-drawer v-model="drawer" :title="detail ? detail.syllabus.title : '课程详情'" size="560px" destroy-on-close>
      <div v-loading="detailLoading" v-if="detail">
        <div class="card-box" style="background:var(--bg-sunken);box-shadow:none">
          <div class="profile-grid" style="grid-template-columns:repeat(2,1fr)">
            <div><span class="lab">时间</span>{{ Fmt.time(detail.syllabus.start_time) }} ~ {{ dayjs(detail.syllabus.end_time).format('HH:mm') }}</div>
            <div><span class="lab">状态</span><dict-tag dict="syllabusStatus" :value="detail.syllabus.status" /></div>
            <div><span class="lab">教练</span>{{ detail.syllabus.coach_name || '-' }}</div>
            <div><span class="lab">教室</span>{{ detail.syllabus.classroom_name || '-' }}</div>
            <div><span class="lab">已约/满员</span>{{ detail.syllabus.booked_count }}/{{ detail.syllabus.people_count }}</div>
            <div><span class="lab">扣次</span>{{ detail.syllabus.deduct_num }} 次/人</div>
          </div>
        </div>
        <div class="box-title" style="margin-top:6px">预约名单（{{ detail.bookings.length }}）</div>
        <el-table border :data="detail.bookings" size="small" max-height="360">
          <el-table-column label="会员" min-width="110">
            <template #default="{ row }">
              <div>{{ row.realname }}</div>
              <div class="text-muted">{{ row.phone }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="card_type_name" label="扣课卡" min-width="110" show-overflow-tooltip />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <dict-tag dict="groupBookStatus" :value="row.status" />
              <div class="text-muted" v-if="row.status === 0">#{{ row.queue_no }}</div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button v-if="row.status === 1" link type="success" size="small" @click="checkinBooking(row)">核销</el-button>
              <el-button v-if="[0,1].includes(row.status)" link type="danger" size="small" @click="cancelBooking(row)">取消</el-button>
            </template>
          </el-table-column>
        </el-table>

        <template v-if="detail.syllabus.status === 1">
          <div class="box-title" style="margin-top:16px">代约会员</div>
          <div style="display:flex;gap:8px;align-items:flex-start">
            <div style="flex:1"><member-select v-model="bookForm.vip_id" @select="onBookMember" /></div>
            <el-select v-model="bookForm.card_id" placeholder="选扣课卡" style="width:190px" no-data-text="无可用次卡/时间卡">
              <el-option v-for="c in memberCards" :key="c.id" :value="c.id"
                :label="c.card_type_name + ([1,4].includes(c.card_kind) ? '（剩' + c.left_counts + '次）' : (c.card_kind === 3 ? '（余额¥' + c.left_money + '）' : '（时间卡不限次）'))"
                :disabled="![0,1].includes(c.status)" />
            </el-select>
            <el-button type="primary" :loading="booking" @click="doBook">代约</el-button>
          </div>
          <div style="display:flex;gap:10px;margin-top:22px" v-if="canManage || role === 'reception'">
            <el-button v-if="canManage" type="danger" plain @click="cancelClass">取消课程</el-button>
            <el-button type="warning" plain v-if="isEnded" @click="settle">课后结算（未到→爽约）</el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <!-- 新增排课 -->
    <el-dialog v-model="addDlg" title="新增排课" width="520px" destroy-on-close>
      <el-form :model="addForm" label-width="100px">
        <el-form-item v-if="clubs.length > 1 && role === 'admin'" label="排课门店" required>
          <el-radio-group v-model="addForm.club_id">
            <el-radio-button v-for="c in clubs" :key="c.id" :value="c.id">{{ c.name }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="团课课程" required>
          <el-select v-model="addForm.group_id" style="width:100%" @change="onCourseChange">
            <el-option v-for="c in courses.filter(x => x.status === 1)" :key="c.id" :value="c.id" :label="c.title + '（' + c.duration + '分钟）'" />
          </el-select>
        </el-form-item>
        <el-form-item label="教练">
          <el-select v-model="addForm.coach_id" clearable style="width:100%">
            <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
          </el-select>
        </el-form-item>
        <el-form-item label="教室">
          <el-select v-model="addForm.classroom_id" clearable style="width:100%" @change="onRoomChange">
            <el-option v-for="c in classrooms" :key="c.id" :value="c.id" :label="c.title + '（容纳' + c.capacity + '人）'" />
          </el-select>
        </el-form-item>
        <el-form-item label="开课时间" required>
          <el-date-picker v-model="addForm.start_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" format="YYYY-MM-DD HH:mm" style="width:100%" />
        </el-form-item>
        <el-form-item label="满员人数"><el-input-number v-model="addForm.people_count" :min="1" style="width:160px" /></el-form-item>
        <el-form-item label="开课下限"><el-input-number v-model="addForm.lower_limit" :min="0" style="width:160px" /></el-form-item>
        <el-form-item label="扣卡次数"><el-input-number v-model="addForm.deduct_num" :min="0" style="width:160px" /></el-form-item>
        <el-form-item label="会员可自约"><el-switch v-model="addForm.is_vipuser_sub" :active-value="1" :inactive-value="0" /></el-form-item>
        <el-form-item label="会员可自取消"><el-switch v-model="addForm.self_cancel" :active-value="1" :inactive-value="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doAdd">保存排课</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    dayjs,
    async load() {
      this.loading = true;
      try {
        this.list = await api.get('/syllabus', {
          from: this.weekStart,
          to: dayjs(this.weekStart).add(6, 'day').format('YYYY-MM-DD'),
          coach_id: this.coachFilter || undefined,
        });
      } finally { this.loading = false; }
    },
    exportCsv(kind) {
      const p = {
        from: this.weekStart,
        to: dayjs(this.weekStart).add(6, 'day').format('YYYY-MM-DD'),
        coach_id: this.coachFilter || undefined,
      };
      window.open(api.exportUrl(kind === 'bookings' ? '/syllabus-bookings' : '/syllabus', p));
    },
    shiftWeek(n) { this.weekStart = dayjs(this.weekStart).add(n * 7, 'day').format('YYYY-MM-DD'); this.load(); },
    goToday() { this.weekStart = dayjs().subtract((dayjs().day() + 6) % 7, 'day').format('YYYY-MM-DD'); this.load(); },
    async loadDicts() {
      const [coaches, courses, rooms] = await Promise.all([
        api.get('/coaches', { status: 1 }), api.get('/group-courses'), api.get('/classrooms'),
      ]);
      this.coaches = coaches; this.courses = courses; this.classrooms = rooms;
      try { this.clubs = await api.get('/clubs'); } catch (e) { this.clubs = []; }
    },
    async openDetail(s) {
      this.drawer = true;
      this.detailLoading = true;
      this.bookForm = { vip_id: null, card_id: null };
      this.memberCards = [];
      try { this.detail = await api.get('/syllabus/' + s.id); }
      finally { this.detailLoading = false; }
    },
    async refreshDetail() {
      if (!this.detail) return;
      this.detail = await api.get('/syllabus/' + this.detail.syllabus.id);
      this.load();
    },
    checkinBooking(row) {
      ElementPlus.ElMessageBox.confirm('核销「' + row.realname + '」到课？将扣减 ' + row.card_deduct_num + ' 次并生成耗课流水。', '到课核销', { type: 'info' })
        .then(async () => {
          await api.post('/syllabus-bookings/' + row.id + '/checkin');
          ElementPlus.ElMessage.success('已核销');
          this.refreshDetail();
        }).catch(() => {});
    },
    cancelBooking(row) {
      ElementPlus.ElMessageBox.prompt('取消「' + row.realname + '」的预约，候补将自动转正。原因：', '取消预约', {
        confirmButtonText: '确认取消', cancelButtonText: '返回', type: 'warning',
      }).then(async ({ value }) => {
        const d = await api.post('/syllabus-bookings/' + row.id + '/cancel', { reason: value || '' });
        ElementPlus.ElMessage.success(d && d.penalty ? '已取消（' + d.penalty + '）' : '已取消');
        this.refreshDetail();
      }).catch(() => {});
    },
    async onBookMember(m) {
      this.bookForm.card_id = null;
      this.memberCards = [];
      if (!m) return;
      const d = await api.get('/cards', { vip_id: m.id, size: 50 });
      this.memberCards = d.list.filter(c => [0, 1].includes(c.status) && (![1, 4].includes(c.card_kind) || c.left_counts > 0) && (c.card_kind !== 3 || Number(c.left_money) > 0));
    },
    async doBook() {
      if (!this.bookForm.vip_id || !this.bookForm.card_id) return ElementPlus.ElMessage.warning('请选择会员与扣课卡');
      this.booking = true;
      try {
        const d = await api.post('/syllabus/' + this.detail.syllabus.id + '/book', this.bookForm);
        if (d && d.waitlist) ElementPlus.ElMessage.warning('课程已满员，已进入候补队列（第' + d.queue_no + '位）');
        else ElementPlus.ElMessage.success('代约成功');
        this.bookForm = { vip_id: null, card_id: null };
        this.memberCards = [];
        this.refreshDetail();
      } finally { this.booking = false; }
    },
    cancelClass() {
      ElementPlus.ElMessageBox.prompt('取消课程将释放全部预约（已约会员自动取消），请填写原因：', '取消课程 - ' + this.detail.syllabus.title, {
        confirmButtonText: '确认取消课程', cancelButtonText: '返回', type: 'warning',
      }).then(async ({ value }) => {
        await api.post('/syllabus/' + this.detail.syllabus.id + '/cancel', { reason: value || '' });
        ElementPlus.ElMessage.success('课程已取消');
        this.drawer = false;
        this.load();
      }).catch(() => {});
    },
    settle() {
      ElementPlus.ElMessageBox.confirm('课后结算：未核销的已约会员将标记为爽约，候补作废，课程结课。', '课后结算', { type: 'warning', confirmButtonText: '确认结算' })
        .then(async () => {
          const d = await api.post('/syllabus/' + this.detail.syllabus.id + '/settle');
          ElementPlus.ElMessage.success('已结算，爽约 ' + (d ? d.noshow : 0) + ' 人');
          this.drawer = false;
          this.load();
        }).catch(() => {});
    },
    copyLastWeek() {
      const from = dayjs(this.weekStart).subtract(7, 'day').format('YYYY-MM-DD');
      ElementPlus.ElMessageBox.confirm('将 ' + from + ' 起一周的排课复制到本周（' + this.weekStart + ' 起），已过期与重复课程自动跳过。', '复制上周排课', { type: 'info' })
        .then(async () => {
          const d = await api.post('/syllabus/copy-week', { from_week_start: from, to_week_start: this.weekStart });
          ElementPlus.ElMessage.success('复制完成，新增 ' + (d ? d.created : 0) + ' 节课');
          this.load();
        }).catch(() => {});
    },
    openAdd() {
      this.addForm = {
        club_id: (Auth.getClubId() && Auth.getClubId() !== 'all') ? Number(Auth.getClubId()) : null,
        group_id: null, coach_id: null, classroom_id: null,
        start_time: dayjs().add(1, 'day').hour(10).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss'),
        people_count: 20, lower_limit: 0, deduct_num: 1, is_vipuser_sub: 1, self_cancel: 1,
      };
      this.addDlg = true;
    },
    onCourseChange(v) {
      const c = this.courses.find(x => x.id === v);
      if (c) this.addForm.deduct_num = c.deduct_num;
    },
    onRoomChange(v) {
      const r = this.classrooms.find(x => x.id === v);
      if (r) this.addForm.people_count = r.capacity;
    },
    async doAdd() {
      if (this.clubs.length > 1 && this.role === 'admin' && !this.addForm.club_id) return ElementPlus.ElMessage.warning('请选择排课门店');
      if (!this.addForm.group_id || !this.addForm.start_time) return ElementPlus.ElMessage.warning('请选择课程与开课时间');
      this.saving = true;
      try {
        await api.post('/syllabus', this.addForm);
        ElementPlus.ElMessage.success('排课成功');
        this.addDlg = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  computed2: {},
  mounted() { this.load(); this.loadDicts(); },
};
// 计算属性补充: 课程是否已结束
window.AppPages.Schedule.computed.isEnded = function () {
  return this.detail && dayjs(this.detail.syllabus.end_time).isBefore(dayjs());
};
delete window.AppPages.Schedule.computed2;
