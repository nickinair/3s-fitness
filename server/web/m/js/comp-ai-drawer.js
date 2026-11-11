/* H5 全局 AI 健身助手「小S」: 左侧滑出抽屉 + 顶栏小S图标入口
 * 接口复用 /api/member/ai/* ; 拍照上传直接走 API.upload (客户端自动压缩 + /api/upload)
 * 支持在任意会员页原地弹出抽屉、原地调起相册/相机识别餐食热量并记入饮食日记
 * 员工登录时为「小S · 教练版」: 接口走 /api/staff/ai/*, 入口在底部 tabbar 最左侧,
 * 所有改动先出确认卡片(action), 点确认后由服务端执行; 另有选人(pick)、可复制文案(copy)卡片 */
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
    recording: false,
    recognizing: false,
    recBars: [5, 7, 10, 6, 8, 11, 7, 5, 9, 6],
    recTime: '0:00',
    enabled: true,
    msgs: [],
    quick: ['下一节课是什么时候', '我的卡还剩几节', '帮我约私教', '本周训练小结', '减脂期晚餐吃什么'],
    input: '',
    quota: null,
    sheet: false,
    sheetTarget: null,
    staff: false,
    mode: '',
  });

  const isStaff = () => Store.type === 'staff';
  const base = () => (isStaff() ? '/staff/ai' : '/member/ai');
  const STAFF_POLL_MS = 3 * 60 * 1000;   // 教练版: 每 3 分钟检查课前提醒/漏消课

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
      if (!Store.token) return;
      // 会员端红点只在顶栏入口显示; 员工端红点显示在 tabbar 的小S上
      try {
        const d = await API.get(base() + '/dot', { silent: true });
        state.unread = isStaff() ? !!(d && (d.dot || d.unread)) : !!(d && d.unread);
        // 抽屉开着时有新提醒(课前/漏消课), 直接拉取最新消息
        if (isStaff() && state.visible && d && d.unread > 0) this.init(true);
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
      if (state.recording) this.cancelVoice();
      finishTyping();
      state.opened = false;
      document.body.style.overflow = '';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { state.visible = false; }, 280);
    },
    async startVoice() {
      if (state.sending || state.uploading || state.recognizing || state.recording) return;
      const hint = window.WavRecorder && WavRecorder.secureHint && WavRecorder.secureHint();
      if (hint) { vant.showToast(hint); return; }
      if (!window.WavRecorder || !WavRecorder.supported()) {
        vant.showToast('当前环境不支持麦克风录音，请使用键盘输入');
        return;
      }
      try {
        await WavRecorder.start();
        state.recording = true;
        state.recTime = '0:00';
        state.recBars = [5, 7, 10, 6, 8, 11, 7, 5, 9, 6];
        const t0 = Date.now();
        clearInterval(this._recTimer);
        this._recTimer = setInterval(() => {
          const sec = Math.floor((Date.now() - t0) / 1000);
          const m = Math.floor(sec / 60);
          const s = sec % 60;
          const lv = (window.WavRecorder && WavRecorder.level) || (0.2 + Math.random() * 0.3);
          const bars = state.recBars.slice(1);
          bars.push(Math.round(4 + Math.min(1, lv + (Math.random() - 0.5) * 0.16) * 14));
          state.recBars = bars;
          state.recTime = m + ':' + (s < 10 ? '0' : '') + s;
        }, 100);
      } catch (e) {
        vant.showToast(e && e.name === 'NotAllowedError' ? '请允许麦克风权限' : '无法开启麦克风，请重试');
      }
    },
    async finishVoice(mode) {
      if (!state.recording) return;
      clearInterval(this._recTimer);
      state.recording = false;
      if (mode === 'cancel') {
        try { await WavRecorder.stop(); } catch (e) {}
        return;
      }
      state.recognizing = true;
      const toast = vant.showLoadingToast({ message: '语音识别中…', forbidClick: true, duration: 0 });
      try {
        const { base64, seconds } = await WavRecorder.stop();
        if (seconds < 0.5) {
          toast.close();
          state.recognizing = false;
          vant.showToast('说话时间太短，请重试');
          return;
        }
        const d = await API.post(base() + '/asr', { audio_base64: base64, format: 'wav' });
        toast.close();
        state.recognizing = false;
        const txt = (d && d.text ? String(d.text).trim() : '');
        if (!txt) {
          vant.showToast('未识别到语音内容');
          return;
        }
        if (mode === 'send') {
          this.send(txt);
        } else {
          const prev = (state.input || '').trim();
          state.input = prev ? (prev + ' ' + txt) : txt;
        }
      } catch (e) {
        toast.close();
        state.recognizing = false;
        vant.showToast((e && e.message) || '语音识别失败');
      }
    },
    cancelVoice() {
      this.finishVoice('cancel');
    },
    init(force) {
      if (initPromise) return initPromise;
      // 同一页面里切换了会员/员工身份: 清掉上一个身份的对话
      const mode = isStaff() ? 'staff' : 'member';
      if (state.mode !== mode) {
        state.mode = mode;
        state.staff = mode === 'staff';
        state.msgs = [];
        state.quick = [];
        loadedDay = '';
      }
      const today = new Date().toDateString();
      if (!force && loadedDay === today && state.msgs.length) {
        scrollBottom();
        return Promise.resolve();
      }
      state.initing = true;
      initPromise = API.get(base() + '/init', { silent: true }).then((d) => {
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

      API.post(base() + '/chat', { message: text, image: image || '' }, { silent: true }).then((d) => {
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
        noSwipe: false,
      };
    },
    mounted() {
      ensureFileInput();
      scrollElGetter = () => this.$refs.bodyEl;
      state.staff = isStaff();
      if (Store.token) AI.checkDot();
      this._poll = setInterval(() => { if (Store.token && isStaff()) AI.checkDot(); }, STAFF_POLL_MS);
    },
    beforeUnmount() { clearInterval(this._poll); },
    methods: {
      close() { AI.close(); },
      choosePhoto() { AI.choosePhoto(); },
      startVoice() { AI.startVoice(); },
      stopVoiceToText() { AI.finishVoice('text'); },
      stopVoiceAndSend() { AI.finishVoice('send'); },
      cancelVoice() { AI.cancelVoice(); },
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
        // 在可横向滑动的区域(快捷提示词条、卡片选项)或输入框里滑动, 是在滚动内容/移动光标, 不算「左滑关闭」
        const el = e.target && e.target.closest ? e.target : null;
        this.noSwipe = !!(el && el.closest('.aid-quick, .aid-opts, .aid-bar, .aid-ta, input, textarea'));
      },
      onTouchEnd(e) {
        const t = e.changedTouches && e.changedTouches[0];
        if (!t || this.noSwipe) return;
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
      /* ---- 教练版卡片 ---- */
      toggleItem(c, it) {
        if (c.status || c.busy) return;
        it.checked = !it.checked;
      },
      pickOption(c, o) {
        if (c.status || c.busy) return;
        c.option = o.value;
      },
      async confirmAction(mi, ci) {
        const m = this.state.msgs[mi];
        const c = m && m.cards && m.cards[ci];
        if (!c || c.status || c.busy || busyAction) return;
        const picked = c.items ? c.items.filter(i => i.checked).map(i => i.id) : undefined;
        if (c.items && !picked.length) { vant.showToast('请至少勾选一项'); return; }
        if (c.danger) {
          try {
            await vant.showConfirmDialog({
              title: c.title,
              message: c.items ? '共 ' + picked.length + ' 项，确认后立即生效' : '确认后立即生效',
              confirmButtonText: c.btn || '确认',
              confirmButtonColor: H.color('--danger'),
            });
          } catch (e) { return; }
        }
        busyAction = true;
        c.busy = true;
        try {
          const d = await API.post('/staff/ai/confirm', { msg_id: m.id, idx: ci, items: picked, option: c.option, text: c.text });
          const r = (d && d.card) || {};
          c.status = r.status || '';
          c.result = r.result || '';
          c.error = r.error || '';
          if (c.status === 'done') {
            vant.showToast({ message: '已完成', icon: 'success' });
            window.dispatchEvent(new CustomEvent('ai-staff-changed', { detail: { act: c.act } }));
          }
        } catch (e) {
          c.error = (e && e.message) || '执行失败';
        } finally {
          busyAction = false;
          c.busy = false;
        }
      },
      async dismissAction(mi, ci) {
        const m = this.state.msgs[mi];
        const c = m && m.cards && m.cards[ci];
        if (!c || c.status || c.busy) return;
        c.status = 'cancelled';
        c.result = '已取消，未做任何改动';
        try { await API.post('/staff/ai/confirm', { msg_id: m.id, idx: ci, cancel: true }, { silent: true }); } catch (e) { /* 本地已标记 */ }
      },
      pickPerson(c, o) {
        if (c.picked || this.state.sending) return;
        c.picked = o.label;
        AI.send(o.send);
      },
      copyText(c) {
        const t = c.text || '';
        const done = () => vant.showToast({ message: '已复制', icon: 'success' });
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(t).then(done).catch(() => this.copyFallback(t, done));
        } else this.copyFallback(t, done);
      },
      copyFallback(t, done) {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { vant.showToast('复制失败，请长按文字手动复制'); }
        document.body.removeChild(ta);
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
        await API.post(base() + '/clear', {});
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
      '        <div class="aid-hname">小S <span class="aid-htag">{{ state.staff ? \'教练版\' : \'AI 健身助手\' }}</span></div>',
      '        <div class="aid-hsub"><i class="aid-dot-on"></i>{{ state.uploading ? \'正在上传照片…\' : (state.sending ? \'正在思考…\' : (state.staff ? \'在线 · 说一句话就能办事\' : \'在线 · 随时为你服务\')) }}</div>',
      '      </div>',
      '      <div v-if="!state.staff" class="aid-hcam" @click="choosePhoto">📷 拍餐食</div>',
      '    </div>',

      // 消息流
      '    <div class="aid-body" ref="bodyEl">',
      '      <div v-if="state.initing && !state.msgs.length" class="aid-init">',
      '        <img class="aid-init-bot" src="/static/ai-bot.png" alt="小S"/>',
      '        <div class="aid-init-t">{{ state.staff ? \'小S 正在整理今日早报…\' : \'小S 正在为你准备今日简报…\' }}</div>',
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

      // 教练版: 操作确认卡片(代约/取消/改约/确认/消课/爽约/签到/请假/计划/体测/维护/潜客/里程碑)
      '              <div v-else-if="c.type === \'action\'" class="aid-card aid-act" :class="{off: c.status}">',
      '                <div class="aid-ctitle">{{ c.title }}</div>',
      '                <div v-if="c.warn" class="aid-warn">{{ c.warn }}</div>',
      '                <div v-for="(r, ri) in c.rows" :key="\'r\'+ri" class="aid-kv"><span class="k">{{ r[0] }}</span><span class="v">{{ r[1] }}</span></div>',
      '                <div v-if="c.list && c.list.length" class="aid-alist"><div v-for="(t, ti) in c.list" :key="ti">{{ ti + 1 }}. {{ t }}</div></div>',
      '                <div v-if="c.items && c.items.length" class="aid-items">',
      '                  <div v-for="it in c.items" :key="it.id" class="aid-item" :class="{on: it.checked}" @click="toggleItem(c, it)">',
      '                    <i class="aid-ck"><van-icon v-if="it.checked" name="success"/></i>',
      '                    <div class="aid-it-t"><div>{{ it.text }}</div><div v-if="it.sub" class="s">{{ it.sub }}</div></div>',
      '                  </div>',
      '                </div>',
      '                <div v-if="c.options && c.options.length" class="aid-opts">',
      '                  <span v-for="o in c.options" :key="o.value" class="aid-opt" :class="{on: c.option === o.value}" @click="pickOption(c, o)">{{ o.label }}</span>',
      '                </div>',
      '                <template v-if="c.text_label">',
      '                  <div class="aid-tlabel">{{ c.text_label }}</div>',
      '                  <textarea class="aid-ta" v-model="c.text" :disabled="!!c.status" rows="4" maxlength="1000"></textarea>',
      '                </template>',
      '                <div v-if="c.error && !c.status" class="aid-cerr">{{ c.error }}</div>',
      '                <div v-if="c.status" class="aid-cdone" :class="{muted: c.status === \'cancelled\'}">{{ c.status === \'done\' ? \'✓ \' : \'\' }}{{ c.result }}</div>',
      '                <div v-else class="aid-cbtns">',
      '                  <div class="aid-btn ghost" @click="dismissAction(mi, ci)">不用了</div>',
      '                  <div class="aid-btn" :class="{danger: c.danger, busy: c.busy}" @click="confirmAction(mi, ci)">{{ c.busy ? \'处理中…\' : c.btn }}</div>',
      '                </div>',
      '              </div>',

      // 教练版: 多位会员同名时选人
      '              <div v-else-if="c.type === \'pick\'" class="aid-card">',
      '                <div class="aid-ctitle">{{ c.title }}</div>',
      '                <div v-for="o in c.options" :key="o.send" class="aid-pick" :class="{on: c.picked === o.label, off: c.picked && c.picked !== o.label}" @click="pickPerson(c, o)">',
      '                  <span class="n">{{ o.label }}</span><span class="s">{{ o.sub }}</span><van-icon name="arrow"/>',
      '                </div>',
      '              </div>',

      // 教练版: 可一键复制的文案(续卡/召回话术、课后反馈、生日祝福)
      '              <div v-else-if="c.type === \'copy\'" class="aid-card">',
      '                <div class="aid-ctitle">{{ c.title }}</div>',
      '                <div class="aid-copy">{{ c.text }}</div>',
      '                <div class="aid-cbtns"><div class="aid-btn" @click="copyText(c)">复制文案</div></div>',
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
      '      <div v-if="state.msgs.length" class="aid-disclaim">{{ state.staff ? \'所有改动都需要你在卡片上确认后才会生效\' : \'AI 生成内容仅供参考，热量为估算值；伤病问题请咨询教练或医生\' }}</div>',
      '      <div style="height:12px"></div>',
      '    </div>',

      // 快捷胶囊条
      '    <div v-if="state.quick.length" class="aid-quick">',
      '      <span v-if="!state.staff" class="aid-q photo" @click="choosePhoto">📷 拍照算热量</span>',
      '      <span v-for="q in state.quick" :key="q" class="aid-q" @click="onQuick(q)">{{ q }}</span>',
      '      <span class="aid-q ghost" @click="clearAll">清空对话</span>',
      '    </div>',

      // 输入栏
      '    <div class="aid-bar">',
      '      <template v-if="!state.recording">',
      '        <div v-if="!state.staff" class="aid-cam" @click="choosePhoto" title="拍照/相册"><van-icon name="photograph" size="19"/></div>',
      '        <div class="aid-mic" :class="{main: state.staff}" @click="startVoice" title="语音输入">',
      '          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '            <rect x="9" y="2" width="6" height="12" rx="3"/>',
      '            <path d="M5 10v1a7 7 0 0 0 14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>',
      '          </svg>',
      '        </div>',
      '        <input class="aid-in" v-model="state.input" :placeholder="state.recognizing ? \'语音识别中…\' : (state.staff ? \'点麦克风说：帮王芳约明晚7点\' : \'问问小S，或点麦克风说话\')" maxlength="500" @keyup.enter="sendInput"/>',
      '        <div class="aid-send" :class="{on: state.input.trim() && !state.sending}" @click="sendInput">发送</div>',
      '      </template>',
      '      <template v-else>',
      '        <div class="aid-cancel" @click="cancelVoice" title="取消录音">✕</div>',
      '        <div class="aid-rec-box" @click="stopVoiceToText">',
      '          <i class="aid-rec-dot"></i>',
      '          <span class="aid-rec-time">{{ state.recTime }}</span>',
      '          <div class="aid-rec-wave"><i v-for="(h, idx) in state.recBars" :key="idx" :style="{height: h + \'px\'}"></i></div>',
      '          <span class="aid-rec-stop-wrap"><span class="aid-rec-stop"><i></i></span><span class="aid-rec-sec">转文字</span></span>',
      '        </div>',
      '        <div class="aid-send on rec-send" @click="stopVoiceAndSend">发送</div>',
      '      </template>',
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

