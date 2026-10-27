/* 会员端-我的 + 编辑资料 */
window.Pages.MemberMine = {
  data() { return { profile: null, pending: 0, pendingContract: 0, newPlan: 0, photoQuotaText: '' }; },
  template: [
    '<div class="page has-tabbar">',
    '  <div class="home-hero" style="padding-bottom:24px">',
    '    <div class="flex">',
    '      <m-avatar :name="profile && (profile.realname||profile.nickname)" :size="56"></m-avatar>',
    '      <div class="flex1" style="margin-left:14px">',
    '        <div style="font-size:19px;font-weight:700">{{ profile ? (profile.realname||profile.nickname||\'会员\') : \'...\' }}</div>',
    '        <div style="font-size:12px;opacity:.85;margin-top:4px">{{ profile && profile.phone }} <span v-if="profile && profile.points != null" style="color:var(--c-title);font-weight:600;margin-left:6px">· {{ profile.points }} 积分</span></div>',
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
    '    <van-cell title="训练风采" icon="photograph" is-link to="/training-photos">',
    '      <template #value><span style="font-size:12px;color:var(--brand);font-weight:600">{{ photoQuotaText || \'成长相册\' }}</span></template>',
    '    </van-cell>',
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
      try { await vant.showConfirmDialog({ title: '退出登录', message: '确定退出当前账号吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
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
      try {
        const ph = await API.get('/member/training-photos', { silent: true });
        if (ph) this.photoQuotaText = '本月 ' + (ph.current_month_count || 0) + '/' + (ph.monthly_limit || 5) + ' 张';
      } catch (e) { /* ignore */ }
    } catch (e) { /* toast 已提示 */ }
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
