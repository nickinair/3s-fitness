/* 会员端-自助签到 */
window.Pages.MemberCheckin = {
  data() { return { list: [], loading: true, doing: false }; },
  template: [
    '<div class="page">',
    '  <m-nav title="到店签到"></m-nav>',
    '  <div style="text-align:center;padding-bottom:6px">',
    '    <button class="checkin-big" style="border-style:solid;cursor:pointer" @click="doCheckin" :disabled="doing">',
    '      <van-loading v-if="doing" color="#fff"/>',
    '      <template v-else><van-icon name="aim" size="34"/><span style="margin-top:8px">到店签到</span></template>',
    '    </button>',
    '    <div class="muted">模拟扫门店二维码 · 自动选卡扣费</div>',
    '  </div>',
    '  <div class="sec-title">签到记录</div>',
    '  <div v-if="loading" style="text-align:center;padding:30px 0"><van-loading color="var(--brand)"/></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无签到记录" image-size="70"/>',
    '    <div class="card-box" v-else style="padding:2px 8px">',
    '      <van-cell v-for="r in list" :key="r.id" :title="H.dt(r.check_in_time)" :label="r.card_type_name + \' · \' + (DICT.port[r.port]||\'\')">',
    '        <template #value><van-tag v-if="!r.check_out_time" type="success" plain round>在场</van-tag><span v-else class="muted">{{ H.time(String(r.check_out_time).slice(10)) }} 离场</span></template>',
    '      </van-cell>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      try { this.list = await API.get('/member/my-checkins'); }
      finally { this.loading = false; }
    },
    async doCheckin() {
      this.doing = true;
      try {
        const r = await API.post('/member/checkin', {});
        vant.showDialog({
          title: '签到成功', confirmButtonColor: 'var(--brand)',
          message: (r.realname || '') + '，欢迎回来！\n' + r.card_type_name + '\n' + (r.deduct_info || ''),
        });
        this.load();
      } catch (e) { /* toast 已提示 */ }
      finally { this.doing = false; }
    },
  },
  mounted() { this.load(); },
};
