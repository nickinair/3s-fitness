/* 会员卡详情 */
window.AppPages.CardDetail = {
  name: 'CardDetailPage',
  data() {
    return {
      d: null, loading: false, Fmt: window.Fmt, DICT: window.DICT,
      sharedDialog: false, sharedMode: 'search',
      selectedVipId: null, searchKw: '', searchingMembers: false, searchedMembers: [],
      newMemberForm: { realname: '', phone: '', gender: 1 },
      sharedRelation: '家属', addingShared: false,
    };
  },
  computed: {
    card() { return this.d ? this.d.card : {}; },
  },
  template: `
  <div v-loading="loading">
    <div class="card-box" v-if="d">
      <div style="display:flex;gap:20px;align-items:flex-start">
        <div class="right-card" :class="[ 'k' + card.card_kind, [2,4,5].includes(card.status) ? 'dead' : '' ]" style="width:280px;flex-shrink:0">
          <div class="rc-tag">{{ DICT.cardStatus[card.status] }}</div>
          <div class="rc-title">{{ card.card_type_name }} <span style="opacity:.75;font-size:12px">· {{ DICT.cardKind[card.card_kind] }}</span></div>
          <div class="rc-main">
            <template v-if="card.card_kind === 3">余额 {{ Fmt.money(card.left_money) }}</template>
            <template v-else-if="card.card_kind === 2">时间卡</template>
            <template v-else>剩 {{ card.left_counts }}<small style="font-size:13px;opacity:.8">/{{ card.counts }}次</small></template>
          </div>
          <div class="rc-sub">{{ card.expire_time ? '有效期至 ' + Fmt.date(card.expire_time) : '待开卡' }}</div>
        </div>
        <div style="flex:1">
          <div class="profile-grid" style="grid-template-columns:repeat(3,1fr)">
            <div><span class="lab">会员</span><el-link type="primary" @click="$router.push('/members/' + card.vip_id)">{{ card.realname }}</el-link></div>
            <div><span class="lab">手机号</span>{{ card.phone }}</div>
            <div><span class="lab">合同号</span>{{ card.contract_number || '-' }}</div>
            <div><span class="lab">实收金额</span><span class="money">{{ Fmt.money(card.actual_money) }}</span></div>
            <div><span class="lab">尾款</span>{{ Fmt.money(card.retainage) }}</div>
            <div><span class="lab">单次单价</span>{{ Fmt.money(card.unit_price) }}</div>
            <div><span class="lab">开卡方式</span>{{ DICT.openCardMode[card.open_card_mode] || '-' }}</div>
            <div><span class="lab">开卡时间</span>{{ Fmt.time(card.open_card_time) }}</div>
            <div><span class="lab">到期时间</span>{{ Fmt.time(card.expire_time) }}</div>
            <div><span class="lab">业绩归属</span>{{ card.membership_name || '-' }}</div>
            <div><span class="lab">服务教练</span>{{ card.coach_name || '-' }}</div>
            <div><span class="lab">经手人</span>{{ card.ope_username || '-' }}</div>
            <div style="grid-column: span 3"><span class="lab">备注</span>{{ card.remark || '-' }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 家庭共享用卡人 -->
    <div class="card-box" v-if="d" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="box-title" style="margin-bottom:0">家庭共享用卡人（{{ (d.shared_users||[]).length }}人）</div>
        <el-button type="primary" size="small" @click="openAddShared">+ 添加共享成员</el-button>
      </div>
      <el-table border :data="d.shared_users || []" size="small" stripe empty-text="暂无家庭共享成员，绑定后共享成员可直接使用本卡预约课程与到店签到">
        <el-table-column prop="realname" label="姓名" width="120" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="relation" label="与主卡人关系" width="120">
          <template #default="{ row }"><el-tag size="small">{{ row.relation || '家属' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="绑定时间" min-width="160">
          <template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="danger" link size="small" @click="removeShared(row)">解除共享</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="two-col" v-if="d" style="margin-top:16px">
      <div class="card-box">
        <div class="box-title">收款流水</div>
        <el-table border :data="d.recharges" size="small" stripe max-height="420">
          <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
          <el-table-column label="类型" width="70"><template #default="{ row }"><dict-tag dict="rechargeType" :value="row.type" /></template></el-table-column>
          <el-table-column label="金额" width="100"><template #default="{ row }"><span class="money">{{ Fmt.money(row.actual_money) }}</span></template></el-table-column>
          <el-table-column label="支付" width="70"><template #default="{ row }">{{ DICT.payMethod[row.pay_method] || '-' }}</template></el-table-column>
          <el-table-column prop="ope_username" label="经手人" width="90" />
          <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        </el-table>
      </div>
      <div class="card-box">
        <div class="box-title">耗卡流水</div>
        <el-table border :data="d.spends" size="small" stripe max-height="420">
          <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
          <el-table-column label="场景" width="90"><template #default="{ row }"><dict-tag dict="spendScene" :value="row.scene" /></template></el-table-column>
          <el-table-column prop="costs" label="扣减" width="60" />
          <el-table-column label="金额" width="90"><template #default="{ row }"><span class="money">{{ Fmt.money(row.spend_money) }}</span></template></el-table-column>
          <el-table-column prop="coach_name" label="教练" width="80" />
          <el-table-column prop="realname" label="使用人" width="90">
            <template #default="{ row }">{{ row.realname || card.realname }}</template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        </el-table>
      </div>
    </div>

    <!-- 添加共享成员弹窗 -->
    <el-dialog v-model="sharedDialog" title="添加家庭共享成员" width="500px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="添加方式">
          <el-radio-group v-model="sharedMode">
            <el-radio-button label="search">选择已有会员</el-radio-button>
            <el-radio-button label="create">新建家庭成员</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="sharedMode==='search'">
          <el-form-item label="搜索会员" required>
            <el-select v-model="selectedVipId" filterable remote reserve-keyword placeholder="请输入姓名或手机号搜索" :remote-method="searchMembers" :loading="searchingMembers" style="width:100%">
              <el-option v-for="m in searchedMembers" :key="m.id" :label="m.realname + ' (' + m.phone + ')'" :value="m.id" />
            </el-select>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="成员姓名" required>
            <el-input v-model="newMemberForm.realname" placeholder="请输入成员姓名" />
          </el-form-item>
          <el-form-item label="手机号" required>
            <el-input v-model="newMemberForm.phone" placeholder="请输入11位手机号" />
          </el-form-item>
          <el-form-item label="性别">
            <el-radio-group v-model="newMemberForm.gender">
              <el-radio :label="1">男</el-radio>
              <el-radio :label="2">女</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>
        <el-form-item label="关系">
          <el-select v-model="sharedRelation" placeholder="选择或输入关系" allow-create filterable style="width:100%">
            <el-option v-for="r in ['家属', '配偶', '子女', '父母', '亲戚', '朋友']" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sharedDialog=false">取消</el-button>
        <el-button type="primary" :loading="addingShared" @click="doAddShared">确认绑定</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/cards/' + this.$route.params.id); }
      finally { this.loading = false; }
    },
    openAddShared() {
      this.sharedMode = 'search';
      this.selectedVipId = null;
      this.searchedMembers = [];
      this.sharedRelation = '家属';
      this.newMemberForm = { realname: '', phone: '', gender: 1 };
      this.sharedDialog = true;
    },
    async searchMembers(query) {
      if (!query || !query.trim()) {
        this.searchedMembers = [];
        return;
      }
      this.searchingMembers = true;
      try {
        const res = await api.get('/members?keyword=' + encodeURIComponent(query.trim()) + '&page=1&size=20');
        const list = (res && res.list) || [];
        const existIds = new Set([this.card.vip_id, ...(this.d.shared_users || []).map(u => u.vip_id)]);
        this.searchedMembers = list.filter(m => !existIds.has(m.id));
      } catch (e) {
        this.searchedMembers = [];
      } finally {
        this.searchingMembers = false;
      }
    },
    async doAddShared() {
      const relation = this.sharedRelation || '家属';
      let payload = { relation };
      if (this.sharedMode === 'search') {
        if (!this.selectedVipId) return ElementPlus.ElMessage.warning('请选择要绑定的会员');
        payload.vip_id = this.selectedVipId;
      } else {
        const f = this.newMemberForm;
        if (!f.realname || !f.realname.trim()) return ElementPlus.ElMessage.warning('请输入姓名');
        if (!f.phone || !/^1\d{10}$/.test(f.phone.trim())) return ElementPlus.ElMessage.warning('请输入正确的11位手机号');
        payload.new_member = {
          realname: f.realname.trim(),
          phone: f.phone.trim(),
          gender: Number(f.gender) || 1,
        };
      }
      this.addingShared = true;
      try {
        await api.post('/cards/' + this.card.id + '/shared-users', payload);
        this.sharedDialog = false;
        ElementPlus.ElMessage.success('绑定成功');
        this.load();
      } finally {
        this.addingShared = false;
      }
    },
    async removeShared(row) {
      try {
        await ElementPlus.ElMessageBox.confirm(`确定要解除 ${row.realname} 对该会员卡的共享使用权吗？`, '解除家庭共享', {
          type: 'warning',
          confirmButtonText: '确定解除',
          cancelButtonText: '取消',
        });
      } catch (e) {
        return;
      }
      try {
        await api.delete('/cards/' + this.card.id + '/shared-users/' + row.vip_id);
        ElementPlus.ElMessage.success('已解除共享');
        this.load();
      } catch (e) {
        // error
      }
    },
  },
  mounted() { this.load(); },
};