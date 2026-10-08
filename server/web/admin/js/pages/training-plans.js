/* 训练计划 */
window.AppPages.TrainingPlans = {
  name: 'TrainingPlansPage',
  data() {
    const user = Auth.getUser() || {};
    return {
      query: { keyword: '', page: 1, size: 20 },
      onlyTemplate: false,
      list: [], total: 0, loading: false,
      coaches: [],
      // 编辑抽屉(大对话框)
      dlg: false, saving: false,
      form: { title: '', vip_id: null, realname: '', coach_id: null, plan_date: dayjs().format('YYYY-MM-DD'), note: '', is_template: 0, items: [] },
      memberInit: null,
      // AI 解析
      aiText: '', aiParsing: false, recognizing: false, recog: null,
      aiStatus: { llm: false, asr: false },
      // 模板导入
      tplDlg: false, templates: [], tplLoading: false,
      Fmt: window.Fmt, DICT: window.DICT,
      role: user.role, myCoachId: user.coach_id || 0,
    };
  },
  computed: {
    isCoach() { return this.role === 'coach'; },
  },
  template: `
  <div>
    <div class="card-box">
      <div class="search-bar">
        <el-input v-model="query.keyword" placeholder="标题/会员关键词" clearable style="width:190px" @keyup.enter="search" />
        <el-switch v-model="onlyTemplate" active-text="仅看模板" @change="search" />
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>&nbsp;查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex:1"></div>
        <el-button type="primary" @click="openAdd"><el-icon><Plus /></el-icon>&nbsp;新建计划</el-button>
      </div>
      <el-table border :data="list" v-loading="loading" stripe>
        <el-table-column label="标题" min-width="180">
          <template #default="{ row }">
            <span style="font-weight:600">{{ row.title }}</span>
            <el-tag v-if="row.is_template" type="warning" size="small" style="margin-left:6px">模板</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="会员" width="110">
          <template #default="{ row }">
            <el-link v-if="row.vip_id" type="primary" @click="$router.push('/members/' + row.vip_id)">{{ row.realname || '#' + row.vip_id }}</el-link>
            <span v-else class="text-muted">—（模板）</span>
          </template>
        </el-table-column>
        <el-table-column prop="coach_name" label="教练" width="90" />
        <el-table-column label="计划日期" width="110"><template #default="{ row }">{{ Fmt.date(row.plan_date) }}</template></el-table-column>
        <el-table-column label="动作数" width="80">
          <template #default="{ row }">{{ itemCount(row) }} 个</template>
        </el-table-column>
        <el-table-column label="推送状态" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.pushed" type="success" size="small">已推送</el-tag>
            <el-tag v-else type="info" size="small">未推送</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="130" show-overflow-tooltip />
        <el-table-column label="创建时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.vip_id" link type="success" size="small" @click="push(row)">推送</el-button>
            <el-button link type="danger" size="small" @click="del(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total"
          v-model:current-page="query.page" v-model:page-size="query.size" @current-change="load" />
      </div>
    </div>

    <!-- 编辑计划 -->
    <el-dialog v-model="dlg" :title="form.id ? '编辑训练计划' : '新建训练计划'" width="860px" top="4vh" destroy-on-close :close-on-click-modal="false">
      <!-- AI 智能生成 -->
      <div style="background:var(--el-color-primary-light-9);border:1px solid var(--el-color-primary-light-7);border-radius:10px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;color:var(--el-color-primary);margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <el-icon><MagicStick /></el-icon>AI 智能生成
          <el-tag size="small" :type="aiStatus.llm ? 'success' : 'info'">{{ aiStatus.llm ? '豆包 AI 已接入' : '本地规则引擎' }}</el-tag>
          <el-tag v-if="aiStatus.asr" size="small" type="success">火山语音已接入</el-tag>
          <span class="text-muted" style="font-weight:400;font-size:12px">一句话描述训练内容，自动识别动作并填入下方表格（追加）</span>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start">
          <el-input v-model="aiText" type="textarea" :rows="2" style="flex:1"
            placeholder="例：今天练胸：杠铃卧推4组12次60kg间歇90秒，哑铃飞鸟3组15，最后跑步机20分钟" />
          <div style="display:flex;flex-direction:column;gap:6px">
            <el-button :type="recognizing ? 'danger' : 'default'" @click="toggleVoice" style="width:120px">
              <el-icon><Microphone /></el-icon>&nbsp;{{ recognizing ? '停止录音' : '语音输入' }}
            </el-button>
            <el-button type="primary" :loading="aiParsing" @click="aiParse" style="width:120px;margin-left:0">
              <el-icon><MagicStick /></el-icon>&nbsp;AI 解析
            </el-button>
          </div>
        </div>
        <div v-if="recognizing" style="color:var(--el-color-danger);font-size:12px;margin-top:6px">● 正在聆听，请说话…（再次点击停止）</div>
      </div>

      <el-form :model="form" label-width="80px">
        <el-row :gutter="14">
          <el-col :span="12"><el-form-item label="标题" required><el-input v-model="form.title" placeholder="如：胸部训练日" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="计划日期">
            <el-date-picker v-model="form.plan_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="关联会员">
            <member-select v-model="form.vip_id" :initial="memberInit" placeholder="搜索会员，留空则保存为模板" @select="onMember" />
          </el-form-item></el-col>
          <el-col :span="12" v-if="!isCoach"><el-form-item label="教练" required>
            <el-select v-model="form.coach_id" style="width:100%" placeholder="选择制定教练">
              <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.note" placeholder="训练注意事项等" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <div class="text-muted" style="margin:-6px 0 8px 80px;font-size:12px">不选会员时保存为「模板」，可在其它计划中一键导入</div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-weight:600;color:var(--text-main)">动作明细 <span class="text-muted" style="font-weight:400">共 {{ form.items.length }} 个</span></div>
        <div>
          <el-button size="small" @click="openTpl">从模板导入</el-button>
          <el-button size="small" type="primary" plain @click="addItem">添加动作</el-button>
        </div>
      </div>
      <el-table :data="form.items" size="small" border>
        <el-table-column type="index" label="#" width="42" />
        <el-table-column label="动作名称" min-width="180">
          <template #default="{ row }">
            <el-autocomplete v-model="row.action_name" :fetch-suggestions="suggestActions" style="width:100%"
              placeholder="输入联想动作" @select="s => onActionPick(row, s)">
              <template #default="{ item }">{{ item.value }} <span class="text-muted">· {{ item.part }}</span></template>
            </el-autocomplete>
            <el-tag v-if="row.part" size="small" type="info" style="margin-top:2px">{{ row.part }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="组数" width="92">
          <template #default="{ row }"><el-input-number v-model="row.sets" :min="1" controls-position="right" style="width:100%" /></template>
        </el-table-column>
        <el-table-column label="次数" width="92">
          <template #default="{ row }"><el-input-number v-model="row.reps" :min="1" controls-position="right" style="width:100%" /></template>
        </el-table-column>
        <el-table-column label="单位" width="86">
          <template #default="{ row }">
            <el-select v-model="row.unit"><el-option value="次" /><el-option value="秒" /><el-option value="分钟" /></el-select>
          </template>
        </el-table-column>
        <el-table-column label="重量" width="90">
          <template #default="{ row }"><el-input v-model="row.weight" placeholder="60kg" /></template>
        </el-table-column>
        <el-table-column label="组间歇" width="90">
          <template #default="{ row }"><el-input v-model="row.rest" placeholder="90秒" /></template>
        </el-table-column>
        <el-table-column label="备注" min-width="110">
          <template #default="{ row }"><el-input v-model="row.remark" /></template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ $index }">
            <el-button link size="small" :disabled="$index === 0" @click="moveItem($index, -1)"><el-icon><Top /></el-icon></el-button>
            <el-button link size="small" :disabled="$index === form.items.length - 1" @click="moveItem($index, 1)"><el-icon><Bottom /></el-icon></el-button>
            <el-button link type="danger" size="small" @click="form.items.splice($index, 1)"><el-icon><Delete /></el-icon></el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!form.items.length" description="暂无动作，可用上方 AI 解析或手动添加" :image-size="56" />
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存计划</el-button>
      </template>
    </el-dialog>

    <!-- 从模板导入 -->
    <el-dialog v-model="tplDlg" title="从模板导入动作" width="560px">
      <el-table border :data="templates" v-loading="tplLoading" size="small" max-height="380">
        <el-table-column prop="title" label="模板名称" min-width="160" />
        <el-table-column prop="coach_name" label="教练" width="90" />
        <el-table-column label="动作数" width="80"><template #default="{ row }">{{ itemCount(row) }} 个</template></el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }"><el-button link type="primary" size="small" @click="importTpl(row)">导入</el-button></template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!tplLoading && !templates.length" description="暂无模板，可新建计划时不选会员保存为模板" :image-size="60" />
    </el-dialog>
  </div>`,
  methods: {
    parseItems(row) { try { return JSON.parse(row.items || '[]'); } catch (e) { return []; } },
    itemCount(row) { return this.parseItems(row).length; },
    async load() {
      this.loading = true;
      try {
        const params = Object.assign({}, this.query);
        if (this.onlyTemplate) params.is_template = 1;
        if (this.isCoach && this.myCoachId) params.coach_id = this.myCoachId;
        const d = await api.get('/training-plans', params);
        this.list = d.list; this.total = d.total;
      } finally { this.loading = false; }
    },
    search() { this.query.page = 1; this.load(); },
    reset() { this.query = { keyword: '', page: 1, size: 20 }; this.onlyTemplate = false; this.load(); },
    async loadDicts() {
      if (!this.isCoach) this.coaches = await api.get('/coaches', { status: 1 });
    },
    blankItem() { return { action_name: '', sets: 3, reps: 12, unit: '次', weight: '', rest: '', remark: '', part: '' }; },
    addItem() { this.form.items.push(this.blankItem()); },
    moveItem(i, dir) {
      const arr = this.form.items;
      const t = arr[i]; arr[i] = arr[i + dir]; arr[i + dir] = t;
    },
    openAdd() {
      this.form = { title: '', vip_id: null, realname: '', coach_id: null, plan_date: dayjs().format('YYYY-MM-DD'), note: '', is_template: 0, items: [] };
      this.memberInit = null;
      this.aiText = '';
      this.dlg = true;
    },
    openEdit(row) {
      this.form = {
        id: row.id, title: row.title, vip_id: row.vip_id || null, realname: row.realname || '',
        coach_id: row.coach_id || null, plan_date: row.plan_date ? Fmt.date(row.plan_date) : '',
        note: row.note || '', is_template: row.is_template, items: this.parseItems(row),
      };
      this.memberInit = row.vip_id ? { id: row.vip_id, realname: row.realname || ('#' + row.vip_id), phone: row.phone || '' } : null;
      this.aiText = '';
      this.dlg = true;
    },
    onMember(m) { this.form.realname = m ? m.realname : ''; },
    /* ---- AI 解析 ---- */
    async aiParse() {
      if (!this.aiText.trim()) return ElementPlus.ElMessage.warning('请先输入或语音描述训练内容');
      this.aiParsing = true;
      try {
        const d = await api.post('/training-plans/parse', { text: this.aiText.trim() });
        const items = (d && d.items) || [];
        if (!items.length) return ElementPlus.ElMessage.warning('未识别出动作，请调整描述后重试');
        items.forEach(it => this.form.items.push(Object.assign(this.blankItem(), it)));
        // 标题留空时用 AI 生成的标题填充, 已手动填写的不覆盖
        let msg = '已识别 ' + items.length + ' 个动作';
        if (d.title && !String(this.form.title || '').trim()) { this.form.title = d.title; msg += '，标题已自动生成'; }
        ElementPlus.ElMessage.success(msg);
        this.aiText = '';
      } finally { this.aiParsing = false; }
    },
    async toggleVoice() {
      // 优先: 服务端火山ASR (需已配置密钥 + 安全上下文才能取麦克风)
      if (this.aiStatus.asr) {
        const hint = WavRecorder.secureHint();
        if (hint) return ElementPlus.ElMessage.warning(hint);
        if (!WavRecorder.supported()) return ElementPlus.ElMessage.warning('当前浏览器不支持录音');
        if (this.recognizing) {
          // 停止 → 上传识别
          this.recognizing = false;
          const loading = ElementPlus.ElMessage({ message: '识别中…', type: 'info', duration: 0 });
          try {
            const { base64, seconds } = await WavRecorder.stop();
            if (seconds < 0.6) return ElementPlus.ElMessage.warning('录音太短，请重试');
            const d = await api.post('/asr/recognize', { audio_base64: base64, format: 'wav' });
            this.aiText = ((this.aiText || '') + ' ' + d.text).trim();
            ElementPlus.ElMessage.success('识别完成，可点击「AI 解析」生成动作');
          } catch (e) {
            // 断网/服务异常时 api 层已提示, 这里兜底避免未捕获异常
            if (!e.handled) ElementPlus.ElMessage.error('语音识别失败：' + (e.message || '请重试'));
          } finally { loading.close(); }
          return;
        }
        try {
          await WavRecorder.start();
          this.recognizing = true;
          ElementPlus.ElMessage.info('录音中…说完后再次点击按钮结束');
        } catch (e) {
          ElementPlus.ElMessage.warning('无法开启麦克风：' + (e.name === 'NotAllowedError' ? '请在浏览器地址栏允许麦克风权限' : e.message));
        }
        return;
      }
      // 回落: 浏览器内置语音识别
      const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
      if (!SR) return ElementPlus.ElMessage.warning('未配置语音识别服务且浏览器不支持内置识别，请手动输入');
      if (this.recognizing) { try { this.recog && this.recog.stop(); } catch (e) {} this.recognizing = false; return; }
      const r = new SR();
      r.lang = 'zh-CN'; r.interimResults = false; r.continuous = true;
      r.onresult = (e) => {
        let t = '';
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
        if (t) this.aiText = (this.aiText || '') + t;
      };
      r.onend = () => { this.recognizing = false; };
      r.onerror = (e) => {
        this.recognizing = false;
        if (e.error !== 'aborted') ElementPlus.ElMessage.warning('语音识别不可用（' + e.error + '），请手动输入');
      };
      this.recog = r; this.recognizing = true;
      try { r.start(); } catch (e) { this.recognizing = false; }
    },
    /* ---- 动作联想 ---- */
    async suggestActions(query, cb) {
      try {
        const d = await api.get('/training-actions', { keyword: query || '' });
        cb((d || []).map(a => ({ value: a.name, part: a.part })));
      } catch (e) { cb([]); }
    },
    onActionPick(row, s) { row.part = s.part || ''; },
    /* ---- 模板 ---- */
    async openTpl() {
      this.tplDlg = true; this.tplLoading = true;
      try {
        const d = await api.get('/training-plans', { is_template: 1, size: 100 });
        this.templates = d.list;
      } finally { this.tplLoading = false; }
    },
    importTpl(row) {
      const items = this.parseItems(row);
      if (!items.length) return ElementPlus.ElMessage.warning('该模板没有动作');
      items.forEach(it => this.form.items.push(Object.assign(this.blankItem(), it)));
      ElementPlus.ElMessage.success('已导入 ' + items.length + ' 个动作');
      this.tplDlg = false;
    },
    /* ---- 保存/推送/删除 ---- */
    async save() {
      if (!this.form.title) return ElementPlus.ElMessage.warning('请填写计划标题');
      if (!this.isCoach && !this.form.coach_id) return ElementPlus.ElMessage.warning('请选择教练');
      if (!this.form.items.length) return ElementPlus.ElMessage.warning('请至少添加一个动作');
      const coach = this.coaches.find(x => x.id === this.form.coach_id);
      const body = {
        title: this.form.title,
        vip_id: this.form.vip_id || 0,
        coach_id: this.isCoach ? undefined : this.form.coach_id,
        coach_name: coach ? coach.realname : undefined,
        plan_date: this.form.plan_date || '',
        note: this.form.note || '',
        is_template: this.form.vip_id ? 0 : 1,
        items: this.form.items.filter(x => x.action_name),
      };
      this.saving = true;
      try {
        if (this.form.id) await api.put('/training-plans/' + this.form.id, body);
        else await api.post('/training-plans', body);
        ElementPlus.ElMessage.success('保存成功');
        this.dlg = false;
        this.load();
      } finally { this.saving = false; }
    },
    push(row) {
      ElementPlus.ElMessageBox.confirm(
        '将把计划「' + row.title + '」推送给会员 ' + (row.realname || '') + '，并发送短信提醒，确认推送？',
        '推送训练计划', { type: 'info', confirmButtonText: '确认推送' })
        .then(async () => {
          await api.post('/training-plans/' + row.id + '/push');
          ElementPlus.ElMessage.success('已推送并发送短信');
          this.load();
        }).catch(() => {});
    },
    del(row) {
      ElementPlus.ElMessageBox.confirm('确定删除计划「' + row.title + '」？', '删除计划', { type: 'warning' })
        .then(async () => {
          await api.del('/training-plans/' + row.id);
          ElementPlus.ElMessage.success('已删除');
          this.load();
        }).catch(() => {});
    },
  },
  mounted() { this.load(); this.loadDicts(); api.get('/ai/status').then(s => { this.aiStatus = s || {}; }).catch(() => {}); },
};
