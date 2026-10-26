/* 会员端-我的合同 + 合同详情(手写签名)
   手写板逻辑抽成 mixin, 员工端「店内当面签」复用同一套, 保证两边签名效果一致。 */
window.SignPadMixin = {
  data() { return { padShow: false, drawn: false, submitting: false }; },
  methods: {
    openPad() {
      this.padShow = true;
      // 兜底: 某些环境下 popup 过渡事件不触发, @opened 收不到
      setTimeout(() => { const cv = this.$refs.pad; if (cv && !cv._inited) this.initPad(); }, 450);
    },
    initPad() {
      const cv = this.$refs.pad;
      if (!cv || cv._inited) { if (cv) this.clearPad(); return; }
      cv._inited = true;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      this._ctx = ctx; this._cw = w; this._ch = h;
      let drawing = false;
      const pos = (e) => {
        const rect = cv.getBoundingClientRect();
        const p = (e.touches && e.touches[0]) || e;
        return { x: p.clientX - rect.left, y: p.clientY - rect.top };
      };
      const start = (e) => { e.preventDefault(); drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke(); this.drawn = true; };
      const move = (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
      const end = () => { drawing = false; };
      cv.addEventListener('touchstart', start, { passive: false });
      cv.addEventListener('touchmove', move, { passive: false });
      cv.addEventListener('touchend', end);
      cv.addEventListener('mousedown', start);
      cv.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
    },
    clearPad() {
      if (!this._ctx) return;
      this._ctx.fillStyle = '#fff';
      this._ctx.fillRect(0, 0, this._cw, this._ch);
      this.drawn = false;
    },
  },
};

window.Pages.MemberContracts = {
  data() { return { list: [], loading: true }; },
  template: [
    '<div class="page">',
    '  <m-nav title="我的合同"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无合同"/>',
    '    <div v-for="c in list" :key="c.id" class="rec-item flex" @click="$router.push(\'/contract/\'+c.id)">',
    '      <van-icon name="notes-o" size="26" color="var(--brand)"/>',
    '      <div class="flex1" style="margin-left:12px">',
    '        <div class="name">{{ c.title }}</div>',
    '        <div class="muted mt4">{{ c.contract_num }} · {{ H.day(c.insert_time) }}</div>',
    '      </div>',
    '      <d-tag dict="signStatus" :v="c.sign_status"></d-tag>',
    '      <van-icon name="arrow" color="var(--c-text-4)" style="margin-left:4px"/>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  async mounted() {
    try { this.list = await API.get('/member/my-contracts'); }
    finally { this.loading = false; }
  },
};

window.Pages.MemberContractDetail = {
  mixins: [window.SignPadMixin],
  data() { return { c: null, loading: true }; },
  template: [
    '<div class="page" style="padding-bottom:90px">',
    '  <m-nav title="合同详情"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="c">',
    '    <div class="card-box">',
    '      <div class="flex">',
    '        <div class="flex1">',
    '          <div style="font-size:16px;font-weight:700">{{ c.title }}</div>',
    '          <div class="muted mt4">合同号 {{ c.contract_num }}</div>',
    '        </div>',
    '        <d-tag dict="signStatus" :v="c.sign_status"></d-tag>',
    '      </div>',
    '      <van-divider style="margin:12px 0"/>',
    '      <div class="contract-body">{{ c.content }}</div>',
    '      <template v-if="c.sign_status===1">',
    '        <van-divider style="margin:12px 0">会员签名</van-divider>',
    '        <img v-if="c.sign_img" :src="c.sign_img" class="sign-img-show" style="width:60%"/>',
    '        <div class="muted mt4">签署时间：{{ H.full(c.sign_time) }}</div>',
    '      </template>',
    '    </div>',
    '    <div v-if="c.sign_status===0" style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -2px 10px rgba(0,0,0,.05);z-index:110">',
    '      <van-button type="primary" block round @click="openPad">签署合同</van-button>',
    '    </div>',
    '  </template>',

    '  <van-popup v-model:show="padShow" position="bottom" round safe-area-inset-bottom @opened="initPad">',
    '    <div class="sign-pad-wrap">',
    '      <div class="flex" style="margin-bottom:10px">',
    '        <div class="flex1" style="font-size:16px;font-weight:600">手写签名</div>',
    '        <span class="muted">请在下方区域签写姓名</span>',
    '      </div>',
    '      <canvas ref="pad" class="sign-canvas"></canvas>',
    '      <div class="flex mt12" style="gap:10px">',
    '        <van-button round block plain type="primary" @click="clearPad">重写</van-button>',
    '        <van-button round block type="primary" :loading="submitting" @click="submitSign">确认签署</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.c = await API.get('/member/my-contracts/' + this.$route.params.id); }
      finally { this.loading = false; }
    },
    async submitSign() {
      if (!this.drawn) return vant.showToast('请先手写签名');
      this.submitting = true;
      try {
        const img = this.$refs.pad.toDataURL('image/png');
        await API.post('/member/my-contracts/' + this.c.id + '/sign', { sign_img: img });
        this.padShow = false;
        vant.showToast({ message: '签署成功', icon: 'success' });
        this.load();
      } finally { this.submitting = false; }
    },
  },
  mounted() { this.load(); },
};
