/* AI 健身助手「小S」左侧抽屉
 * 首页(原生页)左上角机器人头像点击打开; 数据接口 /api/member/ai/*
 * 回复非流式, 前端用打字机效果逐字展示; 卡片: brief 简报 / weekly 周报 / booking 约课确认 / cancel 取消确认 / meal 热量 / link 跳转 */
const config = require('../../config');

const ORIGIN = config.API_BASE.replace(/\/api\/?$/, '');
const TYPE_STEP = 3;      // 每帧显示字数
const TYPE_MS = 28;

Component({
  properties: {
    show: { type: Boolean, value: false },
    capTop: { type: Number, value: 24 },
    capH: { type: Number, value: 32 },
  },
  data: {
    visible: false, opened: false,
    msgs: [], quick: [], input: '', loading: false, initing: false, sending: false,
    recording: false, recognizing: false, recBars: [5, 8, 6, 10, 7, 12, 6, 9, 5, 8], recTime: '0:00',
    scrollId: '', kbH: 0, quota: null, origin: ORIGIN, enabled: true,
  },
  observers: {
    show(v) {
      if (v) {
        this.setData({ visible: true });
        setTimeout(() => this.setData({ opened: true }), 20);
        this.init();
      } else if (this.data.visible) {
        if (this.data.recording) this.cancelVoice();
        this.setData({ opened: false });
        clearTimeout(this.hideT);
        this.hideT = setTimeout(() => this.setData({ visible: false, kbH: 0 }), 280);
      }
    },
  },
  lifetimes: {
    detached() { clearTimeout(this.hideT); clearInterval(this.typeT); clearInterval(this.recT); },
  },
  methods: {
    noop() {},
    token() { return wx.getStorageSync('mp_token') || ''; },
    request(path, method, data) {
      return new Promise((resolve, reject) => {
        const token = this.token();
        wx.request({
          url: config.API_BASE + path, method: method || 'GET', data, timeout: 90000,
          header: token ? { Authorization: 'Bearer ' + token } : {},
          success: (res) => {
            const h = res.header || {};
            const renew = h['X-Renew-Token'] || h['x-renew-token'];
            if (renew) wx.setStorageSync('mp_token', renew);
            if (res.statusCode === 401) { this.triggerEvent('logout'); return reject(new Error('登录已过期，请重新登录')); }
            const body = res.data || {};
            if (body.code === 0) resolve(body.data); else reject(new Error(body.msg || '服务异常'));
          },
          fail: () => reject(new Error('网络不太好，请稍后再试')),
        });
      });
    },
    toast(msg) { wx.showToast({ title: String(msg || '出错了').slice(0, 30), icon: 'none' }); },

    /* ---------- 消息 ---------- */
    norm(m) {
      const cards = (m.cards || []).map(c => {
        if (c.type === 'weekly' && c.rows) {
          c.rows = c.rows.map(r => Object.assign({}, r, {
            curW: Math.round((r.cur / (r.max || 1)) * 100), prevW: Math.round((r.prev / (r.max || 1)) * 100),
            diff: r.cur - r.prev, diffText: r.cur === r.prev ? '持平' : (r.cur > r.prev ? '↑' : '↓') + Math.abs(+(r.cur - r.prev).toFixed(1)),
          }));
        }
        if (c.type === 'meal') {
          const sum = (c.protein * 4 + c.carbs * 4 + c.fat * 9) || 1;
          c.pP = Math.round(c.protein * 4 / sum * 100); c.pC = Math.round(c.carbs * 4 / sum * 100); c.pF = Math.max(0, 100 - c.pP - c.pC);
        }
        return c;
      });
      return {
        id: m.id, role: m.role, text: m.text || '', show: m.text || '', image: m.image ? (m.image.indexOf('http') === 0 ? m.image : ORIGIN + m.image) : '',
        rawImage: m.image || '', cards, time: m.time || '', typing: false,
      };
    },
    scrollBottom() {
      this.setData({ scrollId: '' });
      wx.nextTick(() => this.setData({ scrollId: 'bottom' }));
    },
    init() {
      if (this.data.initing) return;
      // 已加载过且是同一天: 只滚到底部
      const today = new Date().toDateString();
      if (this.loadedDay === today && this.data.msgs.length) { this.scrollBottom(); return; }
      this.setData({ initing: true });
      this.request('/member/ai/init').then(d => {
        this.loadedDay = today;
        this.setData({
          msgs: (d.messages || []).map(m => this.norm(m)), quick: d.quick || [], quota: d.quota, enabled: d.enabled !== false, initing: false,
        }, () => this.scrollBottom());
        this.triggerEvent('read');
      }).catch(e => { this.setData({ initing: false }); this.toast(e.message); });
    },
    pushMsg(m, typing) {
      const msg = this.norm(m);
      if (typing && msg.text) { msg.show = ''; msg.typing = true; }
      const msgs = this.data.msgs.concat([msg]);
      this.setData({ msgs }, () => {
        this.scrollBottom();
        if (typing && msg.text) this.typeOut(msgs.length - 1);
      });
    },
    typeOut(idx) {
      clearInterval(this.typeT);
      const full = this.data.msgs[idx].text;
      let n = 0;
      this.typeT = setInterval(() => {
        n += TYPE_STEP;
        const done = n >= full.length;
        const patch = {};
        patch['msgs[' + idx + '].show'] = done ? full : full.slice(0, n);
        if (done) { patch['msgs[' + idx + '].typing'] = false; clearInterval(this.typeT); }
        this.setData(patch);
        if (done || n % 30 === 0) this.scrollBottom();
      }, TYPE_MS);
    },
    finishTyping() {
      clearInterval(this.typeT);
      const patch = {};
      this.data.msgs.forEach((m, i) => { if (m.typing) { patch['msgs[' + i + '].show'] = m.text; patch['msgs[' + i + '].typing'] = false; } });
      if (Object.keys(patch).length) this.setData(patch);
    },

    /* ---------- 发送 ---------- */
    onInput(e) { this.setData({ input: e.detail.value }); },
    onKb(e) { this.setData({ kbH: e.detail.height || 0 }, () => this.scrollBottom()); },
    onBlur() { this.setData({ kbH: 0 }); },
    sendInput() { this.send(this.data.input); },
    onQuick(e) { this.send(e.currentTarget.dataset.q); },

    /* ---------- 语音输入 (豆包火山引擎 ASR) ---------- */
    ensureRecorder() {
      if (this._recMgr) return this._recMgr;
      const mgr = wx.getRecorderManager();
      mgr.onStart(() => {
        this._recT0 = Date.now();
        this._recLv = 0.2;
        clearInterval(this.recT);
        this.setData({ recording: true, recTime: '0:00', recBars: [5, 7, 10, 6, 8, 11, 7, 5, 9, 6] });
        this.recT = setInterval(() => {
          const sec = Math.floor((Date.now() - this._recT0) / 1000);
          const m = Math.floor(sec / 60);
          const s = sec % 60;
          const lv = this._recLv || (0.2 + Math.random() * 0.35);
          const bars = (this.data.recBars || []).slice(1);
          bars.push(Math.round(4 + Math.min(1, lv + (Math.random() - 0.5) * 0.2) * 14));
          this.setData({ recTime: m + ':' + (s < 10 ? '0' : '') + s, recBars: bars });
        }, 110);
      });
      mgr.onFrameRecorded(({ frameBuffer }) => {
        if (!frameBuffer || !frameBuffer.byteLength) return;
        const pcm = new Int16Array(frameBuffer);
        let sum = 0;
        const step = Math.max(1, Math.floor(pcm.length / 200));
        let cnt = 0;
        for (let i = 0; i < pcm.length; i += step) {
          const v = pcm[i] / 32768;
          sum += v * v;
          cnt++;
        }
        const rms = Math.sqrt(sum / Math.max(1, cnt));
        this._recLv = (this._recLv || 0.2) * 0.5 + Math.min(1, rms * 4.5) * 0.5;
      });
      mgr.onStop((res) => {
        clearInterval(this.recT);
        const action = this._voiceAction || 'text';
        this.setData({ recording: false });
        if (action === 'cancel') return;
        const dur = (res && res.duration) || (Date.now() - (this._recT0 || Date.now()));
        if (dur < 500 || !res || !res.tempFilePath) {
          this.toast('说话时间太短，请重试');
          return;
        }
        this.setData({ recognizing: true });
        wx.showLoading({ title: '语音识别中…', mask: true });
        wx.getFileSystemManager().readFile({
          filePath: res.tempFilePath,
          encoding: 'base64',
          success: (r) => {
            this.request('/member/ai/asr', 'POST', { audio_base64: r.data, format: 'wav' }).then((d) => {
              wx.hideLoading();
              this.setData({ recognizing: false });
              const txt = (d && d.text ? String(d.text).trim() : '');
              if (!txt) { this.toast('未识别到语音内容'); return; }
              if (action === 'send') {
                this.send(txt);
              } else {
                const prev = (this.data.input || '').trim();
                this.setData({ input: prev ? (prev + ' ' + txt) : txt });
              }
            }).catch((err) => {
              wx.hideLoading();
              this.setData({ recognizing: false });
              this.toast(err.message || '语音识别失败');
            });
          },
          fail: () => {
            wx.hideLoading();
            this.setData({ recognizing: false });
            this.toast('读取录音失败，请重试');
          },
        });
      });
      mgr.onError((err) => {
        clearInterval(this.recT);
        this.setData({ recording: false, recognizing: false });
        const msg = (err && err.errMsg) || '';
        if (/auth|deny|permission/i.test(msg)) {
          wx.showModal({
            title: '需要麦克风权限',
            content: '请在设置中开启麦克风权限，以便使用语音对小S说话',
            confirmText: '去开启',
            success: (r) => { if (r.confirm && wx.openSetting) wx.openSetting(); },
          });
        } else {
          this.toast('无法启动录音，请稍后重试');
        }
      });
      this._recMgr = mgr;
      return mgr;
    },
    onMicStart() {
      if (this.data.sending || this.data.recognizing || this.data.recording) return;
      this._micTouchStart = Date.now();
      this._voiceAction = 'text';
      const mgr = this.ensureRecorder();
      mgr.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'wav',
        frameSize: 4,
      });
    },
    onMicEnd() {
      if (!this.data.recording) return;
      const heldMs = Date.now() - (this._micTouchStart || 0);
      // 长按超过 600ms 松手即自动停止并识别；轻点则保持录音状态，点「转文字」或「发送」结束
      if (heldMs >= 600) {
        this._voiceAction = 'text';
        this.ensureRecorder().stop();
      }
    },
    stopVoiceToText() {
      if (!this.data.recording) return;
      this._voiceAction = 'text';
      this.ensureRecorder().stop();
    },
    stopVoiceAndSend() {
      if (!this.data.recording) return;
      this._voiceAction = 'send';
      this.ensureRecorder().stop();
    },
    cancelVoice() {
      if (!this.data.recording) return;
      this._voiceAction = 'cancel';
      clearInterval(this.recT);
      this.setData({ recording: false });
      try { this.ensureRecorder().stop(); } catch (e) {}
    },
    send(text, image) {
      text = String(text || '').trim();
      if ((!text && !image) || this.data.sending) return;
      this.finishTyping();
      const userMsg = { id: 'u' + Date.now(), role: 'user', text, image: image || '', cards: [] };
      this.setData({ input: '', sending: true, msgs: this.data.msgs.concat([this.norm(userMsg)]) }, () => this.scrollBottom());
      this.request('/member/ai/chat', 'POST', { message: text, image: image || '' }).then(d => {
        this.setData({ sending: false, quota: d.quota || this.data.quota });
        (d.messages || []).forEach(m => this.pushMsg(m, true));
      }).catch(e => {
        this.setData({ sending: false });
        this.pushMsg({ id: 'e' + Date.now(), role: 'assistant', text: '😥 ' + e.message, cards: [] }, false);
      });
    },
    chooseImage() {
      if (this.data.sending) return;
      wx.chooseMedia({
        count: 1, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['camera', 'album'],
        success: (res) => {
          const f = res.tempFiles && res.tempFiles[0];
          if (!f) return;
          this.upload(f.tempFilePath);
        },
      });
    },
    upload(filePath) {
      wx.showLoading({ title: '上传中', mask: true });
      const onUploaded = (url) => {
        wx.hideLoading();
        const text = this.data.input.trim();
        this.send(text || '帮我算算这餐的热量', url);
      };
      const fallbackBase64 = () => {
        try {
          wx.getFileSystemManager().readFile({
            filePath,
            encoding: 'base64',
            success: (r) => {
              this.request('/member/ai/upload-base64', 'POST', { base64: r.data }).then(d => {
                if (d && d.url) onUploaded(d.url);
                else { wx.hideLoading(); this.toast('上传失败'); }
              }).catch(e => { wx.hideLoading(); this.toast(e.message || '上传失败'); });
            },
            fail: () => { wx.hideLoading(); this.toast('上传失败，请重试'); },
          });
        } catch (e) {
          wx.hideLoading();
          this.toast('上传失败，请重试');
        }
      };
      wx.uploadFile({
        url: config.API_BASE + '/upload', filePath, name: 'file',
        header: { Authorization: 'Bearer ' + this.token() },
        success: (res) => {
          let body = {};
          try { body = JSON.parse(res.data || '{}'); } catch (e) { body = {}; }
          if (body.code === 0 && body.data && body.data.url) {
            onUploaded(body.data.url);
          } else {
            fallbackBase64();
          }
        },
        fail: () => fallbackBase64(),
      });
    },
    previewImg(e) {
      const url = e.currentTarget.dataset.url;
      if (url) wx.previewImage({ urls: [url], current: url });
    },

    /* ---------- 卡片动作 ---------- */
    cardOf(e) {
      const { mi, ci } = e.currentTarget.dataset;
      const m = this.data.msgs[mi];
      return { m, c: m && m.cards[ci], mi, ci };
    },
    markDone(mi, ci, done) {
      const patch = {};
      patch['msgs[' + mi + '].cards[' + ci + '].done'] = done;
      this.setData(patch);
    },
    confirmBooking(e) {
      const { m, c, mi, ci } = this.cardOf(e);
      if (!c || c.done || this.busy) return;
      this.busy = true;
      wx.showLoading({ title: '预约中', mask: true });
      this.request('/member/ai/confirm-booking', 'POST', { draft: c.draft, msg_id: m.id, card_idx: ci }).then(d => {
        wx.hideLoading(); this.busy = false;
        this.markDone(mi, ci, d.done);
        if (d.message) this.pushMsg(d.message, true);
        this.triggerEvent('changed');
      }).catch(err => { wx.hideLoading(); this.busy = false; this.toast(err.message); });
    },
    confirmCancel(e) {
      const { m, c, mi, ci } = this.cardOf(e);
      if (!c || c.done || this.busy) return;
      wx.showModal({
        title: '确认取消', content: c.day + ' ' + c.draft.from_time + ' ' + c.draft.coach_name + '教练的课程', confirmText: '确认取消', confirmColor: '#000000',
        success: (r) => {
          if (!r.confirm) return;
          this.busy = true;
          this.request('/member/ai/confirm-cancel', 'POST', { booking_id: c.draft.booking_id, msg_id: m.id, card_idx: ci }).then(d => {
            this.busy = false;
            this.markDone(mi, ci, d.done);
            if (d.message) this.pushMsg(d.message, true);
            this.triggerEvent('changed');
          }).catch(err => { this.busy = false; this.toast(err.message); });
        },
      });
    },
    dismissCard(e) {
      const { mi, ci, c } = this.cardOf(e);
      if (!c || c.done) return;
      this.markDone(mi, ci, '已放弃');
    },
    saveMeal(e) {
      const { m, c, mi, ci } = this.cardOf(e);
      if (!c || c.done || this.busy) return;
      this.busy = true;
      this.request('/member/ai/meal-log', 'POST', {
        msg_id: m.id, card_idx: ci, foods: c.foods, kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat,
        image: c.image, meal_type: c.meal_type, comment: c.comment,
      }).then(d => {
        this.busy = false;
        this.markDone(mi, ci, d.done);
        if (d.message) this.pushMsg(d.message, true);
      }).catch(err => { this.busy = false; this.toast(err.message); });
    },
    pickMealType(e) {
      const { mi, ci, c } = this.cardOf(e);
      if (!c || c.done) return;
      const types = ['breakfast', 'lunch', 'dinner', 'snack'];
      const names = ['早餐', '午餐', '晚餐', '加餐'];
      wx.showActionSheet({
        itemList: names,
        success: (r) => {
          const patch = {};
          patch['msgs[' + mi + '].cards[' + ci + '].meal_type'] = types[r.tapIndex];
          patch['msgs[' + mi + '].cards[' + ci + '].meal_name'] = names[r.tapIndex];
          this.setData(patch);
        },
      });
    },
    goLink(e) {
      const { c } = this.cardOf(e);
      if (c && c.path) this.triggerEvent('nav', { path: c.path });
    },

    /* ---------- 抽屉 ---------- */
    close() { this.finishTyping(); this.triggerEvent('close'); },
    clearAll() {
      wx.showModal({
        title: '清空对话', content: '清空后聊天记录无法恢复', confirmText: '清空', confirmColor: '#000000',
        success: (r) => {
          if (!r.confirm) return;
          this.request('/member/ai/clear', 'POST', {}).then(() => { this.loadedDay = ''; this.setData({ msgs: [] }); this.init(); }).catch(e => this.toast(e.message));
        },
      });
    },
    // 面板向左滑动关闭
    onTouchStart(e) { const t = e.touches[0]; this.tx = t.clientX; this.ty = t.clientY; },
    onTouchEnd(e) {
      const t = e.changedTouches[0];
      const dx = t.clientX - this.tx; const dy = t.clientY - this.ty;
      if (dx < -70 && Math.abs(dy) < 50) this.close();
    },
  },
});

