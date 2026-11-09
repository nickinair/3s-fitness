/* 会员端-首页 (沉浸式视频首屏, 版式对标 M Stand 小程序首页) */
(function () {
  /* 首页「常用功能」入口注册表: 顺序即默认展示顺序, 支持会员在编辑态增删与拖拽排序
     s = 图标下方的小字说明(参考图「免费领咖啡 / 会员定期福利」那一行) */
  const QUICKS = {
    checkin: { t: '到店签到', s: '扫码快速入场', icon: 'aim', to: '/checkin' },
    bookings: { t: '我的预约', s: '已约课程', icon: 'clock-o', to: '/my-bookings' },
    cards: { t: '我的卡', s: '余额与有效期', icon: 'credit-pay', to: '/my-cards' },
    contracts: { t: '我的合同', s: '在线签署', icon: 'notes-o', to: '/contracts' },
    plans: { t: '训练计划', s: '教练专属定制', icon: 'todo-list-o', to: '/plans' },
    milestones: { t: '里程碑', s: '成长记录', icon: 'medal-o', to: '/milestones' },
    pending: { t: '待确认消课', s: '私教课确认', icon: 'passed', to: '/pending-confirms' },
    photos: { t: '训练风采', s: '蜕变相册', icon: 'photograph', to: '/training-photos' },
  };
  const QUICK_DEFAULT = ['checkin', 'bookings', 'cards', 'contracts', 'plans', 'milestones', 'pending'];

  /* 首屏轮播视频: 每段最多播 CLIP_SEC 秒后淡入下一段, 两个 <video> 交替做交叉淡化 */
  const VIDEOS = ['dumbbell', 'hanteln2', 'MR8_8170', '21Run01'].map(n => ({
    src: '/static/videos/' + n + '.mp4', poster: '/static/videos/' + n + '-poster.jpg',
  }));
  const CLIP_SEC = 8;
  const FADE_MS = 900;

  window.Pages.MemberHome = {
    data() {
      return {
        home: null, loading: true, notice: null, bannerIdx: 0, editing: false, layout: [], layoutKey: '',
        // 视频轮播
        vIdx: 0, layer: 0, layerIdx: [0, 1 % VIDEOS.length], switching: false,
        reduceMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
        // 常用功能横向滚动指示条
        icoRatio: 1, icoPos: 0,
        heroH: 0,           // 首屏视频高度: 由 fitHero() 按屏幕实算, 让「上滑探索更多精彩」正好落在底部导航上方
      };
    },
    computed: {
      // 持卡才算会员; 未购卡的普通用户不显示任何身份标签
      isMember() { return !!(this.home && (this.home.cards || []).length); },
      videos() { return VIDEOS; },
      QUICKS_() { return QUICKS; },
      quickDefs() { return Object.keys(QUICKS).reduce((m, k) => { m[k] = { t: QUICKS[k].t, icon: QUICKS[k].icon }; return m; }, {}); },
      quickKeys() { return this.layout.filter(k => QUICKS[k]); },
      poolKeys() { return Object.keys(QUICKS).filter(k => !this.layout.includes(k)); },
      quickBadges() {
        const h = this.home || {};
        return { contracts: h.pendingContract || 0, plans: h.newPlan || 0, pending: h.pendingConfirm || 0 };
      },
      displayName() {
        const v = this.home && this.home.vip;
        return v ? (v.realname || v.nickname || '会员') : '会员';
      },
      // 黑色会员条文案: 有卡显示最近一张卡的剩余, 无卡引导买卡
      clubText() {
        if (!this.isMember) return '加入3S会员 开启你的蜕变之旅';
        const c = this.home.cards[0];
        return c.card_type_name + ' · ' + H.cardLeft(c);
      },
      // 对标 M Stand 黑色会员条下方的提示行: 有预约课程时展示下一节课信息
      lessonBar() {
        const h = this.home || {};
        const nl = h.nextLesson;
        if (!nl) return '';
        const timeRange = H.time(nl.start_time) + (nl.to_time ? '-' + String(nl.to_time).slice(0, 5) : '');
        const rawTitle = nl.title || (nl.kind === 'pt' ? '私教课' : '团课');
        const title = (nl.kind === 'pt' && /1v1.*私教/i.test(rawTitle)) ? '私教课' : rawTitle;
        const coach = nl.coach_name ? ' · ' + nl.coach_name + '教练' : '';
        const prefix = nl.status === 0 ? (nl.kind === 'pt' ? '待确认预约：' : '候补中：') : '已约课程：';
        return prefix + H.day(nl.start_time) + ' ' + timeRange + ' · ' + title + coach;
      },
      lessonMore() {
        const h = this.home || {};
        return h.upcoming > 1 ? ('共' + h.upcoming + '节') : '';
      },
      thumbStyle() {
        const w = Math.max(0.25, Math.min(1, this.icoRatio));
        return { width: (w * 100) + '%', transform: 'translateX(' + (this.icoPos * (1 - w) / w * 100) + '%)' };
      },
    },
    template: [
      '<div class="page has-tabbar mh-page">',
      '  <div class="black-warn" v-if="home && home.vip && home.vip.is_black"><van-icon name="warning" /> 您的账号已被列入黑名单，签到与预约受限，请联系门店处理</div>',

      /* ===== 首屏: 全幅视频 + 居中 Logo ===== */
      '  <div class="mh-hero" ref="hero" :style="heroH ? { height: heroH + \'px\' } : null">',
      '    <video v-for="k in [0,1]" :key="k" :ref="\'v\'+k" class="mh-video" :class="{on: layer===k}"',
      '      :src="videos[layerIdx[k]].src" :poster="videos[layerIdx[k]].poster"',
      '      muted playsinline webkit-playsinline x5-playsinline x5-video-player-type="h5-page" disablepictureinpicture',
      '      :preload="k===layer ? \'auto\' : \'metadata\'" @timeupdate="onTime(k, $event)" @ended="onEnded(k)"></video>',
      '    <div class="mh-shade"></div>',
      '    <div class="mh-top">',
      '      <m-avatar :name="displayName" :size="34"></m-avatar>',
      '      <div class="flex1" style="margin-left:9px;min-width:0">',
      '        <div class="mh-hello">Hi，{{ displayName }}</div>',
      '        <div class="mh-next" v-if="home && home.nextLesson" @click="$router.push(\'/my-bookings\')">',
      '          下一节 {{ H.day(home.nextLesson.start_time) }} {{ H.time(home.nextLesson.start_time) }}',
      '          <template v-if="home.nextLesson.coach_name"> · {{ home.nextLesson.coach_name }}</template> ›',
      '        </div>',
      '        <div class="mh-next" v-else-if="home" @click="$router.push(\'/my-bookings\')">近一周预约 {{ home.upcoming || 0 }} 节 ›</div>',
      '      </div>',
      '      <span class="mh-vip" v-if="isMember">会员</span>',
      '    </div>',
      '    <div class="mh-brand">',
      '      <img src="/static/logo-white.png" alt="3S运动中心 FITNESS">',
      '      <div class="mh-slogan">享受自我蜕变的快乐健身</div>',
      '    </div>',
      '    <div class="mh-vdots" v-if="videos.length>1"><i v-for="(v,i) in videos" :key="i" :class="{on: i===vIdx}"></i></div>',
      '  </div>',

      '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else-if="home">',

      /* ===== 双入口卡片(参考图「门店自取 / 外送上门」) ===== */
      '    <div class="mh-entry">',
      '      <div class="mh-entry-item" @click="$router.push({ path: \'/schedule\', query: { tab: \'group\' } })">',
      '        <div class="en">GROUP CLASS</div>',
      '        <div class="cn">团课约课</div>',
      '        <div class="sub">精品团课 · 在线约位</div>',
      '      </div>',
      '      <div class="mh-entry-split"></div>',
      '      <div class="mh-entry-item" @click="$router.push(\'/schedule\')">',
      '        <div class="en">PERSONAL TRAINING</div>',
      '        <div class="cn">私教预约</div>',
      '        <div class="sub">一对一 · 专属定制训练</div>',
      '      </div>',
      '    </div>',

      /* ===== 黑色会员条 + 常用功能横滑(参考图「加入场牌会员」卡片) ===== */
      '    <div class="mh-club">',
      '      <div class="mh-club-bar" @click="$router.push(isMember ? \'/my-cards\' : \'/buy\')">',
      '        <span class="flex1 mh-club-txt">{{ clubText }}</span>',
      '        <span class="mh-club-act">{{ isMember ? \'我的会员卡\' : \'去买卡\' }} <van-icon name="arrow" size="11"/></span>',
      '      </div>',
      '      <div class="mh-club-sub" v-if="lessonBar" @click="$router.push(\'/my-bookings\')">',
      '        <span class="mh-club-sub-txt">{{ lessonBar }}</span>',
      '        <span class="mh-club-sub-more">{{ lessonMore }} <van-icon name="arrow" size="11"/></span>',
      '      </div>',
      '      <div class="mh-club-body">',
      '        <div class="mh-icons" ref="icons" @scroll="onIconScroll">',
      '          <div class="mh-ic" v-for="k in quickKeys" :key="k" @click="goQuick(k)">',
      '            <div class="mh-ic-circle"><van-icon :name="QUICKS_[k].icon" size="22"/>',
      '              <span class="mh-ic-tag" v-if="quickBadges[k]">{{ quickBadges[k] }} 待办</span>',
      '            </div>',
      '            <div class="t">{{ QUICKS_[k].t }}</div>',
      '            <div class="s">{{ QUICKS_[k].s }}</div>',
      '          </div>',
      '          <div class="mh-ic" @click="openEdit">',
      '            <div class="mh-ic-circle"><van-icon name="setting-o" size="22"/></div>',
      '            <div class="t">管理</div>',
      '            <div class="s">自定义常用</div>',
      '          </div>',
      '        </div>',
      '        <div class="mh-track" :style="{ visibility: icoRatio < 0.999 ? \'visible\' : \'hidden\' }"><i :style="thumbStyle"></i></div>',
      '      </div>',
      '    </div>',

      '    <div class="mh-more" ref="moreHint" @click="scrollMore">上滑探索更多精彩 <van-icon name="arrow-up" size="11"/></div>',

      /* ===== 第二屏: 待办提醒 / 活动 Banner / 公告 / 会员卡 ===== */
      '    <div ref="more"></div>',
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

      '    <template v-if="(home.banners||[]).length">',
      '      <div class="sec-title">精彩活动</div>',
      '      <div class="mh-banners">',
      '        <div class="banner-swipe banner-scroll" ref="bsc" @scroll="onBannerScroll">',
      '          <div v-for="(b,i) in home.banners" :key="b.id" class="banner-item" :class="[hasImg(b) ? \'has-img\' : \'banner-g\'+(i%3)]"',
      '            :style="hasImg(b) ? { backgroundImage: \'url(\'+b.image+\')\' } : {}" @click="onBanner(b)">',
      '            <div class="banner-mask"></div>',
      '            <div class="banner-txt">',
      '              <div class="t" v-for="(ln,k) in titleLines(b.title)" :key="k">{{ ln }}</div>',
      '              <div class="s"><span class="hl">即刻开练</span><span class="tx">享受自我蜕变的快乐健身~</span></div>',
      '            </div>',
      '            <div class="banner-cta" v-if="b.link" @click.stop="onBanner(b)">立即前往 ›</div>',
      '          </div>',
      '        </div>',
      '        <div class="banner-dots" v-if="home.banners.length>1">',
      '          <i v-for="(b,i) in home.banners" :key="b.id" :class="{on:i===bannerIdx}" @click="goBanner(i)"></i>',
      '        </div>',
      '      </div>',
      '    </template>',

      // 去掉「公告」小标题省出上下空间, 公告卡片本身够直观了
      '    <div class="card-box notice-box" v-if="(home.notices||[]).length" style="margin-top:12px">',
      '      <van-cell v-for="n in home.notices" :key="n.id" :title="n.title" :value="H.day(n.insert_time)" is-link :border="false" @click="notice=n"/>',
      '    </div>',

      '    <div class="sec-title">我的会员卡 <span class="more" @click="$router.push(\'/my-cards\')">全部 <van-icon name="arrow" size="10"/></span></div>',
      '    <div class="vip-scroll" v-if="(home.cards||[]).length">',
      '      <div v-for="(c, idx) in home.cards" :key="c.id" class="vip-face" :class="H.faceCls(c, idx)" @click="$router.push(\'/card/\'+c.id)">',
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

      /* 常用功能自定义: 底部弹层里编辑, 首页保持干净 */
      '    <van-popup :show="editing" @update:show="v=>{ if(!v) cancelEdit() }" position="bottom" round safe-area-inset-bottom>',
      '      <div style="padding:18px 14px 14px">',
      '        <div class="flex" style="margin-bottom:6px">',
      '          <div class="flex1" style="font-size:16px;font-weight:700;color:var(--c-title)">自定义常用功能</div>',
      '          <span class="wb-edit-btn" @click="saveLayout">完成</span>',
      '        </div>',
      '        <div class="wb-tip">长按图标拖动排序 · 点右上角 − 移除 · 下方点按添加</div>',
      '        <div class="card-box" style="margin:8px 0 0;padding:8px 6px">',
      '          <wb-grid :defs="quickDefs" :keys="quickKeys" :editing="true" :badges="quickBadges" icon-size="24" @update:keys="layout = $event"/>',
      '          <div class="wb-pool-title" v-if="poolKeys.length">可添加的功能</div>',
      '          <wb-grid class="wb-pool" v-if="poolKeys.length" :defs="quickDefs" :keys="poolKeys" :badges="quickBadges" icon-size="22" @pick="addItem"/>',
      '          <div class="wb-reset" @click="resetLayout"><van-icon name="replay"/> 恢复默认布局</div>',
      '        </div>',
      '      </div>',
      '    </van-popup>',

      '    <van-dialog :show="!!notice" @update:show="notice=null" :title="notice && notice.title" confirm-button-text="知道了" confirm-button-color="var(--brand)">',
      '      <div style="padding:16px 20px;font-size:13px;line-height:1.8;color:var(--c-text-2)">{{ notice && notice.content }}</div>',
      '    </van-dialog>',
      '  </template>',
      '</div>',
    ].join('\n'),
    methods: {
      goQuick(key) { const q = QUICKS[key]; if (q) this.$router.push(q.to); },
      addItem(key) { if (!this.layout.includes(key)) this.layout = [...this.layout, key]; },
      openEdit() { this._layoutBak = [...this.layout]; this.layout = [...this.quickKeys]; this.editing = true; },
      cancelEdit() {
        if (this._layoutBak) this.layout = this._layoutBak;
        this.editing = false;
        if (this.$route.query.edit && MP.is()) MP.homeWithToken();
      },
      async saveLayout() {
        try {
          await API.put('/member/workbench', { items: [...this.quickKeys] });
          this._layoutBak = null;
          this.editing = false;
          vant.showToast({ message: '常用功能已保存', icon: 'success' });
          if (this.$route.query.edit && MP.is()) { setTimeout(() => MP.homeWithToken(), 600); return; }
          this.$nextTick(this.onIconScroll);
        } catch (e) { /* API 层已 toast 错误 */ }
      },
      async resetLayout() {
        try { await vant.showConfirmDialog({ title: '恢复默认', message: '将恢复为默认的常用功能布局，确定吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
        this.layout = [...QUICK_DEFAULT];
      },
      watchLayout() { try { localStorage.setItem(this.layoutKey, JSON.stringify(this.layout || [])); } catch (e) { /* ignore */ } },
      scrollMore() {
        const el = this.$refs.more; if (!el) return;
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8, behavior: 'smooth' });
      },
      onIconScroll() {
        const el = this.$refs.icons; if (!el) return;
        this.icoRatio = el.clientWidth / Math.max(1, el.scrollWidth);
        const max = el.scrollWidth - el.clientWidth;
        this.icoPos = max > 0 ? el.scrollLeft / max : 0;
      },

      /* ---------- 视频轮播 ---------- */
      vEl(k) { const r = this.$refs['v' + k]; return Array.isArray(r) ? r[0] : r; },
      playLayer(k) {
        const v = this.vEl(k); if (!v || this.reduceMotion) return;
        v.muted = true;                       // Vue 不一定把 muted 写成属性, iOS 自动播放必须静音
        const p = v.play(); if (p && p.catch) p.catch(() => { /* 被拦截时保留封面图, 等首次触摸再播 */ });
      },
      onTime(k, e) {
        if (k !== this.layer || this.switching || VIDEOS.length < 2) return;
        if (e.target.currentTime >= CLIP_SEC) this.nextVideo();
      },
      onEnded(k) {
        if (k !== this.layer) return;
        if (VIDEOS.length < 2) { this.playLayer(k); return; }
        this.nextVideo();
      },
      nextVideo() {
        if (this.switching) return;
        this.switching = true;
        const cur = this.layer, nxt = 1 - cur;
        const v = this.vEl(nxt);
        if (v) { try { v.currentTime = 0; } catch (e) { /* ignore */ } }
        this.playLayer(nxt);
        this.layer = nxt;
        this.vIdx = this.layerIdx[nxt];
        clearTimeout(this._fadeT);
        this._fadeT = setTimeout(() => {
          const old = this.vEl(cur);
          if (old) old.pause();
          // 淡出的那一层提前换成再下一段, 预加载好等着
          const idx = [...this.layerIdx];
          idx[cur] = (this.layerIdx[nxt] + 1) % VIDEOS.length;
          this.layerIdx = idx;
          this.switching = false;
        }, FADE_MS);
      },
      onVisibility() {
        const v = this.vEl(this.layer); if (!v) return;
        if (document.hidden) v.pause(); else this.playLayer(this.layer);
      },
      kickPlay() { this.playLayer(this.layer); },

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
        finally {
          this.loading = false;
          this.$nextTick(() => {
            this.onIconScroll();
            this.fitHero();
            setTimeout(() => this.fitHero(), 180);
            if (this.$route.query.edit) this.openEdit();
          });
        }
      },
      /* 首屏高度自适应: 视频区 = 底部导航顶边 − 视频下方内容(双入口卡 + 会员条 + 提示语)的高度。
         各机型/小程序原生导航栏高度不同, 写死 vh 做不到「提示语刚好贴在导航上方」, 所以按实际渲染结果算 */
      fitHero() {
        const hero = this.$refs.hero, hint = this.$refs.moreHint;
        if (!hero || !hint) return;
        const tab = document.querySelector('.tabbar-wrap');
        const tabTop = tab ? tab.getBoundingClientRect().top : window.innerHeight;
        const r = hero.getBoundingClientRect();
        const heroTop = r.top + window.scrollY;                    // 上方若有黑名单提示条, 一并扣掉
        const below = hint.getBoundingClientRect().bottom - r.bottom; // 视频底边到提示语底边
        const GAP = 4;
        const h = Math.round(tabTop - GAP - heroTop - below);
        this.heroH = Math.max(280, Math.min(h, 760));                // 矮屏保底 280, 平板等超高屏封顶
      },
    },
    watch: {
      layout() { this.watchLayout(); },
    },
    mounted() {
      this.load();
      this.playLayer(this.layer);
      // 微信内置浏览器: 需等 JSBridge 就绪后再 play 才能自动播放; 仍被拦截则在首次触摸时补播
      this._onBridge = () => this.playLayer(this.layer);
      document.addEventListener('WeixinJSBridgeReady', this._onBridge, false);
      if (window.WeixinJSBridge) this._onBridge();
      this._onTouch = () => { this.kickPlay(); document.removeEventListener('touchstart', this._onTouch); };
      document.addEventListener('touchstart', this._onTouch, { passive: true });
      this._onVis = () => this.onVisibility();
      document.addEventListener('visibilitychange', this._onVis);
      this._onResize = () => { this.onIconScroll(); this.fitHero(); };
      window.addEventListener('resize', this._onResize);
    },
    beforeUnmount() {
      clearTimeout(this._fadeT);
      document.removeEventListener('WeixinJSBridgeReady', this._onBridge);
      document.removeEventListener('touchstart', this._onTouch);
      document.removeEventListener('visibilitychange', this._onVis);
      window.removeEventListener('resize', this._onResize);
      [0, 1].forEach(k => { const v = this.vEl(k); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } });
    },
  };
})();
