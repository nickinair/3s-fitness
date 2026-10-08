/* 前台签到 */
window.AppPages.Checkin = {
  name: 'CheckinPage',
  data() {
    return {
      keyword: '', hits: [], member: null, cards: [], searching: false,
      result: null, // { ok, msg, info }
      inGym: [], loadingGym: false,
      signing: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  template: `
  <div>
    <div class="two-col" style="grid-template-columns: 1.2fr 1fr">
      <div class="card-box">
        <div class="box-title">前台快速签到</div>
        <el-input v-model="keyword" size="large" placeholder="输入姓名 / 手机号 搜索会员，回车搜索" clearable
          @keyup.enter="search" @clear="hits = []; member = null">
          <template #prefix><el-icon><Search /></el-icon></template>
          <template #append><el-button @click="search">搜索</el-button></template>
        </el-input>

        <div style="margin-top:14px" v-loading="searching">
          <div v-for="m in hits" :key="m.id" class="member-hit" :class="{ active: member && member.id === m.id }" @click="pick(m)">
            <div class="nm">{{ m.realname || '未命名' }}
              <el-tag v-if="m.is_black" type="danger" size="small">黑名单</el-tag>
              <dict-tag dict="expireStatus" :value="m.expire_status" />
            </div>
            <div class="ph">{{ m.phone }} · {{ m.card_names || '无卡' }}</div>
          </div>
        </div>

        <div v-if="member" class="member-profile-card" style="margin-top:8px">
          <div class="avatar-circle">{{ (member.realname || '?').slice(0,1) }}</div>
          <div style="flex:1">
            <div style="font-size:16px;font-weight:700;color:var(--text-main)">{{ member.realname }} <span class="text-muted" style="font-weight:400">{{ member.phone }}</span></div>
            <div style="margin:6px 0 2px">
              <el-tag v-for="c in cards" :key="c.id" size="small" style="margin:0 6px 4px 0"
                :type="c.status === 1 ? 'success' : (c.status === 0 ? 'info' : 'danger')">
                {{ c.card_type_name }}
                <template v-if="c.card_kind === 1 || c.card_kind === 4">·剩{{ c.left_counts }}次</template>
                <template v-else-if="c.card_kind === 3">·余{{ Fmt.money(c.left_money) }}</template>
                <template v-else>·至{{ Fmt.date(c.expire_time) }}</template>
              </el-tag>
              <span v-if="!cards.length" class="text-muted">该会员暂无会员卡</span>
            </div>
            <div v-if="member.is_black" class="black-warn">⚠️ 黑名单会员，禁止入场！{{ member.black_reason ? '原因：' + member.black_reason : '' }}</div>
          </div>
          <el-button type="primary" size="large" :disabled="!!member.is_black" :loading="signing" @click="doCheckin">
            <el-icon style="margin-right:4px"><CircleCheck /></el-icon>签到入场
          </el-button>
        </div>

        <div v-if="result" class="checkin-result">
          <template v-if="result.ok">
            <el-result icon="success" :title="result.info.realname + ' 签到成功'" style="padding:0">
              <template #sub-title>
                <div style="line-height:2">
                  <div>使用卡：<b>{{ result.info.card_type_name }}</b></div>
                  <div>{{ result.info.deduct_info }}</div>
                </div>
              </template>
            </el-result>
          </template>
          <template v-else>
            <el-result icon="error" title="签到失败" :sub-title="result.msg" style="padding:0" />
          </template>
        </div>
      </div>

      <div class="card-box">
        <div class="box-title">今日在场（{{ inGym.length }}）
          <el-button link type="primary" @click="loadInGym"><el-icon><Refresh /></el-icon>&nbsp;刷新</el-button>
        </div>
        <el-table border :data="inGym" v-loading="loadingGym" size="small" max-height="520">
          <el-table-column label="会员" min-width="100">
            <template #default="{ row }">
              <div>{{ row.realname }}</div>
              <div class="text-muted">{{ row.phone }}</div>
            </template>
          </el-table-column>
          <el-table-column label="入场时间" width="90"><template #default="{ row }">{{ dayjs(row.check_in_time).format('HH:mm') }}</template></el-table-column>
          <el-table-column prop="card_type_name" label="使用卡" min-width="100" show-overflow-tooltip />
          <el-table-column label="操作" width="80">
            <template #default="{ row }"><el-button link type="warning" size="small" @click="out(row)">出场</el-button></template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loadingGym && !inGym.length" description="当前无人在场" :image-size="70" />
      </div>
    </div>
  </div>`,
  methods: {
    dayjs,
    async search() {
      if (!this.keyword) return;
      this.searching = true;
      this.result = null;
      try {
        const d = await api.get('/members', { keyword: this.keyword, size: 10, status: 'all' });
        this.hits = d.list;
        if (d.list.length === 1) this.pick(d.list[0]);
        else { this.member = null; this.cards = []; }
      } finally { this.searching = false; }
    },
    async pick(m) {
      this.member = m;
      this.result = null;
      const d = await api.get('/cards', { vip_id: m.id, size: 50 });
      this.cards = d.list.filter(c => [0, 1].includes(c.status));
    },
    async doCheckin() {
      if (!this.member) return;
      this.signing = true;
      this.result = null;
      try {
        const info = await api.post('/checkin', { vip_id: this.member.id });
        this.result = { ok: true, info };
        this.loadInGym();
        this.pick(this.member);
      } catch (e) {
        this.result = { ok: false, msg: (e && (e.msg || e.message)) || '签到失败' };
      } finally { this.signing = false; }
    },
    async loadInGym() {
      this.loadingGym = true;
      try {
        const d = await api.get('/checkins', { date: dayjs().format('YYYY-MM-DD'), in_gym: 1, size: 100 });
        this.inGym = d.list;
      } finally { this.loadingGym = false; }
    },
    out(row) {
      ElementPlus.ElMessageBox.confirm('确认「' + row.realname + '」出场？', '出场', { type: 'info' })
        .then(async () => {
          await api.post('/checkin/' + row.id + '/out');
          ElementPlus.ElMessage.success('已出场');
          this.loadInGym();
        }).catch(() => {});
    },
  },
  mounted() { this.loadInGym(); },
};
