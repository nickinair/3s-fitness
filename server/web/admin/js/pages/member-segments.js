/* 会员分群名单 (课时不足 / 本周生日 / 满N次 / 期卡)
 * 路由 /member-segment/:key, 数据 GET /member-segments/:key
 * 权限由后端把关: 教练只返回名下会员。
 */
window.AppPages.MemberSegment = {
  name: 'MemberSegmentPage',
  data() {
    return {
      key: '', title: '', desc: '', sortable: false, sort: '',
      query: { page: 1, size: 20 },
      list: [], total: 0, loading: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  computed: {
    sortText() { return this.sort === 'desc' ? '从多到少' : '从少到多'; },
    isTimecard() { return this.key.indexOf('timecard_') === 0; },
    canAddCard() {
      return this.isTimecard && ['admin', 'manager', 'membership', 'reception'].includes((Auth.getUser() || {}).role);
    },
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <div style="flex:1">
          <span style="font-size:15px;font-weight:600;color:var(--text-main)">{{ title || '会员名单' }}</span>
          <span class="text-muted" style="margin-left:10px">{{ desc }}</span>
          <span style="margin-left:10px">共 <b>{{ total }}</b> 人</span>
        </div>
        <el-button v-if="sortable" @click="toggleSort"><el-icon><Sort /></el-icon>&nbsp;{{ sortText }}</el-button>
        <el-button v-if="canAddCard" type="primary" @click="$router.push('/card-open')"><el-icon><Plus /></el-icon>&nbsp;新增期卡</el-button>
        <el-button @click="$router.push('/dashboard')">返回工作台</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="会员" width="130">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.id)">{{ row.realname || row.nickname || '未命名' }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="主教练" width="120">
          <template #default="{ row }">{{ row.coach_name || '未指定' }}</template>
        </el-table-column>
        <el-table-column label="剩余课时" width="100" align="right">
          <template #default="{ row }">
            <span :class="{ money: key === 'low_lesson' }">{{ row.left_total }}</span> 节
          </template>
        </el-table-column>
        <el-table-column label="累计训练" width="100" align="right">
          <template #default="{ row }">{{ row.trained }} 次</template>
        </el-table-column>
        <el-table-column v-if="key === 'birthday_week'" label="生日" width="120">
          <template #default="{ row }">{{ String(row.birthday || '').slice(5, 10) }}</template>
        </el-table-column>
        <el-table-column v-if="isTimecard" label="期卡" width="130">
          <template #default="{ row }">有效 {{ row.tc_active }} / 过期 {{ row.tc_expired }}</template>
        </el-table-column>
        <el-table-column label="会员状态" width="100">
          <template #default="{ row }"><dict-tag dict="expireStatus" :value="row.expire_status" /></template>
        </el-table-column>
        <el-table-column label="最近到期" min-width="140">
          <template #default="{ row }">{{ row.expire_time ? Fmt.date(row.expire_time) : '-' }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" @current-change="load" />
      </div>
    </div>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try {
        const d = await api.get('/member-segments/' + this.key, Object.assign({}, this.query, { sort: this.sort || undefined }));
        this.list = d.list; this.total = d.total;
        this.title = d.title; this.desc = d.desc; this.sortable = d.sortable;
      } finally { this.loading = false; }
    },
    toggleSort() { this.sort = this.sort === 'desc' ? 'asc' : 'desc'; this.query.page = 1; this.load(); },
  },
  watch: {
    '$route.params.key'(v) { if (v) { this.key = v; this.sort = ''; this.query.page = 1; this.load(); } },
  },
  mounted() {
    this.key = this.$route.params.key;
    this.load();
  },
};
