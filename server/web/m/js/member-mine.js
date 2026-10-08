/* 会员端-我的 + 编辑资料 */
window.Pages.MemberMine = {
  data() { return { profile: null, pending: 0, pendingContract: 0, newPlan: 0 }; },
  template: [
    '<div class="page has-tabbar">',
    '  <div class="home-hero" style="padding-bottom:24px">',
    '    <div class="flex">',
    '      <m-avatar :name="profile && (profile.realname||profile.nickname)" :size="56" style="background:rgba(255,255,255,.25)"></m-avatar>',
    '      <div class="flex1" style="margin-left:14px">',
    '        <div style="font-size:19px;font-weight:700">{{ profile ? (profile.realname||profile.nickname||\'会员\') : \'...\' }}</div>',
    '        <div style="font-size:12px;opacity:.85;margin-top:4px">{{ profile && profile.phone }}</div>',
    '        <div style="font-size:12px;opacity:.85;margin-top:4px" v-if="profile && (profile.coach_name||profile.sub_coach_name)">',
    '          <template v-if="profile.coach_name">主教练 {{ profile.coach_name }}</template>',
    '          <template v-if="profile.sub_coach_name"><template v-if="profile.coach_name"> · </template>副教练 {{ profile.sub_coach_name }}</template>',
    '        </div>',
    '      </div>',
    '      <div class="tr" v-if="profile">',
    '        <d-tag dict="expireStatus" :v="profile.expire_status"></d-tag>',
    '        <div style="font-size:11px;opacity:.8;margin-top:6px" v-if="profile.expire_status===1 && profile.expire_time">{{ H.dateOf(profile.expire_time) }} 到期</div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <div class="card-box" style="padding:4px 8px">',
    '    <van-cell title="我的里程碑" icon="medal-o" is-link to="/milestones" />',
    '    <van-cell title="训练计划" icon="todo-list-o" is-link to="/plans">',
    '      <template #value><van-badge v-if="newPlan" :content="newPlan" style="margin-right:6px"/></template>',
    '    </van-cell>',
    '    <van-cell title="我的会员卡" icon="credit-pay" is-link to="/my-cards" />',
    '    <van-cell title="我的预约" icon="calendar-o" is-link to="/my-bookings" />',
    '    <van-cell title="待确认消课" icon="passed" is-link to="/pending-confirms">',
    '      <template #value><van-badge v-if="pending" :content="pending" style="margin-right:6px"/></template>',
    '    </van-cell>',
    '    <van-cell title="我的合同" icon="notes-o" is-link to="/contracts">',
    '      <template #value><van-badge v-if="pendingContract" :content="pendingContract" style="margin-right:6px"/></template>',
    '    </van-cell>',
    '    <van-cell title="编辑资料" icon="edit" is-link to="/profile" />',
    '    <van-cell title="账号与安全" icon="shield-o" is-link to="/security" :border="false"/>',
    '  </div>',
    '  <div style="margin:24px 16px">',
    '    <van-button block round plain type="danger" @click="logout">退出登录</van-button>',
    '  </div>',
    '</div>',
  ].join('\n'),
  methods: {
    async logout() {
      try { await vant.showConfirmDialog({ title: '退出登录', message: '确定退出当前账号吗？', confirmButtonColor: '#0d5e56' }); } catch (e) { return; }
      Store.logout();
      this.$router.replace('/login');
    },
  },
  async mounted() {
    try {
      this.profile = await API.get('/member/profile');
      const b = await API.get('/member/badges', { silent: true }) || {};
      this.pending = b.confirm || 0;
      this.pendingContract = b.contract || 0;
      this.newPlan = b.plan || 0;
    } catch (e) { /* toast 已提示 */ }
  },
};

window.Pages.MemberProfile = {
  data() { return { form: { realname: '', nickname: '', gender: 0, birthday: '' }, loading: true, saving: false }; },
  template: [
    '<div class="page">',
    '  <m-nav title="编辑资料"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <div class="card-box" v-else style="padding:6px 0">',
    '    <van-field v-model="form.realname" label="姓名" placeholder="真实姓名" />',
    '    <van-field v-model="form.nickname" label="昵称" placeholder="昵称" />',
    '    <van-field label="性别">',
    '      <template #input>',
    '        <van-radio-group v-model="form.gender" direction="horizontal">',
    '          <van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio><van-radio :name="0">保密</van-radio>',
    '        </van-radio-group>',
    '      </template>',
    '    </van-field>',
    '    <van-field label="生日" :border="false">',
    '      <template #input><input type="date" v-model="form.birthday" style="border:none;outline:none;background:transparent;font-size:14px;color:#323233"/></template>',
    '    </van-field>',
    '  </div>',
    '  <div style="margin:20px 16px">',
    '    <van-button type="primary" block round :loading="saving" @click="save">保存</van-button>',
    '  </div>',
    '</div>',
  ].join('\n'),
  methods: {
    async save() {
      if (!this.form.realname) return vant.showToast('请填写姓名');
      this.saving = true;
      try {
        await API.put('/member/profile', { realname: this.form.realname, nickname: this.form.nickname, gender: this.form.gender, birthday: this.form.birthday || null });
        vant.showToast({ message: '已保存', icon: 'success' });
        this.$router.back();
      } finally { this.saving = false; }
    },
  },
  async mounted() {
    try {
      const p = await API.get('/member/profile');
      this.form = { realname: p.realname || '', nickname: p.nickname || '', gender: p.gender || 0, birthday: p.birthday ? H.dateOf(p.birthday) : '' };
    } finally { this.loading = false; }
  },
};
