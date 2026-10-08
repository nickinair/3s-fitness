/* 会员端-我的里程碑 (成就卡 + 时间线 + 体测变化曲线) */
window.Pages.MemberMilestones = {
  data() { return { d: null, loading: true }; },
  computed: {
    milestones() {
      const arr = ((this.d && this.d.milestones) || []).slice();
      return arr.sort((a, b) => (b.insert_time || '') > (a.insert_time || '') ? 1 : -1);
    },
    records() {
      const arr = ((this.d && this.d.bodyRecords) || []).slice();
      const key = r => (r.record_date || '') + '|' + (r.insert_time || '') + '|' + (r.id || 0);
      return arr.sort((a, b) => key(a) < key(b) ? -1 : (key(a) > key(b) ? 1 : 0));
    },
    /* 最新 vs 第一次 对比 */
    compare() {
      const rs = this.records;
      if (rs.length < 2) return null;
      const first = rs[0], last = rs[rs.length - 1];
      const mk = (key, label, unit) => {
        if (first[key] == null || last[key] == null) return null;
        const diff = Number(last[key]) - Number(first[key]);
        return { label, unit, now: H.num(last[key]), diff: Math.round(diff * 10) / 10 };
      };
      return [mk('weight', '体重', 'kg'), mk('body_fat', '体脂率', '%'), mk('muscle', '肌肉量', 'kg'), mk('waist', '腰围', 'cm')].filter(Boolean);
    },
    /* 自绘 SVG 折线: 体重 + 体脂率 */
    chart() {
      const rs = this.records;
      if (rs.length < 2) return null;
      const W = 336, HT = 190, padL = 24, padR = 24, padT = 26, padB = 44; // 底部留出体脂数值与日期轴的间距
      const iw = W - padL - padR, ih = HT - padT - padB;
      const xs = rs.map((r, i) => padL + (rs.length === 1 ? iw / 2 : i * iw / (rs.length - 1)));
      const mkLine = (key) => {
        const vals = rs.map(r => r[key] == null ? null : Number(r[key]));
        const nums = vals.filter(v => v != null);
        if (nums.length < 2) return null;
        let min = Math.min.apply(null, nums), max = Math.max.apply(null, nums);
        if (max - min < 0.6) { max += 0.3; min -= 0.3; }
        const pts = [];
        vals.forEach((v, i) => {
          if (v == null) return;
          pts.push({ x: Math.round(xs[i] * 10) / 10, y: Math.round((padT + ih - (v - min) / (max - min) * ih) * 10) / 10, v: H.num(v) });
        });
        return { pts, path: pts.map(p => p.x + ',' + p.y).join(' ') };
      };
      const weight = mkLine('weight'), fat = mkLine('body_fat');
      const labels = rs.map((r, i) => ({ x: xs[i], t: String(r.record_date || '').slice(5, 10) }));
      const step = Math.max(1, Math.ceil(labels.length / 5));
      return { W, HT, weight, fat, labels: labels.filter((l, i) => i % step === 0 || i === labels.length - 1) };
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="我的里程碑"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else-if="d">',

    '    <div class="ms-hero">',
    '      <div class="l1">🏆 训练成就</div>',
    '      <div class="l2">累计完成 <b>{{ d.totalLessons || 0 }}</b> 节训练</div>',
    '      <div class="l3">每一次坚持，都在靠近更好的自己</div>',
    '    </div>',

    '    <div class="sec-title">里程碑时间线</div>',
    '    <van-empty v-if="!milestones.length" description="继续训练，达成节点后教练会为你写总结" image-size="70"/>',
    '    <div class="ms-line" v-else>',
    '      <div v-for="m in milestones" :key="m.id" class="ms-item">',
    '        <div class="ms-dot" :class="{done:m.status===1}"><van-icon :name="m.status===1?\'medal\':\'clock-o\'" size="14"/></div>',
    '        <div class="ms-card">',
    '          <div class="flex">',
    '            <span class="ms-badge">{{ m.type===2 ? (\'第 \'+m.node_value+\' 天\') : (\'第 \'+m.node_value+\' 节课\') }}</span>',
    '            <span class="flex1"></span>',
    '            <van-tag :type="m.status===1?\'success\':\'warning\'" round>{{ m.status===1?\'已总结\':\'待教练总结\' }}</van-tag>',
    '          </div>',
    '          <div v-if="m.status===1 && m.summary" class="ms-summary">{{ m.summary }}</div>',
    '          <div v-else class="muted mt8">教练 {{ m.coach_name || \'\' }} 将为这个阶段写下训练总结，敬请期待</div>',
    '          <div class="muted mt8">{{ m.coach_name ? m.coach_name+\' 教练 · \' : \'\' }}{{ H.full(m.status===1 ? (m.summary_time||m.insert_time) : m.insert_time) }}</div>',
    '        </div>',
    '      </div>',
    '    </div>',

    '    <div class="sec-title">身体数据变化</div>',
    '    <div class="card-box" v-if="chart">',
    '      <div style="font-size:12px;color:#646566;margin-bottom:4px">',
    '        <span style="color:#0d5e56">●</span> 体重(kg)',
    '        <span style="color:#f2762d;margin-left:12px">●</span> 体脂率(%)',
    '      </div>',
    '      <svg :viewBox="\'0 0 \'+chart.W+\' \'+chart.HT" style="width:100%;display:block">',
    '        <line v-for="i in 4" :key="i" x1="8" :x2="chart.W-8" :y1="26+(i-1)*40" :y2="26+(i-1)*40" stroke="#f0f1f3" stroke-width="1"/>',
    '        <template v-if="chart.weight">',
    '          <polyline :points="chart.weight.path" fill="none" stroke="#0d5e56" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    '          <g v-for="(p,i) in chart.weight.pts" :key="\'w\'+i">',
    '            <circle :cx="p.x" :cy="p.y" r="3" fill="#0d5e56"/>',
    '            <text :x="p.x" :y="p.y-7" text-anchor="middle" font-size="10" fill="#0d5e56">{{ p.v }}</text>',
    '          </g>',
    '        </template>',
    '        <template v-if="chart.fat">',
    '          <polyline :points="chart.fat.path" fill="none" stroke="#f2762d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    '          <g v-for="(p,i) in chart.fat.pts" :key="\'f\'+i">',
    '            <circle :cx="p.x" :cy="p.y" r="3" fill="#f2762d"/>',
    '            <text :x="p.x" :y="p.y+14" text-anchor="middle" font-size="10" fill="#f2762d">{{ p.v }}</text>',
    '          </g>',
    '        </template>',
    '        <text v-for="(l,i) in chart.labels" :key="\'x\'+i" :x="l.x" :y="chart.HT-6" text-anchor="middle" font-size="10" fill="#969799">{{ l.t }}</text>',
    '      </svg>',
    '      <div class="ms-cmp" v-if="compare && compare.length">',
    '        <div class="muted" style="margin-bottom:6px">最新一次 vs 第一次</div>',
    '        <div class="flex" style="flex-wrap:wrap;gap:8px">',
    '          <div v-for="c in compare" :key="c.label" class="ms-cmp-cell">',
    '            <div class="l">{{ c.label }}</div>',
    '            <div class="v">{{ c.now }}<span style="font-size:11px;font-weight:400">{{ c.unit }}</span></div>',
    '            <div class="d" :class="c.diff<0?\'dn\':(c.diff>0?\'up\':\'\')">{{ c.diff>0?\'+\':\'\' }}{{ c.diff===0?\'持平\':(c.diff+c.unit) }} {{ c.diff<0?\'↓\':(c.diff>0?\'↑\':\'\') }}</div>',
    '          </div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div class="card-box" v-else style="text-align:center;padding:26px 14px">',
    '      <van-icon name="chart-trending-o" size="34" color="#c8c9cc"/>',
    '      <div class="muted mt8">教练录入体测数据后这里会出现变化曲线</div>',
    '    </div>',
    '  </template>',
    '</div>',
  ].join('\n'),
  async mounted() {
    try { this.d = await API.get('/member/milestones'); }
    finally { this.loading = false; }
  },
};
