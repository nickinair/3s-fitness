/* 快速开卡 */
window.AppPages.CardOpen = {
  name: 'CardOpenPage',
  data() {
    return {
      // 左: 会员
      mode: 'exist', keyword: '', hits: [], member: null, searching: false, hitPage: 1, hitTotal: 0, kwTimer: null,
      newMember: { realname: '', phone: '', gender: 0, source_id: null, source_name: '' },
      // 中: 卡类型
      cats: [], cat: null,
      // 右: 参数
      form: { club_id: null, actual_money: null, retainage: 0, pay_method: 'wechat', open_card_mode: 1, open_date: '', membership_id: null, coach_id: null, remark: '' },
      sources: [], staffSales: [], coaches: [], clubs: [],
      saving: false,
      doneDlg: false, doneInfo: null,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  computed: {
    catGroups() {
      const groups = [];
      [1, 2, 3, 4].forEach(k => {
        const items = this.cats.filter(c => c.card_kind === k);
        if (items.length) groups.push({ kind: k, name: DICT.cardKind[k], items });
      });
      return groups;
    },
  },
  template: `
  <div class="open-grid">
    <!-- 左: 选择会员 -->
    <div class="card-box" style="margin-bottom:0">
      <div class="box-title">① 选择会员</div>
      <el-radio-group v-model="mode" style="margin-bottom:12px">
        <el-radio-button value="exist">已有会员</el-radio-button>
        <el-radio-button value="new">新会员快速建档</el-radio-button>
      </el-radio-group>
      <template v-if="mode === 'exist'">
        <el-input v-model="keyword" placeholder="姓名/手机号搜索，留空显示最近添加的会员" clearable @input="onKeyword" @keyup.enter="search(true)" @clear="search(true)">
          <template #append><el-button @click="search(true)"><el-icon><Search /></el-icon></el-button></template>
        </el-input>
        <div class="text-muted" style="margin:8px 0 4px;font-size:12px">共 {{ hitTotal }} 人，按添加时间从新到旧</div>
        <div style="max-height:420px;overflow-y:auto" v-loading="searching">
          <div v-for="m in hits" :key="m.id" class="member-hit" :class="{ active: member && member.id === m.id }" @click="member = m">
            <div class="nm">{{ m.realname || m.nickname || '未命名' }}
              <el-tag v-if="m.is_black" type="danger" size="small">黑名单</el-tag>
              <dict-tag dict="expireStatus" :value="m.expire_status" />
            </div>
            <div class="ph">{{ m.phone }} · {{ m.card_names || '无卡' }}</div>
          </div>
          <el-empty v-if="!hits.length && !searching" description="没有匹配的会员" :image-size="60" />
          <div v-if="hits.length < hitTotal" style="text-align:center;padding:8px 0 4px">
            <el-button link type="primary" :loading="searching" @click="search(false)">加载更多（还有 {{ hitTotal - hits.length }} 人）</el-button>
          </div>
        </div>
      </template>
      <template v-else>
        <el-form label-width="70px" size="default">
          <el-form-item label="姓名" required><el-input v-model="newMember.realname" /></el-form-item>
          <el-form-item label="手机号" required><el-input v-model="newMember.phone" maxlength="11" /></el-form-item>
          <el-form-item label="性别">
            <el-radio-group v-model="newMember.gender"><el-radio :value="1">男</el-radio><el-radio :value="2">女</el-radio></el-radio-group>
          </el-form-item>
          <el-form-item label="来源">
            <el-select v-model="newMember.source_id" clearable style="width:100%" @change="onNewSource">
              <el-option v-for="s in sources" :key="s.id" :value="s.id" :label="s.title" />
            </el-select>
          </el-form-item>
        </el-form>
      </template>
    </div>

    <!-- 中: 选择卡类型 -->
    <div class="card-box" style="margin-bottom:0">
      <div class="box-title">② 选择卡类型</div>
      <div style="border:1.5px solid var(--el-color-primary-light-5);background:var(--el-color-primary-light-9);border-radius:10px;padding:12px;margin-bottom:14px">
        <div style="font-weight:700;color:var(--el-color-primary);margin-bottom:8px;font-size:14px">
          <el-icon style="vertical-align:-2px"><OfficeBuilding /></el-icon> 开卡门店
        </div>
        <el-radio-group v-model="form.club_id">
          <el-radio-button v-for="c in clubs" :key="c.id" :value="c.id">{{ c.name }}</el-radio-button>
        </el-radio-group>
        <div class="text-muted" style="margin-top:8px;font-size:12px">卡归属此门店，流水与统计计入该店（跨店上课不改变归属）</div>
      </div>
      <div style="max-height:560px;overflow-y:auto">
        <div v-for="g in catGroups" :key="g.kind">
          <div class="cat-kind-title"><dict-tag dict="cardKind" :value="g.kind" size="default" /></div>
          <div class="cat-grid">
            <div v-for="c in g.items" :key="c.id" class="cat-card" :class="{ active: cat && cat.id === c.id }" @click="pickCat(c)">
              <div class="t">{{ c.title }}</div>
              <div class="p">{{ Fmt.money(c.price) }}
                <span class="text-muted" v-if="Number(c.original_price) > Number(c.price)" style="text-decoration:line-through;font-weight:400">{{ Fmt.money(c.original_price) }}</span>
              </div>
              <div class="d">
                <template v-if="c.card_kind === 3">充值赠{{ Fmt.money(c.gift_money) }}</template>
                <template v-else-if="c.total_counts > 0">{{ c.total_counts }}次</template>
                <template v-else>不限次</template>
                · {{ c.expire_days }}天
              </div>
            </div>
          </div>
        </div>
        <el-empty v-if="!cats.length" description="暂无上架卡类型" :image-size="60" />
      </div>
    </div>

    <!-- 右: 开卡参数 -->
    <div class="card-box" style="margin-bottom:0">
      <div class="box-title">③ 开卡参数</div>
      <div style="background:var(--el-color-primary-light-9);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px;">
        <div style="margin-bottom:4px"><span class="text-muted">门店：</span><b>{{ (clubs.find(c => c.id === form.club_id) || {}).name || '未选择' }}</b></div>
        <div><span class="text-muted">会员：</span><b>{{ mode === 'exist' ? (member ? member.realname + ' ' + member.phone : '未选择') : (newMember.realname || '新会员') + ' ' + newMember.phone }}</b></div>
        <div style="margin-top:4px"><span class="text-muted">卡型：</span><b>{{ cat ? cat.title : '未选择' }}</b> <span class="money" v-if="cat">{{ Fmt.money(cat.price) }}</span></div>
      </div>
      <el-form label-width="86px" size="default">
        <el-form-item label="实收金额" required>
          <el-input-number v-model="form.actual_money" :min="0" :precision="2" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item label="尾款">
          <el-input-number v-model="form.retainage" :min="0" :precision="2" style="width:100%" controls-position="right" />
        </el-form-item>
        <el-form-item label="支付方式">
          <el-select v-model="form.pay_method" style="width:100%">
            <el-option v-for="(v,k) in DICT.payMethod" :key="k" :value="k" :label="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="开卡方式">
          <el-radio-group v-model="form.open_card_mode">
            <el-radio :value="1">立即</el-radio><el-radio :value="2">首次使用</el-radio><el-radio :value="3">指定日期</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="开卡日期" v-if="form.open_card_mode === 3">
          <el-date-picker v-model="form.open_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="业绩归属">
          <el-select v-model="form.membership_id" clearable style="width:100%">
            <el-option v-for="s in staffSales" :key="s.id" :value="s.id" :label="s.realname + '（' + (DICT.role[s.role] || s.role) + '）'" />
          </el-select>
        </el-form-item>
        <el-form-item label="服务教练">
          <el-select v-model="form.coach_id" clearable style="width:100%">
            <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
        <el-button type="primary" size="large" style="width:100%" :loading="saving" @click="submit">确认开卡</el-button>
      </el-form>
    </div>

    <el-dialog v-model="doneDlg" title="开卡成功" width="440px" :close-on-click-modal="false">
      <el-result icon="success" title="开卡成功" style="padding:8px 0">
        <template #sub-title>
          <div style="line-height:2">
            <div>合同号：<b>{{ doneInfo && doneInfo.contract_number }}</b></div>
            <div class="text-muted">会员可在小程序「我的合同」中查看并签署电子合同</div>
          </div>
        </template>
      </el-result>
      <template #footer>
        <el-button @click="doneDlg = false">继续开卡</el-button>
        <el-button type="primary" @click="$router.push('/cards/' + doneInfo.cardId)">查看卡详情</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    // reset=true 从第一页重新查; false 追加下一页(每页 15, 按添加时间倒序)
    async search(reset = true) {
      if (reset) { this.hitPage = 1; }
      this.searching = true;
      try {
        const d = await api.get('/members', { keyword: this.keyword || '', page: this.hitPage, size: 15, status: 'all' });
        this.hits = reset ? d.list : this.hits.concat(d.list);
        this.hitTotal = d.total || 0;
        this.hitPage += 1;
      } finally { this.searching = false; }
    },
    onKeyword() { clearTimeout(this.kwTimer); this.kwTimer = setTimeout(() => this.search(true), 350); },
    pickCat(c) {
      this.cat = c;
      this.form.actual_money = Number(c.price);
      this.form.open_card_mode = c.open_card_mode || 1;
    },
    onNewSource(v) {
      const s = this.sources.find(x => x.id === v);
      this.newMember.source_name = s ? s.title : '';
    },
    async submit() {
      if (!this.cat) return ElementPlus.ElMessage.warning('请选择卡类型');
      if (this.mode === 'exist' && !this.member) return ElementPlus.ElMessage.warning('请选择会员');
      if (this.mode === 'new' && (!this.newMember.realname || !/^1\d{10}$/.test(this.newMember.phone))) {
        return ElementPlus.ElMessage.warning('请填写新会员姓名与正确手机号');
      }
      if (this.form.actual_money == null) return ElementPlus.ElMessage.warning('请填写实收金额');
      if (this.form.open_card_mode === 3 && !this.form.open_date) return ElementPlus.ElMessage.warning('请选择开卡日期');
      const sale = this.staffSales.find(x => x.id === this.form.membership_id);
      const coach = this.coaches.find(x => x.id === this.form.coach_id);
      const body = {
        club_id: this.form.club_id || undefined,
        card_type_id: this.cat.id,
        actual_money: this.form.actual_money,
        retainage: this.form.retainage || 0,
        pay_method: this.form.pay_method,
        open_card_mode: this.form.open_card_mode,
        open_date: this.form.open_card_mode === 3 ? this.form.open_date : undefined,
        membership_id: sale ? sale.id : undefined,
        membership_name: sale ? sale.realname : undefined,
        coach_id: coach ? coach.id : undefined,
        coach_name: coach ? coach.realname : undefined,
        remark: this.form.remark,
      };
      if (this.mode === 'exist') body.vip_id = this.member.id;
      else body.new_member = this.newMember;
      this.saving = true;
      try {
        const d = await api.post('/cards/open', body);
        this.doneInfo = d;
        this.doneDlg = true;
        if (this.mode === 'exist' && this.member) this.search();
      } catch (e) { /* 已提示 */ } finally { this.saving = false; }
    },
    async loadDicts() {
      const [cats, sources, staff, coaches, clubs] = await Promise.all([
        api.get('/card-categories', { status: 1 }), api.get('/sources'), api.get('/staff'), api.get('/coaches', { status: 1 }),
        api.get('/clubs'),
      ]);
      this.cats = cats;
      this.sources = sources;
      // 业绩归属(纪要2.4「谁开的卡即归属谁」): 任意员工皆可; 默认=当前经手人
      this.staffSales = staff.filter(s => ['membership', 'coach', 'manager', 'admin'].includes(s.role) && s.status === 1);
      const me = Auth.getUser() || {};
      if (this.staffSales.some(s => s.id === me.id)) this.form.membership_id = me.id;
      this.coaches = coaches;
      this.clubs = clubs;
      // 默认当前登录门店
      const user = Auth.getUser() || {};
      const myClub = clubs.find(c => c.id === user.club_id);
      this.form.club_id = myClub ? myClub.id : (clubs.length ? clubs[0].id : null);
      // 支持 ?vip_id= 直达
      const vipId = this.$route.query.vip_id;
      if (vipId) {
        try {
          const detail = await api.get('/members/' + vipId);
          this.member = detail.profile;
          this.hits = [detail.profile];
          this.keyword = detail.profile.phone;
        } catch (e) { /* ignore */ }
      }
    },
  },
  mounted() { this.loadDicts(); this.search(true); },
};
