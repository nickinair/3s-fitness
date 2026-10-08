/* 员工端-会员查询 / 会员详情(维护) / 录潜客 */
window.Pages.StaffMembers = {
  data() { return { kw: '', list: [], stats: null, total: 0, loading: false, searched: false, quick: '' }; },
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
    quickLabel() { const c = this.quickCells.find(x => x.k === this.quick); return c ? c.l : ''; },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员查询"></m-nav>',
    '  <van-search v-model="kw" placeholder="姓名 / 昵称 / 手机号" show-action @search="search" @clear="search">',
    '    <template #action><div @click="search" style="color:#0d5e56">搜索</div></template>',
    '  </van-search>',
    // 四个统计可点, 点中即按该口径筛选列表; 再点一次取消
    '  <div class="stat-row tapable" v-if="stats" style="margin-top:12px">',
    '    <div v-for="c in quickCells" :key="c.k" class="stat-cell tap" :class="{on:quick===c.k}" @click="pickQuick(c.k)">',
    '      <div class="v">{{ c.v }}</div><div class="l">{{ c.l }}</div>',
    '    </div>',
    '  </div>',
    '  <div v-if="quick" class="qk-bar">',
    '    <van-tag type="primary" round size="medium">{{ quickLabel }}</van-tag>',
    '    <span class="muted" style="margin-left:8px">共 {{ total }} 人</span>',
    '    <span class="flex1"></span>',
    '    <span class="brand-text" style="font-size:13px" @click="pickQuick(quick)">清除筛选</span>',
    '  </div>',
    '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="searched && !list.length" description="没有符合条件的会员"/>',
    '    <div v-for="m in list" :key="m.id" class="rec-item flex" :class="{black:m.is_black}" @click="$router.push(\'/staff/member/\'+m.id)">',
    '      <m-avatar :name="m.realname||m.nickname" :size="44" :style="m.is_black?{background:\'#ee0a24\'}:{}"></m-avatar>',
    '      <div class="flex1" style="margin-left:12px">',
    '        <div class="name">{{ m.realname || m.nickname || \'未命名\' }}',
    '          <van-tag v-if="m.is_black" type="danger" style="margin-left:4px">黑名单</van-tag>',
    '          <d-tag v-else dict="expireStatus" :v="m.expire_status" style="margin-left:4px"></d-tag>',
    '        </div>',
    '        <div class="muted mt4">{{ m.phone }} <template v-if="m.membership_name">· 业绩归属 {{ m.membership_name }}</template></div>',
    '        <div class="muted mt4" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.card_names || \'无持卡\' }}</div>',
    '      </div>',
    '      <van-icon name="arrow" color="#c8c9cc"/>',
    '    </div>',
    '    <div class="muted" v-if="total>list.length" style="text-align:center;padding:6px 0 14px">共 {{ total }} 人，仅显示前 {{ list.length }} 条，请细化关键词</div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    // 再点同一个 = 取消筛选
    pickQuick(k) { this.quick = this.quick === k ? '' : k; this.search(); },
    async search() {
      this.loading = true;
      try {
        const q = '/members?keyword=' + encodeURIComponent(this.kw.trim()) + '&size=30'
          + (this.quick ? '&quick=' + this.quick : '');
        const d = await API.get(q);
        this.list = d.list || []; this.stats = d.stats; this.total = d.total || 0; this.searched = true;
      } finally { this.loading = false; }
    },
  },
  mounted() { this.search(); },
};

window.Pages.StaffMemberDetail = {
  data() {
    return {
      d: null, loading: true, tab: 0,
      mShow: false, mType: 1, mContent: '', mSaving: false,
      bodyRecords: [], bShow: false, bSaving: false,
      bForm: { record_date: H.today(), height: '', weight: '', body_fat: '', muscle: '', waist: '', remark: '' },
    };
  },
  computed: {
    p() { return this.d && this.d.profile; },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员详情"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="black-warn" v-if="p.is_black"><van-icon name="warning"/> 黑名单会员{{ p.black_reason ? \'：\'+p.black_reason : \'\' }}</div>',
    '    <div class="card-box">',
    '      <div class="flex">',
    '        <m-avatar :name="p.realname||p.nickname" :size="50"></m-avatar>',
    '        <div class="flex1" style="margin-left:12px">',
    '          <div style="font-size:17px;font-weight:700">{{ p.realname || p.nickname }} <span class="muted" style="font-weight:400">{{ DICT.gender[p.gender] }}</span></div>',
    '          <div class="muted mt4">{{ p.phone }}</div>',
    '        </div>',
    '        <d-tag dict="expireStatus" :v="p.expire_status"></d-tag>',
    '      </div>',
    '      <van-divider style="margin:10px 0"/>',
    '      <div class="muted" style="line-height:2">',
    '        来源：{{ p.source_name || \'-\' }} · 意向：{{ DICT.labelLv[p.label_levels] }}<br/>',
    '        业绩归属：{{ p.membership_name || \'-\' }} · 主教练：{{ p.coach_name || \'-\' }}<template v-if="p.sub_coach_name"> · 副教练：{{ p.sub_coach_name }}</template><br/>',
    '        <template v-if="p.expire_time">最近到期：{{ H.dateOf(p.expire_time) }}<br/></template>',
    '        <template v-if="p.remark">备注:{{ p.remark }}<br/></template>',
    '        注册时间：{{ H.full(p.insert_time) }}',
    '      </div>',
    '    </div>',
    '    <div class="sec-title">持卡（{{ (d.cards||[]).length }}）</div>',
    '    <van-empty v-if="!(d.cards||[]).length" description="无持卡" image-size="60"/>',
    '    <div class="card-box" v-else style="padding:2px 8px">',
    '      <van-cell v-for="c in d.cards" :key="c.id" :title="c.card_type_name" :label="H.cardLeft(c)+\' · \'+H.cardExp(c)" is-link @click="$router.push(\'/staff/card/\'+c.id)">',
    '        <template #value><d-tag dict="cardStatus" :v="c.status"></d-tag></template>',
    '      </van-cell>',
    '    </div>',
    '    <div class="sec-title">最近流水</div>',
    '    <div class="card-box" style="padding:6px 4px 10px">',
    '      <van-tabs v-model:active="tab" color="#0d5e56">',
    '        <van-tab :title="\'收款(\'+(d.recharges||[]).length+\')\'">',
    '          <van-empty v-if="!(d.recharges||[]).length" description="暂无收款" image-size="60"/>',
    '          <van-cell v-for="r in (d.recharges||[]).slice(0,10)" :key="r.id" :title="(DICT.rechargeType[r.type]||\'\')+\' · \'+r.card_type_name" :label="H.full(r.insert_time)">',
    '            <template #value><span class="price">{{ H.money(r.actual_money) }}</span></template>',
    '          </van-cell>',
    '        </van-tab>',
    '        <van-tab :title="\'耗卡(\'+(d.spends||[]).length+\')\'">',
    '          <van-empty v-if="!(d.spends||[]).length" description="暂无耗卡" image-size="60"/>',
    '          <van-cell v-for="s in (d.spends||[]).slice(0,10)" :key="s.id" :title="DICT.spendScene[s.scene]+\' · \'+s.card_type_name" :label="H.full(s.insert_time)">',
    '            <template #value>{{ H.money(s.spend_money) }}</template>',
    '          </van-cell>',
    '        </van-tab>',
    '        <van-tab :title="\'签到(\'+(d.checkins||[]).length+\')\'">',
    '          <van-empty v-if="!(d.checkins||[]).length" description="暂无签到" image-size="60"/>',
    '          <van-cell v-for="c in (d.checkins||[]).slice(0,10)" :key="c.id" :title="H.dt(c.check_in_time)" :label="c.card_type_name" />',
    '        </van-tab>',
    '      </van-tabs>',
    '    </div>',
    '    <div class="sec-title">维护记录（{{ (d.maintains||[]).length }}）<span class="more brand-text" @click="mShow=true"><van-icon name="add-o"/> 新增维护</span></div>',
    '    <van-empty v-if="!(d.maintains||[]).length" description="暂无维护记录" image-size="60"/>',
    '    <div v-else class="card-box" style="padding:2px 8px">',
    '      <van-cell v-for="m in (d.maintains||[]).slice(0,10)" :key="m.id" :label="(m.membership_name||\'\')+\' · \'+H.full(m.insert_time)">',
    '        <template #title><van-tag plain type="primary">{{ DICT.maintainType[m.record_type]||\'其他\' }}</van-tag> <span style="font-size:14px">{{ m.content }}</span></template>',
    '      </van-cell>',
    '    </div>',

    '    <div class="sec-title">体测数据（{{ bodyRecords.length }}）<span class="more brand-text" @click="openBody"><van-icon name="add-o"/> 录入</span></div>',
    '    <van-empty v-if="!bodyRecords.length" description="暂无体测记录" image-size="60"/>',
    '    <div v-else class="card-box" style="padding:2px 8px">',
    '      <van-cell v-for="b in bodyRecords" :key="b.id" :title="H.dateOf(b.record_date)" :label="(b.remark||\'\')+(b.coach_name?(b.remark?\' · \':\'\')+b.coach_name+\' 录入\':\'\')">',
    '        <template #value><span style="font-size:13px">体重 <b>{{ b.weight!=null?H.num(b.weight):\'-\' }}</b>kg · 体脂 <b>{{ b.body_fat!=null?H.num(b.body_fat):\'-\' }}</b>%</span></template>',
    '      </van-cell>',
    '    </div>',

    '  </template>',
    '  <van-popup v-model:show="bShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">录入体测数据</div>',
    '      <van-field label="日期">',
    '        <template #input><input type="date" v-model="bForm.record_date" style="border:none;outline:none;background:transparent;font-size:14px;color:#323233"/></template>',
    '      </van-field>',
    '      <van-field v-model="bForm.height" type="number" label="身高(cm)" placeholder="如 165"/>',
    '      <van-field v-model="bForm.weight" type="number" label="体重(kg)" placeholder="如 52.5"/>',
    '      <van-field v-model="bForm.body_fat" type="number" label="体脂率(%)" placeholder="如 24.1"/>',
    '      <van-field v-model="bForm.muscle" type="number" label="肌肉量(kg)" placeholder="选填"/>',
    '      <van-field v-model="bForm.waist" type="number" label="腰围(cm)" placeholder="选填"/>',
    '      <van-field v-model="bForm.remark" label="备注" placeholder="选填" :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="bSaving" @click="saveBody">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="mShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">新增维护记录</div>',
    '      <van-field label="方式">',
    '        <template #input>',
    '          <van-radio-group v-model="mType" direction="horizontal">',
    '            <van-radio :name="1">电话</van-radio><van-radio :name="2">到店</van-radio><van-radio :name="3">微信</van-radio><van-radio :name="4">其他</van-radio>',
    '          </van-radio-group>',
    '        </template>',
    '      </van-field>',
    '      <van-field v-model="mContent" type="textarea" rows="3" label="内容" placeholder="沟通内容 / 跟进要点" maxlength="200" show-word-limit/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="mSaving" @click="saveMaintain">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await API.get('/members/' + this.$route.params.id); }
      finally { this.loading = false; }
      this.loadBody();
    },
    async loadBody() {
      try { this.bodyRecords = (await API.get('/body-records?vip_id=' + this.$route.params.id, { silent: true })) || []; }
      catch (e) { /* ignore */ }
    },
    openBody() {
      this.bForm = { record_date: H.today(), height: '', weight: '', body_fat: '', muscle: '', waist: '', remark: '' };
      this.bShow = true;
    },
    async saveBody() {
      if (!this.bForm.record_date) return vant.showToast('请选择日期');
      if (!this.bForm.weight && !this.bForm.body_fat) return vant.showToast('请至少填写体重或体脂率');
      this.bSaving = true;
      try {
        await API.post('/body-records', {
          vip_id: Number(this.$route.params.id),
          record_date: this.bForm.record_date,
          height: this.bForm.height === '' ? null : Number(this.bForm.height),
          weight: this.bForm.weight === '' ? null : Number(this.bForm.weight),
          body_fat: this.bForm.body_fat === '' ? null : Number(this.bForm.body_fat),
          muscle: this.bForm.muscle === '' ? null : Number(this.bForm.muscle),
          waist: this.bForm.waist === '' ? null : Number(this.bForm.waist),
          remark: this.bForm.remark,
        });
        this.bShow = false;
        vant.showToast({ message: '已录入', icon: 'success' });
        this.loadBody();
      } finally { this.bSaving = false; }
    },
    async saveMaintain() {
      if (!this.mContent.trim()) return vant.showToast('请填写维护内容');
      this.mSaving = true;
      try {
        await API.post('/maintain-records', { vip_user_id: this.p.id, vip_user_type: 1, record_type: this.mType, content: this.mContent.trim() });
        this.mShow = false; this.mContent = '';
        vant.showToast({ message: '已保存', icon: 'success' });
        this.load();
      } finally { this.mSaving = false; }
    },
  },
  mounted() { this.load(); },
};

window.Pages.StaffPotential = {
  data() {
    return {
      form: { realname: '', phone: '', gender: 1, source_id: 0, source_name: '', label_levels: 1, remark: '' },
      sources: [], srcShow: false, saving: false,
    };
  },
  computed: { srcCols() { return this.sources.map(s => ({ text: s.title, value: s.id })); } },
  template: [
    '<div class="page">',
    '  <m-nav title="录入潜客"></m-nav>',
    '  <div class="card-box" style="padding:6px 0">',
    '    <van-field v-model="form.realname" label="姓名" placeholder="潜客姓名" />',
    '    <van-field v-model="form.phone" type="tel" maxlength="11" label="手机号" placeholder="11位手机号" />',
    '    <van-field label="性别">',
    '      <template #input><van-radio-group v-model="form.gender" direction="horizontal"><van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio></van-radio-group></template>',
    '    </van-field>',
    '    <van-field :model-value="form.source_name" label="来源" placeholder="选择来源渠道" readonly is-link @click="srcShow=true"/>',
    '    <van-field label="意向等级">',
    '      <template #input>',
    '        <van-radio-group v-model="form.label_levels" direction="horizontal">',
    '          <van-radio :name="1">A 高</van-radio><van-radio :name="2">B 中</van-radio><van-radio :name="3">C 低</van-radio>',
    '        </van-radio-group>',
    '      </template>',
    '    </van-field>',
    '    <van-field v-model="form.remark" type="textarea" rows="2" label="备注" placeholder="需求 / 训练目标 / 跟进要点" :border="false"/>',
    '  </div>',
    '  <div style="margin:20px 16px">',
    '    <van-button type="primary" block round :loading="saving" @click="save">保存潜客</van-button>',
    '  </div>',
    '  <van-popup v-model:show="srcShow" position="bottom" round><van-picker :columns="srcCols" @confirm="onSrc" @cancel="srcShow=false" confirm-button-text="确定"/></van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    onSrc(v) { this.form.source_id = v.selectedOptions[0].value; this.form.source_name = v.selectedOptions[0].text; this.srcShow = false; },
    async save() {
      if (!this.form.realname) return vant.showToast('请填写姓名');
      if (!/^1\d{10}$/.test(this.form.phone)) return vant.showToast('请输入正确的手机号');
      this.saving = true;
      try {
        await API.post('/potentials', this.form);
        vant.showToast({ message: '潜客已录入', icon: 'success' });
        this.form = { realname: '', phone: '', gender: 1, source_id: 0, source_name: '', label_levels: 1, remark: '' };
      } finally { this.saving = false; }
    },
  },
  async mounted() {
    try { this.sources = await API.get('/sources', { silent: true }); } catch (e) { /* ignore */ }
  },
};
