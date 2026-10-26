/* 教练端-我的主页: 编辑自己的头像 / 主页背景 / 擅长 / 简介 */
window.Pages.StaffCoachProfile = {
  data() {
    return {
      loading: true, saving: false, uploading: '',
      form: { id: 0, realname: '', nickname: '', good_at: '', desc: '', detail: '', avatar: '', cover: '' },
    };
  },
  template: [
    '<div class="page">',
    '  <m-nav title="我的主页"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    /* 预览: 与会员看到的教练主页一致 */
    '    <div class="home-hero coach-hero" :class="{cover: form.cover}" :style="form.cover ? {backgroundImage:\'linear-gradient(180deg,rgba(6,20,18,.35),rgba(6,20,18,.82)),url(\'+form.cover+\')\'} : {}" style="padding-bottom:20px">',
    '      <div class="flex">',
    '        <img v-if="form.avatar" class="coach-face" :src="form.avatar" alt=""/>',
    '        <m-avatar v-else :name="form.realname" :size="58" style="background:rgba(255,255,255,.25)"></m-avatar>',
    '        <div class="flex1" style="margin-left:14px">',
    '          <div style="font-size:19px;font-weight:700">{{ form.realname }}</div>',
    '          <div style="font-size:12px;opacity:.85;margin-top:4px">{{ form.good_at || \'填写你的擅长领域\' }}</div>',
    '        </div>',
    '      </div>',
    '      <div style="font-size:12px;opacity:.85;margin-top:12px">{{ form.desc || \'写一句话介绍自己，会员会先看到这句\' }}</div>',
    '    </div>',
    '    <div class="muted" style="padding:10px 16px 0">以上是会员打开你主页时看到的样子</div>',

    '    <div class="card-box" style="padding:4px 8px">',
    '      <van-cell title="头像" center>',
    '        <template #value>',
    '          <div class="flex" style="justify-content:flex-end;gap:8px">',
    '            <img v-if="form.avatar" :src="form.avatar" style="width:44px;height:44px;border-radius:50%;object-fit:cover"/>',
    '            <van-uploader :max-count="1" :preview-image="false" :after-read="f=>pick(f,\'avatar\')" accept="image/*">',
    '              <van-button size="small" round type="primary" plain :loading="uploading===\'avatar\'">{{ form.avatar ? \'更换\' : \'上传\' }}</van-button>',
    '            </van-uploader>',
    '          </div>',
    '        </template>',
    '      </van-cell>',
    '      <van-cell title="主页背景" label="建议横向图片，会员打开你主页时作为顶部背景" center :border="false">',
    '        <template #value>',
    '          <div class="flex" style="justify-content:flex-end;gap:8px">',
    '            <img v-if="form.cover" :src="form.cover" style="width:66px;height:36px;border-radius:6px;object-fit:cover"/>',
    '            <van-uploader :max-count="1" :preview-image="false" :after-read="f=>pick(f,\'cover\')" accept="image/*">',
    '              <van-button size="small" round type="primary" plain :loading="uploading===\'cover\'">{{ form.cover ? \'更换\' : \'上传\' }}</van-button>',
    '            </van-uploader>',
    '          </div>',
    '        </template>',
    '      </van-cell>',
    '    </div>',

    '    <div class="card-box" style="padding:4px 0">',
    '      <van-field v-model="form.nickname" label="昵称" placeholder="选填，留空则显示姓名"/>',
    '      <van-field v-model="form.good_at" label="擅长" maxlength="30" show-word-limit placeholder="如 增肌塑形 · 体态矫正"/>',
    '      <van-field v-model="form.desc" label="一句话简介" maxlength="40" show-word-limit placeholder="如 国家级健身教练认证，8年执教经验"/>',
    '      <van-field v-model="form.detail" label="详细介绍" type="textarea" rows="5" maxlength="500" show-word-limit :border="false" placeholder="资质、教学风格、擅长人群等，会员在主页可以看到"/>',
    '    </div>',
    '    <div style="margin:18px 16px 30px"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    async pick(fileObj, field) {
      const file = fileObj && fileObj.file;
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return vant.showToast('图片不能超过 5MB');
      this.uploading = field;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const resp = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + Store.token }, body: fd });
        const j = await resp.json();
        if (j.code !== 0) throw new Error(j.msg || '上传失败');
        this.form[field] = j.data.url;
        vant.showToast({ message: '已上传，记得点保存', icon: 'success' });
      } catch (e) {
        vant.showToast(e.message || '上传失败');
      } finally { this.uploading = ''; }
    },
    async save() {
      this.saving = true;
      try {
        await API.put('/coaches/' + this.form.id, {
          nickname: this.form.nickname, good_at: this.form.good_at, desc: this.form.desc,
          detail: this.form.detail, avatar: this.form.avatar, cover: this.form.cover,
        });
        vant.showToast({ message: '已保存', icon: 'success' });
      } finally { this.saving = false; }
    },
  },
  async mounted() {
    try {
      const d = await API.get('/coaches/me');
      this.form = {
        id: d.id, realname: d.realname || '', nickname: d.nickname || '', good_at: d.good_at || '',
        desc: d.desc || '', detail: d.detail || '', avatar: d.avatar || '', cover: d.cover || '',
      };
    } finally { this.loading = false; }
  },
};
