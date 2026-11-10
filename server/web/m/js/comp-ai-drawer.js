/* H5 全局 AI 健身助手「小S」: 左侧滑出抽屉 + 顶栏小S图标入口
 * 接口复用 /api/member/ai/* ; 拍照上传直接走 API.upload (客户端自动压缩 + /api/upload)
 * 支持在任意会员页原地弹出抽屉、原地调起相册/相机识别餐食热量并记入饮食日记 */
(function () {
  const TYPE_STEP = 3;
  const TYPE_MS = 26;
  const MEAL_TYPES = [
    { name: '早餐', key: 'breakfast' },
    { name: '午餐', key: 'lunch' },
    { name: '晚餐', key: 'dinner' },
    { name: '加餐', key: 'snack' },
  ];

  const state = Vue.reactive({
    visible: false,
    opened: false,
    unread: false,
    initing: false,
    sending: false,
    uploading: false,
    enabled: true,
    msgs: [],
    quick: ['下一节课是什么时候', '我的卡还剩几节', '帮我约私教', '本周训练小结', '减脂期晚餐吃什么'],
    input: '',
    quota: null,
    sheet: false,
    sheetTarget: null,
  });

  let loadedDay = '';
  let initPromise = null;
  let hideTimer = null;
  let typeTimer = null;
  let busyAction = false;
  let fileInputEl = null;
  let scrollElGetter = null;

  function ensureFileInput() {
    if (fileInputEl && document.body.contains(fileInputEl)) return fileInputEl;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    inp.addEventListener('change', (e) => {
      const f = e.target && e.target.files && e.target.files[0];
      inp.value = '';
      if (f) AI.handleFile(f);
    });
    document.body.appendChild(inp);
    fileInputEl = inp;
    return inp;
  }

  function normMsg(m) {
    const cards = (m.cards || []).map((raw) => {
      const c = Object.assign({}, raw);
      if (c.type === 'weekly' && Array.isArray(c.rows)) {
        c.rows = c.rows.map((r) => {
          const diff = +(r.cur - r.prev).toFixed(1);
          return Object.assign({}, r, {
            curW: Math.max(4, Math.round((r.cur / (r.max || 1)) * 100)),
            prevW: Math.max(4, Math.round((r.prev / (r.max || 1)) * 100)),
            diff,
            diffText: diff === 0 ? '持平' : (diff > 0 ? '↑' : '↓') + Math.abs(diff),
          });
        });
      }
      if (c.type === 'meal') {
        const sum = (Number(c.protein || 0) * 4 + Number(c.carbs || 0) * 4 + Number(c.fat || 0) * 9) || 1;
        c.pP = Math.round((Number(c.protein || 0) * 4 / sum) * 100);
        c.pC = Math.round((Number(c.carbs || 0) * 4 / sum) * 100);
        c.pF = Math.max(0, 100 - c.pP - c.pC);
      }
      return c;
    });
    return {
      id: m.id || ('m_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
      role: m.role,
      text: m.text || '',
      show: m.text || '',
      image: m.image || '',
      cards,
      time: m.time || '',
      typing: false,
      optimistic: !!m.optimistic,
    };
  }

  function scrollBottom() {
    setTimeout(() => {
      const el = scrollElGetter && scrollElGetter();
      if (el) el.scrollTop = el.scrollHeight + 400;
    }, 24);
  }

  function finishTyping() {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    state.msgs.forEach((m) => {
      if (m.typing) {
        m.show = m.text;
        m.typing = false;
      }
    });
  }

  function typeOut(msg) {
    finishTyping();
    const full = msg.text || '';
    if (!full) { msg.typing = false; return; }
    msg.show = '';
    msg.typing = true;
    let n = 0;
    typeTimer = setInterval(() => {
      n += TYPE_STEP;
      if (n >= full.length) {
        msg.show = full;
        msg.typing = false;
        clearInterval(typeTimer);
        typeTimer = null;
        scrollBottom();
      } else {
        msg.show = full.slice(0, n);
        if (n % 27 === 0) scrollBottom();
      }
    }, TYPE_MS);
  }

  function pushMsg(raw, withTyping) {
    const msg = normMsg(raw);
    if (withTyping && msg.text) {
      msg.show = '';
      msg.typing = true;
    }
    state.msgs.push(msg);
    const liveMsg = state.msgs[state.msgs.length - 1];
    scrollBottom();
    if (withTyping && liveMsg.text) typeOut(liveMsg);
  }

  const AI = {
    state,
    async checkDot() {
      if (!Store.token || Store.type === 'staff') return;
      try {
        const d = await API.get('/member/ai/dot', { silent: true });
        state.unread = !!(d && d.unread);
      } catch (e) { /* ignore */ }
    },
    open() {
      if (!Store.token) {
        location.hash = '#/login';
        return;
      }
      clearTimeout(hideTimer);
      state.visible = true;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { state.opened = true; });
      });
      this.init();
    },
    // 在当前页弹出 AI 抽屉并同步拉起系统相册/相机
    openWithPhoto() {
      if (!Store.token) {
        location.hash = '#/login';
        return;
      }
      const inp = ensureFileInput();
      inp.value = '';
      inp.click();
      this.open();
    },
    choosePhoto() {
      if (state.sending || state.uploading) return;
      const inp = ensureFileInput();
      inp.value = '';
      inp.click();
    },
    close() {
      finishTyping();
      state.opened = false;
      document.body.style.overflow = '';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { state.visible = false; }, 280);
    },
    init(force) {
      if (initPromise) return initPromise;
      const today = new Date().toDateString();
      if (!force && loadedDay === today && state.msgs.length) {
        scrollBottom();
        return Promise.resolve();
      }
      state.initing = true;
      initPromise = API.get('/member/ai/init', { silent: true }).then((d) => {
        loadedDay = today;
        const pendingOptimistic = state.msgs.filter(m => m.optimistic);
        const serverMsgs = (d.messages || []).map(m => normMsg(m));
        state.msgs = serverMsgs.concat(pendingOptimistic);
        if (d.quick && d.quick.length) state.quick = d.quick;
        state.quota = d.quota || null;
        state.enabled = d.enabled !== false;
        state.unread = false;
        scrollBottom();
      }).catch((e) => {
        if (!state.msgs.length) {
          vant.showToast((e && e.message) || '加载小S失败');
        }
      }).finally(() => {
        state.initing = false;
        initPromise = null;
      });
      return initPromise;
    },
    async handleFile(file) {
      if (!file || state.sending || state.uploading) return;
      if (!state.visible) this.open();
      state.uploading = true;
      const toast = vant.showLoadingToast({ message: '上传照片中...', forbidClick: true, duration: 0 });
      try {
        const url = await API.upload(file);
        toast.close();
        state.uploading = false;
        if (!url) throw new Error('上传失败');
        if (initPromise) {
          try { await initPromise; } catch (e) {}
        }
        const prompt = (state.input || '').trim() || '帮我算算这餐的热量';
        this.send(prompt, url);
      } catch (e) {
        toast.close();
        state.uploading = false;
        vant.showToast((e && e.message) || '图片上传失败，请重试');
      }
    },
    send(text, image) {
      text = String(text || '').trim();
      if ((!text && !image) || state.sending) return;
      finishTyping();
      const userMsg = normMsg({
        id: 'u_' + Date.now(),
        role: 'user',
        text,
        image: image || '',
        cards: [],
        optimistic: true,
      });
      state.input = '';
      state.sending = true;
      state.msgs.push(userMsg);
      scrollBottom();

      API.post('/member/ai/chat', { message: text, image: image || '' }, { silent: true }).then((d) => {
        userMsg.optimistic = false;
        state.sending = false;
        if (d.quota) state.quota = d.quota;
        (d.messages || []).forEach(m => pushMsg(m, true));
      }).catch((e) => {
        userMsg.optimistic = false;
        state.sending = false;
        pushMsg({
          id: 'err_' + Date.now(),
          role: 'assistant',
          text: '😥 ' + ((e && e.message) || '网络不太好，请稍后再试'),
          cards: [],
        }, false);
      });
    },
  };

  window.AI = AI;

  /* 顶栏「小S」图标入口组件: 可选带左侧小房子主页按钮 */
  const AiEntry = {
    props: {
      home: { type: Boolean, default: false },
      dark: { type: Boolean, default: false },
      label: { type: String, default: '小S' },
    },
    data() {
      return { state };
    },
    mounted() {
      if (!state.msgs.length) AI.checkDot();
    },
    methods: {
      openAi() { AI.open(); },
      goHome() {
        if (window.MP && MP.is() && MP.homeWithToken()) return;
        this.$router.push('/');
      },
    },
    template: [
      '<div class="ai-entry-wrap" :class="{dark: dark}">',
      '  <div v-if="home" class="ai-home-btn" @click.stop="goHome" title="首页">',
      '    <van-icon name="wap-home-o"/>',
      '  </div>',
      '  <div class="ai-bot-pill" @click.stop="openAi">',
      '    <div class="ai-bot-av">',
      '      <img src="/static/ai-bot.png" alt="小S"/>',
      '      <i class="ai-bot-ring"></i>',
      '      <span v-if="state.unread" class="ai-bot-dot"></span>',
      '    </div>',
      '    <span v-if="label" class="ai-bot-txt">{{ label }}</span>',
      '  </div>',
      '</div>',
    ].join('\n'),
  };

  /* 左侧滑出 AI 聊天抽屉组件 */
  const AiDrawer = {
    data() {
      return {
        state,
        mealActions: MEAL_TYPES,
        tx: 0,
        ty: 0,
      };
    },
    mounted() {
      ensureFileInput();
      scrollElGetter = () => this.$refs.bodyEl;
      if (Store.token && Store.type !== 'staff') AI.checkDot();
    },
    methods: {
      close() { AI.close(); },
      choosePhoto() { AI.choosePhoto(); },
      sendInput() { AI.send(this.state.input); },
      onQuick(q) { AI.send(q); },
      preview(u) {
        if (u) vant.showImagePreview({ images: [u], closeable: true });
      },
      onTouchStart(e) {
        const t = e.touches && e.touches[0];
        if (!t) return;
        this.tx = t.clientX;
        this.ty = t.clientY;
      },
      onTouchEnd(e) {
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - this.tx;
        const dy = t.clientY - this.ty;
        if (dx < -65 && Math.abs(dy) < 55) this.close();
      },
      dismissCard(mi, ci) {
        const m = this.state.msgs[mi];
        const c = m && m.cards && m.cards[ci];
        if (!c || c.done) return;
        c.done = '已放弃';
      },
      async confirmBooking(mi, ci) {
        const m = this.state.msgs[mi];
        const c = m && m.cards && m.cards[ci];
        if (!c || c.done || busyAction) return;
        busyAction = true;
        const toast = vant.showLoadingToast({ message: '预约中...', forbidClick: true, duration: 0 });
        try {
          const d = await API.post('/member/ai/confirm-booking', { draft: c.draft, msg_id: m.id, card_idx: ci });
          toast.close();
          c.done = d.done;
          if (d.message) pushMsg(d.message, true);
          window.dispatchEvent(new CustomEvent('ai-booking-changed', { detail: d }));
        } catch (e) {
          toast.close();
        } finally {
          busyAction = false;
        }
      },
      async confirmCancel(mi, ci) {
        const m = this.state.msgs[mi];
        const c = m && m.cards && m.cards[ci];
        if (!c || c.done || busyAction) return;
        try {
          await vant.showConfirmDialog({
            title: '确认取消',
            message: c.day + ' ' + c.draft.from_time + ' ' + c.draft.coach_name + '教练的课程',
            confirmButtonText: '确认取消',
            confirmButtonColor: '#000',
          });
        } catch (e) { return; }
        busyAction = true;
        try {
          const d = await API.post('/member/ai/confirm-cancel', { booking_id: c.draft.booking_id, msg_id: m.id, card_idx: ci });
          c.done = d.done;
          if (d.message) pushMsg(d.message, true);
          window.dispatchEvent(new CustomEvent('ai-booking-changed', { detail: d }));
        } finally {
          busyAction = false;
        }
      },
      pickMealType(mi, ci) {
        const m = this.state.msgs[mi];
        const c = m && m.cards && m.cards[ci];
        if (!c || c.done) return;
        this.state.sheetTarget = { mi, ci };
        this.state.sheet = true;
      },
      onSelectMealType(a) {
        this.state.sheet = false;
        const t = this.state.sheetTarget;
        if (!t) return;
        const m = this.state.msgs[t.mi];
        const c = m && m.cards && m.cards[t.ci];
        if (!c || c.done) return;
        c.meal_type = a.key;
        c.meal_name = a.name;
      },
      async saveMeal(mi, ci) {
        const m = this.state.msgs[mi];
        const c = m && m.cards && m.cards[ci];
        if (!c || c.done || busyAction) return;
        busyAction = true;
        try {
          const d = await API.post('/member/ai/meal-log', {
            msg_id: m.id,
            card_idx: ci,
            foods: c.foods,
            kcal: c.kcal,
            protein: c.protein,
            carbs: c.carbs,
            fat: c.fat,
            image: c.image,
            meal_type: c.meal_type,
            comment: c.comment,
          });
          c.done = d.done;
          if (d.message) pushMsg(d.message, true);
          vant.showToast({ message: d.done || '已记入饮食日记', icon: 'success' });
          window.dispatchEvent(new CustomEvent('ai-meal-logged', { detail: d }));
        } finally {
          busyAction = false;
        }
      },
      goLink(c) {
        if (!c || !c.path) return;
        const target = '/' + String(c.path).replace(/^\//, '');
        this.close();
        if (this.$route.path === target.split('?')[0]) {
          window.dispatchEvent(new CustomEvent('ai-meal-logged'));
          window.dispatchEvent(new CustomEvent('ai-booking-changed'));
          return;
        }
        this.$router.push(target);
      },
      async clearAll() {
        try {
          await vant.showConfirmDialog({
            title: '清空对话',
            message: '清空后聊天记录无法恢复',
            confirmButtonText: '清空',
            confirmButtonColor: '#000',
          });
        } catch (e) { return; }
        await API.post('/member/ai/clear', {});
        loadedDay = '';
        this.state.msgs = [];
        AI.init(true);
      },
    },
    template: [
      '<div v-if="state.visible" class="aid-root">',
      '  <div class="aid-mask" :class="{on: state.opened}" @click="close"></div>',
      '  <div class="aid-panel" :class="{on: state.opened}" @touchstart="onTouchStart" @touchend="onTouchEnd">',
      // 顶栏
      '    <div class="aid-head">',
      '      <div class="aid-close" @click="close"><van-icon name="arrow-left"/></div>',
      '      <img class="aid-bot" src="/static/ai-bot.png" alt="小S"/>',
      '      <div class="aid-htxt">',
      '        <div class="aid-hname">小S <span class="aid-htag">AI 健身助手</span></div>',
      '        <div class="aid-hsub"><i class="aid-dot-on"></i>{{ state.uploading ? \'正在上传照片…\' : (state.sending ? \'正在思考…\' : \'在线 · 随时为你服务\') }}</div>',
      '      </div>',
      '      <div class="aid-hcam" @click="choosePhoto">📷 拍餐食</div>',
      '    </div>',

      // 消息流
      '    <div class="aid-body" ref="bodyEl">',
      '      <div v-if="state.initing && !state.msgs.length" class="aid-init">',
      '        <img class="aid-init-bot" src="/static/ai-bot.png" alt="小S"/>',
      '        <div class="aid-init-t">小S 正在为你准备今日简报…</div>',
      '        <div class="aid-dots"><i></i><i></i><i></i></div>',
      '      </div>',

      '      <div v-for="(m, mi) in state.msgs" :key="m.id || mi" class="aid-row" :class="m.role === \'user\' ? \'me\' : \'bot\'">',
      '        <img v-if="m.role !== \'user\'" class="aid-av" src="/static/ai-bot.png" alt="小S"/>',
      '        <div class="aid-main">',
      '          <img v-if="m.image" class="aid-img" :src="m.image" @click="preview(m.image)"/>',
      '          <template v-for="(c, ci) in m.cards" :key="\'bh_\'+ci">',
      '            <div v-if="c.type === \'brief\'" class="aid-brief-head">',
      '              <span class="bh-t">☀️ {{ c.title }}</span>',
      '              <span v-if="c.weather" class="bh-w">{{ c.weather }}</span>',
      '            </div>',
      '          </template>',
      '          <div v-if="m.show || m.typing" class="aid-bubble">{{ m.show }}<span v-if="m.typing" class="aid-caret">▍</span></div>',

      // 结构化卡片
      '          <template v-if="!m.typing">',
      '            <template v-for="(c, ci) in m.cards" :key="\'cd_\'+ci">',
      // 周报卡片
      '              <div v-if="c.type === \'weekly\'" class="aid-card">',
      '                <div class="aid-ctitle">📊 {{ c.title }}</div>',
      '                <div v-for="w in c.rows" :key="w.label" class="aid-wk-row">',
      '                  <div class="aid-wk-l">{{ w.label }}</div>',
      '                  <div class="aid-wk-bars">',
      '                    <div class="aid-wk-bar cur" :style="{width: w.curW + \'%\'}"><span>{{ w.cur }}</span></div>',
      '                    <div class="aid-wk-bar prev" :style="{width: w.prevW + \'%\'}"><span>{{ w.prev }}</span></div>',
      '                  </div>',
      '                  <div class="aid-wk-d" :class="w.diff > 0 ? \'up\' : (w.diff < 0 ? \'down\' : \'\')">{{ w.diffText }}</div>',
      '                </div>',
      '                <div class="aid-wk-legend"><i class="cur"></i>上周 <i class="prev"></i>再上周</div>',
      '              </div>',

      // 约课确认卡片
      '              <div v-else-if="c.type === \'booking\'" class="aid-card">',
      '                <div class="aid-ctitle">📅 {{ c.title }}</div>',
      '                <div class="aid-kv"><span class="k">教练</span><span class="v">{{ c.draft.coach_name }}</span></div>',
      '                <div class="aid-kv"><span class="k">课程</span><span class="v">{{ c.draft.course_title }}</span></div>',
      '                <div class="aid-kv"><span class="k">时间</span><span class="v strong">{{ c.day }} {{ c.draft.from_time }}-{{ c.draft.to_time }}</span></div>',
      '                <div class="aid-kv"><span class="k">门店</span><span class="v">{{ c.draft.club_name }}</span></div>',
      '                <div class="aid-kv"><span class="k">用卡</span><span class="v">{{ c.draft.card_name }} · {{ c.draft.card_left }}</span></div>',
      '                <div v-if="c.done" class="aid-cdone">{{ c.done }}</div>',
      '                <div v-else class="aid-cbtns">',
      '                  <div class="aid-btn ghost" @click="dismissCard(mi, ci)">不用了</div>',
      '                  <div class="aid-btn" @click="confirmBooking(mi, ci)">确认预约</div>',
      '                </div>',
      '              </div>',

      // 取消预约确认卡片
      '              <div v-else-if="c.type === \'cancel\'" class="aid-card">',
      '                <div class="aid-ctitle">⚠️ {{ c.title }}</div>',
      '                <div class="aid-kv"><span class="k">课程</span><span class="v">{{ c.draft.course_title }}</span></div>',
      '                <div class="aid-kv"><span class="k">时间</span><span class="v strong">{{ c.day }} {{ c.draft.from_time }}-{{ c.draft.to_time }}</span></div>',
      '                <div class="aid-kv"><span class="k">教练</span><span class="v">{{ c.draft.coach_name }}</span></div>',
      '                <div v-if="c.done" class="aid-cdone">{{ c.done }}</div>',
      '                <div v-else class="aid-cbtns">',
      '                  <div class="aid-btn ghost" @click="dismissCard(mi, ci)">保留课程</div>',
      '                  <div class="aid-btn danger" @click="confirmCancel(mi, ci)">确认取消</div>',
      '                </div>',
      '              </div>',

      // 餐食热量识别卡片
      '              <div v-else-if="c.type === \'meal\'" class="aid-card">',
      '                <div class="aid-meal-top">',
      '                  <div>',
      '                    <div class="aid-meal-k"><span class="num">{{ c.kcal }}</span> kcal</div>',
      '                    <div v-if="c.range" class="aid-meal-r">估算区间 {{ c.range }}</div>',
      '                  </div>',
      '                  <div class="aid-meal-type" @click="pickMealType(mi, ci)">{{ c.meal_name }} ▾</div>',
      '                </div>',
      '                <div class="aid-macro">',
      '                  <div class="aid-mc-bar">',
      '                    <i class="p" :style="{width: c.pP + \'%\'}"></i>',
      '                    <i class="c" :style="{width: c.pC + \'%\'}"></i>',
      '                    <i class="f" :style="{width: c.pF + \'%\'}"></i>',
      '                  </div>',
      '                  <div class="aid-mc-lg">',
      '                    <span><i class="d p"></i>蛋白 {{ c.protein }}g</span>',
      '                    <span><i class="d c"></i>碳水 {{ c.carbs }}g</span>',
      '                    <span><i class="d f"></i>脂肪 {{ c.fat }}g</span>',
      '                  </div>',
      '                </div>',
      '                <div v-for="(f, fi) in c.foods" :key="fi" class="aid-food">',
      '                  <span class="fn">{{ f.name }}</span>',
      '                  <span class="fg">约{{ f.grams }}g</span>',
      '                  <span class="fk">{{ f.kcal }} kcal</span>',
      '                </div>',
      '                <div v-if="c.target" class="aid-meal-tip">今日建议 {{ c.target }} kcal · 已记录 {{ c.eaten }} kcal</div>',
      '                <div v-if="c.done" class="aid-cdone">{{ c.done }}</div>',
      '                <div v-else class="aid-cbtns">',
      '                  <div class="aid-btn" @click="saveMeal(mi, ci)">记入今日{{ c.meal_name }}</div>',
      '                </div>',
      '              </div>',

      // 跳转胶囊
      '              <div v-else-if="c.type === \'link\'" class="aid-link" @click="goLink(c)">{{ c.text }} ›</div>',
      '            </template>',
      '          </template>',
      '        </div>',
      '      </div>',

      '      <div v-if="state.sending || state.uploading" class="aid-row bot">',
      '        <img class="aid-av" src="/static/ai-bot.png" alt="小S"/>',
      '        <div class="aid-bubble aid-thinking"><div class="aid-dots"><i></i><i></i><i></i></div></div>',
      '      </div>',
      '      <div v-if="state.msgs.length" class="aid-disclaim">AI 生成内容仅供参考，热量为估算值；伤病问题请咨询教练或医生</div>',
      '      <div style="height:12px"></div>',
      '    </div>',

      // 快捷胶囊条
      '    <div v-if="state.quick.length" class="aid-quick">',
      '      <span class="aid-q photo" @click="choosePhoto">📷 拍照算热量</span>',
      '      <span v-for="q in state.quick" :key="q" class="aid-q" @click="onQuick(q)">{{ q }}</span>',
      '      <span class="aid-q ghost" @click="clearAll">清空对话</span>',
      '    </div>',

      // 输入栏
      '    <div class="aid-bar">',
      '      <div class="aid-cam" @click="choosePhoto"><van-icon name="photograph" size="20"/></div>',
      '      <input class="aid-in" v-model="state.input" placeholder="问问小S，如「约三七教练明晚7点」" maxlength="500" @keyup.enter="sendInput"/>',
      '      <div class="aid-send" :class="{on: state.input.trim() && !state.sending}" @click="sendInput">发送</div>',
      '    </div>',
      '  </div>',
      '  <van-action-sheet v-model:show="state.sheet" :actions="mealActions" cancel-text="取消" description="改为哪一餐" @select="onSelectMealType" teleport="body"/>',
      '</div>',
    ].join('\n'),
  };

  window.MComponents = window.MComponents || {};
  window.MComponents['ai-entry'] = AiEntry;
  window.MComponents['ai-drawer'] = AiDrawer;
})();
