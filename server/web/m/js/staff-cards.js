/* 员工端-会员卡列表 / 会员卡详情(操作: 续费/暂停/恢复/停卡/启用/退卡/改卡) / 合同管理
   对应 PC: server/web/admin/js/pages/cards.js, card-detail.js, contracts.js
   接口: server/src/routes/cards.js (GET /cards, GET /cards/:id, POST /cards/:id/renew|pause|resume|stop|enable|refund, PUT /cards/:id,
         GET /card-categories, GET /contracts, GET /contracts/:id) + server/src/routes/common.js (GET /staff, GET /clubs, GET /logs) + server/src/routes/coaches.js (GET /coaches) */
window.Pages.StaffCardList = {
  data() {
    return {
      query: {
        keyword: '',
        status: this.$route.query.status != null && this.$route.query.status !== '' ? Number(this.$route.query.status) : '',
        kind: '',
      },
      list: [], total: 0, page: 1,
      loading: false, finished: false,
      clubMap: {},
    };
  },
  computed: {
    statusOpts() {
      return [{ text: '全部状态', value: '' }].concat(Object.keys(DICT.cardStatus).map(k => ({ text: DICT.cardStatus[k][0], value: Number(k) })));
    },
    kindOpts() {
      return [{ text: '全部卡种', value: '' }].concat(Object.keys(DICT.cardKind).map(k => ({ text: DICT.cardKind[k], value: Number(k) })));
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员卡列表"></m-nav>',
    '  <van-search v-model="query.keyword" placeholder="会员姓名 / 手机号" @search="reload" @clear="reload">',
    '    <template #action><div @click="reload" style="color:var(--brand)">搜索</div></template>',
    '  </van-search>',
    '  <van-dropdown-menu>',
    '    <van-dropdown-item v-model="query.status" :options="statusOpts" @change="reload"></van-dropdown-item>',
    '    <van-dropdown-item v-model="query.kind" :options="kindOpts" @change="reload"></van-dropdown-item>',
    '  </van-dropdown-menu>',
    '  <div class="flex" style="margin:10px 12px 0">',
    '    <span class="muted flex1">{{ total ? (\'共 \'+total+\' 张\') : \'\' }}</span>',
    '    <van-button size="small" round type="primary" plain icon="plus" @click="$router.push(\'/staff/opencard\')">快速开卡</van-button>',
    '  </div>',
    '  <van-list v-model:loading="loading" :finished="finished" :finished-text="list.length ? \'没有更多了\' : \'\'" @load="onLoad">',
    '    <van-empty v-if="finished && !list.length" description="没有符合条件的会员卡"></van-empty>',
    '    <div v-for="c in list" :key="c.id" class="rec-item" @click="$router.push(\'/staff/card/\'+c.id)">',
    '      <div class="head">',
    '        <span class="name">{{ c.realname }} <span class="muted" style="font-weight:400">{{ c.phone }}</span></span>',
    '        <d-tag dict="cardStatus" :v="c.status"></d-tag>',
    '      </div>',
    '      <div class="mt8" style="font-size:14px"><b>{{ c.card_type_name }}</b> <span class="muted">· {{ DICT.cardKind[c.card_kind] }}</span></div>',
    '      <div class="muted mt4">{{ H.cardLeft(c) }} · {{ H.cardExp(c) }}</div>',
    '      <div class="muted mt4">开卡门店：{{ clubMap[c.club_id] || \'-\' }}<template v-if="c.membership_name"> · 业绩 {{ c.membership_name }}</template></div>',
    '    </div>',
    '  </van-list>',
    '</div>',
  ].join('\n'),
  methods: {
    qs() {
      const q = { page: this.page, size: 20 };
      if (this.query.keyword && this.query.keyword.trim()) q.keyword = this.query.keyword.trim();
      if (this.query.status !== '') q.status = this.query.status;
      if (this.query.kind !== '') q.kind = this.query.kind;
      return Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
    },
    async fetchPage() {
      this.loading = true;
      try {
        const d = await API.get('/cards?' + this.qs());
        this.list = this.page === 1 ? (d.list || []) : this.list.concat(d.list || []);
        this.total = d.total || 0;
        if (this.list.length >= this.total) { this.finished = true; } else { this.page++; }
      } catch (e) { this.finished = true; }
      finally { this.loading = false; }
    },
    onLoad() { this.fetchPage(); },
    reload() { this.page = 1; this.list = []; this.finished = false; this.fetchPage(); },
    async loadClubs() {
      try {
        const rows = await API.get('/clubs', { silent: true });
        const m = {};
        (rows || []).forEach(c => { m[c.id] = c.name; });
        this.clubMap = m;
      } catch (e) { /* ignore */ }
    },
  },
  mounted() { this.loadClubs(); },
};

window.Pages.StaffCardDetail = {
  data() {
    return {
      d: null, loading: false,
      role: (Store.user || {}).role,
      staffSales: [], coaches: [],
      logs: [], logsLoading: false,
      saving: false,
      renewShow: false, renewForm: {},
      pauseShow: false, pauseForm: { days: 7 },
      stopShow: false, stopReason: '',
      refundShow: false, refundForm: {},
      editShow: false, editForm: {},
      pickerShow: false, pickerMode: '',
    };
  },
  computed: {
    card() { return this.d ? this.d.card : {}; },
    canManage() { return ['admin', 'manager'].includes(this.role); },
    canAdmin() { return ['admin', 'manager', 'platform'].includes(this.role); },
    canWrite() { return ['admin', 'manager', 'membership', 'reception'].includes(this.role); },
    is300PtCard() {
      if (!this.card || this.card.card_kind !== 4) return false;
      const unit = Math.round(Number(this.card.unit_price || 0));
      return unit === 300 || (this.card.card_type_name && this.card.card_type_name.includes('300'));
    },
    payCols() { return Object.keys(DICT.payMethod).map(k => ({ text: DICT.payMethod[k], value: k })); },
    saleCols() { return [{ text: '不指定（默认本人）', value: null }].concat(this.staffSales.map(s => ({ text: s.realname, value: s.id }))); },
    coachCols() { return [{ text: '不指定', value: null }].concat(this.coaches.map(c => ({ text: c.realname, value: c.id }))); },
    pickerCols() {
      const map = { renewPay: this.payCols, refundPay: this.payCols, renewSale: this.saleCols, editSale: this.saleCols, editCoach: this.coachCols };
      return map[this.pickerMode] || [];
    },
    isCountCard() { return Number(this.card.counts) > 0; },
    leftDays() {
      if (!this.card.expire_time) return 0;
      const d = (x) => { const t = new Date(x); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
      return Math.max(0, Math.round((d(this.card.expire_time) - d(new Date())) / 86400000));
    },
    // 常用退课时数快捷选项: 半数 / 全部
    refundQuicks() {
      const n = Number(this.card.left_counts || 0);
      const set = [...new Set([1, Math.floor(n / 2), n].filter(x => x >= 1 && x <= n))];
      return set.sort((a, b) => a - b);
    },
    // 系统建议退款额, 口径与后端 util.cardRemainValue 一致
    suggestRefund() {
      const c = this.card;
      if (this.isCountCard) return Math.round(Number(this.refundForm.refund_counts || 0) * Number(c.unit_price || 0) * 100) / 100;
      if (Number(c.card_kind) === 3) return Math.round((Number(c.left_money || 0) + Number(c.left_gift_money || 0)) * 100) / 100;
      if (!c.expire_time) return Number(c.actual_money || 0);
      const days = Number(c.expire_days || 0);
      if (days <= 0) return 0;
      return Math.round(Number(c.actual_money || 0) * Math.min(this.leftDays, days) / days * 100) / 100;
    },
    // 手工改过金额时给出差额提示, 避免误填
    refundDiff() {
      const v = Number(this.refundForm.refund_money);
      if (!Number.isFinite(v)) return '';
      const diff = Math.round((v - this.suggestRefund) * 100) / 100;
      if (Math.abs(diff) < 0.01) return '';
      return diff > 0 ? `比剩余价值多退 ¥${diff.toFixed(2)}` : `比剩余价值少退 ¥${Math.abs(diff).toFixed(2)}`;
    },
    cardLogs() {
      if (!this.d || !this.logs.length) return [];
      const idTag = '卡#' + this.card.id;
      const name = this.card.realname || '';
      const cat = this.card.card_type_name || '';
      return this.logs.filter(l => {
        const t = l.detail || '';
        return t.indexOf(idTag) !== -1 || (name && cat && t.indexOf(name) !== -1 && t.indexOf(cat) !== -1);
      });
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员卡详情"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="vip-face block" :class="H.faceCls(card)">',
    '      <div class="flex">',
    '        <span class="kind">{{ DICT.cardKind[card.card_kind] }}</span>',
    '        <div class="flex1"></div>',
    '        <d-tag dict="cardStatus" :v="card.status"></d-tag>',
    '      </div>',
    '      <div class="name">{{ card.card_type_name }}</div>',
    '      <div class="left">{{ H.cardLeft(card) }}</div>',
    '      <div class="exp">{{ H.cardExp(card) }}</div>',
    '    </div>',
    '    <div class="card-box" style="padding:4px 8px">',
    '      <van-cell title="会员" :value="card.realname + \' \' + card.phone" is-link @click="$router.push(\'/staff/member/\'+card.vip_id)"/>',
    '      <van-cell title="合同号" :value="card.contract_number || \'-\'"/>',
    '      <van-cell title="实收金额" :value="H.money(card.actual_money)"/>',
    '      <van-cell v-if="Number(card.retainage)>0" title="尾款" :value="H.money(card.retainage)"/>',
    '      <van-cell title="单次单价" :value="H.money(card.unit_price)"/>',
    '      <van-cell title="开卡方式" :value="DICT.openMode[card.open_card_mode] || \'-\'"/>',
    '      <van-cell title="开卡时间" :value="card.open_card_time ? H.full(card.open_card_time) : \'待开卡\'"/>',
    '      <van-cell title="到期时间" :value="card.expire_time ? H.full(card.expire_time) : \'-\'"/>',
    '      <van-cell title="业绩归属" :value="card.membership_name || \'-\'"/>',
    '      <van-cell title="服务教练" :value="card.coach_name || \'-\'"/>',
    '      <van-cell title="经手人" :value="card.ope_username || \'-\'"/>',
    '      <van-cell title="备注" :value="card.remark || \'-\'" :border="false"/>',
    '    </div>',

    '    <div class="flex" style="margin:14px 12px;gap:8px;flex-wrap:wrap" v-if="canWrite || canManage">',
    '      <van-button v-if="canWrite && [1,2,3].includes(card.status)" size="small" round type="primary" @click="openRenew">续费</van-button>',
    '      <van-button v-if="canWrite && card.status===1" size="small" round type="warning" plain @click="openPause">请假/暂停</van-button>',
    '      <van-button v-if="canWrite && card.status===3" size="small" round type="success" plain @click="resume">恢复</van-button>',
    '      <van-button v-if="canManage && [0,1,2,3].includes(card.status)" size="small" round type="danger" plain @click="openStop">停卡</van-button>',
    '      <van-button v-if="canManage && card.status===4" size="small" round type="success" plain @click="enable">启用</van-button>',
    '      <van-button v-if="canManage && card.status!==5" size="small" round type="danger" @click="openRefund">退卡</van-button>',
    '      <van-button v-if="canManage" size="small" round plain @click="openEdit">改卡</van-button>',
    '    </div>',

    '    <div class="sec-title">收款流水（{{ (d.recharges||[]).length }}）</div>',
    '    <van-empty v-if="!(d.recharges||[]).length" description="暂无收款流水" image-size="60"/>',
    '    <div class="card-box" v-else style="padding:2px 8px">',
    '      <van-cell v-for="r in d.recharges" :key="r.id" :title="DICT.rechargeType[r.type]||\'流水\'" :label="H.full(r.insert_time)+\' · \'+(DICT.payMethod[r.pay_method]||r.pay_method)+(r.ope_username?(\' · \'+r.ope_username):\'\')">',
    '        <template #value><span class="price">{{ H.money(r.actual_money) }}</span></template>',
    '      </van-cell>',
    '    </div>',

    '    <div class="sec-title">耗卡流水（{{ (d.spends||[]).length }}）</div>',
    '    <van-empty v-if="!(d.spends||[]).length" description="暂无耗卡流水" image-size="60"/>',
    '    <div class="card-box" v-else style="padding:2px 8px">',
    '      <van-cell v-for="s in d.spends" :key="s.id" :title="DICT.spendScene[s.scene]" :label="H.full(s.insert_time)+(s.coach_name?(\' · \'+s.coach_name):\'\')">',
    '        <template #value>{{ (s.costs ? (\'-\'+H.num(s.costs)+\'次 \') : \'\') + H.money(s.spend_money) }}</template>',
    '      </van-cell>',
    '    </div>',

    '    <template v-if="canManage">',
    '      <div class="sec-title">操作记录</div>',
    '      <van-loading v-if="logsLoading" color="var(--brand)" style="margin:10px 14px" size="18">加载中...</van-loading>',
    '      <van-empty v-else-if="!cardLogs.length" description="暂无相关操作记录" image-size="60"/>',
    '      <div class="card-box" v-else style="padding:2px 8px">',
    '        <van-cell v-for="l in cardLogs" :key="l.id" :title="l.action+\' · \'+H.full(l.insert_time)" :label="(l.username?(l.username+\' · \'):\'\')+l.detail"/>',
    '      </div>',
    '    </template>',
    '  </template>',

    // 续费
    '  <van-popup v-model:show="renewShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px;max-height:78vh;overflow-y:auto" v-if="d">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:6px">续费 · {{ card.realname }} {{ card.card_type_name }}</div>',
    '      <van-field v-if="[1,4].includes(card.card_kind)" v-model="renewForm.add_counts" type="number" label="追加次数" placeholder="0"/>',
    '      <van-field v-model="renewForm.add_days" type="number" label="延长天数" placeholder="0"/>',
    '      <van-field v-model="renewForm.actual_money" type="number" label="实收金额" placeholder="0.00"/>',
    '      <van-field v-if="card.card_kind===3" v-model="renewForm.gift_money" type="number" label="赠送金额" placeholder="0.00"/>',
    '      <van-field :model-value="DICT.payMethod[renewForm.pay_method]" label="支付方式" readonly is-link @click="openPicker(\'renewPay\')"/>',
    '      <van-field :model-value="renewForm.membership_name || saleName(renewForm.membership_id)" label="业绩归属" readonly is-link @click="openPicker(\'renewSale\')"/>',
    '      <van-field v-model="renewForm.remark" label="备注" placeholder="选填" :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="doRenew">确认续费</van-button></div>',
    '    </div>',
    '  </van-popup>',

    // 暂停
    '  <van-popup v-model:show="pauseShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px" v-if="d">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:6px">暂停/请假 · {{ card.card_type_name }}</div>',
    '      <div class="flex" style="padding:8px 0"><span class="flex1">暂停天数</span><van-stepper v-model="pauseForm.days" min="1" integer button-size="26"/></div>',
    '      <div class="muted">暂停期间到期时间自动顺延，提前恢复将扣回未用天数</div>',
    '      <div class="mt12"><van-button type="warning" block round :loading="saving" @click="doPause">确认暂停</van-button></div>',
    '    </div>',
    '  </van-popup>',

    // 停卡
    '  <van-popup v-model:show="stopShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px" v-if="d">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:6px">停卡 · {{ card.realname }} {{ card.card_type_name }}</div>',
    '      <div class="muted" style="margin-bottom:8px">停卡后会员将无法使用该卡</div>',
    '      <van-field v-model="stopReason" type="textarea" rows="2" label="停卡原因" placeholder="请填写停卡原因" :border="false"/>',
    '      <div class="mt12"><van-button type="danger" block round :loading="saving" @click="doStop">确认停卡</van-button></div>',
    '    </div>',
    '  </van-popup>',

    // 退卡
    '  <van-popup v-model:show="refundShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px;max-height:78vh;overflow-y:auto" v-if="d">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:6px">退卡 · {{ card.realname }} {{ card.card_type_name }}</div>',
    '      <div class="muted" style="margin-bottom:10px">实收 {{ H.money(card.actual_money) }}<template v-if="isCountCard"> · 单价 {{ H.money(card.unit_price) }} · 剩余 {{ card.left_counts }} 次</template><template v-else-if="card.expire_time"> · 剩余 {{ leftDays }} 天</template></div>',
    // 计次卡: 选退几节, 金额跟着算; 期卡/储值卡: 直接给出按剩余天数/余额折算的整张剩余价值
    '      <template v-if="isCountCard">',
    '        <div class="rf-box">',
    '          <div class="flex"><span class="flex1" style="font-size:14px">退课时数</span>',
    '            <van-stepper v-model="refundForm.refund_counts" :min="1" :max="card.left_counts" integer @change="syncRefundMoney"/></div>',
    '          <div class="rf-quick">',
    '            <span v-for="q in refundQuicks" :key="q" :class="{on: refundForm.refund_counts===q}" @click="pickRefundCounts(q)">{{ q===card.left_counts ? \'全退 \'+q+\' 次\' : q+\' 次\' }}</span>',
    '          </div>',
    '          <div class="rf-calc">{{ refundForm.refund_counts }} 次 × {{ H.money(card.unit_price) }} = <b>{{ H.money(suggestRefund) }}</b></div>',
    '          <div class="rf-note" v-if="refundForm.refund_counts < card.left_counts">只退部分课时，卡继续可用，退后剩余 {{ card.left_counts - refundForm.refund_counts }} 次</div>',
    '          <div class="rf-note" v-else>退完全部剩余课时，该卡将作废</div>',
    '        </div>',
    '      </template>',
    '      <div class="rf-box" v-else>',
    '        <div class="rf-calc">按剩余价值退款 <b>{{ H.money(suggestRefund) }}</b></div>',
    '        <div class="rf-note" v-if="card.card_kind===3">储值余额 + 剩余赠额</div>',
    '        <div class="rf-note" v-else-if="card.expire_time">实收 {{ H.money(card.actual_money) }} × 剩余 {{ leftDays }} 天 ÷ 共 {{ card.expire_days }} 天</div>',
    '        <div class="rf-note">退卡后该卡不可再使用</div>',
    '      </div>',
    '      <van-field v-model="refundForm.refund_money" type="number" label="退款金额" placeholder="0.00"/>',
    '      <div class="rf-diff" v-if="refundDiff">{{ refundDiff }}</div>',
    '      <van-field :model-value="DICT.payMethod[refundForm.pay_method]" label="退款方式" readonly is-link @click="openPicker(\'refundPay\')"/>',
    '      <van-field v-model="refundForm.reason" type="textarea" rows="2" label="退卡原因" placeholder="选填" :border="false"/>',
    '      <div class="mt12"><van-button type="danger" block round :loading="saving" @click="doRefund">确认退卡</van-button></div>',
    '    </div>',
    '  </van-popup>',

    // 改卡
    '  <van-popup v-model:show="editShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px;max-height:78vh;overflow-y:auto" v-if="d">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:6px">改卡 · {{ card.realname }} {{ card.card_type_name }}</div>',
    '      <van-field label="到期时间">',
    '        <template #input><input type="datetime-local" v-model="editForm.expire_time" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text);width:100%"/></template>',
    '      </van-field>',
    '      <van-field v-if="is300PtCard && canAdmin" v-model="editForm.counts" type="number" label="制卡总次数" placeholder="300元/节私教卡支持修改"/>',
    '      <van-field v-if="[1,4].includes(card.card_kind)" v-model="editForm.left_counts" type="number" label="剩余次数"/>',
    '      <van-field v-if="card.card_kind===3" v-model="editForm.left_money" type="number" label="余额"/>',
    '      <van-field :model-value="editForm.membership_name || saleName(editForm.membership_id)" label="业绩归属" readonly is-link @click="openPicker(\'editSale\')"/>',
    '      <van-field :model-value="editForm.coach_name || coachName(editForm.coach_id)" label="服务教练" readonly is-link @click="openPicker(\'editCoach\')"/>',
    '      <van-field v-model="editForm.reason" label="改卡原因" placeholder="将记入操作日志" :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="doEdit">保存修改</van-button></div>',
    '    </div>',
    '  </van-popup>',

    '  <van-popup v-model:show="pickerShow" position="bottom" round>',
    '    <van-picker :columns="pickerCols" @confirm="onPickerConfirm" @cancel="pickerShow=false" confirm-button-text="确定"></van-picker>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try {
        this.d = await API.get('/cards/' + this.$route.params.id);
        this.loadLogs();
      } finally { this.loading = false; }
    },
    async loadStaff() {
      try {
        const [staff, coaches] = await Promise.all([API.get('/staff', { silent: true }), API.get('/coaches', { silent: true })]);
        this.staffSales = (staff || []).filter(s => s.role === 'membership' && s.status === 1);
        this.coaches = coaches || [];
      } catch (e) { /* ignore */ }
    },
    async loadLogs() {
      if (!this.canManage) return;
      this.logsLoading = true;
      try { this.logs = await API.get('/logs', { silent: true }) || []; }
      catch (e) { this.logs = []; }
      finally { this.logsLoading = false; }
    },
    saleName(id) { const s = this.staffSales.find(x => x.id === id); return s ? s.realname : '不指定（默认本人）'; },
    coachName(id) { const c = this.coaches.find(x => x.id === id); return c ? c.realname : '不指定'; },
    openPicker(mode) { this.pickerMode = mode; this.pickerShow = true; },
    onPickerConfirm(v) {
      const opt = v.selectedOptions[0];
      if (this.pickerMode === 'renewPay') this.renewForm.pay_method = opt.value;
      else if (this.pickerMode === 'refundPay') this.refundForm.pay_method = opt.value;
      else if (this.pickerMode === 'renewSale') { this.renewForm.membership_id = opt.value; this.renewForm.membership_name = opt.value == null ? '' : opt.text; }
      else if (this.pickerMode === 'editSale') { this.editForm.membership_id = opt.value; this.editForm.membership_name = opt.value == null ? '' : opt.text; }
      else if (this.pickerMode === 'editCoach') { this.editForm.coach_id = opt.value; this.editForm.coach_name = opt.value == null ? '' : opt.text; }
      this.pickerShow = false;
    },
    toLocalInput(s) { return s ? String(s).slice(0, 16).replace(' ', 'T') : ''; },
    fromLocalInput(s) { return s ? s.replace('T', ' ') + ':00' : null; },

    openRenew() {
      this.renewForm = { add_counts: 0, add_days: 0, actual_money: 0, gift_money: 0, pay_method: 'wechat', membership_id: null, membership_name: '', remark: '' };
      this.renewShow = true;
    },
    async doRenew() {
      const f = this.renewForm;
      this.saving = true;
      try {
        await API.post('/cards/' + this.card.id + '/renew', {
          add_counts: Number(f.add_counts || 0), add_days: Number(f.add_days || 0), actual_money: Number(f.actual_money || 0),
          gift_money: Number(f.gift_money || 0), pay_method: f.pay_method, membership_id: f.membership_id,
          membership_name: f.membership_id != null ? f.membership_name : undefined, remark: f.remark,
        });
        this.renewShow = false;
        vant.showToast({ message: '续费成功', icon: 'success' });
        this.load();
      } finally { this.saving = false; }
    },

    openPause() { this.pauseForm = { days: 7 }; this.pauseShow = true; },
    async doPause() {
      if (!(Number(this.pauseForm.days) > 0)) return vant.showToast('请填写暂停天数');
      this.saving = true;
      try {
        await API.post('/cards/' + this.card.id + '/pause', { days: Number(this.pauseForm.days) });
        this.pauseShow = false;
        vant.showToast({ message: '已暂停', icon: 'success' });
        this.load();
      } finally { this.saving = false; }
    },
    async resume() {
      try { await vant.showConfirmDialog({ title: '恢复会员卡', message: '确定恢复该卡？未用完的暂停天数将从到期时间扣回。', confirmButtonColor: 'var(--brand)' }); }
      catch (e) { return; }
      await API.post('/cards/' + this.card.id + '/resume');
      vant.showToast({ message: '已恢复', icon: 'success' });
      this.load();
    },

    openStop() { this.stopReason = ''; this.stopShow = true; },
    async doStop() {
      this.saving = true;
      try {
        await API.post('/cards/' + this.card.id + '/stop', { reason: this.stopReason || '' });
        this.stopShow = false;
        vant.showToast({ message: '已停卡', icon: 'success' });
        this.load();
      } finally { this.saving = false; }
    },
    async enable() {
      try { await vant.showConfirmDialog({ title: '启用会员卡', message: '确定重新启用该卡？', confirmButtonColor: 'var(--brand)' }); }
      catch (e) { return; }
      await API.post('/cards/' + this.card.id + '/enable');
      vant.showToast({ message: '已启用', icon: 'success' });
      this.load();
    },

    openRefund() {
      this.refundForm = {
        refund_counts: Number(this.card.left_counts || 0) || 1,
        refund_money: 0, pay_method: this.card.pay_method || 'cash', reason: '',
      };
      this.refundForm.refund_money = this.suggestRefund;   // 默认填系统算出的剩余价值
      this.refundShow = true;
    },
    pickRefundCounts(n) { this.refundForm.refund_counts = n; this.syncRefundMoney(); },
    // 改课时数时把退款额重算一遍(员工仍可手工覆盖)
    syncRefundMoney() { this.$nextTick(() => { this.refundForm.refund_money = this.suggestRefund; }); },
    async doRefund() {
      if (this.refundForm.refund_money === '' || this.refundForm.refund_money == null) return vant.showToast('请填写退款金额');
      this.saving = true;
      try {
        await API.post('/cards/' + this.card.id + '/refund', {
          refund_money: Number(this.refundForm.refund_money), pay_method: this.refundForm.pay_method, reason: this.refundForm.reason,
          refund_counts: this.isCountCard ? Number(this.refundForm.refund_counts) : undefined,
        });
        this.refundShow = false;
        vant.showToast({ message: '退卡完成', icon: 'success' });
        this.load();
      } finally { this.saving = false; }
    },

    openEdit() {
      this.editForm = {
        expire_time: this.toLocalInput(this.card.expire_time), counts: this.card.counts, left_counts: this.card.left_counts, left_money: Number(this.card.left_money || 0),
        membership_id: this.card.membership_id || null, membership_name: this.card.membership_name || '',
        coach_id: this.card.coach_id || null, coach_name: this.card.coach_name || '', reason: '',
      };
      this.editShow = true;
    },
    async doEdit() {
      const is300 = this.is300PtCard;
      if (!this.editForm.reason && !(is300 && Number(this.editForm.counts) !== Number(this.card.counts))) return vant.showToast('请填写改卡原因');
      const f = this.editForm;
      const body = { expire_time: this.fromLocalInput(f.expire_time), reason: (f.reason || '修改300元私教卡次数').trim() };
      if (is300 && this.canAdmin && f.counts != null) body.counts = Number(f.counts);
      if ([1, 4].includes(this.card.card_kind)) body.left_counts = Number(f.left_counts);
      if (this.card.card_kind === 3) body.left_money = Number(f.left_money);
      if (f.membership_id != null) { body.membership_id = f.membership_id; body.membership_name = f.membership_name || ''; }
      if (f.coach_id != null) { body.coach_id = f.coach_id; body.coach_name = f.coach_name || ''; }
      this.saving = true;
      try {
        await API.put('/cards/' + this.card.id, body);
        this.editShow = false;
        vant.showToast({ message: '改卡成功', icon: 'success' });
        this.load();
      } finally { this.saving = false; }
    },
  },
  mounted() { this.load(); this.loadStaff(); },
};

window.Pages.StaffContracts = {
  mixins: [window.SignPadMixin],
  data() {
    return {
      query: { keyword: '', sign_status: '' },
      list: [], total: 0, page: 1,
      loading: false, finished: false,
      dShow: false, cur: null, pending: 0,
    };
  },
  computed: {
    signOpts() { return [{ text: '全部状态', value: '' }, { text: '待签署', value: 0 }, { text: '已签署', value: 1 }]; },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="合同管理"></m-nav>',
    '  <van-search v-model="query.keyword" placeholder="会员 / 手机号 / 合同号" @search="reload" @clear="reload">',
    '    <template #action><div @click="reload" style="color:var(--brand)">搜索</div></template>',
    '  </van-search>',
    '  <van-dropdown-menu>',
    '    <van-dropdown-item v-model="query.sign_status" :options="signOpts" @change="reload"></van-dropdown-item>',
    '  </van-dropdown-menu>',
    '  <div class="tip-box" v-if="pending && query.sign_status===\'\'" @click="onlyPending">',
    '    <van-icon name="warning-o"/> 有 <b>{{ pending }}</b> 份合同待签署，点此只看待签署 <van-icon name="arrow" size="11"/>',
    '  </div>',
    '  <div class="muted" style="margin:10px 12px 0">{{ total ? (\'共 \'+total+\' 份合同\') : \'\' }}</div>',
    '  <van-list v-model:loading="loading" :finished="finished" :finished-text="list.length ? \'没有更多了\' : \'\'" @load="onLoad">',
    '    <van-empty v-if="finished && !list.length" description="暂无合同"></van-empty>',
    '    <div v-for="c in list" :key="c.id" class="rec-item flex" @click="view(c)">',
    '      <van-icon name="notes-o" size="26" color="var(--brand)"></van-icon>',
    '      <div class="flex1" style="margin-left:12px">',
    '        <div class="name">{{ c.title }}</div>',
    '        <div class="muted mt4">{{ c.contract_num }}</div>',
    '        <div class="muted mt4">{{ c.realname }} {{ c.phone }} · {{ H.full(c.insert_time) }}</div>',
    '      </div>',
    '      <d-tag dict="signStatus" :v="c.sign_status"></d-tag>',
    '      <van-icon name="arrow" color="var(--c-text-4)" style="margin-left:4px"></van-icon>',
    '    </div>',
    '  </van-list>',

    '  <van-popup v-model:show="dShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:18px 16px 24px;max-height:78vh;overflow-y:auto" v-if="cur">',
    '      <div class="flex">',
    '        <div class="flex1" style="font-size:16px;font-weight:700">{{ cur.title }}</div>',
    '        <d-tag dict="signStatus" :v="cur.sign_status"></d-tag>',
    '      </div>',
    '      <div class="muted mt4">合同号 {{ cur.contract_num }}</div>',
    '      <div class="muted mt4">{{ cur.realname }} {{ cur.phone }}</div>',
    '      <div class="muted mt4" v-if="cur.sign_status===1">签署于 {{ H.full(cur.sign_time) }}',
    '        <template v-if="cur.sign_source===2"> · 店内当面签<template v-if="cur.sign_by">（经办 {{ cur.sign_by }}）</template></template>',
    '        <template v-else> · 会员自助签署</template></div>',
    '      <div class="muted mt4" v-else>会员可自己在小程序签，也可把手机递给会员当面签</div>',
    '      <van-divider style="margin:12px 0"></van-divider>',
    '      <div class="contract-body">{{ cur.content }}</div>',
    '      <template v-if="cur.sign_status===1 && cur.sign_img">',
    '        <van-divider style="margin:12px 0">会员签名</van-divider>',
    '        <img :src="cur.sign_img" class="sign-img-show" style="width:60%"/>',
    '      </template>',
    '      <div class="flex mt12" style="gap:10px" v-if="cur.sign_status===0">',
    '        <van-button round style="flex:1" @click="dShow=false">关闭</van-button>',
    '        <van-button round type="primary" style="flex:1.4" icon="edit" @click="startSign">请会员当面签署</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',

    // 当面签: 把手机递给会员手写, 提交后即为已签署
    '  <van-popup v-model:show="padShow" position="bottom" round safe-area-inset-bottom @opened="initPad">',
    '    <div class="sign-pad-wrap" v-if="cur">',
    '      <div class="flex" style="margin-bottom:4px">',
    '        <div class="flex1" style="font-size:16px;font-weight:600">请 {{ cur.realname }} 手写签名</div>',
    '      </div>',
    '      <div class="muted" style="margin-bottom:10px">签署即视为本人已阅读并同意《{{ cur.title }}》全部条款</div>',
    '      <canvas ref="pad" class="sign-canvas"></canvas>',
    '      <div class="flex mt12" style="gap:10px">',
    '        <van-button round block plain type="primary" @click="clearPad">重写</van-button>',
    '        <van-button round block type="primary" :loading="submitting" @click="submitSign">确认签署</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    qs() {
      const q = { page: this.page, size: 20 };
      if (this.query.keyword && this.query.keyword.trim()) q.keyword = this.query.keyword.trim();
      if (this.query.sign_status !== '') q.sign_status = this.query.sign_status;
      return Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
    },
    async fetchPage() {
      this.loading = true;
      try {
        const d = await API.get('/contracts?' + this.qs());
        this.list = this.page === 1 ? (d.list || []) : this.list.concat(d.list || []);
        this.total = d.total || 0;
        if (this.list.length >= this.total) { this.finished = true; } else { this.page++; }
      } catch (e) { this.finished = true; }
      finally { this.loading = false; }
    },
    onLoad() { this.fetchPage(); },
    reload() { this.page = 1; this.list = []; this.finished = false; this.fetchPage(); },
    onlyPending() { this.query.sign_status = 0; this.reload(); },
    async view(row) {
      this.cur = await API.get('/contracts/' + row.id);
      this.dShow = true;
    },
    async loadPending() {
      try { const d = await API.get('/contracts/pending-count', { silent: true }); this.pending = (d && d.count) || 0; }
      catch (e) { this.pending = 0; }
    },
    // 当面签: 收起合同详情再开签名板, 两个底部弹层不叠在一起
    startSign() { this.dShow = false; this.drawn = false; setTimeout(() => this.openPad(), 260); },
    async submitSign() {
      if (!this.drawn) return vant.showToast('请先手写签名');
      this.submitting = true;
      try {
        const img = this.$refs.pad.toDataURL('image/png');
        await API.post('/contracts/' + this.cur.id + '/sign', { sign_img: img });
        this.padShow = false;
        vant.showToast({ message: '已签署', icon: 'success' });
        this.loadPending();
        this.reload();
      } finally { this.submitting = false; }
    },
  },
  async mounted() {
    this.loadPending();
    // 开卡后带 ?sign=合同id 过来: 直接把签名板推到会员面前
    const sid = this.$route.query.sign;
    if (!sid) return;
    try {
      this.cur = await API.get('/contracts/' + sid);
      if (this.cur.sign_status === 0) { this.drawn = false; this.openPad(); }
      else this.dShow = true;
    } catch (e) { /* 合同取不到就正常显示列表 */ }
  },
};

/* 页面清单 (建议路由，由主进程统一接入路由表):
 * window.Pages.StaffCardList   建议路由 /staff/cards      会员卡列表: 关键词搜索 + 卡状态筛选 + 卡种筛选 + van-list 分页(20/页)，点击进入详情
 * window.Pages.StaffCardDetail 建议路由 /staff/card/:id   会员卡详情: 基本信息 + 收款/耗卡流水 + 操作记录(仅admin/manager) + 续费/请假(暂停)/恢复/停卡/启用/退卡/改卡
 * window.Pages.StaffContracts  建议路由 /staff/contracts  合同管理: 关键词搜索 + 签署状态筛选 + van-list 分页(20/页)，点击查看合同内容与签署状态
 */
