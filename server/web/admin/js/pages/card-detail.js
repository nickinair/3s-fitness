/* 会员卡详情 */
window.AppPages.CardDetail = {
  name: 'CardDetailPage',
  data() {
    return { d: null, loading: false, Fmt: window.Fmt, DICT: window.DICT };
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
    <div class="two-col" v-if="d">
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
          <el-table-column label="金额" width="100"><template #default="{ row }"><span class="money">{{ Fmt.money(row.spend_money) }}</span></template></el-table-column>
          <el-table-column prop="coach_name" label="教练" width="80" />
          <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        </el-table>
      </div>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/cards/' + this.$route.params.id); }
      finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};
