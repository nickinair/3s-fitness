/* 私教预约管理 */
window.AppPages.PtBookings = {
  name: 'PtBookingsPage',
  data() {
    return {
      clubs: [],
      query: { date: '', status: '', coach_id: '', keyword: '', page: 1, size: 20 },
      list: [], total: 0, loading: false,
      coaches: [], courses: [],
      // 代约
      dlg: false, saving: false,
      bkForm: { vip_id: null, coach_id: null, course_id: null, date: dayjs().format('YYYY-MM-DD'), from_time: '', card_id: null, remark: '' },
      memberCards: [], slots: [],
      Fmt: window.Fmt, DICT: window.DICT,
      role: (Auth.getUser() || {}).role,
      myCoachId: (Auth.getUser() || {}).coach_id || null,
    };
  },
  computed: {
    canFinish() { return ['admin', 'manager', 'reception', 'coach'].includes(this.role); },
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-date-picker v-model="query.date" type="date" value-format="YYYY-MM-DD" placeholder="预约日期" style="width:140px" />
        <el-select v-model="query.status" placeholder="状态" clearable style="width:110px">
          <el-option v-for="(v,k) in DICT.ptStatus" :key="k" :value="k" :label="v" />
        </el-select>
        <el-select v-if="role !== 'coach'" v-model="query.coach_id" placeholder="教练" clearable style="width:120px">
          <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="会员/手机号" clearable style="width:160px" @keyup.enter="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button v-if="['admin','manager','coach'].includes(role)" type="primary" plain @click="openBook">私教代约</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="日期" width="100"><template #default="{ row }">{{ Fmt.date(row.date) }}</template></el-table-column>
        <el-table-column label="时段" width="110"><template #default="{ row }">{{ row.from_time }}-{{ row.to_time }}</template></el-table-column>
        <el-table-column label="会员" width="120">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname }}</el-link>
            <div class="text-muted">{{ row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="coach_name" label="上课教练" width="90" />
        <el-table-column prop="course_title" label="课程" min-width="110" show-overflow-tooltip />
        <el-table-column prop="card_type_name" label="扣课卡" min-width="120" show-overflow-tooltip />
        <el-table-column prop="remark" label="备注(代约人)" min-width="120" show-overflow-tooltip />
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <dict-tag dict="ptStatus" :value="row.status" />
            <el-tag v-if="row.status === 1 && row.confirm_status === 1" type="warning" size="small" style="margin-left:4px">待学员确认</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 0" link type="success" size="small" @click="confirm(row)">确认</el-button>
            <el-button v-if="[0,1].includes(row.status)" link type="danger" size="small" @click="cancel(row)">取消</el-button>
            <el-button v-if="row.status === 1 && isPast(row)" link type="warning" size="small" @click="noshow(row)">爽约</el-button>
            <el-button v-if="row.status === 1 && isPast(row) && row.confirm_status !== 1" link type="primary" size="small" @click="startFinish(row)">发起消课</el-button>
            <el-button v-if="canFinish && row.status === 1" link type="primary" size="small" @click="finish(row)">{{ role === 'coach' ? '确认销课' : '代确认消课' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" @current-change="load" />
      </div>
    </div>

    <!-- 私教代约 -->
    <el-dialog v-model="dlg" title="私教代约" width="520px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item v-if="clubs.length > 1" label="上课门店" required>
          <el-radio-group v-model="bkForm.club_id">
            <el-radio-button v-for="c in clubs" :key="c.id" :value="c.id">{{ c.name }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="会员" required>
          <member-select v-model="bkForm.vip_id" @select="onMember" />
        </el-form-item>
        <el-form-item label="扣课卡" required>
          <el-select v-model="bkForm.card_id" style="width:100%" placeholder="选择会员的卡（任意卡种均可）" no-data-text="该会员无可用会员卡">
            <el-option v-for="c in memberCards" :key="c.id" :value="c.id"
              :label="c.card_type_name + ([1,4].includes(c.card_kind) ? '（剩' + c.left_counts + '次）' : (c.card_kind === 3 ? '（余额¥' + c.left_money + '）' : '（时间卡不限次）'))"
              :disabled="[1,4].includes(c.card_kind) ? c.left_counts < 1 : (c.card_kind === 3 && Number(c.left_money) <= 0)" />
          </el-select>
        </el-form-item>
        <el-form-item label="课程" required>
          <el-select v-model="bkForm.course_id" style="width:100%" @change="loadSlots">
            <el-option v-for="c in courses.filter(x => x.status === 1)" :key="c.id" :value="c.id" :label="c.title + '（' + c.duration + '分钟）'" />
          </el-select>
        </el-form-item>
        <el-form-item label="教练" required>
          <el-select v-model="bkForm.coach_id" style="width:100%" :disabled="role === 'coach'" @change="loadSlots">
            <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
          </el-select>
          <div v-if="role === 'coach'" class="text-muted" style="font-size:12px">教练代约只能约到自己名下</div>
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="bkForm.date" type="date" value-format="YYYY-MM-DD" :clearable="false" style="width:100%" @change="loadSlots" />
        </el-form-item>
        <el-form-item label="时段" required>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <el-button v-for="s in slots" :key="s.from_time" size="small"
              :type="bkForm.from_time === s.from_time ? 'primary' : (s.available ? 'default' : 'info')"
              :disabled="!s.available" @click="bkForm.from_time = s.from_time">
              {{ s.from_time }}{{ s.available ? '' : '·' + s.reason }}
            </el-button>
            <span v-if="!slots.length" class="text-muted">请先选择教练/课程/日期</span>
          </div>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="bkForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doBook">提交预约</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    isPast(row) { return dayjs(Fmt.date(row.date) + ' ' + row.from_time).isBefore(dayjs()); },
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/ptrain-bookings', this.query);
        this.list = d.list; this.total = d.total;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { date: '', status: '', coach_id: '', keyword: '', page: 1, size: 20 }; this.load(); },
    async loadDicts() {
      const [coaches, courses] = await Promise.all([api.get('/coaches', { status: 1 }), api.get('/ptrain-courses')]);
      this.coaches = coaches; this.courses = courses;
    },
    confirm(row) {
      ElementPlus.ElMessageBox.confirm('确认该私教预约（' + row.realname + ' ' + row.date + ' ' + row.from_time + '）？', '确认预约', { type: 'info' })
        .then(async () => {
          await api.post('/ptrain-bookings/' + row.id + '/confirm');
          ElementPlus.ElMessage.success('已确认');
          this.load();
        }).catch(() => {});
    },
    cancel(row) {
      ElementPlus.ElMessageBox.prompt('取消预约（' + row.realname + ' ' + Fmt.date(row.date) + ' ' + row.from_time + '），请填写原因：', '取消预约', {
        confirmButtonText: '确认取消', cancelButtonText: '返回', type: 'warning',
      }).then(async ({ value }) => {
        await api.post('/ptrain-bookings/' + row.id + '/cancel', { reason: value || '' });
        ElementPlus.ElMessage.success('已取消');
        this.load();
      }).catch(() => {});
    },
    noshow(row) {
      ElementPlus.ElMessageBox.confirm('标记「' + row.realname + '」爽约？爽约将计入会员30天爽约统计。', '标记爽约', { type: 'warning' })
        .then(async () => {
          await api.post('/ptrain-bookings/' + row.id + '/noshow');
          ElementPlus.ElMessage.success('已标记爽约');
          this.load();
        }).catch(() => {});
    },
    startFinish(row) {
      ElementPlus.ElMessageBox.confirm('发起消课后学员将在小程序确认，确认后自动扣课时。', '发起消课', { type: 'info' })
        .then(async () => {
          await api.post('/ptrain-bookings/' + row.id + '/start-finish');
          ElementPlus.ElMessage.success('已发起消课，等待学员确认');
          this.load();
        }).catch(() => {});
    },
    finish(row) {
      ElementPlus.ElMessageBox.confirm('代学员确认消课，将立即扣减课时并生成消课记录。', '代确认消课 - ' + row.realname, { type: 'warning', confirmButtonText: '确认消课' })
        .then(async () => {
          await api.post('/ptrain-bookings/' + row.id + '/finish', {});
          ElementPlus.ElMessage.success('消课完成');
          this.load();
        }).catch(() => {});
    },
    openBook() {
      this.bkForm = { club_id: (Auth.getClubId() && Auth.getClubId() !== 'all') ? Number(Auth.getClubId()) : ((this.clubs[0] || {}).id || null), vip_id: null, coach_id: null, course_id: null, date: dayjs().format('YYYY-MM-DD'), from_time: '', card_id: null, remark: '' };
      if (!this.clubs.length) api.get('/clubs').then(cs => { this.clubs = cs; if (!this.bkForm.club_id && cs.length) this.bkForm.club_id = cs[0].id; });
      if (this.role === 'coach' && this.myCoachId) this.bkForm.coach_id = this.myCoachId;
      this.memberCards = []; this.slots = [];
      this.dlg = true;
    },
    async onMember(m) {
      this.bkForm.card_id = null;
      this.memberCards = [];
      if (!m) return;
      const d = await api.get('/cards', { vip_id: m.id, size: 50 });
      this.memberCards = (d.list || []).filter(c => [0, 1].includes(c.status));
    },
    async loadSlots() {
      this.bkForm.from_time = '';
      this.slots = [];
      if (!this.bkForm.coach_id || !this.bkForm.date) return;
      const course = this.courses.find(x => x.id === this.bkForm.course_id);
      this.slots = await api.get('/coaches/' + this.bkForm.coach_id + '/slots', {
        date: this.bkForm.date, duration: course ? course.duration : 60,
      });
    },
    async doBook() {
      const f = this.bkForm;
      if (!f.vip_id || !f.card_id || !f.course_id || !f.coach_id || !f.date || !f.from_time) {
        return ElementPlus.ElMessage.warning('请完整选择会员/扣课卡/课程/教练/时段');
      }
      this.saving = true;
      try {
        await api.post('/ptrain-bookings', f);
        ElementPlus.ElMessage.success('代约成功（已确认）');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); this.loadDicts(); },
};
