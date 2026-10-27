/* 会员端-首页 */
(function () {
  /* 首页「常用功能」入口注册表: 顺序即默认展示顺序, 支持会员在编辑态增删与拖拽排序 */
  const QUICKS = {
    bookings: { t: '我的预约', icon: 'clock-o', to: '/my-bookings' },
    cards: { t: '我的卡', icon: 'credit-pay', to: '/my-cards' },
    contracts: { t: '我的合同', icon: 'notes-o', to: '/contracts' },
    plans: { t: '训练计划', icon: 'todo-list-o', to: '/plans' },
    milestones: { t: '里程碑', icon: 'medal-o', to: '/milestones' },
    pending: { t: '待确认消课', icon: 'passed', to: '/pending-confirms' },
  };
  const QUICK_DEFAULT = ['bookings', 'cards', 'contracts', 'plans', 'milestones', 'pending'];

  window.Pages.MemberHome = {
  data() {
    return { home: null, loading: true, notice: null, bannerIdx: 0, editing: false, layout: [], layoutKey: '' };
  },
  computed: {
    // 持卡才算会员; 未购卡的普通用户不显示任何身份标签
    isMember() { return !!(this.home && (this.home.cards || []).length); },
    quickDefs() { return Object.keys(QUICKS).reduce((m, k) => { m[k] = { t: QUICKS[k].t, icon: QUICKS[k].icon }; return m; }, {}); },
    quickKeys() { return this.layout.filter(k => QUICKS[k]); },
    poolKeys() { return Object.keys(QUICKS).filter(k => !this.layout.includes(k)); },
    quickBadges() {
      const h = this.home || {};
      return { contracts: h.pendingContract || 0, plans: h.newPlan || 0, pending: h.pendingConfirm || 0 };
    },
  },
  template: [
    '<div class="page has-tabbar">',
    '  <div v-if="loading" style="text-align:center;padding:80px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="home">',
    '    <div class="black-warn" v-if="home.vip && home.vip.is_black"><van-icon name="warning" /> 您的账号已被列入黑名单，签到与预约受限，请联系门店处理</div>',
    '    <div class="home-hero">',
    '      <div class="flex">',
    '        <m-avatar :name="home.vip && (home.vip.realname||home.vip.nickname)" :size="42"></m-avatar>',
    '        <div class="flex1" style="margin-left:10px">',
    '          <div class="hello">Hi，{{ home.vip ? (home.vip.realname || home.vip.nickname || \'会员\') : \'会员\' }}</div>',
    '          <div class="hero-sub" @click="$router.push(\'/my-bookings\')">近一周预约 {{ home.upcoming || 0 }} 节 <van-icon name="arrow" size="10"/></div>',
    '          <div class="hero-next" v-if="home.nextLesson" @click="$router.push(\'/my-bookings\')">',
    '            <van-icon name="clock-o" size="12"/> 下一节 {{ H.day(home.nextLesson.start_time) }} {{ H.time(home.nextLesson.start_time) }}',
    '            <template v-if="home.nextLesson.coach_name"> · {{ home.nextLesson.coach_name }} 教练</template>',
    '          </div>',
    '        </div>',
    '        <van-tag v-if="isMember" round color="var(--brand)" text-color="#fff" style="padding:3px 10px">会员</van-tag>',
    '      </div>',
    '    </div>',
    '    <div class="banner-wrap">',
    '    <div class="banner-swipe banner-scroll" ref="bsc" @scroll="onBannerScroll">',
    '      <div v-for="(b,i) in (home.banners||[])" :key="b.id" class="banner-item" :class="[hasImg(b) ? \'has-img\' : \'banner-g\'+(i%3)]"',
    '        :style="hasImg(b) ? { backgroundImage: \'url(\'+b.image+\')\' } : {}" @click="onBanner(b)">',
    '        <div class="banner-mask"></div>',
    '        <div class="banner-txt">',
    '          <div class="t" v-for="(ln,k) in titleLines(b.title)" :key="k">{{ ln }}</div>',
    '          <div class="s"><span class="hl">即刻开练</span><span class="tx">享受自我蜕变的快乐健身~</span></div>',
    '        </div>',
    '        <div class="banner-cta" v-if="b.link" @click.stop="onBanner(b)">立即前往 ›</div>',
    '      </div>',
    '      <div v-if="!(home.banners||[]).length" class="banner-item banner-g0">',
    '        <div class="banner-mask"></div>',
    '        <div class="banner-txt">',
    '          <div class="t">3S运动中心</div><div class="t">欢迎你的到来</div>',
    '          <div class="s"><span class="hl">即刻开练</span><span class="tx">享受自我蜕变的快乐健身~</span></div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div class="pending-bar" v-if="home.pendingConfirm>0" @click="$router.push(\'/pending-confirms\')">',
    '      <van-badge dot><van-icon name="bell" size="18"/></van-badge>',
    '      <span class="flex1" style="margin-left:10px">您有 <b>{{ home.pendingConfirm }}</b> 节私教课待确认消课，请及时确认</span>',
    '      <van-icon name="arrow"/>',
    '    </div>',
    // 合同不签会员是不知道的, 首页直接提示到签署入口
    '    <div class="pending-bar" v-if="home.pendingContract>0" @click="$router.push(\'/contracts\')">',
    '      <van-badge dot><van-icon name="notes-o" size="18"/></van-badge>',
    '      <span class="flex1" style="margin-left:10px">您有 <b>{{ home.pendingContract }}</b> 份购卡合同待签署</span>',
    '      <van-icon name="arrow"/>',
    '    </div>',
    '    <div class="pending-bar" v-if="home.newPlan>0" @click="$router.push(\'/plans\')">',
    '      <van-badge dot><van-icon name="todo-list-o" size="18"/></van-badge>',
    '      <span class="flex1" style="margin-left:10px">教练给您推送了 <b>{{ home.newPlan }}</b> 份训练计划</span>',
    '      <van-icon name="arrow"/>',
    '    </div>',
    '    <div class="banner-dots" v-if="(home.banners||[]).length>1">',
    '      <i v-for="(b,i) in home.banners" :key="b.id" :class="{on:i===bannerIdx}" @click="goBanner(i)"></i>',
    '    </div>',
    '    </div>',
    // 去掉「公告」小标题省出上下空间, 公告卡片本身够直观了
    '    <div class="card-box notice-box" v-if="(home.notices||[]).length" style="margin-top:12px">',
    '      <van-cell v-for="n in home.notices" :key="n.id" :title="n.title" :value="H.day(n.insert_time)" is-link :border="false" @click="notice=n"/>',
    '    </div>',
    '    <div class="card-box muted" v-else style="text-align:center;padding:14px">暂无公告</div>',
    '    <div class="sec-title">我的会员卡 <span class="more" @click="$router.push(\'/my-cards\')">全部 <van-icon name="arrow" size="10"/></span></div>',
    '    <div class="vip-scroll" v-if="(home.cards||[]).length">',
    '      <div v-for="c in home.cards" :key="c.id" class="vip-face" :class="H.faceCls(c)" @click="$router.push(\'/card/\'+c.id)">',
    '        <span class="kind">{{ DICT.cardKind[c.card_kind] }}</span>',
    '        <div class="name">{{ c.card_type_name }}</div>',
    '        <div class="left">{{ H.cardLeft(c) }}</div>',
    '        <div class="exp">{{ H.cardExp(c) }}</div>',
    '      </div>',
    '      <div class="vip-add" @click="$router.push(\'/buy\')"><van-icon name="plus" size="20"/><span>新增会员卡</span></div>',
    '    </div>',
    '    <div class="card-box flex" v-else @click="$router.push(\'/buy\')">',
    '      <van-icon name="credit-pay" color="var(--brand)" size="22"/>',
    '      <span class="flex1" style="margin-left:10px;font-size:14px">还没有会员卡，去挑选一张开启训练吧</span>',
    '      <van-button type="primary" size="small" round>去买卡</van-button>',
    '    </div>',
    '    <div class="sec-title">常用功能 <span class="wb-edit-btn" @click="toggleEdit">{{ editing ? \'完成\' : \'编辑\' }}</span></div>',
    '    <div class="act-panel">',
    '      <div class="main-acts">',
    '        <div class="main-act buy" @click="$router.push(\'/buy\')"><van-icon name="cart-o" size="19"/>买卡</div>',
    '        <div class="main-act book" @click="$router.push(\'/schedule\')"><van-icon name="calendar-o" size="19"/>约课</div>',
    '      </div>',
    '      <div class="act-split"></div>',
    '      <div class="wb-tip" v-if="editing">长按图标拖动排序 · 点右上角 − 移除 · 下方点按添加</div>',
    '      <wb-grid :defs="quickDefs" :keys="quickKeys" :editing="editing" :badges="quickBadges" icon-size="24" @update:keys="layout = $event" @pick="goQuick"/>',
    '      <template v-if="editing">',
    '        <div class="wb-pool-title" v-if="poolKeys.length">可添加的功能</div>',
    '        <wb-grid class="wb-pool" :defs="quickDefs" :keys="poolKeys" :badges="quickBadges" icon-size="22" @pick="addItem"/>',
    '        <div class="wb-reset" @click="resetLayout"><van-icon name="replay"/> 恢复默认布局</div>',
    '      </template>',
    '    </div>',
    '    <van-dialog :show="!!notice" @update:show="notice=null" :title="notice && notice.title" confirm-button-text="知道了" confirm-button-color="var(--brand)">',
    '      <div style="padding:16px 20px;font-size:13px;line-height:1.8;color:var(--c-text-2)">{{ notice && notice.content }}</div>',
    '    </van-dialog>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    // 九宫格角标: 待签合同 / 教练新推的训练计划 / 待确认消课, 有几条显示几
    badgeOf(to) {
      const h = this.home || {};
      const n = { '/contracts': h.pendingContract, '/plans': h.newPlan, '/pending-confirms': h.pendingConfirm }[to];
      return n > 0 ? n : '';
    },
    goQuick(key) { const q = QUICKS[key]; if (q) this.$router.push(q.to); },
    addItem(key) { if (!this.layout.includes(key)) this.layout = [...this.layout, key]; },
    toggleEdit() {
      if (this.editing) { this.saveLayout(); return; }
      this.layout = [...this.quickKeys];
      this.editing = true;
    },
    async saveLayout() {
      try {
        await API.put('/member/workbench', { items: [...this.quickKeys] });
        this.editing = false;
        vant.showToast({ message: '常用功能已保存', icon: 'success' });
      } catch (e) { /* API 层已 toast 错误 */ }
    },
    async resetLayout() {
      try { await vant.showConfirmDialog({ title: '恢复默认', message: '将恢复为默认的常用功能布局，确定吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
      this.layout = [...QUICK_DEFAULT];
    },
    watchLayout() { try { localStorage.setItem(this.layoutKey, JSON.stringify(this.layout || [])); } catch (e) { /* ignore */ } },
    onBannerScroll(e) {
      const el = e.target;
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (i !== this.bannerIdx) this.bannerIdx = i;
    },
    goBanner(i) {
      const el = this.$refs.bsc; if (!el) return;
      el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
      this.bannerIdx = i;
    },
    hasImg(b) { const u = b && b.image ? String(b.image) : ''; return u.indexOf('/uploads') === 0 || u.indexOf('/static') === 0; },
    // 标题按标点断成 1-2 行, 做成大标题的排版效果
    titleLines(t) {
      const s = String(t || '').trim();
      if (!s) return [''];
      const i = s.search(/[，,。！!·、\s]/);
      if (i > 2 && i < s.length - 2) return [s.slice(0, i), s.slice(i + 1)];
      if (s.length > 9) return [s.slice(0, Math.ceil(s.length / 2)), s.slice(Math.ceil(s.length / 2))];
      return [s];
    },
    onBanner(b) {
      // 配置了站内链接才跳转, 例如 /buy
      const l = b && b.link ? String(b.link) : '';
      if (l.indexOf('/') === 0) this.$router.push(l);
    },
    async load() {
      // 常用功能自定义布局: 先本地缓存即时渲染, 再以后端为准
      this.layoutKey = 'wb_layout_member_' + ((Store.user || {}).id || (Store.user || {}).phone || 0);
      try { const c = JSON.parse(localStorage.getItem(this.layoutKey) || 'null'); if (Array.isArray(c) && c.length) this.layout = c; } catch (e) { /* ignore */ }
      if (!this.layout.length) this.layout = [...QUICK_DEFAULT];
      try {
        const d = await API.get('/member/workbench', { silent: true });
        if (d && Array.isArray(d.items) && d.items.length) this.layout = d.items;
      } catch (e) { /* ignore */ }
      try { this.home = await API.get('/member/home'); }
      finally { this.loading = false; }
    },
  },
  watch: {
    layout() { this.watchLayout(); },
  },
  mounted() { this.load(); },
};
})();
