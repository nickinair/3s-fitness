/* 会员列表 */
window.AppPages.Members = {
  name: 'MembersPage',
  data() {
    return {
      tab: 'active',
      user: Auth.getUser() || {},
      query: { keyword: '', card_type_id: '', membership_id: '', coach_id: '', expire_within: '', club_id: window.clubDefault(), quick: '', page: 1, size: 20 },
      list: [], total: 0, stats: null, loading: false,
      selection: [],
      sources: [], staffSales: [], coaches: [], cardTypes: [],
      // 新增/编辑弹窗
      dlg: false, dlgTitle: '新增会员', form: {}, saving: false,
      // 维护记录弹窗
      mtDlg: false, mtMember: null, mtList: [], mtForm: { record_type: 1, content: '' }, mtSaving: false,
      // 分配教练
      assignDlg: false, assignForm: { coach_id: null },
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="card-box">
      <el-tabs v-model="tab" @tab-change="onTab">
        <el-tab-pane label="在籍会员" name="active" />
        <el-tab-pane label="过期召回" name="expired" />
        <el-tab-pane label="无卡会员" name="none" />
        <el-tab-pane label="全部" name="all" />
      </el-tabs>
      <div class="stat-strip" v-if="stats">
        <div v-for="c in quickCells" :key="c.k" class="item tap" :class="{on: query.quick === c.k}"
             @click="pickQuick(c.k)" :title="'点击筛选：' + c.l"><b>{{ c.v }}</b>{{ c.l }}</div>
        <el-tag v-if="query.quick" type="primary" closable disable-transitions
                style="margin-left:12px" @close="pickQuick(query.quick)">
          已筛选：{{ quickLabel }}（{{ total }} 人）
        </el-tag>
      </div>
      <div class="search-bar">
        <el-input v-model="query.keyword" placeholder="姓名/昵称/手机号" clearable style="width:190px" @keyup.enter="search" />

        <el-select v-model="query.coach_id" placeholder="主教练" clearable style="width:130px">
          <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
        </el-select>
        <el-select v-model="query.card_type_id" placeholder="持有卡类型" clearable filterable style="width:160px">
          <el-option v-for="c in cardTypes" :key="c.id" :value="c.id" :label="c.title" />
        </el-select>
        <club-picker v-model="query.club_id" @change="search" />
        <el-select v-model="query.expire_within" placeholder="N天内到期" clearable style="width:120px">
          <el-option :value="7" label="7天内到期" />
          <el-option :value="15" label="15天内到期" />
          <el-option :value="30" label="30天内到期" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button :disabled="!selection.length" @click="openAssign">批量分配教练 ({{ selection.length }})</el-button>
        <el-button type="danger" plain :disabled="!selection.length" @click="batchDelete">批量删除 ({{ selection.length }})</el-button>
        <el-button @click="exportCsv"><el-icon><Download /></el-icon>&nbsp;导出CSV</el-button>
        <el-button type="primary" plain @click="openAdd">新增会员</el-button>
        <el-button @click="$router.push('/members-import')"><el-icon><Upload /></el-icon>&nbsp;批量导入</el-button>
      </div>

      <el-table :data="list" v-loading="loading" @selection-change="s => selection = s" stripe border scrollbar-always-on style="width:100%">
        <el-table-column type="selection" width="42" />
        <el-table-column label="会员" width="160" fixed="left">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.id)">{{ row.realname || row.nickname || '未命名' }}</el-link>
            <el-tag v-if="row.is_black" type="danger" size="small" style="margin-left:4px">黑名单</el-tag>
            <div class="text-muted">{{ DICT.gender[row.gender] }}<span v-if="row.birthday"> · {{ Fmt.date(row.birthday) }}</span></div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="120" />
        <el-table-column label="所属门店" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.club_names || '-' }}</template>
        </el-table-column>
        <el-table-column label="持有卡" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.card_names">{{ row.card_names }} <span class="text-muted">({{ row.card_count }}张)</span></span>
            <span v-else class="text-muted">无卡</span>
          </template>
        </el-table-column>
        <el-table-column label="剩余/总次数" width="105" align="center">
          <template #default="{ row }">
            <span v-if="row.total_counts > 0">
              <b :style="{color: row.total_left_counts > 0 ? 'var(--el-color-success)' : 'var(--el-color-danger)'}">{{ row.total_left_counts || 0 }}</b>
              <span class="text-muted"> / {{ row.total_counts }}</span>
            </span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="剩余价值" width="100" align="right">
          <template #default="{ row }">
            <span v-if="row.remaining_value > 0" style="color:var(--el-color-warning);font-weight:600">¥{{ Number(row.remaining_value).toLocaleString() }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="76">
          <template #default="{ row }"><dict-tag dict="expireStatus" :value="row.expire_status" /></template>
        </el-table-column>
        <el-table-column label="最近到期" width="110">
          <template #default="{ row }">{{ Fmt.date(row.expire_time) }}</template>
        </el-table-column>
        <el-table-column label="开卡时间" width="110">
          <template #default="{ row }">{{ Fmt.date(row.last_open_card_time) }}</template>
        </el-table-column>
        <el-table-column label="会籍顾问" width="100" show-overflow-tooltip>
          <template #default="{ row }">{{ row.membership_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="主教练" width="100">
          <template #default="{ row }">{{ row.coach_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="经手人" width="100" show-overflow-tooltip>
          <template #default="{ row }">{{ row.ope_username || '-' }}</template>
        </el-table-column>
        <el-table-column prop="source_name" label="来源" width="90" show-overflow-tooltip />
        <el-table-column label="实体卡号" width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.physical_card_nos || '-' }}</template>
        </el-table-column>
        <el-table-column label="最近签到" width="120">
          <template #default="{ row }">{{ Fmt.time(row.last_sign_time) }}</template>
        </el-table-column>
        <el-table-column label="标签" width="64">
          <template #default="{ row }">
            <dict-tag v-if="row.label_levels" dict="labelLevel" :value="row.label_levels" />
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="185" fixed="right">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:2px;white-space:nowrap">
              <el-button link type="primary" size="small" @click="$router.push('/members/' + row.id)">详情</el-button>
              <el-button link type="primary" size="small" style="margin-left:0" @click="openEdit(row)">编辑</el-button>
              <el-button link type="primary" size="small" style="margin-left:0" @click="openMaintain(row)">维护</el-button>
              <el-dropdown @command="cmd => rowCmd(cmd, row)" trigger="click">
                <el-button link type="primary" size="small" style="margin-left:0">更多<el-icon style="margin-left:2px"><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="black">
                      <span :style="{color: row.is_black ? 'var(--el-color-success)' : 'var(--el-color-danger)'}">{{ row.is_black ? '移出黑名单' : '加入黑名单' }}</span>
                    </el-dropdown-item>
                    <el-dropdown-item v-if="['admin','manager'].includes((user||{}).role)" command="disable" divided>
                      <span style="color:var(--el-color-danger)">禁用会员</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, sizes, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" :page-sizes="[20,50,100]"
          @current-change="load" @size-change="search" />
      </div>
    </div>

    <!-- 新增/编辑会员 -->
    <el-dialog v-model="dlg" :title="dlgTitle" width="620px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-row :gutter="14">
          <el-col :span="12"><el-form-item label="姓名" required><el-input v-model="form.realname" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="手机号" required><el-input v-model="form.phone" :disabled="!!form.id" maxlength="11" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="昵称"><el-input v-model="form.nickname" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="性别">
            <el-radio-group v-model="form.gender">
              <el-radio :value="1">男</el-radio><el-radio :value="2">女</el-radio><el-radio :value="0">未知</el-radio>
            </el-radio-group>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生日"><el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="身份证号"><el-input v-model="form.id_card_number" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="来源渠道">
            <el-select v-model="form.source_id" clearable style="width:100%" @change="onSourceChange">
              <el-option v-for="s in sources" :key="s.id" :value="s.id" :label="s.title" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="意向标签">
            <el-select v-model="form.label_levels" style="width:100%">
              <el-option :value="0" label="无" /><el-option :value="1" label="A · 高意向" /><el-option :value="2" label="B · 中意向" /><el-option :value="3" label="C · 低意向" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="主教练">
            <el-select v-model="form.coach_id" clearable style="width:100%" @change="onCoachChange">
              <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="副教练">
            <el-select v-model="form.sub_coach_id" clearable style="width:100%" @change="onSubCoachChange">
              <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="24"><el-form-item label="住址"><el-input v-model="form.address" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 维护记录 -->
    <el-dialog v-model="mtDlg" :title="'维护记录 - ' + (mtMember ? mtMember.realname : '')" width="640px" destroy-on-close>
      <el-form inline :model="mtForm" style="margin-bottom:6px">
        <el-form-item label="方式">
          <el-select v-model="mtForm.record_type" style="width:100px">
            <el-option v-for="(v,k) in DICT.maintainType" :key="k" :value="Number(k)" :label="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容" style="width:320px">
          <el-input v-model="mtForm.content" placeholder="填写本次维护/回访内容" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="mtSaving" @click="saveMaintain">新增记录</el-button>
        </el-form-item>
      </el-form>
      <el-table border :data="mtList" size="small" max-height="320">
        <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="方式" width="70"><template #default="{ row }">{{ DICT.maintainType[row.record_type] || '-' }}</template></el-table-column>
        <el-table-column prop="membership_name" label="会籍顾问" width="90" />
        <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
      </el-table>
    </el-dialog>

    <!-- 批量分配教练 -->
    <el-dialog v-model="assignDlg" title="批量分配教练" width="420px">
      <el-form label-width="90px">
        <el-form-item label="所属教练">
          <el-select v-model="assignForm.coach_id" style="width:100%" placeholder="请选择">
            <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
          </el-select>
        </el-form-item>
        <div class="text-muted" style="padding-left:90px">将为选中的 {{ selection.length }} 名会员统一设置主教练</div>
      </el-form>
      <template #footer>
        <el-button @click="assignDlg=false">取消</el-button>
        <el-button type="primary" @click="doAssign">确认分配</el-button>
      </template>
    </el-dialog>
  </div>`,
  computed: {
    quickCells() {
      const s = this.stats || {};
      return [
        { k: 'active', l: '在籍', v: s.active_count || 0 },
        { k: 'today_expire', l: '今日到期', v: s.today_expire || 0 },
        { k: 'expired', l: '已过期', v: s.expired_count || 0 },
        { k: 'month_new', l: '本月新增', v: s.month_new || 0 },
      ];
    },
    quickLabel() { const c = this.quickCells.find(x => x.k === this.query.quick); return c ? c.l : ''; },
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/members', Object.assign({ status: this.tab }, this.query));
        this.list = d.list; this.total = d.total; this.stats = d.stats;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() {
      this.query = { keyword: '', card_type_id: '', membership_id: '', coach_id: '', expire_within: '', page: 1, size: this.query.size };
      this.load();
    },
    onTab() { this.search(); },
    // 统计条下钻: 四个数字的口径是全量的, 所以选中时把页签切到「全部」, 免得和页签条件打架
    pickQuick(k) {
      this.query.quick = this.query.quick === k ? '' : k;
      if (this.query.quick) this.tab = 'all';
      this.search();
    },
    exportCsv() {
      window.open(api.exportUrl('/members', Object.assign({ status: this.tab }, this.query, { page: undefined, size: undefined })));
    },
    async loadDicts() {
      const [sources, staff, coaches, cats] = await Promise.all([
        api.get('/sources'), api.get('/staff'), api.get('/coaches', { status: 1 }), api.get('/card-categories'),
      ]);
      this.sources = sources;
      this.staffSales = staff.filter(s => s.role === 'membership' && s.status === 1);
      this.coaches = coaches;
      this.cardTypes = cats;
    },
    openAdd() {
      this.dlgTitle = '新增会员';
      this.form = { gender: 0, label_levels: 0 };
      this.dlg = true;
    },
    async openEdit(row) {
      this.dlgTitle = '编辑会员 - ' + (row.realname || row.phone);
      // 取完整档案，确保 PUT 时回传 coach/sub_coach 等全部字段（v2 后端整体覆盖）
      try {
        const d = await api.get('/members/' + row.id);
        this.form = JSON.parse(JSON.stringify(d.profile));
      } catch (e) {
        this.form = JSON.parse(JSON.stringify(row));
      }
      if (!this.form.coach_id) this.form.coach_id = null;
      if (!this.form.sub_coach_id) this.form.sub_coach_id = null;
      this.dlg = true;
    },
    onSourceChange(v) {
      const s = this.sources.find(x => x.id === v);
      this.form.source_name = s ? s.title : '';
    },
    onSaleChange(v) {
      const s = this.staffSales.find(x => x.id === v);
      this.form.membership_name = s ? s.realname : '';
    },
    onCoachChange(v) {
      const c = this.coaches.find(x => x.id === v);
      this.form.coach_name = c ? c.realname : '';
    },
    onSubCoachChange(v) {
      const c = this.coaches.find(x => x.id === v);
      this.form.sub_coach_name = c ? c.realname : '';
    },
    async save() {
      if (!this.form.realname) return ElementPlus.ElMessage.warning('请填写姓名');
      if (!this.form.id && !/^1\d{10}$/.test(this.form.phone || '')) return ElementPlus.ElMessage.warning('请填写正确的手机号');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/members/' + this.form.id, this.form);
        else await api.post('/members', this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.dlg = false;
        this.load();
      } catch (e) { /* 已提示 */ } finally { this.saving = false; }
    },
    async openMaintain(row) {
      this.mtMember = row;
      this.mtForm = { record_type: 1, content: '' };
      this.mtDlg = true;
      const d = await api.get('/maintain-records', { vip_user_id: row.id, vip_user_type: 1, size: 50 });
      this.mtList = d.list;
    },
    async saveMaintain() {
      if (!this.mtForm.content) return ElementPlus.ElMessage.warning('请填写维护内容');
      this.mtSaving = true;
      try {
        await api.post('/maintain-records', { vip_user_id: this.mtMember.id, vip_user_type: 1, record_type: this.mtForm.record_type, content: this.mtForm.content });
        ElementPlus.ElMessage.success('已记录');
        this.mtForm.content = '';
        const d = await api.get('/maintain-records', { vip_user_id: this.mtMember.id, vip_user_type: 1, size: 50 });
        this.mtList = d.list;
      } finally { this.mtSaving = false; }
    },
    rowCmd(cmd, row) {
      if (cmd === 'black') this.toggleBlack(row);
      else if (cmd === 'disable') this.disableMember(row);
    },
    disableMember(row) {
      ElementPlus.ElMessageBox.confirm(
        '禁用后「' + row.realname + '」将从会员列表隐藏、无法登录会员端；历史消费与合同数据全部保留（逻辑禁用，非物理删除）。确定禁用？',
        '禁用会员', { type: 'warning', confirmButtonText: '确定禁用', confirmButtonClass: 'el-button--danger' })
        .then(async () => {
          await api.post('/members/' + row.id + '/disable', { enable: 0 });
          ElementPlus.ElMessage.success('已禁用（历史数据保留）');
          this.load();
        }).catch(() => {});
    },
    toggleBlack(row) {
      if (row.is_black) {
        ElementPlus.ElMessageBox.confirm('确定将「' + row.realname + '」移出黑名单？', '移出黑名单', { type: 'warning' })
          .then(async () => {
            await api.post('/members/' + row.id + '/blacklist', { is_black: 0 });
            ElementPlus.ElMessage.success('已移出黑名单');
            this.load();
          }).catch(() => {});
      } else {
        ElementPlus.ElMessageBox.prompt('加入黑名单后该会员将无法入场/购卡/预约，请填写原因：', '加入黑名单 - ' + row.realname, {
          confirmButtonText: '确认加入', cancelButtonText: '取消', inputPlaceholder: '黑名单原因',
        }).then(async ({ value }) => {
          await api.post('/members/' + row.id + '/blacklist', { is_black: 1, reason: value || '' });
          ElementPlus.ElMessage.success('已加入黑名单');
          this.load();
        }).catch(() => {});
      }
    },
    openAssign() { this.assignForm = { coach_id: null }; this.assignDlg = true; },
    async batchDelete() {
      const n = this.selection.length;
      if (!n) return;
      try {
        await ElementPlus.ElMessageBox.confirm(
          `确定删除选中的 ${n} 名会员吗？删除后会员不再出现在列表和统计中，也无法登录；历史消费、合同与流水会保留，可在操作日志中查看。`,
          '批量删除会员', { type: 'warning', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' });
      } catch (e) { return; }
      const d = await api.post('/members/batch-disable', { ids: this.selection.map(x => x.id) });
      ElementPlus.ElMessage.success('已删除 ' + d.count + ' 名会员');
      this.selection = [];
      this.load();
    },
    async doAssign() {
      if (!this.assignForm.coach_id) return ElementPlus.ElMessage.warning('请选择教练');
      const c = this.coaches.find(x => x.id === this.assignForm.coach_id);
      await api.post('/members/assign', {
        ids: this.selection.map(x => x.id), type: 'member',
        coach_id: this.assignForm.coach_id, coach_name: c ? c.realname : '',
      });
      ElementPlus.ElMessage.success('分配成功');
      this.assignDlg = false;
      this.load();
    },
  },
  mounted() { this.load(); this.loadDicts(); },
};
