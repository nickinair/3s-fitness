/* 会员端-我的 + 编辑资料 */
window.Pages.MemberMine = {
  /* 版式对标 M Stand「我的」页: 头像抬头 + 一张张白卡, 每张卡把一项功能做成「标题 + 关键数字 + 操作」.
     功能顺序与旧版列表一致: 训练风采 → 里程碑 → 训练计划 → 会员卡 → 预约 → 待确认消课 → 合同 → 编辑资料 → 账号与安全 → 退出 */
  data() {
    return {
      profile: null, pending: 0, pendingContract: 0, newPlan: 0,
      photo: null,            // { current_month_count, monthly_limit }
      totalLessons: null,     // 里程碑: 累计完成课时
      planCount: null,        // 训练计划总数
      cards: null,            // 会员卡列表
      upcoming: null,         // 近 7 天预约
      contractTotal: null,    // 合同总数
      mealKcal: 0,            // 饮食日记: 今日已摄入热量
    };
  },
  computed: {
    name() { return this.profile ? (this.profile.realname || this.profile.nickname || '会员') : '...'; },
    photoPct() {
      if (!this.photo) return 0;
      const lim = Number(this.photo.monthly_limit) || 5;
      return Math.min(100, Math.round((Number(this.photo.current_month_count) || 0) * 100 / lim));
    },
    // 会员卡: 只展示可用的前两张(使用中/待开卡/暂停), 其余去列表页看
    liveCards() { return (this.cards || []).filter(c => [0, 1, 3].includes(Number(c.status))).slice(0, 2); },
  },
  template: [
    '<div class="page has-tabbar mn-page">',
    // ---- 抬头: 头像 + 姓名(无卡片, 直接在页面底色上) ----
    '  <div class="mn-head">',
    '    <m-avatar :name="profile && (profile.realname||profile.nickname)" :size="64" class="mn-avatar"></m-avatar>',
    '    <div class="flex1" style="margin-left:14px;min-width:0">',
    '      <div class="mn-name">{{ name }}</div>',
    '      <div class="mn-sub">{{ profile && profile.phone }}<template v-if="profile && profile.points != null"> · <b>{{ profile.points }}</b> 积分</template></div>',
    '      <div class="mn-sub" v-if="profile && (profile.coach_name||profile.sub_coach_name)">',
    '        <template v-if="profile.coach_name">主教练 {{ profile.coach_name }}</template>',
    '        <template v-if="profile.sub_coach_name"><template v-if="profile.coach_name"> · </template>副教练 {{ profile.sub_coach_name }}</template>',
    '      </div>',
    '    </div>',
    '    <div class="tr" v-if="profile">',
    '      <d-tag dict="expireStatus" :v="profile.expire_status"></d-tag>',
    '      <div class="mn-exp" v-if="profile.expire_status===1 && profile.expire_time">{{ H.dateOf(profile.expire_time) }} 到期</div>',
    '    </div>',
    '  </div>',

    // ---- ① 训练风采: 大数字 + 进度条(对应「欢迎~新朋友」卡) ----
    '  <div class="mn-card" @click="$router.push(\'/training-photos\')">',
    '    <div class="mn-title">训练风采 · 本月成长相册</div>',
    '    <div class="mn-row" style="margin-top:12px">',
    '      <div class="mn-big">{{ photo ? (photo.current_month_count || 0) : 0 }}<small>/ {{ photo ? (photo.monthly_limit || 5) : 5 }} 张</small></div>',
    '      <div class="mn-link">去上传 <van-icon name="arrow"/></div>',
    '    </div>',
    '    <div class="mn-bar"><i :style="{ width: photoPct + \'%\' }"></i></div>',
    '  </div>',

    // ---- ② 里程碑 ③ 训练计划: 缩略图 + 标题 + 胶囊按钮(对应「限时福利活动」卡) ----
    '  <div class="mn-card">',
    '    <div class="mn-title">成长记录</div>',
    '    <div class="mn-item" @click="$router.push(\'/milestones\')">',
    '      <div class="mn-thumb"><van-icon name="medal-o"/></div>',
    '      <div class="flex1"><div class="mn-it">我的里程碑</div>',
    '        <div class="mn-is">{{ totalLessons != null ? (\'累计完成 \' + totalLessons + \' 节训练\') : \'每一次坚持都在靠近更好的自己\' }}</div></div>',
    '      <div class="mn-pill">查看</div>',
    '    </div>',
    '    <div class="mn-item" @click="$router.push(\'/plans\')">',
    '      <div class="mn-thumb"><van-icon name="todo-list-o"/></div>',
    '      <div class="flex1"><div class="mn-it">训练计划</div>',
    '        <div class="mn-is">{{ planCount ? (\'教练已推送 \' + planCount + \' 份计划\') : \'教练推送训练计划后将展示在这里\' }}</div></div>',
    '      <van-badge :content="newPlan || \'\'" :show-zero="false"><div class="mn-pill">查看</div></van-badge>',
    '    </div>',
    '    <div class="mn-item" @click="$router.push(\'/meals\')">',
    '      <div class="mn-thumb"><van-icon name="fire-o"/></div>',
    '      <div class="flex1"><div class="mn-it">饮食日记</div>',
    '        <div class="mn-is">{{ mealKcal ? (\'今天已摄入约 \' + mealKcal + \' kcal\') : \'拍照记录每餐热量，小S 帮你算\' }}</div></div>',
    '      <div class="mn-pill">查看</div>',
    '    </div>',
    '  </div>',

    // ---- ④ 我的会员卡(对应「订单中心」卡) ----
    '  <div class="mn-card">',
    '    <div class="mn-row" @click="$router.push(\'/my-cards\')">',
    '      <div class="mn-title flex"><van-icon name="credit-pay" class="mn-ico"/>我的会员卡</div>',
    '      <div class="mn-link">全部 <van-icon name="arrow"/></div>',
    '    </div>',
    '    <div v-if="liveCards.length">',
    '      <div v-for="(c, idx) in liveCards" :key="c.id" class="vip-face mn-vip-row" :class="H.faceCls(c, idx)" @click="$router.push(\'/card/\' + c.id)">',
    '        <div class="flex1" style="min-width:0">',
    '          <div class="mn-vip-head"><span class="kind">{{ DICT.cardKind[c.card_kind] }}</span><span class="mn-vip-name ellipsis">{{ c.card_type_name }}</span></div>',
    '          <div class="mn-vip-sub">{{ cardDesc(c) }}<template v-if="c.expire_time"> · {{ H.dateOf(c.expire_time) }} 到期</template></div>',
    '        </div>',
    '        <d-tag dict="cardStatus" :v="c.status"></d-tag>',
    '      </div>',
    '    </div>',
    '    <div v-else class="mn-empty" @click="$router.push(\'/buy\')">{{ cards ? \'当前没有可用的会员卡哦，去看看 ›\' : \'加载中...\' }}</div>',
    '  </div>',

    // ---- ⑤ 我的预约 ⑥ 待确认消课: 左右两栏 + 黑色胶囊(对应「余额 / 积分」卡) ----
    '  <div class="mn-card mn-duo">',
    '    <div class="mn-half" @click="$router.push(\'/my-bookings\')">',
    '      <div class="mn-ht">我的预约</div>',
    '      <div class="mn-row" style="margin-top:14px"><div class="mn-mid">{{ upcoming != null ? upcoming : 0 }}<small>节 · 近7天</small></div><div class="mn-btn">查看</div></div>',
    '    </div>',
    '    <div class="mn-sep"></div>',
    '    <div class="mn-half" @click="$router.push(\'/pending-confirms\')">',
    '      <div class="mn-ht">待确认消课</div>',
    '      <div class="mn-row" style="margin-top:14px"><div class="mn-mid">{{ pending }}<small>节</small></div>',
    '        <van-badge :content="pending || \'\'" :show-zero="false"><div class="mn-btn">去确认</div></van-badge></div>',
    '    </div>',
    '  </div>',

    // ---- ⑦ 我的合同(对应「我的卡券」卡) ----
    '  <div class="mn-card" @click="$router.push(\'/contracts\')">',
    '    <div class="mn-row">',
    '      <div class="mn-ht">我的合同</div>',
    '      <div class="mn-link" :class="{ strong: pendingContract }">{{ pendingContract ? (pendingContract + \' 份待签署\') : \'查看全部\' }} <van-icon name="arrow"/></div>',
    '    </div>',
    '    <div class="mn-mid" style="margin-top:12px">{{ contractTotal != null ? contractTotal : 0 }}<small>份</small></div>',
    '  </div>',

    // ---- ⑧ 编辑资料 ⑨ 账号与安全 + 其他入口: 图标宫格(对应「M Stand服务」) ----
    '  <div class="mn-card">',
    '    <div class="mn-sec">3S服务</div>',
    '    <div class="mn-grid">',
    '      <div class="mn-gi" @click="$router.push(\'/profile\')"><van-icon name="edit"/><span>编辑资料</span></div>',
    '      <div class="mn-gi" @click="$router.push(\'/security\')"><van-icon name="shield-o"/><span>账号与安全</span></div>',
    '      <div class="mn-gi" @click="$router.push(\'/complete-profile\')"><van-icon name="gift-o"/><span>完善档案</span></div>',
    '      <div class="mn-gi" @click="$router.push(\'/guide\')"><van-icon name="guide-o"/><span>使用引导</span></div>',
    '    </div>',
    '  </div>',

    '  <div class="mn-logout" @click="logout">退出登录</div>',
    '</div>',
  ].join('\n'),
  methods: {
    cardDesc(c) {
      if (Number(c.card_kind) === 3) return '余额 ' + H.money(c.left_money);
      if (Number(c.card_kind) === 2) return '不限次';
      return '剩余 ' + (c.left_counts != null ? c.left_counts : '-') + ' 次';
    },
    async logout() {
      try { await vant.showConfirmDialog({ title: '退出登录', message: '确定退出当前账号吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
      Store.logout();
      if (MP.is() && MP.home('?logout=1')) return;
      this.$router.replace('/login');
    },
  },
  async mounted() {
    try {
      this.profile = await API.get('/member/profile');
    } catch (e) { return; /* toast 已提示 */ }
    // 各卡片的数字互不依赖, 并行取; 单项失败只影响那张卡, 不弹提示
    const q = (u) => API.get(u, { silent: true }).catch(() => null);
    const [b, ph, ms, plans, cards, home, contracts, meals] = await Promise.all([
      q('/member/badges'), q('/member/training-photos'), q('/member/milestones'), q('/member/training-plans'),
      q('/member/my-cards'), q('/member/home'), q('/member/my-contracts'), q('/member/ai/meals'),
    ]);
    if (meals && meals.total) this.mealKcal = meals.total.kcal || 0;
    if (b) { this.pending = b.confirm || 0; this.pendingContract = b.contract || 0; this.newPlan = b.plan || 0; }
    if (ph) this.photo = ph;
    if (ms) this.totalLessons = ms.totalLessons || 0;
    if (plans) this.planCount = plans.length;
    this.cards = cards || [];
    if (home) this.upcoming = home.upcoming || 0;
    if (contracts) this.contractTotal = contracts.length;
  },
};

window.Pages.MemberProfile = {
  data() {
    return {
      form: {
        realname: '', nickname: '', gender: 0, birthday: '',
        initial_weight: '', target_weight: '', constellation_mbti: '', training_frequency: '', studio_feedback: '',
        target_compare_photos: [],
      },
      loading: true, saving: false,
    };
  },
  template: [
    '<div class="page">',
    '  <m-nav title="编辑资料"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <div class="card-box" style="padding:6px 0">',
    '      <van-field v-model="form.realname" label="姓名" placeholder="真实姓名" />',
    '      <van-field v-model="form.nickname" label="昵称" placeholder="昵称" />',
    '      <van-field label="性别">',
    '        <template #input>',
    '          <van-radio-group v-model="form.gender" direction="horizontal">',
    '            <van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio><van-radio :name="0">保密</van-radio>',
    '          </van-radio-group>',
    '        </template>',
    '      </van-field>',
    '      <van-field label="生日">',
    '        <template #input><input type="date" v-model="form.birthday" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text)"/></template>',
    '      </van-field>',
    '      <van-field v-model="form.initial_weight" type="number" label="初始体重(kg)" placeholder="如 70.5"/>',
    '      <van-field v-model="form.target_weight" type="number" label="目标体重(kg)" placeholder="如 62.0"/>',
    '      <van-field v-model="form.constellation_mbti" label="星座/MBTI" placeholder="如 天蝎座 / INTJ"/>',
    '      <van-field v-model="form.training_frequency" label="训练频次" placeholder="如 每周3-4次"/>',
    '      <van-field v-model="form.studio_feedback" type="textarea" rows="2" label="会馆反馈" placeholder="对场馆设施/课程/教练的建议与反馈"/>',
    '      <div style="padding:10px 16px 4px">',
    '        <div style="font-size:14px;color:var(--c-text-2);margin-bottom:8px">目标对比图</div>',
    '        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">',
    '          <div v-for="(img, idx) in form.target_compare_photos" :key="idx" style="position:relative;width:56px;height:56px;border-radius:6px;overflow:hidden;border:1px solid var(--c-line)">',
    '            <van-image :src="img" width="56" height="56" fit="cover"/>',
    '            <div @click="removePhoto(idx)" style="position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);color:#fff;width:18px;height:18px;line-height:18px;text-align:center;font-size:12px">×</div>',
    '          </div>',
    '          <van-uploader :after-read="afterReadPhoto" accept="image/*" max-count="9">',
    '            <div style="width:56px;height:56px;border:1px dashed var(--c-text-4);border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--c-text-3)">',
    '              <van-icon name="plus" size="18"/><span style="font-size:10px;margin-top:2px">上传</span>',
    '            </div>',
    '          </van-uploader>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div style="margin:20px 16px">',
    '      <van-button type="primary" block round :loading="saving" @click="save">保存</van-button>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    async afterReadPhoto(file) {
      try {
        const url = await API.upload(file.file);
        this.form.target_compare_photos.push(url);
        vant.showToast({ message: '已上传', icon: 'success' });
      } catch (e) { vant.showToast(e.message || '上传失败'); }
    },
    removePhoto(idx) {
      this.form.target_compare_photos.splice(idx, 1);
    },
    async save() {
      if (!this.form.realname) return vant.showToast('请填写姓名');
      this.saving = true;
      try {
        await API.put('/member/profile', {
          realname: this.form.realname,
          nickname: this.form.nickname,
          gender: this.form.gender,
          birthday: this.form.birthday || null,
          initial_weight: this.form.initial_weight === '' ? null : Number(this.form.initial_weight),
          target_weight: this.form.target_weight === '' ? null : Number(this.form.target_weight),
          constellation_mbti: this.form.constellation_mbti.trim() || null,
          training_frequency: this.form.training_frequency.trim() || null,
          studio_feedback: this.form.studio_feedback.trim() || null,
          target_compare_photos: this.form.target_compare_photos,
        });
        vant.showToast({ message: '已保存', icon: 'success' });
        this.$router.back();
      } finally { this.saving = false; }
    },
  },
  async mounted() {
    try {
      const p = await API.get('/member/profile');
      let photos = [];
      if (Array.isArray(p.target_compare_photos)) photos = [...p.target_compare_photos];
      else if (typeof p.target_compare_photos === 'string') {
        try { photos = JSON.parse(p.target_compare_photos); } catch { photos = []; }
      }
      this.form = {
        realname: p.realname || '',
        nickname: p.nickname || '',
        gender: p.gender || 0,
        birthday: p.birthday ? H.dateOf(p.birthday) : '',
        initial_weight: p.initial_weight != null ? p.initial_weight : '',
        target_weight: p.target_weight != null ? p.target_weight : '',
        constellation_mbti: p.constellation_mbti || '',
        training_frequency: p.training_frequency || '',
        studio_feedback: p.studio_feedback || '',
        target_compare_photos: photos,
      };
    } finally { this.loading = false; }
  },
};
