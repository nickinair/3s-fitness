/* 员工端-教练: 训练计划列表 / 新建·编辑(AI一句话生成) */
(function () {
  const coachId = () => (Store.user && Store.user.coach_id) || 0;
  const UNITS = ['次', '秒', '分钟'];

  window.Pages.StaffPlans = {
    data() { return { list: [], loading: true, onlyTpl: false, img: '', imgShow: false, pushing: 0, removing: 0 }; },
    computed: {
      shown() { return this.onlyTpl ? this.list.filter(p => p.is_template) : this.list; },
    },
    template: [
      '<div class="page">',
      '  <m-nav title="训练计划"></m-nav>',
      '  <div class="flex" style="margin:12px 12px 0;gap:10px">',
      '    <van-button type="primary" round size="small" icon="plus" style="flex:1" @click="$router.push(\'/staff/plan-edit\')">新建计划</van-button>',
      '    <van-checkbox v-model="onlyTpl" shape="square" icon-size="16" checked-color="var(--brand)" style="flex-shrink:0">仅看模板</van-checkbox>',
      '  </div>',
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!shown.length" description="暂无训练计划，点上方按钮新建"/>',
      '    <div v-for="p in shown" :key="p.id" class="rec-item">',
      '      <div class="head" @click="$router.push(\'/staff/plan-edit?id=\'+p.id)">',
      '        <span class="name">{{ p.title }}</span>',
      '        <span>',
      '          <van-tag v-if="p.is_template" type="primary" plain round>模板</van-tag>',
      '          <van-tag v-if="p.pushed" type="success" round style="margin-left:4px">已推送</van-tag>',
      '        </span>',
      '      </div>',
      '      <div class="muted mt8" @click="$router.push(\'/staff/plan-edit?id=\'+p.id)">',
      '        {{ p.is_template ? \'通用模板\' : (\'学员 \'+(p.realname||\'-\')) }}',
      '        <template v-if="p.plan_date"> · {{ H.dateOf(p.plan_date) }}</template>',
      '        · {{ itemCount(p) }} 个动作',
      '      </div>',
      '      <div class="foot">',
      '        <van-button size="small" round plain icon="delete-o" class="btn-icon-only" :loading="removing===p.id" @click="remove(p)"></van-button>',
      '        <van-button size="small" round plain @click="$router.push(\'/staff/plan-edit?id=\'+p.id)">编辑</van-button>',
      '        <van-button size="small" round plain icon="photo-o" @click="genImage(p)">生成图片</van-button>',
      '        <van-button v-if="p.vip_id" size="small" round type="primary" :loading="pushing===p.id" @click="push(p)">{{ p.pushed ? \'再次推送\' : \'推送给学员\' }}</van-button>',
      '      </div>',
      '    </div>',
      '  </template>',
      '  <van-popup v-model:show="imgShow" round closeable style="width:86%;max-width:420px;background:transparent">',
      '    <div style="background:#fff;border-radius:14px;padding:12px 12px 16px">',
      '      <img :src="img" style="width:100%;display:block;border-radius:10px"/>',
      '      <div class="muted" style="text-align:center;margin-top:10px">长按图片保存，可直接转发微信给学员</div>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      itemCount(p) { return window.parsePlanItems(p.items).length; },
      genImage(p) {
        this.img = window.PlanImage({
          title: p.title, member: p.is_template ? '' : (p.realname || ''), coach: p.coach_name || (Store.user || {}).realname,
          date: H.dateOf(p.plan_date), note: p.note, items: window.parsePlanItems(p.items),
        });
        this.imgShow = true;
      },
      // 删除为软删除(status=0), 会员端也随之看不到; 已推送的额外提醒一句
      async remove(p) {
        try {
          await vant.showConfirmDialog({
            title: '删除计划', confirmButtonColor: 'var(--danger)', confirmButtonText: '删除',
            message: '确定删除「' + p.title + '」吗？'
              + (p.pushed ? '\n该计划已推送，删除后学员也将看不到。' : ''),
          });
        } catch (e) { return; }
        this.removing = p.id;
        try {
          await API.del('/training-plans/' + p.id);
          vant.showToast({ message: '已删除', icon: 'success' });
          this.load();
        } finally { this.removing = 0; }
      },
      async push(p) {
        try {
          await vant.showConfirmDialog({
            title: '推送给学员', confirmButtonColor: 'var(--brand)',
            message: '将「' + p.title + '」推送给 ' + (p.realname || '学员') + '，并发送短信通知，确定吗？',
          });
        } catch (e) { return; }
        this.pushing = p.id;
        try {
          await API.post('/training-plans/' + p.id + '/push');
          vant.showToast({ message: '已推送并发送短信', icon: 'success' });
          this.load();
        } finally { this.pushing = 0; }
      },
      async load() {
        this.loading = true;
        try {
          const d = await API.get('/training-plans?size=100');
          this.list = d.list || [];
        } finally { this.loading = false; }
      },
    },
    mounted() { this.load(); },
  };

  window.Pages.StaffPlanEdit = {
    data() {
      return {
        id: Number(this.$route.query.id || 0),
        loading: false, saving: false,
        form: { title: '', vip_id: 0, realname: '', plan_date: H.today(), note: '' },
        items: [],
        // AI 解析
        aiText: '', aiLoading: false, listening: false, aiStatus: { llm: false, asr: false },
        recBars: [], recSec: 0,   // 声纹柱高(0~1) 与录音秒数
        // 学员选择
        students: [], stuShow: false, stuKw: '',
        // 动作联想
        sugFor: -1, sugs: [],
      };
    },
    template: [
      '<div class="page" style="padding-bottom:90px">',
      '  <m-nav :title="id ? \'编辑计划\' : \'新建计划\'"></m-nav>',
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',

      '    <div class="ai-box">',
      '      <div class="flex"><van-icon name="bulb-o" color="var(--c-title)"/><b style="margin-left:6px;font-size:14px">AI 一句话生成</b><span class="muted flex1" style="margin-left:8px">说出或输入整套安排</span></div>',
      '      <textarea v-model="aiText" rows="2" class="ai-ta" placeholder="例：练背：引体向上4组8次，杠铃划船4组10次60kg，最后划船机15分钟"></textarea>',
      // 录音时只有左侧按钮切换成声纹条, AI 解析按钮始终可见
      '      <div class="flex" style="gap:8px;margin-top:8px">',
      '        <button v-if="!listening" type="button" class="vc-btn" @click="voice">',
      '          <svg class="vc-mic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"/><path d="M18 11a6 6 0 0 1-12 0"/><path d="M12 17v4"/><path d="M9 21h6"/></svg>',
      '          <span>语音录入</span>',
      '        </button>',
      '        <button v-else type="button" class="vc-btn rec" @click="voice">',
      '          <span class="rec-dot"></span>',
      '          <span class="rec-wave">',
      '            <i v-for="(h, i) in recBars" :key="i" :style="{ height: (3 + h * 15) + \'px\' }"></i>',
      '          </span>',
      '          <span class="rec-time">{{ recTime }}</span>',
      '          <span class="rec-stop"><i></i></span>',
      '        </button>',
      '        <van-button size="small" round type="primary" style="flex:1" :loading="aiLoading" loading-text="解析中..." @click="aiParse">',
      '          <i class="ai-ico"></i>AI 解析',
      '        </van-button>',
      '      </div>',
      '    </div>',

      '    <div class="card-box" style="padding:6px 0">',
      '      <van-field v-model="form.title" label="计划标题" placeholder="如：胸部训练日" />',
      '      <van-field :model-value="form.vip_id ? form.realname : \'不选学员（存为模板）\'" label="学员" readonly is-link @click="openStu"/>',
      '      <van-field label="日期">',
      '        <template #input><input type="date" v-model="form.plan_date" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text)"/></template>',
      '      </van-field>',
      '      <van-field v-model="form.note" label="备注" placeholder="教练叮嘱，随计划展示给学员" :border="false"/>',
      '    </div>',

      '    <div class="sec-title">动作列表（{{ items.length }}）<span class="more brand-text" @click="addItem"><van-icon name="add-o"/> 添加动作</span></div>',
      '    <van-empty v-if="!items.length" description="用上方 AI 解析，或手动添加动作" image-size="60"/>',
      '    <div v-for="(it,i) in items" :key="i" class="rec-item" style="padding:10px 12px">',
      '      <div class="flex">',
      '        <div class="plan-idx">{{ i+1 }}</div>',
      '        <div class="flex1" style="margin:0 8px;position:relative">',
      '          <input v-model="it.action_name" placeholder="动作名" class="plan-input" @input="suggest(i)" @blur="hideSug"/>',
      '          <div v-if="sugFor===i && sugs.length" class="sug-pop">',
      '            <div v-for="s in sugs" :key="s.id" class="sug-item" @mousedown.prevent="pickSug(i,s)">{{ s.name }}<span class="muted" style="margin-left:6px">{{ s.part }}</span></div>',
      '          </div>',
      '        </div>',
      '        <van-icon name="cross" color="var(--c-text-4)" size="18" @click="items.splice(i,1)"/>',
      '      </div>',
      '      <div class="flex mt8" style="gap:10px;flex-wrap:wrap">',
      '        <div class="flex"><span class="muted" style="margin-right:4px">组数</span><van-stepper v-model="it.sets" min="1" max="20" integer button-size="22"/></div>',
      '        <div class="flex"><span class="muted" style="margin-right:4px">{{ it.unit===\'次\' ? \'次数\' : \'数值\' }}</span><van-stepper v-model="it.reps" min="1" max="999" integer button-size="22"/></div>',
      '        <div class="unit-seg"><span v-for="u in units" :key="u" :class="{on:it.unit===u}" @click="it.unit=u">{{ u }}</span></div>',
      '      </div>',
      '      <div class="flex mt8" style="gap:8px">',
      '        <input v-model="it.weight" placeholder="重量(如 60kg)" class="plan-input" style="flex:1"/>',
      '        <input v-model="it.rest" placeholder="组间歇(如 90秒)" class="plan-input" style="flex:1"/>',
      '      </div>',
      '    </div>',

      '    <div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -2px 10px rgba(0,0,0,.05);z-index:110">',
      '      <van-button type="primary" block round :loading="saving" @click="save">{{ form.vip_id ? \'保存计划\' : \'保存为模板\' }}</van-button>',
      '    </div>',
      '  </template>',

      '  <van-popup v-model:show="stuShow" position="bottom" round safe-area-inset-bottom>',
      '    <div class="pop-scroll" style="padding:16px 14px 22px">',
      '      <div style="font-size:15px;font-weight:600;margin-bottom:6px">选择学员</div>',
      '      <van-search v-model="stuKw" placeholder="搜索姓名 / 手机号" style="padding:0 0 8px" clearable/>',
      '      <div class="cat-pick flex" :class="{on:!form.vip_id}" @click="pickStu(null)">',
      '        <div class="flex1">不选学员 <span class="muted">存为通用模板</span></div>',
      '        <van-icon v-if="!form.vip_id" name="checked" color="var(--brand)" size="18"/>',
      '      </div>',
      '      <div v-for="s in filteredStudents" :key="s.card_id" class="cat-pick flex" :class="{on:form.vip_id===s.id}" @click="pickStu(s)">',
      '        <div class="flex1"><b>{{ s.realname }}</b> <span class="muted">{{ s.phone }} · 剩 {{ s.left_counts }} 课时</span></div>',
      '        <van-icon v-if="form.vip_id===s.id" name="checked" color="var(--brand)" size="18"/>',
      '      </div>',
      '      <van-empty v-if="!filteredStudents.length" :description="stuKw ? \'没有匹配的学员\' : \'暂无私教学员\'" image-size="60"/>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    beforeUnmount() { clearInterval(this._waveTimer); },
    computed: {
      units() { return UNITS; },
      recTime() {
        const m = Math.floor(this.recSec / 60), sec = this.recSec % 60;
        return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
      },
      // 按姓名/手机号过滤(列表已全量加载, 前端过滤即可)
      filteredStudents() {
        const k = this.stuKw.trim().toLowerCase();
        if (!k) return this.students;
        return this.students.filter(s =>
          String(s.realname || '').toLowerCase().includes(k) || String(s.phone || '').includes(k));
      },
    },
    methods: {
      addItem() { this.items.push({ action_name: '', sets: 4, reps: 12, unit: '次', weight: '', rest: '', remark: '' }); },
      openStu() { this.stuKw = ''; this.stuShow = true; },
      pickStu(s) {
        if (s) { this.form.vip_id = s.id; this.form.realname = s.realname; }
        else { this.form.vip_id = 0; this.form.realname = ''; }
        this.stuShow = false;
      },
      hideSug() { setTimeout(() => { this.sugFor = -1; }, 150); },
      async suggest(i) {
        const kw = (this.items[i].action_name || '').trim();
        this.sugFor = i;
        if (kw.length < 1) { this.sugs = []; return; }
        try {
          const list = await API.get('/training-actions?keyword=' + encodeURIComponent(kw), { silent: true });
          this.sugs = (list || []).filter(a => a.name !== kw).slice(0, 5);
        } catch (e) { this.sugs = []; }
      },
      pickSug(i, s) { this.items[i].action_name = s.name; this.items[i].part = s.part; this.sugFor = -1; this.sugs = []; },
      // 声纹动效: real=true 时用麦克风真实音量(WavRecorder.level)驱动, 否则用轻微起伏兜底
      startWave(real) {
        const N = 11;   // 声纹条塞在半宽按钮内, 前面让出呼吸红点的位置
        this.recBars = new Array(N).fill(0.06);
        this.recSec = 0;
        const t0 = Date.now();
        this._waveTimer = setInterval(() => {
          const lv = real && window.WavRecorder ? (WavRecorder.level || 0) : (0.12 + Math.random() * 0.12);
          const h = Math.max(0.06, Math.min(1, lv + (Math.random() - 0.5) * 0.06));
          const arr = this.recBars.slice(1); arr.push(h);
          this.recBars = arr;
          this.recSec = Math.floor((Date.now() - t0) / 1000);
        }, 90);
      },
      stopWave() {
        clearInterval(this._waveTimer); this._waveTimer = null;
        this.recBars = []; this.recSec = 0;
      },
      async voice() {
        // 优先: 服务端火山ASR识别 (需已配置密钥 + HTTPS/localhost)
        if (this.aiStatus && this.aiStatus.asr) {
          const hint = WavRecorder.secureHint();
          if (hint) return vant.showToast(hint);
          if (!WavRecorder.supported()) return vant.showToast('当前浏览器不支持录音');
          if (this.listening) {
            this.listening = false;
            this.stopWave();
            const t = vant.showLoadingToast({ message: '识别中…', duration: 0 });
            try {
              const { base64, seconds } = await WavRecorder.stop();
              if (seconds < 0.6) return vant.showToast('录音太短，请重试');
              const d = await API.post('/asr/recognize', { audio_base64: base64, format: 'wav' });
              this.aiText = (this.aiText ? this.aiText + '，' : '') + d.text;
              vant.showToast({ message: '识别完成', icon: 'success' });
            } finally { t.close(); }
            return;
          }
          try {
            await WavRecorder.start();
            this.listening = true;
            this.startWave(true);
          } catch (e) {
            vant.showToast(e.name === 'NotAllowedError' ? '请允许麦克风权限' : '无法开启麦克风');
          }
          return;
        }
        // 回落: 浏览器内置语音识别
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return vant.showToast('当前浏览器不支持语音输入，请直接键入');
        if (this.listening && this._rec) { this._rec.stop(); return; }
        const rec = new SR();
        this._rec = rec;
        rec.lang = 'zh-CN'; rec.interimResults = false; rec.continuous = false;
        this.startWave(false);
        rec.onresult = (e) => {
          let t = '';
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
          this.aiText = (this.aiText ? this.aiText + '，' : '') + t;
        };
        rec.onerror = () => { this.listening = false; this.stopWave(); vant.showToast('语音识别失败，请重试或直接键入'); };
        rec.onend = () => { this.listening = false; this.stopWave(); };
        this.listening = true;
        rec.start();
      },
      async aiParse() {
        const text = this.aiText.trim();
        if (!text) return vant.showToast('请先说出或输入训练安排');
        this.aiLoading = true;
        try {
          const d = await API.post('/training-plans/parse', { text });
          const items = (d && d.items) || [];
          if (!items.length) return vant.showToast('未识别到动作，请换个说法');
          items.forEach(it => {
            this.items.push({
              action_name: it.action_name, sets: it.sets || 1, reps: it.reps || 12,
              unit: it.unit || '次', weight: it.weight || '', rest: it.rest || '', remark: it.remark || '', part: it.part || '',
            });
          });
          let msg = '已识别 ' + items.length + ' 个动作';
          if (d.title && !String(this.form.title || '').trim()) { this.form.title = d.title; msg += '，标题已生成'; }
          vant.showToast({ message: msg, icon: 'success' });
        } finally { this.aiLoading = false; }
      },
      async save() {
        if (!this.form.title.trim()) return vant.showToast('请填写计划标题');
        if (!this.items.length) return vant.showToast('请至少添加一个动作');
        if (this.items.some(it => !String(it.action_name || '').trim())) return vant.showToast('有动作未填写名称');
        const body = {
          title: this.form.title.trim(),
          vip_id: this.form.vip_id || 0,
          coach_id: coachId(),
          plan_date: this.form.plan_date,
          note: this.form.note,
          is_template: this.form.vip_id ? 0 : 1,
          items: this.items.map(it => ({
            action_name: String(it.action_name).trim(), sets: Number(it.sets) || 1, reps: Number(it.reps) || 0,
            unit: it.unit || '次', weight: it.weight || '', rest: it.rest || '', remark: it.remark || '', part: it.part || '',
          })),
        };
        this.saving = true;
        try {
          if (this.id) await API.put('/training-plans/' + this.id, body);
          else await API.post('/training-plans', body);
          vant.showToast({ message: '已保存', icon: 'success' });
          this.$router.replace('/staff/plans');
        } finally { this.saving = false; }
      },
    },
    async mounted() {
      API.get('/ai/status', { silent: true }).then(s => { this.aiStatus = s || {}; }).catch(() => {});
      try { this.students = await API.get('/coaches/' + coachId() + '/students', { silent: true }); } catch (e) { /* ignore */ }
      if (this.id) {
        this.loading = true;
        try {
          const p = await API.get('/training-plans/' + this.id);
          this.form = { title: p.title, vip_id: p.vip_id || 0, realname: p.realname || '', plan_date: H.dateOf(p.plan_date) || H.today(), note: p.note || '' };
          this.items = window.parsePlanItems(p.items).map(it => ({
            action_name: it.action_name, sets: it.sets || 1, reps: it.reps || 0, unit: it.unit || '次',
            weight: it.weight || '', rest: it.rest || '', remark: it.remark || '', part: it.part || '',
          }));
        } finally { this.loading = false; }
      }
    },
  };
})();
