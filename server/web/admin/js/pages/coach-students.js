/* 我的学员（教练） */
window.AppPages.CoachStudents = {
  name: 'CoachStudentsPage',
  data() {
    return {
      list: [], loading: false, coaches: [], coachId: '',
      Fmt: window.Fmt, DICT: window.DICT,
      user: Auth.getUser() || {},
    };
  },
  computed: {
    isCoach() { return this.user.role === 'coach'; },
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar" v-if="!isCoach">
        <el-select v-model="coachId" placeholder="选择教练" style="width:150px" @change="load">
          <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
        </el-select>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="学员" width="130">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push('/members/' + row.id)">{{ row.realname }}</el-link>
            <div class="text-muted">{{ row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="card_type_name" label="私教卡" min-width="140" />
        <el-table-column label="剩余课时" width="110">
          <template #default="{ row }"><b>{{ row.left_counts }}</b><span class="text-muted">/{{ row.counts }}</span></template>
        </el-table-column>
        <el-table-column label="卡状态" width="90"><template #default="{ row }"><dict-tag dict="cardStatus" :value="row.card_status" /></template></el-table-column>
        <el-table-column label="卡到期" width="110"><template #default="{ row }">{{ Fmt.date(row.expire_time) }}</template></el-table-column>
        <el-table-column label="最近上课" width="150"><template #default="{ row }">{{ Fmt.time(row.last_lesson_time) }}</template></el-table-column>
        <el-table-column label="近30天课次" width="100">
          <template #default="{ row }">
            <el-tag :type="row.lessons_30d > 0 ? 'success' : 'info'" size="small">{{ row.lessons_30d }} 节</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无学员" :image-size="80" />
    </div>
  </div>`,
  methods: {
    async load() {
      const id = this.isCoach ? (this.user.coach_id || 0) : this.coachId;
      if (!id) return;
      this.loading = true;
      try { this.list = await api.get('/coaches/' + id + '/students'); }
      finally { this.loading = false; }
    },
  },
  async mounted() {
    if (!this.isCoach) {
      this.coaches = await api.get('/coaches', { status: 1 });
      if (this.coaches.length) { this.coachId = this.coaches[0].id; }
    }
    this.load();
  },
};
