/* 员工端-快速开卡 */
window.Pages.StaffOpenCard = {
  data() {
    return {
      mode: 'exist',                       // exist | new
      kw: '', results: [], searching: false, vip: null, rPage: 1, rTotal: 0, kwTimer: null,
      nm: { realname: '', phone: '', gender: 1, source_id: 0, source_name: '' },
      sources: [], srcShow: false,
      cats: [], kind: 0, cat: null,
      clubs: [], staff: [], coaches: [],
      form: { club_id: null, actual_money: '', retainage: '', pay_method: 'wechat', open_card_mode: 1, open_date: '',
        membership_id: null, membership_name: '', coach_id: null, coach_name: '', remark: '' },
      payShow: false, modeShow: false, saleShow: false, coachShow: false,
      submitting: false,
      confirmShow: false, fromIntent: null,   // 开卡前的核对页 / 由购卡意向带入的原始记录
      lockVip: false,                         // 会员已由意向确定, 折叠掉选会员那一步
      step: 1,                                // 分步: 1选会员 2选卡 3收款
    };
  },
  computed: {
    kinds() { const ks = []; [1, 2, 3, 4].forEach(k => { if (this.cats.some(c => c.card_kind === k)) ks.push(k); }); return ks; },
    kindCats() { return this.cats.filter(c => c.card_kind === this.kind); },
    payCols() { return Object.keys(DICT.payMethod).filter(k => k !== 'store').map(k => ({ text: DICT.payMethod[k], value: k })); },
    modeCols() { return [1, 2, 3].map(k => ({ text: DICT.openMode[k], value: k })); },
    srcCols() { return this.sources.map(s => ({ text: s.title, value: s.id })); },
    saleCols() { return [{ text: '不指定（默认记在自己名下）', value: 0 }].concat(this.staff.map(s => ({ text: s.realname, value: s.id }))); },
    coachCols() { return [{ text: '不指定', value: 0 }].concat(this.coaches.map(c => ({ text: c.realname, value: c.id }))); },
    clubName() { const c = this.clubs.find(x => x.id === this.form.club_id); return c ? c.name : '请选择'; },
    // 核对页用: 会员显示名 / 卡 / 门店
    whoName() { return this.mode === 'exist' ? (this.vip ? this.vip.realname : '') : this.nm.realname; },
    whoPhone() { return this.mode === 'exist' ? (this.vip ? this.vip.phone : '') : this.nm.phone; },
    confirmClub() { const c = this.clubs.find(x => x.id === this.form.club_id); return c ? c.name : ''; },
    stepTitles() { return ['选择会员', '选择卡类型', '收款信息']; },
    // 底部主按钮: 前两步是翻页, 第三步唤起核对单
    nextText() {
      if (this.step < 3) return '下一步（' + this.step + '/3）';
      return '核对开卡（3/3）' + (this.form.actual_money ? ' · 收款 ' + H.money(this.form.actual_money) : '');
    },
  },
  template: [
    // 第一步锁定整屏高度: 只让会员列表内部滚动, 否则页面和列表两层滚动会把「加载更多」顶到按钮下面
    '<div class="page oc-page" :class="{\'oc-fit\': step===1 && !lockVip && mode===\'exist\'}">',
    '  <m-nav title="快速开卡"></m-nav>',

    // 分步进度条: 已完成的步骤可点回去改
    '  <div class="oc-steps">',
    '    <div v-for="(t,i) in stepTitles" :key="i" class="oc-step" :class="{on:step===i+1, done:step>i+1}" @click="goStep(i+1)">',
    '      <div class="n"><van-icon v-if="step>i+1" name="success"/><template v-else>{{ i+1 }}</template></div>',
    '      <div class="t">{{ t }}</div>',
    '    </div>',
    '  </div>',

    /* ===== 第 1 步: 选择会员 ===== */
    // 从购卡意向进来时会员已确定, 折叠成一行, 并直接跳到第 2 步
    '  <template v-if="step===1 && lockVip">',
    '    <div class="card-box oc-locked flex">',
    '      <m-avatar :name="vip.realname" :size="38"></m-avatar>',
    '      <div class="flex1" style="margin-left:10px">',
    '        <div style="font-size:15px;font-weight:600">{{ vip.realname }}',
    '          <van-tag v-if="vip.is_black" type="danger" style="margin-left:4px">黑名单</van-tag></div>',
    '        <div class="muted mt4">{{ vip.phone }} · 来自购卡意向</div>',
    '      </div>',
    '      <van-button size="small" round plain @click="unlockVip">更换</van-button>',
    '    </div>',
    '  </template>',

    '  <template v-else-if="step===1">',
    '  <div class="card-box oc-pick" style="padding:10px 12px">',
    '    <van-tabs v-model:active="mode" type="card" color="#0d5e56" style="margin-bottom:10px">',
    '      <van-tab title="已有会员" name="exist"></van-tab>',
    '      <van-tab title="新会员建档" name="new"></van-tab>',
    '    </van-tabs>',
    '    <template v-if="mode===\'exist\'">',
    '      <van-search v-model="kw" placeholder="姓名 / 手机号，留空显示最近添加的会员" style="padding:0 0 4px" @update:model-value="onKw" @search="search(true)"/>',
    '      <div class="muted" style="padding:0 4px 6px">共 {{ rTotal }} 人，按添加时间从新到旧</div>',
    '      <div class="oc-members">',
    '        <div v-for="m in results" :key="m.id" class="cat-pick flex" :class="{on:vip && vip.id===m.id}" @click="vip=m">',
    '          <div class="flex1"><b>{{ m.realname || \'未命名\' }}</b> <span class="muted">{{ m.phone }}</span>',
    '            <van-tag v-if="m.is_black" type="danger" style="margin-left:4px">黑名单</van-tag></div>',
    '          <van-icon v-if="vip && vip.id===m.id" name="checked" color="#0d5e56" size="20"/>',
    '        </div>',
    '        <div v-if="searching" style="text-align:center;padding:8px"><van-loading size="20" color="#0d5e56"/></div>',
    '        <van-empty v-else-if="!results.length" description="没有匹配的会员" image-size="60"/>',
    '        <div v-else-if="results.length < rTotal" style="text-align:center;padding:6px 0 2px" @click="search(false)"><span class="brand-text" style="font-size:13px">加载更多（还有 {{ rTotal - results.length }} 人）</span></div>',
    '      </div>',
    '      <div class="muted" v-if="vip" style="padding-top:6px">已选：<b class="brand-text">{{ vip.realname }}</b> {{ vip.phone }}</div>',
    '    </template>',
    '    <template v-else>',
    '      <van-field v-model="nm.realname" label="姓名" placeholder="会员姓名" />',
    '      <van-field v-model="nm.phone" type="tel" maxlength="11" label="手机号" placeholder="11位手机号" />',
    '      <van-field label="性别">',
    '        <template #input><van-radio-group v-model="nm.gender" direction="horizontal"><van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio></van-radio-group></template>',
    '      </van-field>',
    '      <van-field :model-value="nm.source_name" label="来源" placeholder="选择来源渠道" readonly is-link @click="srcShow=true" :border="false"/>',
    '    </template>',
    '  </div>',
    '  </template>',

    /* ===== 第 2 步: 选择门店与卡 ===== */
    '  <template v-if="step===2">',
    '  <div class="card-box oc-who flex" v-if="whoName">',
    '    <van-icon name="manager-o" color="#0d5e56"/>',
    '    <span style="margin-left:6px">为 <b>{{ whoName }}</b> <span class="muted">{{ whoPhone }}</span> 开卡</span>',
    '  </div>',
    // 门店决定卡归属, 放在卡种 tab 之前先定下来
    '  <div v-if="clubs.length>1" class="card-box" style="padding:12px">',
    '    <div class="oc-store">',
    '      <div class="oc-store-t"><van-icon name="shop-o"/> 开卡门店</div>',
    '      <div class="oc-store-seg">',
    '        <div v-for="c in clubs" :key="c.id" class="oc-store-btn" :class="{on:form.club_id===c.id}" @click="form.club_id=c.id">{{ c.name }}</div>',
    '      </div>',
    '      <div class="oc-store-tip">卡归属此门店，流水与统计计入该店（跨店上课不改变归属）</div>',
    '    </div>',
    '  </div>',
    '  <div class="card-box" style="padding:10px 12px">',
    '    <van-tabs v-model:active="kind" type="card" color="#0d5e56" style="margin-bottom:10px">',
    '      <van-tab v-for="k in kinds" :key="k" :title="DICT.cardKind[k]" :name="k"></van-tab>',
    '    </van-tabs>',
    '    <div class="oc-cat-t">选择卡</div>',
    '    <div v-for="c in kindCats" :key="c.id" class="cat-pick flex" :class="{on:cat && cat.id===c.id}" @click="pickCat(c)">',
    '      <div class="flex1">',
    '        <div style="font-size:14px;font-weight:600">{{ c.title }}</div>',
    '        <div class="muted mt4">有效期{{ c.expire_days }}天<template v-if="c.total_counts"> · {{ c.total_counts }}次</template><template v-if="Number(c.gift_money)"> · 赠{{ H.money(c.gift_money) }}</template></div>',
    '      </div>',
    '      <div class="price">{{ H.money(c.price) }}</div>',
    '    </div>',
    '  </div>',
    '  </template>',

    /* ===== 第 3 步: 收款信息 ===== */
    '  <template v-if="step===3">',
    '  <div class="card-box oc-who flex" v-if="cat">',
    '    <van-icon name="card" color="#0d5e56"/>',
    '    <span style="margin-left:6px"><b>{{ whoName }}</b> · {{ cat.title }}</span>',
    '    <span class="flex1"></span><span class="price">{{ H.money(cat.price) }}</span>',
    '  </div>',
    '  <div class="card-box" style="padding:6px 0">',
    '    <van-field v-model="form.actual_money" type="number" label="实收金额" placeholder="0.00">',
    '      <template #left-icon><span style="color:#d4380d;font-weight:700">¥</span></template>',
    '    </van-field>',
    '    <van-field :model-value="DICT.payMethod[form.pay_method]" label="支付方式" readonly is-link @click="payShow=true"/>',
    '    <van-field :model-value="DICT.openMode[form.open_card_mode]" label="开卡方式" readonly is-link @click="modeShow=true"/>',
    '    <van-field v-if="form.open_card_mode===3" label="开卡日期">',
    '      <template #input><input type="date" v-model="form.open_date" style="border:none;outline:none;background:transparent;font-size:14px"/></template>',
    '    </van-field>',
    '    <van-field v-model="form.retainage" type="number" label="尾款" placeholder="0.00，有欠款时填写"/>',
    '    <van-field :model-value="form.membership_name || \'不指定（记在自己名下）\'" label="业绩归属" readonly is-link @click="saleShow=true"/>',
    '    <van-field :model-value="form.coach_name || \'不指定\'" label="服务教练" readonly is-link @click="coachShow=true"/>',
    '    <van-field v-model="form.remark" label="备注" placeholder="选填" :border="false"/>',
    '  </div>',
    '  </template>',

    '  <div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -2px 10px rgba(0,0,0,.05);z-index:110">',
    '    <div class="flex" style="gap:10px">',
    '      <van-button v-if="step>1" round style="flex:.6" @click="prev">上一步</van-button>',
    '      <van-button type="primary" round style="flex:1" @click="next">{{ nextText }}</van-button>',
    '    </div>',
    '  </div>',

    // 开卡前核对: 建卡即生成合同号并计入流水, 不可撤销, 故提交前先让员工过一眼
    '  <van-popup v-model:show="confirmShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:17px;font-weight:700;text-align:center">请核对开卡信息</div>',
    '      <div class="muted" style="text-align:center;margin-top:4px">确认后将建卡、记收款并生成合同，不可撤销</div>',
    '      <div class="oc-cfm">',
    '        <div class="r"><span>会员</span><b>{{ whoName }} <span class="muted" style="font-weight:400">{{ whoPhone }}</span>',
    '          <van-tag v-if="mode===\'new\'" type="primary" style="margin-left:4px">新建档</van-tag></b></div>',
    '        <div class="r"><span>卡</span><b>{{ cat ? cat.title : \'\' }}</b></div>',
    '        <div class="r" v-if="cat"><span>规格</span><b>有效期{{ cat.expire_days }}天<template v-if="cat.total_counts"> · {{ cat.total_counts }}次</template></b></div>',
    '        <div class="r" v-if="confirmClub"><span>开卡门店</span><b>{{ confirmClub }}</b></div>',
    '        <div class="r"><span>实收</span><b class="hl">{{ H.money(form.actual_money || 0) }}</b></div>',
    '        <div class="r" v-if="Number(form.retainage)"><span>尾款</span><b class="warn">{{ H.money(form.retainage) }}</b></div>',
    '        <div class="r"><span>支付方式</span><b>{{ DICT.payMethod[form.pay_method] }}</b></div>',
    '        <div class="r"><span>开卡方式</span><b>{{ DICT.openMode[form.open_card_mode] }}<template v-if="form.open_card_mode===3 && form.open_date"> · {{ form.open_date }}</template></b></div>',
    '        <div class="r"><span>业绩归属</span><b>{{ form.membership_name || \'记在自己名下\' }}</b></div>',
    '        <div class="r"><span>服务教练</span><b>{{ form.coach_name || \'不指定\' }}</b></div>',
    '        <div class="r" v-if="form.remark"><span>备注</span><b>{{ form.remark }}</b></div>',
    '      </div>',
    '      <div v-if="cat && Number(form.actual_money) !== Number(cat.price)" class="oc-cfm-tip">',
    '        <van-icon name="info-o"/> 实收与卡面价 {{ H.money(cat.price) }} 不一致，请确认无误',
    '      </div>',
    '      <div class="flex" style="gap:10px;margin-top:16px">',
    '        <van-button round style="flex:1" @click="confirmShow=false">返回修改</van-button>',
    '        <van-button type="primary" round style="flex:1.4" :loading="submitting" @click="submit">确认开卡</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',

    '  <van-popup v-model:show="payShow" position="bottom" round><van-picker :columns="payCols" @confirm="onPay" @cancel="payShow=false" confirm-button-text="确定"/></van-popup>',
    '  <van-popup v-model:show="modeShow" position="bottom" round><van-picker :columns="modeCols" @confirm="onMode" @cancel="modeShow=false" confirm-button-text="确定"/></van-popup>',
    '  <van-popup v-model:show="srcShow" position="bottom" round><van-picker :columns="srcCols" @confirm="onSrc" @cancel="srcShow=false" confirm-button-text="确定"/></van-popup>',
    '  <van-popup v-model:show="saleShow" position="bottom" round><van-picker title="业绩归属" :columns="saleCols" @confirm="onSale" @cancel="saleShow=false" confirm-button-text="确定"/></van-popup>',
    '  <van-popup v-model:show="coachShow" position="bottom" round><van-picker title="服务教练" :columns="coachCols" @confirm="onCoach" @cancel="coachShow=false" confirm-button-text="确定"/></van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    // reset=true 从第一页重新查; false 追加下一页(每页 15, 按添加时间倒序)
    async search(reset = true) {
      if (reset) this.rPage = 1;
      this.searching = true;
      try {
        const d = await API.get('/members?keyword=' + encodeURIComponent(this.kw.trim()) + '&page=' + this.rPage + '&size=15&status=all');
        this.results = reset ? (d.list || []) : this.results.concat(d.list || []);
        this.rTotal = d.total || 0; this.rPage += 1;
        if (reset && this.kw.trim() && !this.results.length) vant.showToast('未找到会员，可切换「新会员建档」');
      } finally { this.searching = false; }
    },
    onKw(v) { this.kw = v; clearTimeout(this.kwTimer); this.kwTimer = setTimeout(() => this.search(true), 350); },
    pickCat(c) { this.cat = c; this.form.actual_money = H.num(c.price); },
    onPay(v) { this.form.pay_method = v.selectedOptions[0].value; this.payShow = false; },
    onMode(v) { this.form.open_card_mode = v.selectedOptions[0].value; this.modeShow = false; },
    onSrc(v) { this.nm.source_id = v.selectedOptions[0].value; this.nm.source_name = v.selectedOptions[0].text; this.srcShow = false; },
    onSale(v) { const o = v.selectedOptions[0]; this.form.membership_id = o.value || null; this.form.membership_name = o.value ? o.text : ''; this.saleShow = false; },
    onCoach(v) { const o = v.selectedOptions[0]; this.form.coach_id = o.value || null; this.form.coach_name = o.value ? o.text : ''; this.coachShow = false; },
    /* 由「购卡意向 → 去开卡」带 ?intent=id 进来: 自动选中会员与卡、预填实收。
       URL 里只放意向 id, 姓名手机号走接口取, 不进地址栏。 */
    async applyIntent() {
      const iid = this.$route.query.intent;
      if (!iid) return;
      let it;
      try { it = await API.get('/card-intents/' + iid, { silent: true }); } catch (e) { return; }
      if (!it) return;
      this.fromIntent = it;
      if (it.vip_id) {
        this.mode = 'exist';
        this.kw = it.phone || '';
        await this.search(true);
        const hit = this.results.find(m => m.id === it.vip_id);
        if (hit) { this.vip = hit; this.lockVip = true; }
        else vant.showToast('未找到该会员，请手动搜索');
      }
      const c = this.cats.find(x => x.id === it.card_type_id);
      if (c) { this.kind = c.card_kind; this.pickCat(c); }
      else vant.showToast('意向卡种已下架，请手动选择');
      if (this.lockVip) this.step = 2;        // 会员已定, 直接落到选卡这步
    },
    // 「更换」: 展开选会员那一步, 并把列表恢复成默认的最近会员
    unlockVip() {
      this.lockVip = false; this.vip = null; this.kw = '';
      this.step = 1;
      this.search(true);
    },
    // 每步独立校验, 不通过就停在本步; 口径与最终提交一致, 避免走到最后才报错
    stepOk(s) {
      if (s === 1) {
        if (this.mode === 'exist') {
          if (!this.vip) { vant.showToast('请先选择会员'); return false; }
        } else {
          if (!this.nm.realname) { vant.showToast('请填写新会员姓名'); return false; }
          if (!/^1\d{10}$/.test(this.nm.phone)) { vant.showToast('请输入正确的手机号'); return false; }
        }
      }
      if (s === 2) {
        if (this.clubs.length > 1 && !this.form.club_id) { vant.showToast('请选择开卡门店'); return false; }
        if (!this.cat) { vant.showToast('请选择卡类型'); return false; }
      }
      return true;
    },
    next() {
      if (!this.stepOk(this.step)) return;
      if (this.step < 3) { this.step += 1; this.toTop(); return; }
      if (!this.buildBody()) return;          // 第三步: 校验通过则弹核对单
      this.confirmShow = true;
    },
    prev() { if (this.step > 1) { this.step -= 1; this.toTop(); } },
    // 进度条上点已完成的步骤可回去改; 不能跳过未完成的步骤
    goStep(s) {
      if (s === this.step) return;
      if (s < this.step) { this.step = s; this.toTop(); return; }
      for (let i = this.step; i < s; i++) if (!this.stepOk(i)) return;
      this.step = s; this.toTop();
    },
    toTop() { this.$nextTick(() => window.scrollTo(0, 0)); },
    // 组装提交体, 校验不过时弹 toast 并返回 null
    buildBody() {
      if (!this.cat) { vant.showToast('请选择卡类型'); return null; }
      if (this.clubs.length > 1 && !this.form.club_id) { vant.showToast('请选择开卡门店'); return null; }
      const body = {
        card_type_id: this.cat.id,
        club_id: this.form.club_id || undefined,
        actual_money: Number(this.form.actual_money || 0),
        retainage: Number(this.form.retainage || 0),
        pay_method: this.form.pay_method,
        open_card_mode: this.form.open_card_mode,
        remark: this.form.remark || '',
      };
      // 带上来源意向, 后端据此核销这一条(换了卡种也算跟进完成)
      if (this.fromIntent) body.intent_id = this.fromIntent.id;
      if (this.form.membership_id) { body.membership_id = this.form.membership_id; body.membership_name = this.form.membership_name; }
      if (this.form.coach_id) { body.coach_id = this.form.coach_id; body.coach_name = this.form.coach_name; }
      if (this.form.open_card_mode === 3) {
        if (!this.form.open_date) { vant.showToast('请选择开卡日期'); return null; }
        body.open_date = this.form.open_date;
      }
      if (this.mode === 'exist') {
        if (!this.vip) { vant.showToast('请先搜索并选择会员'); return null; }
        body.vip_id = this.vip.id;
      } else {
        if (!this.nm.realname) { vant.showToast('请填写新会员姓名'); return null; }
        if (!/^1\d{10}$/.test(this.nm.phone)) { vant.showToast('请输入正确的手机号'); return null; }
        body.new_member = { realname: this.nm.realname, phone: this.nm.phone, gender: this.nm.gender, source_id: this.nm.source_id, source_name: this.nm.source_name };
      }
      return body;
    },
    async submit() {
      const body = this.buildBody();
      if (!body) { this.confirmShow = false; return; }
      this.submitting = true;
      try {
        const r = await API.post('/cards/open', body);
        this.confirmShow = false;
        const who = this.mode === 'exist' ? this.vip.realname : this.nm.realname;
        // 开完卡趁会员还在柜台, 直接引导当面签合同; 选「稍后」则由会员自己在小程序签
        let signNow = false;
        try {
          await vant.showConfirmDialog({
            title: '开卡成功', confirmButtonColor: '#0d5e56',
            confirmButtonText: '现在签约', cancelButtonText: '稍后再签',
            message: who + ' · ' + this.cat.title + '\n实收 ' + H.money(body.actual_money)
              + '\n合同号：' + r.contract_number + '\n\n合同已生成，可请会员当面签署',
          });
          signNow = true;
        } catch (e) { /* 点了「稍后再签」 */ }
        if (signNow && r.contractId) {
          this.$router.push('/staff/contracts?sign=' + r.contractId);
          return;
        }
        // 从购卡意向进来的: 该意向已被后端自动核销, 直接退回列表看结果
        if (this.fromIntent) { this.fromIntent = null; this.$router.back(); return; }
        this.step = 1; this.toTop();
        this.vip = null; this.results = []; this.kw = ''; this.cat = null;
        this.nm = { realname: '', phone: '', gender: 1, source_id: 0, source_name: '' };
        this.form = { club_id: this.clubs.length === 1 ? this.clubs[0].id : this.form.club_id,
          actual_money: '', retainage: '', pay_method: 'wechat', open_card_mode: 1, open_date: '',
          membership_id: null, membership_name: '', coach_id: null, coach_name: '', remark: '' };
      } finally { this.submitting = false; }
    },
  },
  async mounted() {
    try {
      this.cats = await API.get('/card-categories?status=1');
      this.search(true);
      this.kind = this.kinds[0] || 1;
      this.sources = await API.get('/sources', { silent: true });
      const [clubs, staff, coaches] = await Promise.all([
        API.get('/clubs', { silent: true }), API.get('/staff', { silent: true }), API.get('/coaches?status=1', { silent: true }),
      ]);
      this.clubs = (clubs || []).filter(c => c.status !== 0);
      this.staff = (staff || []).filter(s => s.status !== 0 && s.role !== 'platform');
      this.coaches = coaches || [];
      const my = Store.user || {};
      this.form.club_id = this.clubs.length === 1 ? this.clubs[0].id : (my.club_id || (this.clubs[0] && this.clubs[0].id) || null);
      await this.applyIntent();
    } catch (e) { /* ignore */ }
  },
};
