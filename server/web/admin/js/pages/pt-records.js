/* 消课记录 + 补消课 */
window.AppPages.PtRecords = {
  name: 'PtRecordsPage',
  data() {
    return {
      query: { month: dayjs().format('YYYY-MM'), coach_id: '', page: 1, size: 20 },
      list: [], total: 0, loading: false, coaches: [],
      dlg: false, saving: false,
      form: { vip_id: null, card_id: null, coach_id: null, costs: 1, remark: '' },
      memberCards: [],
      Fmt: window.Fmt, DICT: window.DICT,
      role: (Auth.getUser() || {}).role,
    };
  },
  computed: {
    canManual() { return ['admin', 'manager'].includes(this.role); },
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-date-picker v-model="query.month" type="month" value-format="YYYY-MM" placeholder="月份" style="width:130px" />
        <el-select v-if="role !== 'coach'" v-model="query.coach_id" placeholder="教练" clearable style="width:120px">
          <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
        <el-button v-if="canManual" type="primary" plain @click="openManual">补消课</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="消课时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="会员" width="110">
          <template #default="{ row }"><el-link type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname }}</el-link></template>
        </el-table-column>
        <el-table-column prop="coach_name" label="教练" width="90" />
        <el-table-column prop="costs" label="课时数" width="70" />
        <el-table-column label="课时单价" width="100"><template #default="{ row }">{{ Fmt.money(row.unit_price) }}</template></el-table-column>
        <el-table-column label="耗课金额" width="110"><template #default="{ row }"><span class="money">{{ Fmt.money(row.spend_money) }}</span></template></el-table-column>
        <el-table-column label="来源" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.bespeak_id ? 'primary' : 'warning'">{{ row.bespeak_id ? '预约消课' : '补消课' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reception_remark" label="备注" min-width="160" show-overflow-tooltip />
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" @current-change="load" />
      </div>
    </div>

    <!-- 补消课 -->
    <el-dialog v-model="dlg" title="补消课（无预约直接扣课时）" width="480px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="会员" required><member-select v-model="form.vip_id" @select="onMember" /></el-form-item>
        <el-form-item label="私教卡" required>
          <el-select v-model="form.card_id" style="width:100%" placeholder="选择会员的私教卡" no-data-text="该会员无私教卡">
            <el-option v-for="c in memberCards" :key="c.id" :value="c.id"
              :label="c.card_type_name + '（剩' + c.left_counts + '次）'" :disabled="![0,1].includes(c.status) || c.left_counts < 1" />
          </el-select>
        </el-form-item>
        <el-form-item label="教练" required>
          <el-select v-model="form.coach_id" style="width:100%">
            <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
          </el-select>
        </el-form-item>
        <el-form-item label="课时数" required><el-input-number v-model="form.costs" :min="1" :max="20" style="width:160px" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" placeholder="补消课原因" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doManual">确认扣课</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/ptrain-records', this.query);
        this.list = d.list; this.total = d.total;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { month: dayjs().format('YYYY-MM'), coach_id: '', page: 1, size: 20 }; this.load(); },
    exportCsv() {
      window.open(api.exportUrl('/ptrain-records', Object.assign({}, this.query, { page: undefined, size: undefined })));
    },
    openManual() {
      this.form = { vip_id: null, card_id: null, coach_id: null, costs: 1, remark: '' };
      this.memberCards = [];
      this.dlg = true;
    },
    async onMember(m) {
      this.form.card_id = null;
      this.memberCards = [];
      if (!m) return;
      const d = await api.get('/cards', { vip_id: m.id, size: 50 });
      this.memberCards = d.list;
    },
    doManual() {
      const f = this.form;
      if (!f.vip_id || !f.card_id || !f.coach_id) return ElementPlus.ElMessage.warning('请完整填写');
      ElementPlus.ElMessageBox.confirm('确认补扣 ' + f.costs + ' 课时？此操作立即生效并生成耗课流水。', '补消课确认', { type: 'warning' })
        .then(async () => {
          this.saving = true;
          try {
            await api.post('/ptrain-records/manual', f);
            ElementPlus.ElMessage.success('补消课完成');
            this.dlg = false;
            this.load();
          } finally { this.saving = false; }
        }).catch(() => {});
    },
  },
  async mounted() {
    this.coaches = await api.get('/coaches');
    this.load();
  },
};
