/* 约课时间轴组件 (类似会议室预订)
 * <m-time-picker v-model="from" :date :open-time :busy :mine :duration />
 *   - 横向时间轴(左右滑动), 灰色=教练已有安排, 橙色=我自己的课, 斜纹=已过
 *   - 点空白处放下一个课时块(按 15 分钟对齐), 左右拖动或 ±15分 微调
 *   - 落在占用时间上会自动挪到最近的空闲时间
 *   - v-model 只在时间有效时为 "HH:mm", 否则为 null
 * <m-avail-bar :date :open-time :busy /> 教练卡片上的横向忙闲条
 */
(function () {
  const STEP = 15;
  const PX = 1.6; // 每分钟像素(横向), 一小时 96px
  const toMin = (t) => { const p = String(t || '0:0').split(':').map(Number); return p[0] * 60 + (p[1] || 0); };
  const fmt = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  function parseOpen(s) {
    const m = String(s || '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    return m ? { open: toMin(m[1]), close: toMin(m[2]) } : { open: 480, close: 1260 };
  }
  function nowMinFor(date) {
    const today = dayjs().format('YYYY-MM-DD');
    if (date < today) return 24 * 60;
    if (date > today) return -1;
    return dayjs().hour() * 60 + dayjs().minute();
  }

  const MTimePicker = {
    props: {
      modelValue: { type: String, default: null },
      date: { type: String, required: true },
      openTime: { type: String, default: '08:00-21:00' },
      busy: { type: Array, default: () => [] },
      mine: { type: Array, default: () => [] },
      duration: { type: Number, default: 60 },
      // 补录场景(员工代约): 允许选择已过去的时段; 会员自约保持 false
      allowPast: { type: Boolean, default: false },
    },
    emits: ['update:modelValue'],
    data() { return { start: null, drag: null }; },
    computed: {
      range() { return parseOpen(this.openTime); },
      width() { return (this.range.close - this.range.open) * PX; },
      nowMin() { return nowMinFor(this.date); },
      // 最早可选起点: 营业开始 与 当前时间(向后取整到15分) 取较晚者
      minStart() {
        if (this.allowPast) return this.range.open;
        return Math.max(this.range.open, Math.ceil((this.nowMin + 1) / STEP) * STEP);
      },
      maxStart() { return this.range.close - this.duration; },
      hours() {
        const r = [];
        for (let m = Math.ceil(this.range.open / 60) * 60; m <= this.range.close; m += 60) r.push(m);
        return r;
      },
      halfs() {
        const r = [];
        for (let m = Math.ceil(this.range.open / 30) * 30; m < this.range.close; m += 30) if (m % 60) r.push(m);
        return r;
      },
      intervals() {
        const all = [];
        // 自己约的课在教练忙碌里也会出现一次, 只保留"我的课"
        const mineKey = new Set(this.mine.map(b => b.from + '-' + b.to));
        this.busy.forEach(b => { if (b.type === 'booked' && mineKey.has(b.from + '-' + b.to)) return; all.push({ f: toMin(b.from), t: toMin(b.to), type: b.type, label: b.label, from: b.from, to: b.to }); });
        this.mine.forEach(b => all.push({ f: toMin(b.from), t: toMin(b.to), type: 'mine', label: b.label, from: b.from, to: b.to }));
        return all;
      },
      blocks() {
        const { open, close } = this.range;
        return this.intervals
          .map(b => ({ ...b, cf: Math.max(b.f, open), ct: Math.min(b.t, close) }))
          .filter(b => b.ct > b.cf)
          .map(b => ({ ...b, left: (b.cf - open) * PX, w: (b.ct - b.cf) * PX, text: b.type === 'rest' && b.f <= open && b.t >= close ? b.label : b.label }));
      },
      past() {
        const { open, close } = this.range;
        const end = Math.min(this.nowMin, close);
        return end > open ? { left: 0, w: (end - open) * PX } : null;
      },
      reason() { return this.start == null ? '' : this.conflict(this.start); },
      nothingFree() {
        for (let m = this.minStart; m <= this.maxStart; m += STEP) if (!this.conflict(m)) return false;
        return true;
      },
    },
    watch: {
      modelValue: { immediate: true, handler(v) { if (v && toMin(v) !== this.start) this.start = toMin(v); if (!v && this.start != null && !this.reason && !this.drag) this.start = null; } },
      date() { this.revalidate(true); },
      openTime() { this.revalidate(false); },
      busy() { this.revalidate(false); },
      mine() { this.revalidate(false); },
      duration() { this.revalidate(false); },
    },
    template: `
      <div class="tp">
        <div class="tp-head">
          <div class="flex1">
            <template v-if="start != null">
              <div class="tp-time" :class="{bad: reason}">{{ fmt(start) }} - {{ fmt(start + duration) }}</div>
              <div class="tp-tip" :class="{bad: reason}">{{ reason || ('左右拖动色块或 ±15分 微调') }}</div>
            </template>
            <template v-else>
              <div class="tp-time muted">{{ nothingFree ? '当天没有可约时间' : '请选择开始时间' }}</div>
              <div class="tp-tip">{{ nothingFree ? '换一天或换一位教练试试' : '左右滑动时间轴，点空白处选时间' }}</div>
            </template>
          </div>
          <div class="tp-nudge" v-if="start != null">
            <button type="button" @click="nudge(-1)">-15分</button>
            <button type="button" @click="nudge(1)">+15分</button>
          </div>
        </div>
        <div class="tp-scroll" ref="scroll">
          <div class="tp-body" ref="body" :style="{width: width + 'px'}" @click="onTap">
            <div v-for="m in hours" :key="'h' + m" class="tp-hour" :style="{left: (m - range.open) * 1.6 + 'px'}"><span>{{ fmt(m) }}</span></div>
            <div v-for="m in halfs" :key="'s' + m" class="tp-half" :style="{left: (m - range.open) * 1.6 + 'px'}"></div>
            <div v-if="past" class="tp-past" :style="{left: past.left + 'px', width: past.w + 'px'}"><span v-if="past.w > 40">已过</span></div>
            <div v-for="(b, i) in blocks" :key="'b' + i" class="tp-busy" :class="'t-' + b.type" :style="{left: b.left + 'px', width: b.w + 'px'}"><span>{{ b.text }}</span></div>
            <div v-if="start != null" class="tp-pick" :class="{bad: reason, dragging: drag}"
              :style="{left: (start - range.open) * 1.6 + 'px', width: duration * 1.6 + 'px'}"
              @pointerdown.stop.prevent="dragStart" @click.stop>
              <div class="tp-grip"></div>
              <span>{{ fmt(start) }}</span>
            </div>
          </div>
        </div>
        <div class="tp-legend">
          <span><i class="lg-pick"></i>本次</span><span><i class="lg-busy"></i>教练有安排</span><span><i class="lg-mine"></i>我的课</span><span><i class="lg-past"></i>已过</span>
        </div>
      </div>`,
    methods: {
      fmt,
      conflict(s) {
        const e = s + this.duration;
        if (s < this.range.open || e > this.range.close) return '超出营业时间（' + fmt(this.range.open) + '-' + fmt(this.range.close) + '）';
        if (!this.allowPast && s <= this.nowMin) return '开始时间已过';
        const hit = this.intervals.find(b => s < b.t && b.f < e);
        if (hit) return (hit.type === 'mine' ? '与您已有的课冲突：' : '教练该时段有安排：') + hit.label + ' ' + hit.from + '-' + hit.to;
        return '';
      },
      clamp(s) { return Math.min(Math.max(s, this.minStart), this.maxStart); },
      snap(m) { return Math.round(m / STEP) * STEP; },
      nearestFree(s) {
        const base = this.clamp(this.snap(s));
        for (let k = 0; k <= 96; k++) {
          for (const d of k ? [k, -k] : [0]) {
            const c = base + d * STEP;
            if (c >= this.minStart && c <= this.maxStart && !this.conflict(c)) return c;
          }
        }
        return null;
      },
      commit(s, silent) {
        const want = s;
        const ok = s != null && !this.conflict(s) ? s : this.nearestFree(s == null ? this.minStart : s);
        this.start = ok;
        this.$emit('update:modelValue', ok == null ? null : fmt(ok));
        if (!silent && ok != null && want != null && ok !== want) vant.showToast('该时间不可约，已调整到最近的空闲时间');
        if (!silent && ok == null) vant.showToast('当天没有可约时间了');
      },
      onTap(e) {
        if (this.drag) return;
        const rect = this.$refs.body.getBoundingClientRect();
        const minute = this.range.open + (e.clientX - rect.left) / PX - this.duration / 2;
        this.commit(this.clamp(this.snap(minute)));
      },
      nudge(dir) {
        if (this.start == null) return;
        for (let c = this.start + dir * STEP; c >= this.minStart && c <= this.maxStart; c += dir * STEP) {
          if (!this.conflict(c)) { this.commit(c, true); return; }
        }
        vant.showToast(dir > 0 ? '后面没有可约时间了' : '前面没有可约时间了');
      },
      dragStart(e) {
        this.drag = { x: e.clientX, s: this.start };
        const move = (ev) => {
          const scroll = this.$refs.scroll;
          const r = scroll.getBoundingClientRect();
          if (ev.clientX < r.left + 36) scroll.scrollLeft -= 10;
          if (ev.clientX > r.right - 36) scroll.scrollLeft += 10;
          const delta = (ev.clientX - this.drag.x) / PX;
          this.start = this.clamp(this.snap(this.drag.s + delta));
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          const s = this.start;
          setTimeout(() => { this.drag = null; }, 0);
          this.commit(s);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      },
      revalidate(dateChanged) {
        this.$nextTick(() => {
          if (this.start != null && (dateChanged || this.conflict(this.start))) {
            this.start = null;
            this.$emit('update:modelValue', null);
          }
          if (dateChanged) this.scrollToFocus();
        });
      },
      scrollToFocus() {
        this.$nextTick(() => {
          const sc = this.$refs.scroll; if (!sc) return;
          const focus = this.start != null ? this.start : (this.nearestFree(this.minStart) != null ? this.nearestFree(this.minStart) : this.minStart);
          sc.scrollLeft = Math.max(0, (focus - this.range.open) * PX - 60);
        });
      },
    },
    mounted() { this.scrollToFocus(); },
  };

  const MAvailBar = {
    props: {
      date: { type: String, required: true },
      openTime: { type: String, default: '08:00-21:00' },
      busy: { type: Array, default: () => [] },
    },
    computed: {
      r() { return parseOpen(this.openTime); },
      span() { return Math.max(1, this.r.close - this.r.open); },
      segs() {
        const { open, close } = this.r;
        return this.busy.map(b => ({ f: Math.max(toMin(b.from), open), t: Math.min(toMin(b.to), close), type: b.type }))
          .filter(x => x.t > x.f)
          .map(x => ({ left: (x.f - open) / this.span * 100, width: (x.t - x.f) / this.span * 100, type: x.type }));
      },
      past() {
        const end = Math.min(nowMinFor(this.date), this.r.close);
        return end > this.r.open ? (end - this.r.open) / this.span * 100 : 0;
      },
      ticks() {
        const out = []; const { open, close } = this.r;
        const step = this.span > 720 ? 240 : 180;
        for (let m = Math.ceil(open / step) * step; m < close; m += step) {
          const left = (m - open) / this.span * 100;
          if (left < 14 || left > 86) continue; // 避免与两端时间文字重叠
          out.push({ left, t: fmt(m) });
        }
        return out;
      },
    },
    template: `
      <div class="ab">
        <div class="ab-bar">
          <div v-if="past" class="ab-past" :style="{width: past + '%'}"></div>
          <div v-for="(s, i) in segs" :key="i" class="ab-seg" :class="'t-' + s.type" :style="{left: s.left + '%', width: s.width + '%'}"></div>
        </div>
        <div class="ab-ticks">
          <span style="left:0">{{ fmt(r.open) }}</span>
          <span v-for="t in ticks" :key="t.t" :style="{left: t.left + '%'}" class="mid">{{ t.t }}</span>
          <span style="right:0;left:auto">{{ fmt(r.close) }}</span>
        </div>
      </div>`,
    methods: { fmt },
  };

  window.MComponents = Object.assign(window.MComponents || {}, { 'm-time-picker': MTimePicker, 'm-avail-bar': MAvailBar });
})();
