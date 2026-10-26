/* 员工端-教练: 里程碑总结待办 */
window.Pages.StaffMilestones = {
  data() {
    return {
      tab: 0, list: [], loading: true,
      cur: null, sumShow: false, summary: '', saving: false,
    };
  },
  template: [
    '<div class="page">',
    '  <m-nav title="里程碑总结"></m-nav>',
    '  <van-tabs v-model:active="tab" color="var(--brand)" sticky offset-top="46" @change="load">',
    '    <van-tab title="待总结" :name="0"></van-tab>',
    '    <van-tab title="已总结" :name="1"></van-tab>',
    '  </van-tabs>',
    '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    // 空列表时把玩法讲清楚: 这个功能不常触发, 教练第一次进来容易不知道它是干嘛的
    '    <template v-if="!list.length">',
    // 说明卡在下面, 插图缩小免得把正文顶出首屏
    '      <van-empty :image-size="tab===0 ? 70 : 100" :description="tab===0 ? \'当前没有待总结的里程碑\' : \'暂无已总结记录\'"/>',
    '      <div class="ms-guide" v-if="tab===0">',
    '        <div class="t"><van-icon name="question-o"/> 里程碑总结怎么用</div>',
    '        <div class="s"><b>1. 自动产生，不用手动建</b><br/>学员每累计上满 <b>5 节</b>私教课，系统自动生成一个里程碑（第5节、第10节、第15节…），并给学员发短信提醒。</div>',
    '        <div class="s"><b>2. 谁带的学员谁来写</b><br/>每位学员在会员档案里都会指定一位<b>主教练</b>（和副教练相对，不是教练团队里的职级）。里程碑就落给这位学员的主教练；该学员没指定主教练时，落给最近一次给他上课的教练。所以这里只会出现你名下的学员。</div>',
    '        <div class="s"><b>3. 写完学员就能看到</b><br/>点「填写总结」写下这阶段的训练成果、进步和下阶段建议，提交后展示在学员小程序的「里程碑」页，是很好的续卡沟通时机。</div>',
    '        <div class="s"><b>4. 只有私教类卡计入</b><br/>销课时才累计（预约不算）。团课、自助训练卡不产生里程碑。</div>',
    '        <div class="tip">这里是空的说明学员还没到下一个 5 节的节点，正常现象，不用处理。</div>',
    '      </div>',
    '    </template>',
    '    <div v-for="m in list" :key="m.id" class="rec-item" @click="tab===0 && openSum(m)">',
    '      <div class="head">',
    '        <span class="name">{{ m.realname }}',
    '          <span class="ms-badge" style="margin-left:6px">{{ m.type===2 ? (\'第 \'+m.node_value+\' 天\') : (\'第 \'+m.node_value+\' 节课\') }}</span>',
    '        </span>',
    '        <van-tag :type="m.status===1?\'success\':\'warning\'" round>{{ m.status===1?\'已总结\':\'待总结\' }}</van-tag>',
    '      </div>',
    '      <div class="muted mt8">{{ m.card_type_name || \'私教训练\' }} · 达成于 {{ H.full(m.insert_time) }}</div>',
    '      <div v-if="m.status===1 && m.summary" class="ms-summary" style="margin-top:8px">{{ m.summary }}</div>',
    '      <div class="foot" v-if="m.status===0">',
    '        <van-button size="small" round type="primary" @click.stop="openSum(m)">填写总结</van-button>',
    '      </div>',
    '    </div>',
    '    <div class="rpt-export-row" v-if="list.length" @click="exportCsv()">导出本期数据 <van-icon name="arrow" size="11"/></div>',
    '  </template>',

    '  <van-popup v-model:show="sumShow" position="bottom" round safe-area-inset-bottom>',
    '    <div v-if="cur" style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600">阶段总结 · {{ cur.realname }}</div>',
    '      <div class="muted mt4">{{ cur.type===2 ? (\'第 \'+cur.node_value+\' 天\') : (\'第 \'+cur.node_value+\' 节课\') }} 里程碑，总结将展示在学员的里程碑页</div>',
    '      <van-field v-model="summary" type="textarea" rows="4" placeholder="写下这个阶段的训练成果、进步与下一阶段建议..." maxlength="500" show-word-limit style="margin-top:10px;background:var(--c-bg-2);border-radius:10px"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="submit">提交总结</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    openSum(m) { this.cur = m; this.summary = ''; this.sumShow = true; },
    exportCsv() {
      var url = '/api/milestones?status=' + this.tab + '&export=csv';
      window.open(url + '&token=' + encodeURIComponent(Store.token));
    },
    async submit() {
      if (!this.summary.trim()) return vant.showToast('请填写总结内容');
      this.saving = true;
      try {
        await API.post('/milestones/' + this.cur.id + '/summary', { summary: this.summary.trim() });
        this.sumShow = false;
        vant.showToast({ message: '总结已提交', icon: 'success' });
        this.load();
      } finally { this.saving = false; }
    },
    async load() {
      this.loading = true;
      try {
        const d = await API.get('/milestones?status=' + this.tab + '&size=100');
        this.list = d.list || [];
      } finally { this.loading = false; }
    },
  },
  mounted() { this.load(); },
};
