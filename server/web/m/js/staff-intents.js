/* 员工端-购卡意向跟进 */
window.Pages.StaffIntents = {
  data() {
    return {
      tab: 0, list: [], loading: true,
      cur: null, closeShow: false, closeRemark: '', closing: false,
    };
  },
  template: [
    '<div class="page">',
    '  <m-nav title="购卡意向"></m-nav>',
    '  <van-tabs v-model:active="tab" color="#0d5e56" sticky offset-top="46" @change="load">',
    '    <van-tab title="待跟进" :name="0"></van-tab>',
    '    <van-tab title="已开卡" :name="1"></van-tab>',
    '    <van-tab title="已关闭" :name="2"></van-tab>',
    '  </van-tabs>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" :description="[\'暂无待跟进意向\',\'暂无已开卡意向\',\'暂无已关闭意向\'][tab]"/>',
    '    <div v-for="it in list" :key="it.id" class="rec-item">',
    '      <div class="head">',
    '        <span class="name">{{ it.realname }}',
    '          <a :href="\'tel:\'+it.phone" style="font-size:12px;font-weight:400;color:#0d5e56;margin-left:6px" @click.stop><van-icon name="phone-o" size="12"/> {{ it.phone }}</a>',
    '        </span>',
    '        <van-tag :type="[\'warning\',\'success\',\'default\'][it.status]" round>{{ [\'待跟进\',\'已开卡\',\'已关闭\'][it.status] }}</van-tag>',
    '      </div>',
    '      <div class="mt8" style="font-size:13px">意向：<b>{{ it.card_type_name }}</b> <span class="price" style="margin-left:4px">{{ H.money(it.price) }}</span></div>',
    '      <div class="muted mt4" v-if="it.remark">会员备注：{{ it.remark }}</div>',
    '      <div class="muted mt4">提交于 {{ H.full(it.insert_time) }}</div>',
    '      <div class="muted mt4" v-if="it.status===2 && it.handle_remark">关闭原因：{{ it.handle_remark }}<template v-if="it.handle_user">（{{ it.handle_user }}）</template></div>',
    '      <div class="muted mt4" v-else-if="it.status===1 && it.handle_time">开卡于 {{ H.full(it.handle_time) }}<template v-if="it.handle_user"> · {{ it.handle_user }}</template><template v-if="it.handle_remark"> · {{ it.handle_remark }}</template></div>',
    '      <div class="foot" v-if="it.status===0">',
    '        <van-button size="small" round plain @click="openClose(it)">关闭</van-button>',
    '        <van-button size="small" round type="primary" @click="$router.push(\'/staff/opencard?intent=\'+it.id)">去开卡</van-button>',
    '      </div>',
    '    </div>',
    '    <div class="rpt-export-row" v-if="list.length" @click="exportCsv()">导出本期数据 <van-icon name="arrow" size="11"/></div>',
    '  </template>',

    '  <van-popup v-model:show="closeShow" position="bottom" round safe-area-inset-bottom>',
    '    <div v-if="cur" style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600">关闭意向 · {{ cur.realname }}</div>',
    '      <div class="muted mt4">{{ cur.card_type_name }} · {{ H.money(cur.price) }}</div>',
    '      <van-field v-model="closeRemark" type="textarea" rows="3" placeholder="填写关闭原因（如：已电话沟通，暂不考虑）" maxlength="200" show-word-limit style="margin-top:10px;background:#f7f8fa;border-radius:10px"/>',
    '      <div class="mt12"><van-button type="danger" block round :loading="closing" @click="doClose">确认关闭</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    openClose(it) { this.cur = it; this.closeRemark = ''; this.closeShow = true; },
    exportCsv() {
      var url = '/api/card-intents?status=' + this.tab + '&export=csv';
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
    async doClose() {
      if (!this.closeRemark.trim()) return vant.showToast('请填写关闭原因');
      this.closing = true;
      try {
        await API.post('/card-intents/' + this.cur.id + '/close', { remark: this.closeRemark.trim() });
        this.closeShow = false;
        vant.showToast({ message: '已关闭', icon: 'success' });
        this.load();
      } finally { this.closing = false; }
    },
    async load() {
      this.loading = true;
      try {
        const d = await API.get('/card-intents?status=' + this.tab + '&size=100');
        this.list = d.list || [];
      } finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};
