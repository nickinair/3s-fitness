/* 卡类型配置 */
window.AppPages.CardCategories = {
  name: 'CardCategoriesPage',
  data() {
    return {
      kind: '0', list: [], loading: false,
      drawer: false, form: {}, saving: false,
      Fmt: window.Fmt, DICT: window.DICT,
    };
  },
  computed: {
    filtered() {
      if (this.kind === '0') return this.list;
      return this.list.filter(x => String(x.card_kind) === this.kind);
    },
  },
  template: `
  <div>
    <div class="card-box">
      <el-tabs v-model="kind">
        <el-tab-pane label="全部" name="0" />
        <el-tab-pane label="次卡" name="1" />
        <el-tab-pane label="时间卡" name="2" />
        <el-tab-pane label="储值卡" name="3" />
        <el-tab-pane label="私教卡" name="4" />
      </el-tabs>
      <div class="search-bar">
        <div style="flex:1"></div>
        <el-button type="primary" @click="openAdd">新增卡类型</el-button>
      </div>
      <el-table border :data="filtered" v-loading="loading" stripe>
        <el-table-column label="卡种" width="86"><template #default="{ row }"><dict-tag dict="cardKind" :value="row.card_kind" /></template></el-table-column>
        <el-table-column prop="title" label="名称" min-width="140" />
        <el-table-column label="价格" width="130">
          <template #default="{ row }">
            <span class="money">{{ Fmt.money(row.price) }}</span>
            <span class="text-muted" v-if="Number(row.original_price) > Number(row.price)" style="text-decoration:line-through;margin-left:4px">{{ Fmt.money(row.original_price) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="权益" min-width="150">
          <template #default="{ row }">
            <span v-if="row.card_kind === 3">充{{ Fmt.money(row.price) }}赠{{ Fmt.money(row.gift_money) }}</span>
            <span v-else-if="row.total_counts > 0">{{ row.total_counts }}次</span>
            <span v-else>不限次</span>
            <span class="text-muted"> / {{ row.expire_days }}天有效</span>
          </template>
        </el-table-column>
        <el-table-column label="开卡方式" width="110"><template #default="{ row }">{{ DICT.openCardMode[row.open_card_mode] || '-' }}</template></el-table-column>
        <el-table-column label="线上售卖" width="80"><template #default="{ row }">{{ row.online_sale ? '是' : '否' }}</template></el-table-column>
        <el-table-column prop="sort" label="排序" width="60" />
        <el-table-column label="上架状态" width="100">
          <template #default="{ row }">
            <el-switch :model-value="row.status === 1" @change="v => toggleStatus(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }"><el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button></template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="drawer" :title="form.id ? '编辑卡类型 - ' + form.title : '新增卡类型'" size="640px" destroy-on-close>
      <el-form :model="form" label-width="130px" size="default">
        <div class="form-section-title">基础信息</div>
        <el-form-item label="卡种" required>
          <el-radio-group v-model="form.card_kind" :disabled="!!form.id">
            <el-radio-button :value="1">次卡</el-radio-button><el-radio-button :value="2">时间卡</el-radio-button>
            <el-radio-button :value="3">储值卡</el-radio-button><el-radio-button :value="4">私教卡</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="卡名称" required><el-input v-model="form.title" placeholder="如：健身年卡 / 私教30节" /></el-form-item>
        <el-form-item label="简介"><el-input v-model="form.intro" type="textarea" :rows="2" /></el-form-item>
        <el-row>
          <el-col :span="12"><el-form-item label="售价(¥)" required><el-input-number v-model="form.price" :min="0" :precision="2" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="划线原价(¥)"><el-input-number v-model="form.original_price" :min="0" :precision="2" style="width:160px" /></el-form-item></el-col>
        </el-row>
        <el-row>
          <el-col :span="12"><el-form-item label="有效期(天)" required><el-input-number v-model="form.expire_days" :min="1" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12" v-if="form.card_kind === 1 || form.card_kind === 4">
            <el-form-item label="总次数/课时" required><el-input-number v-model="form.total_counts" :min="1" style="width:160px" /></el-form-item>
          </el-col>
          <el-col :span="12" v-if="form.card_kind === 3">
            <el-form-item label="赠送金额(¥)"><el-input-number v-model="form.gift_money" :min="0" :precision="2" style="width:160px" /></el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" style="width:160px" /></el-form-item>

        <div class="form-section-title">课程权限</div>
        <el-form-item label="课程权限说明">
          <el-input v-model="form.course_permission" type="textarea" :rows="2" placeholder="描述该卡可上的课程范围（展示用），如：全部团课 + 自由训练" />
        </el-form-item>

        <div class="form-section-title">预约限制</div>
        <el-row>
          <el-col :span="12"><el-form-item label="每日限约(次)"><el-input-number v-model="form.book_limit_day" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="每周限约(次)"><el-input-number v-model="form.book_limit_week" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="每30天限约(次)"><el-input-number v-model="form.book_limit_month30" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="同时保留预约数"><el-input-number v-model="form.advance_book_limit" :min="0" style="width:160px" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="可约时段">
          <el-input v-model="form.book_time_range" placeholder="如 08:00-21:00，留空不限" style="width:220px" />
        </el-form-item>
        <el-form-item label="团课预约窗口">
          <el-input v-model="form.group_advance_range" placeholder="如 7,2 = 提前7天开约,开课前2小时截止" style="width:280px" />
        </el-form-item>
        <div class="text-muted" style="margin:-6px 0 10px 130px">0 表示不限制</div>

        <div class="form-section-title">取消与爽约</div>
        <el-row>
          <el-col :span="12"><el-form-item label="免费取消总次数"><el-input-number v-model="form.free_cancel_total" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="每月超时取消上限"><el-input-number v-model="form.free_cancel_month_overtime" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="取消截止(小时)"><el-input-number v-model="form.cancel_deadline_hours" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="30天爽约上限"><el-input-number v-model="form.noshow_limit_30d" :min="0" style="width:160px" /></el-form-item></el-col>
        </el-row>
        <div class="text-muted" style="margin:-6px 0 10px 130px">开课前 N 小时内取消将按规则扣次；30天内爽约达上限将暂停约课</div>

        <div class="form-section-title">开卡与暂停</div>
        <el-form-item label="默认开卡方式">
          <el-radio-group v-model="form.open_card_mode">
            <el-radio :value="1">立即开卡</el-radio><el-radio :value="2">首次使用开卡</el-radio><el-radio :value="3">指定日期</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-row>
          <el-col :span="12"><el-form-item label="最迟开卡(天)"><el-input-number v-model="form.latest_open_days" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="可暂停次数"><el-input-number v-model="form.pause_times" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="单次最长暂停(天)"><el-input-number v-model="form.pause_max_days" :min="0" style="width:160px" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="入场时段">
          <el-input v-model="form.free_train_time_range" placeholder="如 06:30-22:30，留空不限" style="width:220px" />
        </el-form-item>

        <div class="form-section-title">里程碑</div>
        <el-form-item label="里程碑提醒">
          <el-radio-group v-model="form.milestone_type">
            <el-radio :value="0">关闭</el-radio><el-radio :value="1">按课时</el-radio><el-radio :value="2">按天数</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.milestone_type > 0" :label="form.milestone_type === 1 ? '每N节课' : '每N天'">
          <el-input-number v-model="form.milestone_interval" :min="1" style="width:160px" />
          <span class="text-muted" style="margin-left:10px">每{{ form.milestone_interval || 'N' }}{{ form.milestone_type === 1 ? '节课' : '天' }}生成一次里程碑，提醒教练总结并短信通知会员</span>
        </el-form-item>

        <div class="form-section-title">售卖控制</div>
        <el-row>
          <el-col :span="12"><el-form-item label="线上可售"><el-switch v-model="form.online_sale" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="仅学生可购"><el-switch v-model="form.student_only" :active-value="1" :inactive-value="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="每人限购(张)"><el-input-number v-model="form.purchase_limit" :min="0" style="width:160px" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="上架状态"><el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="上架" inactive-text="下架" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="drawer=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-drawer>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.list = await api.get('/card-categories'); }
      finally { this.loading = false; }
    },
    openAdd() {
      this.form = {
        card_kind: this.kind === '0' ? 1 : Number(this.kind), title: '', intro: '', price: 0, original_price: 0, expire_days: 30,
        total_counts: 10, gift_money: 0, course_permission: '', book_limit_day: 0, book_limit_week: 0, book_limit_month30: 0,
        advance_book_limit: 0, book_time_range: '', group_advance_range: '7,2', free_cancel_total: 0, free_cancel_month_overtime: 0,
        cancel_deadline_hours: 2, noshow_limit_30d: 3, open_card_mode: 1, latest_open_days: 30, pause_times: 0, pause_max_days: 0,
        free_train_time_range: '', online_sale: 0, student_only: 0, purchase_limit: 0, sort: 0, status: 1,
        milestone_type: 0, milestone_interval: 10,
      };
      this.drawer = true;
    },
    openEdit(row) {
      this.form = JSON.parse(JSON.stringify(row));
      ['price', 'original_price', 'gift_money'].forEach(k => { this.form[k] = Number(this.form[k] || 0); });
      if (this.form.milestone_type == null) this.form.milestone_type = 0;
      if (!this.form.milestone_interval) this.form.milestone_interval = 10;
      this.drawer = true;
    },
    async save() {
      if (!this.form.title) return ElementPlus.ElMessage.warning('请填写卡名称');
      this.saving = true;
      try {
        if (this.form.id) await api.put('/card-categories/' + this.form.id, this.form);
        else await api.post('/card-categories', this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.drawer = false;
        this.load();
      } finally { this.saving = false; }
    },
    async toggleStatus(row, v) {
      await api.put('/card-categories/' + row.id, { status: v ? 1 : 0 });
      ElementPlus.ElMessage.success(v ? '已上架' : '已下架');
      this.load();
    },
  },
  mounted() { this.load(); },
};
