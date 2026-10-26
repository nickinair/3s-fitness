/* 会员端-买卡(提交购卡意向, 到店办理) */
window.Pages.MemberBuy = {
  data() {
    return {
      cats: [], intents: [], loading: true, kind: 0,
      detail: null,            // 详情弹层
      intentShow: false, intentCard: null, remark: '', submitting: false,
    };
  },
  computed: {
    kinds() {
      const ks = [];
      // 私教卡放第一个
      [4, 1, 2, 3].forEach(k => { if (this.cats.some(c => c.card_kind === k)) ks.push(k); });
      return ks;
    },
    curList() { return this.cats.filter(c => c.card_kind === this.kind); },
    intentedIds() {
      const s = {};
      (this.intents || []).forEach(i => { if (i.status === 0) s[i.card_type_id] = true; });
      return s;
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="购卡"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else>',
    '    <van-tabs v-model:active="kind" color="var(--brand)" sticky offset-top="46">',
    '      <van-tab v-for="k in kinds" :key="k" :title="DICT.cardKind[k]" :name="k"></van-tab>',
    '    </van-tabs>',
    '    <van-empty v-if="!curList.length" description="暂无在售卡" />',
    '    <div v-for="c in curList" :key="c.id" class="rec-item flex" @click="detail=c">',
    '      <div class="flex1">',
    '        <div class="name">{{ c.title }} <van-tag v-if="intentedIds[c.id]" type="success" plain round style="margin-left:4px">已提交意向</van-tag></div>',
    '        <div class="muted mt4" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{{ c.intro }}</div>',
    '        <div class="mt8 muted">',
    '          有效期 {{ c.expire_days }} 天',
    '          <template v-if="c.total_counts"> · {{ c.total_counts }} 次</template>',
    '          <template v-if="Number(c.gift_money)"> · 赠 {{ H.money(c.gift_money) }}</template>',
    '        </div>',
    '      </div>',
    '      <div class="tr" style="margin-left:10px">',
    '        <div class="price" style="font-size:18px">{{ H.money(c.price) }}</div>',
    '        <div class="line-through" v-if="Number(c.original_price)>Number(c.price)">{{ H.money(c.original_price) }}</div>',
    '        <van-button v-if="!intentedIds[c.id]" type="primary" size="small" round style="margin-top:8px;min-width:76px" @click.stop="openIntent(c)">提交意向</van-button>',
    '        <van-button v-else size="small" round disabled style="margin-top:8px;min-width:76px">已提交</van-button>',
    '      </div>',
    '    </div>',
    '  </template>',

    '  <van-popup :show="!!detail" @update:show="v=>!v&&(detail=null)" position="bottom" round closeable safe-area-inset-bottom>',
    '    <div v-if="detail" style="padding:20px 18px 24px">',
    '      <div class="vip-face block" :class="\'face-k\'+detail.card_kind" style="margin:0 0 14px">',
    '        <span class="kind">{{ DICT.cardKind[detail.card_kind] }}</span>',
    '        <div class="name">{{ detail.title }}</div>',
    '        <div class="left">{{ detail.total_counts ? detail.total_counts+\' 次\' : (detail.card_kind===3 ? \'充值 \'+H.money(detail.price) : \'不限次\') }} · 有效期 {{ detail.expire_days }} 天</div>',
    '        <div class="exp">{{ DICT.openMode[detail.open_card_mode||1] }}</div>',
    '      </div>',
    '      <div style="font-size:13px;color:#555;line-height:1.8">{{ detail.intro || \'暂无介绍\' }}</div>',
    '      <div class="muted mt8" v-if="Number(detail.gift_money)">充值加赠 {{ H.money(detail.gift_money) }}，到账 {{ H.money(Number(detail.price)+Number(detail.gift_money)) }}</div>',
    '      <div class="muted mt8" v-if="intentedIds[detail.id]" style="color:var(--down)"><van-icon name="checked"/> 您已提交该卡购买意向，工作人员将与您联系</div>',
    '      <div class="flex mt12">',
    '        <div class="flex1"><span class="price" style="font-size:22px">{{ H.money(detail.price) }}</span>',
    '          <span class="line-through" style="margin-left:6px" v-if="Number(detail.original_price)>Number(detail.price)">{{ H.money(detail.original_price) }}</span></div>',
    '        <van-button v-if="!intentedIds[detail.id]" type="primary" round style="min-width:130px" @click="openIntent(detail)">提交购卡意向</van-button>',
    '        <van-button v-else round disabled style="min-width:130px">已提交意向</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',

    '  <van-popup v-model:show="intentShow" position="bottom" round :close-on-click-overlay="!submitting" safe-area-inset-bottom>',
    '    <div v-if="intentCard" style="padding:22px 18px 26px">',
    '      <div style="font-size:16px;font-weight:600">提交购卡意向</div>',
    '      <div class="muted mt4">{{ intentCard.title }} · {{ H.money(intentCard.price) }}</div>',
    '      <div class="tip-box" style="margin:12px 0">本店采用<b>到店办理</b>方式：提交意向后，工作人员将尽快与您电话联系，确认后到店付款开卡。</div>',
    '      <van-field v-model="remark" type="textarea" rows="2" label="备注" placeholder="选填：期望到店时间 / 其他需求" maxlength="100" show-word-limit/>',
    '      <div class="mt12">',
    '        <van-button type="primary" block round :loading="submitting" loading-text="提交中..." @click="submitIntent">确认提交意向</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    openIntent(c) { this.intentCard = c; this.remark = ''; this.detail = null; this.intentShow = true; },
    async submitIntent() {
      this.submitting = true;
      try {
        await API.post('/member/card-intents', { card_type_id: this.intentCard.id, remark: this.remark.trim() });
        this.intentShow = false;
        this.loadIntents();
        vant.showDialog({
          title: '意向已提交', confirmButtonColor: 'var(--brand)', confirmButtonText: '知道了',
          message: '「' + this.intentCard.title + '」购买意向已提交\n工作人员将尽快与您联系，到店办理即可',
        });
      } finally { this.submitting = false; }
    },
    async loadIntents() {
      try { this.intents = await API.get('/member/my-card-intents', { silent: true }); } catch (e) { /* ignore */ }
    },
  },
  async mounted() {
    try {
      this.cats = await API.get('/member/card-categories');
      this.kind = this.kinds[0] || 1;
      this.loadIntents();
    } finally { this.loading = false; }
  },
};
