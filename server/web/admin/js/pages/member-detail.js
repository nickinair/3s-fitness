/* 会员详情 */
window.AppPages.MemberDetail = {
  name: 'MemberDetailPage',
  data() {
    return {
      d: null, loading: false, tab: 'recharges',
      user: Auth.getUser() || {},
      Fmt: window.Fmt, DICT: window.DICT,
      // 维护
      mtForm: { record_type: 1, content: '' }, mtSaving: false,
      // 合同查看
      contractDlg: false, contract: null,
      // 编辑
      editDlg: false, form: {}, sources: [], coaches: [], saving: false,
      // 体测
      bodyRecords: [], bodyDlg: false, bodyForm: {}, bodySaving: false,
      // 里程碑
      milestones: [],
    };
  },
  computed: {
    id() { return this.$route.params.id; },
    profile() { return this.d ? this.d.profile : {}; },
    // 体重 + 体脂率 双 y 轴趋势
    bodyChart() {
      const rows = [...this.bodyRecords].sort((a, b) => (String(a.record_date) > String(b.record_date) ? 1 : -1));
      if (rows.length < 2) return null;
      return {
        tooltip: { trigger: 'axis' },
        legend: { data: ['体重(kg)', '体脂率(%)'], top: 0 },
        grid: { left: 56, right: 56, top: 36, bottom: 28 },
        xAxis: { type: 'category', data: rows.map(r => Fmt.date(r.record_date)), boundaryGap: false },
        yAxis: [
          { type: 'value', name: '体重(kg)', scale: true },
          { type: 'value', name: '体脂率(%)', scale: true },
        ],
        series: [
          { name: '体重(kg)', type: 'line', smooth: true, connectNulls: true, itemStyle: { color: '#0d5e56' },
            areaStyle: { opacity: .1 }, data: rows.map(r => r.weight != null ? Number(r.weight) : null) },
          { name: '体脂率(%)', type: 'line', smooth: true, connectNulls: true, yAxisIndex: 1, itemStyle: { color: '#c98a2d' },
            data: rows.map(r => r.body_fat != null ? Number(r.body_fat) : null) },
        ],
      };
    },
  },
  template: `
  <div v-loading="loading">
    <div class="card-box" v-if="d">
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div class="avatar-circle">{{ (profile.realname || '?').slice(0, 1) }}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:18px;font-weight:700;color:var(--text-main)">{{ profile.realname || '未命名' }}</span>
            <dict-tag dict="expireStatus" :value="profile.expire_status" />
            <dict-tag v-if="profile.label_levels" dict="labelLevel" :value="profile.label_levels" />
            <el-tag v-if="profile.is_black" type="danger" size="small">黑名单：{{ profile.black_reason || '无原因' }}</el-tag>
          </div>
          <div class="profile-grid">
            <div><span class="lab">手机号</span>{{ profile.phone }}</div>
            <div><span class="lab">性别</span>{{ DICT.gender[profile.gender] }}</div>
            <div><span class="lab">生日</span>{{ Fmt.date(profile.birthday) }}</div>
            <div><span class="lab">来源</span>{{ profile.source_name || '-' }}</div>
            <div><span class="lab">主教练</span>{{ profile.coach_name || '-' }}</div>
            <div><span class="lab">副教练</span>{{ profile.sub_coach_name || '-' }}</div>
            <div><span class="lab">最近签到</span>{{ Fmt.time(profile.last_sign_time) }}</div>
            <div><span class="lab">建档时间</span>{{ Fmt.time(profile.insert_time) }}</div>
            <div><span class="lab">最近维护</span>{{ Fmt.time(profile.last_maintain_time) }}</div>
            <div><span class="lab">最近到期</span>{{ Fmt.date(profile.expire_time) }}</div>
            <div style="grid-column: span 2"><span class="lab">备注</span>{{ profile.remark || '-' }}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <el-button type="primary" @click="$router.push({ path: '/card-open', query: { vip_id: profile.id } })">开卡</el-button>
          <el-button @click="tab = 'maintains'">维护</el-button>
          <el-button @click="openEdit">编辑</el-button>
        </div>
      </div>
    </div>

    <div class="card-box" v-if="d">
      <div class="box-title">权益快照 <span class="text-muted" style="font-weight:400">共 {{ d.cards.length }} 张卡</span></div>
      <div class="rights-cards" v-if="d.cards.length">
        <div v-for="c in d.cards" :key="c.id" class="right-card" :class="[ 'k' + c.card_kind, [2,4,5].includes(c.status) ? 'dead' : '' ]"
          style="cursor:pointer" @click="$router.push('/cards/' + c.id)">
          <div class="rc-tag">{{ DICT.cardStatus[c.status] }}</div>
          <div class="rc-title">{{ c.card_type_name }} <span style="opacity:.75;font-size:12px">· {{ DICT.cardKind[c.card_kind] }}</span></div>
          <div class="rc-main">
            <template v-if="c.card_kind === 3">余额 {{ Fmt.money(c.left_money) }}</template>
            <template v-else-if="c.card_kind === 2">时间卡</template>
            <template v-else>剩 {{ c.left_counts }}<small style="font-size:13px;opacity:.8">/{{ c.counts }}次</small></template>
          </div>
          <div class="rc-sub">{{ c.expire_time ? '有效期至 ' + Fmt.date(c.expire_time) : '待开卡' }} · 实收{{ Fmt.money(c.actual_money) }}</div>
        </div>
      </div>
      <el-empty v-else description="暂无会员卡" :image-size="70" />
    </div>

    <div class="card-box" v-if="d">
      <el-tabs v-model="tab">
        <el-tab-pane label="收款流水" name="recharges">
          <el-table border :data="d.recharges" size="small" stripe>
            <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
            <el-table-column prop="card_type_name" label="卡类型" min-width="120" />
            <el-table-column label="类型" width="76"><template #default="{ row }"><dict-tag dict="rechargeType" :value="row.type" /></template></el-table-column>
            <el-table-column label="金额" width="110"><template #default="{ row }"><span class="money">{{ Fmt.money(row.actual_money) }}</span></template></el-table-column>
            <el-table-column label="支付方式" width="90"><template #default="{ row }">{{ DICT.payMethod[row.pay_method] || row.pay_method }}</template></el-table-column>
            <el-table-column prop="membership_name" label="业绩归属" width="100" />
            <el-table-column prop="ope_username" label="经手人" width="100" />
            <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="耗卡流水" name="spends">
          <el-table border :data="d.spends" size="small" stripe>
            <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
            <el-table-column prop="card_type_name" label="卡类型" min-width="120" />
            <el-table-column label="场景" width="90"><template #default="{ row }"><dict-tag dict="spendScene" :value="row.scene" /></template></el-table-column>
            <el-table-column prop="costs" label="扣减" width="70" />
            <el-table-column label="耗卡金额" width="110"><template #default="{ row }"><span class="money">{{ Fmt.money(row.spend_money) }}</span></template></el-table-column>
            <el-table-column prop="coach_name" label="教练" width="90" />
            <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="维护记录" name="maintains">
          <el-form inline :model="mtForm" style="margin-bottom:6px">
            <el-form-item label="方式">
              <el-select v-model="mtForm.record_type" style="width:100px">
                <el-option v-for="(v,k) in DICT.maintainType" :key="k" :value="Number(k)" :label="v" />
              </el-select>
            </el-form-item>
            <el-form-item style="width:380px"><el-input v-model="mtForm.content" placeholder="填写维护/回访内容" /></el-form-item>
            <el-form-item><el-button type="primary" :loading="mtSaving" @click="saveMaintain">新增维护记录</el-button></el-form-item>
          </el-form>
          <el-table border :data="d.maintains" size="small" stripe>
            <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
            <el-table-column label="方式" width="70"><template #default="{ row }">{{ DICT.maintainType[row.record_type] || '-' }}</template></el-table-column>
            <el-table-column prop="membership_name" label="会籍顾问" width="100" />
            <el-table-column prop="content" label="内容" min-width="240" show-overflow-tooltip />
            <el-table-column label="操作" width="70">
              <template #default="{ row }">
                <el-button v-if="['admin','manager'].includes((user||{}).role)" link type="danger" size="small" @click="delMaintain(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="签到记录" name="checkins">
          <el-table border :data="d.checkins" size="small" stripe>
            <el-table-column label="入场时间" width="150"><template #default="{ row }">{{ Fmt.time(row.check_in_time) }}</template></el-table-column>
            <el-table-column label="出场时间" width="150"><template #default="{ row }">{{ row.check_out_time ? Fmt.time(row.check_out_time) : '在场' }}</template></el-table-column>
            <el-table-column prop="card_type_name" label="使用卡" min-width="130" />
            <el-table-column prop="ope_username" label="经手人" width="110" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="私教预约" name="pt">
          <el-table border :data="d.ptBookings" size="small" stripe>
            <el-table-column label="日期" width="100"><template #default="{ row }">{{ row.date ? Fmt.date(row.date) : '-' }}</template></el-table-column>
            <el-table-column label="时段" width="110"><template #default="{ row }">{{ row.from_time }}-{{ row.to_time }}</template></el-table-column>
            <el-table-column prop="course_title" label="课程" min-width="110" />
            <el-table-column prop="coach_name" label="教练" width="90" />
            <el-table-column prop="card_type_name" label="扣课卡" min-width="120" />
            <el-table-column label="状态" width="90"><template #default="{ row }"><dict-tag dict="ptStatus" :value="row.status" /></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="团课预约" name="group">
          <el-table border :data="d.groupBookings" size="small" stripe>
            <el-table-column label="上课时间" width="150"><template #default="{ row }">{{ Fmt.time(row.class_start_time) }}</template></el-table-column>
            <el-table-column prop="syllabus_title" label="课程" min-width="120" />
            <el-table-column prop="card_type_name" label="扣课卡" min-width="120" />
            <el-table-column prop="card_deduct_num" label="扣次" width="60" />
            <el-table-column label="状态" width="90"><template #default="{ row }"><dict-tag dict="groupBookStatus" :value="row.status" /></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="体测数据" name="body">
          <div class="search-bar" style="margin-bottom:8px">
            <div class="text-muted">共 {{ bodyRecords.length }} 条体测记录</div>
            <div style="flex:1"></div>
            <el-button type="primary" plain size="small" @click="openBodyDlg">录入体测</el-button>
          </div>
          <div v-if="bodyChart" style="margin-bottom:12px"><v-chart :option="bodyChart" height="280px" /></div>
          <el-alert v-else type="info" :closable="false" style="margin-bottom:12px"
            title="体测数据不足 2 条，暂无法绘制体重/体脂率趋势图，请先录入体测" />
          <el-table border :data="bodyRecords" size="small" stripe>
            <el-table-column label="日期" width="110"><template #default="{ row }">{{ Fmt.date(row.record_date) }}</template></el-table-column>
            <el-table-column label="身高(cm)" width="90"><template #default="{ row }">{{ row.height != null ? row.height : '-' }}</template></el-table-column>
            <el-table-column label="体重(kg)" width="90"><template #default="{ row }">{{ row.weight != null ? row.weight : '-' }}</template></el-table-column>
            <el-table-column label="体脂率(%)" width="90"><template #default="{ row }">{{ row.body_fat != null ? row.body_fat : '-' }}</template></el-table-column>
            <el-table-column label="肌肉量(kg)" width="94"><template #default="{ row }">{{ row.muscle != null ? row.muscle : '-' }}</template></el-table-column>
            <el-table-column label="胸围(cm)" width="86"><template #default="{ row }">{{ row.bust != null ? row.bust : '-' }}</template></el-table-column>
            <el-table-column label="腰围(cm)" width="86"><template #default="{ row }">{{ row.waist != null ? row.waist : '-' }}</template></el-table-column>
            <el-table-column label="臀围(cm)" width="86"><template #default="{ row }">{{ row.hip != null ? row.hip : '-' }}</template></el-table-column>
            <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
            <el-table-column label="操作" width="70" fixed="right">
              <template #default="{ row }"><el-button link type="danger" size="small" @click="delBody(row)">删除</el-button></template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="里程碑" name="milestones">
          <el-timeline v-if="milestones.length" style="padding-top:6px">
            <el-timeline-item v-for="m in milestones" :key="m.id" :timestamp="Fmt.time(m.insert_time)"
              :type="m.status === 1 ? 'success' : 'warning'" placement="top">
              <div style="font-weight:600;margin-bottom:4px">
                {{ m.type === 1 ? '第' + m.node_value + '节课' : '第' + m.node_value + '天' }}
                <dict-tag dict="milestoneStatus" :value="m.status" style="margin-left:6px" />
                <span class="text-muted" style="font-weight:400;margin-left:6px" v-if="m.card_type_name">{{ m.card_type_name }}</span>
              </div>
              <div v-if="m.status === 1" style="background:var(--el-color-primary-light-9);border-radius:8px;padding:10px 12px;line-height:1.7;white-space:pre-wrap;font-size:13px">{{ m.summary }}</div>
              <div v-else class="text-muted">教练尚未填写总结（{{ m.coach_name || '未分配教练' }}）</div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无里程碑" :image-size="70" />
        </el-tab-pane>
        <el-tab-pane label="合同" name="contracts">
          <el-table border :data="d.contracts" size="small" stripe>
            <el-table-column prop="contract_num" label="合同号" width="200" />
            <el-table-column prop="title" label="标题" min-width="160" />
            <el-table-column label="签署状态" width="100"><template #default="{ row }"><dict-tag dict="signStatus" :value="row.sign_status" /></template></el-table-column>
            <el-table-column label="签署时间" width="150"><template #default="{ row }">{{ Fmt.time(row.sign_time) }}</template></el-table-column>
            <el-table-column label="创建时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row }"><el-button link type="primary" size="small" @click="viewContract(row)">查看合同</el-button></template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 合同查看 -->
    <el-dialog v-model="contractDlg" :title="contract ? contract.title + '（' + contract.contract_num + '）' : '合同'" width="680px">
      <template v-if="contract">
        <div style="margin-bottom:10px">
          <dict-tag dict="signStatus" :value="contract.sign_status" size="default" />
          <span class="text-muted" style="margin-left:10px" v-if="contract.sign_status === 1">签署于 {{ Fmt.time(contract.sign_time) }}</span>
        </div>
        <div class="contract-body">{{ contract.content }}</div>
        <div v-if="contract.sign_status === 1 && contract.sign_img" style="margin-top:12px">
          <div class="text-muted" style="margin-bottom:6px">会员签名：</div>
          <img :src="contract.sign_img" style="max-height:110px;border:1px dashed #ccc;border-radius:8px;background:#fff" />
        </div>
      </template>
    </el-dialog>

    <!-- 录入体测 -->
    <el-dialog v-model="bodyDlg" :title="'录入体测 - ' + (profile.realname || '')" width="520px" destroy-on-close>
      <el-form :model="bodyForm" label-width="90px">
        <el-form-item label="体测日期" required>
          <el-date-picker v-model="bodyForm.record_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-row :gutter="10">
          <el-col :span="12"><el-form-item label="身高(cm)"><el-input-number v-model="bodyForm.height" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="体重(kg)"><el-input-number v-model="bodyForm.weight" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="体脂率(%)"><el-input-number v-model="bodyForm.body_fat" :min="0" :max="100" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="肌肉量(kg)"><el-input-number v-model="bodyForm.muscle" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="胸围(cm)"><el-input-number v-model="bodyForm.bust" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="腰围(cm)"><el-input-number v-model="bodyForm.waist" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="臀围(cm)"><el-input-number v-model="bodyForm.hip" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="bodyForm.remark" placeholder="如：训练1个月复测" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bodyDlg=false">取消</el-button>
        <el-button type="primary" :loading="bodySaving" @click="saveBody">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑档案 -->
    <el-dialog v-model="editDlg" title="编辑会员档案" width="620px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-row :gutter="14">
          <el-col :span="12"><el-form-item label="姓名"><el-input v-model="form.realname" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="昵称"><el-input v-model="form.nickname" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="性别">
            <el-radio-group v-model="form.gender"><el-radio :value="1">男</el-radio><el-radio :value="2">女</el-radio><el-radio :value="0">未知</el-radio></el-radio-group>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生日"><el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="来源渠道">
            <el-select v-model="form.source_id" clearable style="width:100%" @change="onSourceChange">
              <el-option v-for="s in sources" :key="s.id" :value="s.id" :label="s.title" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="意向标签">
            <el-select v-model="form.label_levels" style="width:100%">
              <el-option :value="0" label="无" /><el-option :value="1" label="A" /><el-option :value="2" label="B" /><el-option :value="3" label="C" />
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
          <el-col :span="12"><el-form-item label="身份证号"><el-input v-model="form.id_card_number" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="住址"><el-input v-model="form.address" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="editDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/members/' + this.id); }
      finally { this.loading = false; }
      this.loadExtras();
    },
    async loadExtras() {
      try { this.bodyRecords = await api.get('/body-records', { vip_id: this.id }) || []; } catch (e) { this.bodyRecords = []; }
      try {
        const d = await api.get('/milestones', { vip_id: this.id, size: 100 });
        this.milestones = d.list || [];
      } catch (e) { this.milestones = []; }
    },
    /* ---- 体测 ---- */
    openBodyDlg() {
      this.bodyForm = { record_date: dayjs().format('YYYY-MM-DD'), weight: null, body_fat: null, muscle: null, bust: null, waist: null, hip: null, remark: '' };
      this.bodyDlg = true;
    },
    async saveBody() {
      if (!this.bodyForm.record_date) return ElementPlus.ElMessage.warning('请选择体测日期');
      if (this.bodyForm.weight == null && this.bodyForm.body_fat == null) return ElementPlus.ElMessage.warning('请至少填写体重或体脂率');
      this.bodySaving = true;
      try {
        await api.post('/body-records', Object.assign({ vip_id: Number(this.id) }, this.bodyForm));
        ElementPlus.ElMessage.success('体测已录入');
        this.bodyDlg = false;
        this.loadExtras();
      } finally { this.bodySaving = false; }
    },
    delBody(row) {
      ElementPlus.ElMessageBox.confirm('确定删除 ' + Fmt.date(row.record_date) + ' 的体测记录？', '删除体测', { type: 'warning' })
        .then(async () => {
          await api.del('/body-records/' + row.id);
          ElementPlus.ElMessage.success('已删除');
          this.loadExtras();
        }).catch(() => {});
    },
    async viewContract(row) {
      this.contract = await api.get('/contracts/' + row.id);
      this.contractDlg = true;
    },
    delMaintain(row) {
      ElementPlus.ElMessageBox.confirm('确定删除这条维护记录？（会记入操作日志）', '删除维护记录', { type: 'warning' })
        .then(async () => {
          await api.del('/maintain-records/' + row.id);
          ElementPlus.ElMessage.success('已删除');
          this.load();
        }).catch(() => {});
    },
    async saveMaintain() {
      if (!this.mtForm.content) return ElementPlus.ElMessage.warning('请填写维护内容');
      this.mtSaving = true;
      try {
        await api.post('/maintain-records', { vip_user_id: this.profile.id, vip_user_type: 1, record_type: this.mtForm.record_type, content: this.mtForm.content });
        ElementPlus.ElMessage.success('已记录');
        this.mtForm.content = '';
        this.load();
      } finally { this.mtSaving = false; }
    },
    async openEdit() {
      if (!this.sources.length) this.sources = await api.get('/sources');
      if (!this.coaches.length) this.coaches = await api.get('/coaches', { status: 1 });
      this.form = JSON.parse(JSON.stringify(this.profile));
      if (!this.form.coach_id) this.form.coach_id = null;
      if (!this.form.sub_coach_id) this.form.sub_coach_id = null;
      this.editDlg = true;
    },
    onSourceChange(v) {
      const s = this.sources.find(x => x.id === v);
      this.form.source_name = s ? s.title : '';
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
      this.saving = true;
      try {
        await api.put('/members/' + this.profile.id, this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.editDlg = false;
        this.load();
      } finally { this.saving = false; }
    },
  },
  watch: { '$route.params.id'() { if (this.$route.path.startsWith('/members/')) this.load(); } },
  mounted() { this.load(); },
};
