/* 员工端-快速签到 */
window.Pages.StaffCheckin = {
  data() { return { kw: '', list: [], searched: false, loading: false, doing: 0 }; },
  template: [
    '<div class="page">',
    '  <m-nav title="快速签到"></m-nav>',
    '  <van-search v-model="kw" placeholder="输入会员姓名 / 手机号" show-action @search="search" @clear="reset">',
    '    <template #action><div @click="search" style="color:var(--brand)">搜索</div></template>',
    '  </van-search>',
    '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="var(--brand)">搜索中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="searched && !list.length" description="未找到会员，请检查关键词"/>',
    '    <div v-if="!searched" class="muted" style="text-align:center;padding:44px 20px">输入姓名或手机号搜索会员，点击结果即可签到<br/><br/><van-icon name="aim" size="46" color="#d3dedd"/></div>',
    '    <div v-for="m in list" :key="m.id" class="rec-item flex" :class="{black:m.is_black}" @click="doCheckin(m)">',
    '      <m-avatar :name="m.realname" :size="44" :style="m.is_black?{background:\'var(--danger)\'}:{}"></m-avatar>',
    '      <div class="flex1" style="margin-left:12px">',
    '        <div class="name">{{ m.realname || m.nickname || \'未命名\' }}',
    '          <van-tag v-if="m.is_black" type="danger" style="margin-left:4px">黑名单</van-tag>',
    '          <d-tag v-else dict="expireStatus" :v="m.expire_status" style="margin-left:4px"></d-tag>',
    '        </div>',
    '        <div class="muted mt4">{{ m.phone }}</div>',
    '        <div class="muted mt4" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.card_names || \'无持卡\' }}</div>',
    '      </div>',
    '      <van-button size="small" round :type="m.is_black?\'danger\':\'primary\'" :loading="doing===m.id" style="min-width:70px">签到</van-button>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    reset() { this.list = []; this.searched = false; },
    async search() {
      if (!this.kw.trim()) return vant.showToast('请输入关键词');
      this.loading = true;
      try {
        const d = await API.get('/members?keyword=' + encodeURIComponent(this.kw.trim()) + '&size=30');
        this.list = d.list || []; this.searched = true;
      } finally { this.loading = false; }
    },
    async doCheckin(m) {
      try {
        await vant.showConfirmDialog({
          title: '确认签到',
          message: '确认为「' + (m.realname || m.phone) + '」办理入场签到？' + (m.is_black ? '\n⚠️ 该会员在黑名单中！' : ''),
          confirmButtonColor: 'var(--brand)',
        });
      } catch (e) { return; }
      this.doing = m.id;
      try {
        const r = await API.post('/checkin', { vip_id: m.id });
        vant.showDialog({
          title: '签到成功', confirmButtonColor: 'var(--brand)',
          message: r.realname + '\n' + r.card_type_name + '\n' + (r.deduct_info || ''),
        });
      } catch (e) { /* toast 已提示（黑名单/在场/无卡等） */ }
      finally { this.doing = 0; }
    },
  },
};
