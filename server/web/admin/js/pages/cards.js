/* 会员卡列表 */
window.AppPages.Cards = {
  name: 'CardsPage',
  data() {
    return {
      query: { keyword: '', status: '', kind: '', card_type_id: '', expire_within: '', page: 1, size: 20 },
      list: [], total: 0, loading: false,
      cardTypes: [], staffSales: [], coaches: [],
      // 各操作弹窗
      renewDlg: false, renewForm: {}, cur: null,
      pauseDlg: false, pauseForm: { days: 7 },
      refundDlg: false, refundForm: {},
      editDlg: false, editForm: {},
      saving: false,
      Fmt: window.Fmt, DICT: window.DICT,
      role: (Auth.getUser() || {}).role,
    };
  },
  computed: {
    canManage() { return ['admin', 'manager'].includes(this.role); },
    canAdmin() { return ['admin', 'platform'].includes(this.role); },
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-input v-model="query.keyword" placeholder="会员姓名/手机号" clearable style="width:180px" @keyup.enter="search" />
        <el-select v-model="query.status" placeholder="卡状态" clearable style="width:110px">
          <el-option v-for="(v,k) in DICT.cardStatus" :key="k" :value="k" :label="v" />
        </el-select>
        <el-select v-model="query.kind" placeholder="卡种" clearable style="width:110px">
          <el-option v-for="(v,k) in DICT.cardKind" :key="k" :value="k" :label="v" />
        </el-select>
        <el-select v-model="query.card_type_id" placeholder="卡类型" clearable filterable style="width:160px">
          <el-option v-for="c in cardTypes" :key="c.id" :value="c.id" :label="c.title" />
        </el-select>
        <el-select v-model="query.expire_within" placeholder="N天内到期" clearable style="width:120px">
          <el-option :value="7" label="7天内到期" /><el-option :value="15" label="15天内到期" /><el-option :value="30" label="30天内到期" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
        <el-button type="primary" plain @click="$router.push('/card-open')">快速开卡</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="会员" width="120">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname }}</el-link>
            <div class="text-muted">{{ row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="卡类型" min-width="140">
          <template #default="{ row }">
            <el-link @click="$router.push('/cards/' + row.id)">{{ row.card_type_name }}</el-link>
            <div><dict-tag dict="cardKind" :value="row.card_kind" /></div>
          </template>
        </el-table-column>
        <el-table-column label="剩余权益" min-width="130">
          <template #default="{ row }">
            <template v-if="row.card_kind === 3"><span class="money">{{ Fmt.money(row.left_money) }}</span><span class="text-muted"> 余额</span></template>
            <template v-else-if="row.card_kind === 2"><span class="text-muted">时间卡 至</span> {{ Fmt.date(row.expire_time) }}</template>
            <template v-else><b>{{ row.left_counts }}</b><span class="text-muted">/{{ row.counts }}次</span></template>
          </template>
        </el-table-column>
        <el-table-column label="实收" width="100">
          <template #default="{ row }">
            <span class="money">{{ Fmt.money(row.actual_money) }}</span>
            <div class="text-muted" v-if="Number(row.retainage) > 0">尾款{{ Fmt.money(row.retainage) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="开卡时间" width="110"><template #default="{ row }">{{ Fmt.date(row.open_card_time) }}</template></el-table-column>
        <el-table-column label="到期时间" width="110"><template #default="{ row }">{{ Fmt.date(row.expire_time) }}</template></el-table-column>
        <el-table-column label="状态" width="84"><template #default="{ row }"><dict-tag dict="cardStatus" :value="row.status" /></template></el-table-column>
        <el-table-column prop="membership_name" label="业绩归属" width="90" />
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button v-if="[1,2,3].includes(row.status)" link type="primary" size="small" @click="openRenew(row)">续卡</el-button>
            <el-button v-if="row.status === 1" link type="warning" size="small" @click="openPause(row)">暂停</el-button>
            <el-button v-if="row.status === 3" link type="success" size="small" @click="resume(row)">恢复</el-button>
            <el-button v-if="canManage && [0,1,2,3].includes(row.status)" link type="danger" size="small" @click="stop(row)">停卡</el-button>
            <el-button v-if="canManage && row.status === 4" link type="success" size="small" @click="enable(row)">启用</el-button>
            <el-button v-if="canManage && row.status !== 5" link type="danger" size="small" @click="openRefund(row)">退卡</el-button>
            <el-button v-if="canManage" link type="primary" size="small" @click="openEdit(row)">改卡</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, sizes, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" :page-sizes="[20,50,100]"
          @current-change="load" @size-change="search" />
      </div>
    </div>

    <!-- 续卡 -->
    <el-dialog v-model="renewDlg" :title="cur ? '续卡 - ' + cur.realname + ' · ' + cur.card_type_name : '续卡'" width="480px" destroy-on-close>
      <el-form :model="renewForm" label-width="100px">
        <el-form-item label="追加次数" v-if="cur && [1,4].includes(cur.card_kind)">
          <el-input-number v-model="renewForm.add_counts" :min="0" style="width:180px" />
        </el-form-item>
        <el-form-item label="延长天数">
          <el-input-number v-model="renewForm.add_days" :min="0" style="width:180px" />
        </el-form-item>
        <el-form-item label="实收金额" required>
          <el-input-number v-model="renewForm.actual_money" :min="0" :precision="2" style="width:180px" />
        </el-form-item>
        <el-form-item label="赠送金额" v-if="cur && cur.card_kind === 3">
          <el-input-number v-model="renewForm.gift_money" :min="0" :precision="2" style="width:180px" />
        </el-form-item>
        <el-form-item label="支付方式">
          <el-select v-model="renewForm.pay_method" style="width:180px">
            <el-option v-for="(v,k) in DICT.payMethod" :key="k" :value="k" :label="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="业绩归属">
          <el-select v-model="renewForm.membership_id" clearable style="width:180px">
            <el-option v-for="s in staffSales" :key="s.id" :value="s.id" :label="s.realname" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="renewForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renewDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doRenew">确认续卡</el-button>
      </template>
    </el-dialog>

    <!-- 暂停 -->
    <el-dialog v-model="pauseDlg" :title="cur ? '暂停会员卡 - ' + cur.card_type_name : '暂停'" width="400px">
      <el-form label-width="90px">
        <el-form-item label="暂停天数"><el-input-number v-model="pauseForm.days" :min="1" style="width:160px" /></el-form-item>
        <div class="text-muted" style="padding-left:90px">暂停期间到期时间自动顺延，提前恢复将扣回未用天数</div>
      </el-form>
      <template #footer>
        <el-button @click="pauseDlg=false">取消</el-button>
        <el-button type="warning" :loading="saving" @click="doPause">确认暂停</el-button>
      </template>
    </el-dialog>

    <!-- 退卡 -->
    <el-dialog v-model="refundDlg" :title="cur ? '退卡 - ' + cur.realname + ' · ' + cur.card_type_name : '退卡'" width="440px">
      <el-alert type="warning" :closable="false" style="margin-bottom:14px"
        :title="cur ? '实收金额 ' + Fmt.money(cur.actual_money) + '，退卡后该卡不可再使用' : ''" />
      <el-form :model="refundForm" label-width="90px">
        <el-form-item label="退款金额" required><el-input-number v-model="refundForm.refund_money" :min="0" :precision="2" style="width:180px" /></el-form-item>
        <el-form-item label="退款方式">
          <el-select v-model="refundForm.pay_method" style="width:180px">
            <el-option v-for="(v,k) in DICT.payMethod" :key="k" :value="k" :label="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="退卡原因"><el-input v-model="refundForm.reason" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundDlg=false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="doRefund">确认退卡</el-button>
      </template>
    </el-dialog>

    <!-- 改卡 -->
    <el-dialog v-model="editDlg" :title="cur ? '改卡 - ' + cur.realname + ' · ' + cur.card_type_name : '改卡'" width="480px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="到期时间">
          <el-date-picker v-model="editForm.expire_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width:220px" />
        </el-form-item>
        <el-form-item label="制卡总次数" v-if="cur && is300PtCard(cur) && canAdmin">
          <el-input-number v-model="editForm.counts" :min="1" style="width:180px" />
          <div class="text-muted" style="font-size:12px;margin-top:2px">仅 300 元/节私教次卡支持修改制卡次数（管理员权限）</div>
        </el-form-item>
        <el-form-item label="剩余次数" v-if="cur && [1,4].includes(cur.card_kind)">
          <el-input-number v-model="editForm.left_counts" :min="0" style="width:180px" />
        </el-form-item>
        <el-form-item label="余额" v-if="cur && cur.card_kind === 3">
          <el-input-number v-model="editForm.left_money" :min="0" :precision="2" style="width:180px" />
        </el-form-item>
        <el-form-item label="业绩归属">
          <el-select v-model="editForm.membership_id" clearable style="width:180px">
            <el-option v-for="s in staffSales" :key="s.id" :value="s.id" :label="s.realname" />
          </el-select>
        </el-form-item>
        <el-form-item label="服务教练">
          <el-select v-model="editForm.coach_id" clearable style="width:180px">
            <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
          </el-select>
        </el-form-item>
        <el-form-item label="改卡原因" required><el-input v-model="editForm.reason" placeholder="将记入操作日志" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doEdit">保存修改</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    is300PtCard(c) {
      if (!c || c.card_kind !== 4) return false;
      const unit = Math.round(Number(c.unit_price || 0));
      return unit === 300 || (c.card_type_name && c.card_type_name.includes('300'));
    },
    async load(silent = false) {
      if (!silent) this.loading = true;
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      try {
        const d = await api.get('/cards', this.query);
        this.list = d.list; this.total = d.total;
      } finally {
        if (!silent) this.loading = false;
        if (silent) {
          this.$nextTick(() => {
            window.scrollTo({ top: scrollY, behavior: 'instant' });
          });
        }
      }
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { keyword: '', status: '', kind: '', card_type_id: '', expire_within: '', page: 1, size: 20 }; this.load(); },
    exportCsv() { window.open(api.exportUrl('/cards', Object.assign({}, this.query, { page: undefined, size: undefined }))); },
    async loadDicts() {
      const [cats, staff, coaches] = await Promise.all([api.get('/card-categories'), api.get('/staff'), api.get('/coaches')]);
      this.cardTypes = cats;
      this.staffSales = staff.filter(s => s.role === 'membership' && s.status === 1);
      this.coaches = coaches;
    },
    openRenew(row) {
      this.cur = row;
      this.renewForm = { add_counts: 0, add_days: 0, actual_money: 0, gift_money: 0, pay_method: 'wechat', membership_id: null, remark: '' };
      this.renewDlg = true;
    },
    async doRenew() {
      const f = this.renewForm;
      const sale = this.staffSales.find(x => x.id === f.membership_id);
      this.saving = true;
      try {
        await api.post('/cards/' + this.cur.id + '/renew', Object.assign({}, f, {
          membership_name: sale ? sale.realname : undefined,
        }));
        ElementPlus.ElMessage.success('续卡成功');
        this.renewDlg = false;
        this.load(true);
      } finally { this.saving = false; }
    },
    openPause(row) { this.cur = row; this.pauseForm = { days: 7 }; this.pauseDlg = true; },
    async doPause() {
      this.saving = true;
      try {
        await api.post('/cards/' + this.cur.id + '/pause', { days: this.pauseForm.days });
        ElementPlus.ElMessage.success('已暂停');
        this.pauseDlg = false;
        this.load(true);
      } finally { this.saving = false; }
    },
    resume(row) {
      ElementPlus.ElMessageBox.confirm('确定恢复该卡？未用完的暂停天数将从到期时间扣回。', '恢复会员卡', { type: 'warning' })
        .then(async () => {
          await api.post('/cards/' + row.id + '/resume');
          ElementPlus.ElMessage.success('已恢复');
          this.load(true);
        }).catch(() => {});
    },
    stop(row) {
      ElementPlus.ElMessageBox.prompt('停卡后会员将无法使用该卡，请填写停卡原因：', '停卡 - ' + row.realname + ' · ' + row.card_type_name, {
        confirmButtonText: '确认停卡', cancelButtonText: '取消', type: 'warning',
      }).then(async ({ value }) => {
        await api.post('/cards/' + row.id + '/stop', { reason: value || '' });
        ElementPlus.ElMessage.success('已停卡');
        this.load(true);
      }).catch(() => {});
    },
    enable(row) {
      ElementPlus.ElMessageBox.confirm('确定重新启用该卡？', '启用会员卡', { type: 'warning' })
        .then(async () => {
          await api.post('/cards/' + row.id + '/enable');
          ElementPlus.ElMessage.success('已启用');
          this.load(true);
        }).catch(() => {});
    },
    openRefund(row) {
      this.cur = row;
      this.refundForm = { refund_money: Number(row.actual_money), pay_method: row.pay_method || 'cash', reason: '' };
      this.refundDlg = true;
    },
    async doRefund() {
      if (this.refundForm.refund_money == null) return ElementPlus.ElMessage.warning('请填写退款金额');
      this.saving = true;
      try {
        await api.post('/cards/' + this.cur.id + '/refund', this.refundForm);
        ElementPlus.ElMessage.success('退卡完成');
        this.refundDlg = false;
        this.load(true);
      } finally { this.saving = false; }
    },
    openEdit(row) {
      this.cur = row;
      this.editForm = {
        expire_time: row.expire_time, counts: row.counts, left_counts: row.left_counts, left_money: Number(row.left_money || 0),
        membership_id: row.membership_id || null, coach_id: row.coach_id || null, reason: '',
      };
      this.editDlg = true;
    },
    async doEdit() {
      const is300 = this.is300PtCard(this.cur);
      if (!this.editForm.reason && !(is300 && this.editForm.counts !== this.cur.counts)) {
        return ElementPlus.ElMessage.warning('请填写改卡原因');
      }
      const f = this.editForm;
      const sale = this.staffSales.find(x => x.id === f.membership_id);
      const coach = this.coaches.find(x => x.id === f.coach_id);
      const body = { expire_time: f.expire_time, reason: f.reason || '修改300元私教卡次数' };
      if (is300 && f.counts != null) body.counts = f.counts;
      if ([1, 4].includes(this.cur.card_kind)) body.left_counts = f.left_counts;
      if (this.cur.card_kind === 3) body.left_money = f.left_money;
      if (f.membership_id != null) { body.membership_id = f.membership_id; body.membership_name = sale ? sale.realname : ''; }
      if (f.coach_id != null) { body.coach_id = f.coach_id; body.coach_name = coach ? coach.realname : ''; }
      this.saving = true;
      try {
        await api.put('/cards/' + this.cur.id, body);
        ElementPlus.ElMessage.success('改卡成功');
        this.editDlg = false;
        this.load(true);
      } finally { this.saving = false; }
    },
  },
  mounted() {
    if (this.$route.query.status != null) this.query.status = String(this.$route.query.status);
    this.load();
    this.loadDicts();
  },
};
