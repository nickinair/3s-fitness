/* 会员端-我的会员卡列表 + 卡详情(流水) */
window.Pages.MemberCards = {
  data() { return { list: [], loading: true }; },
  template: [
    '<div class="page">',
    '  <m-nav title="我的会员卡"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-empty v-if="!list.length" description="暂无会员卡"><van-button type="primary" round size="small" to="/buy" style="min-width:120px">去买卡</van-button></van-empty>',
    '    <div v-for="c in list" :key="c.id" class="vip-face block" :class="H.faceCls(c)" @click="$router.push(\'/card/\'+c.id)">',
    '      <div class="flex">',
    '        <span class="kind">{{ DICT.cardKind[c.card_kind] }}</span>',
    '        <div class="flex1"></div>',
    '        <d-tag dict="cardStatus" :v="c.status"></d-tag>',
    '      </div>',
    '      <div class="name">{{ c.card_type_name }}</div>',
    '      <div class="left">{{ H.cardLeft(c) }}</div>',
    '      <div class="exp">{{ H.cardExp(c) }} · 合同号 {{ c.contract_number }}</div>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  async mounted() {
    try { this.list = await API.get('/member/my-cards'); }
    finally { this.loading = false; }
  },
};

window.Pages.MemberCardDetail = {
  data() { return { card: null, recharges: [], spends: [], loading: true, tab: 0 }; },
  template: [
    '<div class="page">',
    '  <m-nav title="会员卡详情"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else-if="card">',
    '    <div class="vip-face block" :class="H.faceCls(card)">',
    '      <div class="flex">',
    '        <span class="kind">{{ DICT.cardKind[card.card_kind] }}</span>',
    '        <div class="flex1"></div>',
    '        <d-tag dict="cardStatus" :v="card.status"></d-tag>',
    '      </div>',
    '      <div class="name">{{ card.card_type_name }}</div>',
    '      <div class="left">{{ H.cardLeft(card) }}</div>',
    '      <div class="exp">{{ H.cardExp(card) }}</div>',
    '    </div>',
    '    <div class="card-box" style="padding:4px 8px">',
    '      <van-cell title="合同号" :value="card.contract_number" />',
    '      <van-cell title="开卡时间" :value="card.open_card_time ? H.full(card.open_card_time) : DICT.openMode[card.open_card_mode]" />',
    '      <van-cell title="到期时间" :value="card.expire_time ? H.full(card.expire_time) : \'未开卡\'" />',
    '      <van-cell v-if="card.counts" title="总次数 / 剩余" :value="card.counts + \' / \' + card.left_counts + \' 次\'" />',
    '      <van-cell v-if="card.card_kind===3" title="余额" :value="H.money(card.left_money)" />',
    '      <van-cell title="实收金额" :value="H.money(card.actual_money)" :border="false"/>',
    '    </div>',
    '    <div class="card-box" style="padding:6px 4px 10px">',
    '      <van-tabs v-model:active="tab" color="#0d5e56">',
    '        <van-tab :title="\'收款流水(\'+recharges.length+\')\'">',
    '          <van-empty v-if="!recharges.length" description="暂无收款流水" image-size="60"/>',
    '          <van-cell v-for="rr in recharges" :key="rr.id" :title="DICT.rechargeType[rr.type] || \'流水\'" :label="H.full(rr.insert_time) + \' · \' + (DICT.payMethod[rr.pay_method]||rr.pay_method)">',
    '            <template #value><span :class="Number(rr.actual_money)>=0?\'price\':\'\'">{{ H.money(rr.actual_money) }}</span></template>',
    '          </van-cell>',
    '        </van-tab>',
    '        <van-tab :title="\'耗卡流水(\'+spends.length+\')\'">',
    '          <van-empty v-if="!spends.length" description="暂无耗卡流水" image-size="60"/>',
    '          <van-cell v-for="s in spends" :key="s.id" :title="DICT.spendScene[s.scene]" :label="H.full(s.insert_time) + (s.coach_name ? \' · \'+s.coach_name : \'\')">',
    '            <template #value><span>{{ s.costs ? \'-\'+H.num(s.costs)+\'次\' : \'\' }} {{ H.money(s.spend_money) }}</span></template>',
    '          </van-cell>',
    '        </van-tab>',
    '      </van-tabs>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  async mounted() {
    try {
      const d = await API.get('/member/my-cards/' + this.$route.params.id);
      this.card = d.card; this.recharges = d.recharges || []; this.spends = d.spends || [];
    } finally { this.loading = false; }
  },
};
