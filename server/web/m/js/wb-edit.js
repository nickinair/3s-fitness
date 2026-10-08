/* wb-grid 可编辑九宫格: 员工工作台 / 会员首页「常用功能」共用。
   - 常态: 点击 cell 触发 pick(key)
   - 编辑态(editing): 按住后移动即拖拽, 松开落定; 右上角 − 移除
   丝滑拖拽核心原则:
     1. ghost 用 position:fixed + transform:translate(x,y) 跟手, 完全不用 left/top 更新(避免 layout)
     2. ghost 初始锚点 = 按下瞬间元素的视口坐标, 偏移量 = 手指移动 delta —— 两者叠加即实时位置
     3. rAF 节流: 每帧最多写一次 DOM, 彻底消除连续 touchmove 堆积导致的抖动
     4. 让位预览全程只写 transform(GPU 合成层, 无 reflow/repaint)
     5. gridRect 在 start() 快照一次, 拖拽过程不重算(防止页面滚动后坐标漂移) */
(function () {
  const COLS = 3;

  /** rAF 节流: 连续调用只保留最新参数, 每帧执行一次 */
  function rafThrottle(fn) {
    let rafId = null;
    let ctx = null;
    let latestArgs = null;
    return function (...args) {
      ctx = this;
      latestArgs = args;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          fn.apply(ctx, latestArgs);
        });
      }
    };
  }

  window.WBGrid = {
    name: 'wb-grid',
    props: {
      defs:     { type: Object,  required: true },
      keys:     { type: Array,   default: () => [] },
      editing:  { type: Boolean, default: false },
      badges:   { type: Object,  default: () => ({}) },
      iconSize: { type: String,  default: '26' },
    },
    emits: ['update:keys', 'pick'],
    data() {
      return {
        drag:     null,   // 拖拽状态快照
        pressAt:  null,   // 长按起点
        pressEl:  null,
        pressIdx: null,
        noClick:  false,
        _longPressed: false,  // 长按已触发
        _pressTimer:  null,   // 长按定时器 ID
      };
    },
    computed: {
      cells() {
        return this.keys.filter((k) => this.defs[k]).map((k) => ({ key: k, ...this.defs[k] }));
      },
      /**
       * ghost 样式: 只声明尺寸 + 初始 translate 定位; transform 由 JS 直接写, 不走 Vue 响应式。
       * 注意: 这里给的 transform 是初始值; mounted 后 move() 会直接覆盖 el.style.transform。
       */
      ghostStyle() {
        if (!this.drag) return {};
        const { initX, initY, w, h } = this.drag;
        return {
          width:     w + 'px',
          height:    h + 'px',
          transform: `translate(${initX}px,${initY}px) scale(1.07)`,
        };
      },
    },
    created() {
      // rAF 节流版的 _doMove, 所有 DOM 写操作在此执行
      this._doMove = rafThrottle(function (p) {
        if (!this.drag) return;
        const dx = p.x - this.drag.sx;
        const dy = p.y - this.drag.sy;
        const tx = this.drag.initX + dx;
        const ty = this.drag.initY + dy;
        if (this.$refs.ghost) {
          this.$refs.ghost.style.transform = `translate(${tx}px,${ty}px) scale(1.07)`;
        }
        this._hover(p);
      });
    },
    mounted() {
      this._mv = (e) => {
        if (this.drag) {
          if (e.cancelable) e.preventDefault();
          this._doMove(this.pt(e));
        } else if (this.pressAt && this.pressEl) {
          const p = this.pt(e);
          const dist = Math.hypot(p.x - this.pressAt.x, p.y - this.pressAt.y);
          if (!this._longPressed) {
            // 长按未触发前, 手指移动超过 10px 视为滚动, 取消长按
            if (dist > 10) this._cancelPress();
            return;
          }
          // 长按已触发, 手指移动超过 5px 启动拖拽
          if (dist > 5) {
            if (e.cancelable) e.preventDefault();
            this._start(this.pressIdx, this.pressEl, this.pressAt);
            if (this.drag) this._doMove(p);
          }
        }
      };
      this._up = () => this._up2();
      document.addEventListener('touchmove',   this._mv, { passive: false });
      document.addEventListener('touchend',    this._up, { passive: true });
      document.addEventListener('touchcancel', this._up, { passive: true });
      document.addEventListener('mousemove',   this._mv);
      document.addEventListener('mouseup',     this._up);
    },
    beforeUnmount() {
      document.removeEventListener('touchmove',   this._mv);
      document.removeEventListener('touchend',    this._up);
      document.removeEventListener('touchcancel', this._up);
      document.removeEventListener('mousemove',   this._mv);
      document.removeEventListener('mouseup',     this._up);
    },
    methods: {
      pt(e) {
        if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
      },

      /** 按下: 记录起点 + 启动 300ms 长按定时器, 长按成功后才允许拖拽 */
      down(e, idx) {
        if (!this.editing || this.drag) return;
        this._cancelPress();
        this.pressAt  = this.pt(e);
        this.pressEl  = e.currentTarget;
        this.pressIdx = idx;
        this._longPressed = false;
        this._pressTimer = setTimeout(() => {
          this._pressTimer = null;
          this._longPressed = true;
          // 触觉反馈 (移动端)
          if (navigator.vibrate) navigator.vibrate(20);
          // 视觉反馈: 给被按住的元素加一个缩放
          if (this.pressEl) this.pressEl.style.transform = 'scale(0.92)';
        }, 300);
      },

      /** 取消长按 (手指移动太远 / 松手) */
      _cancelPress() {
        if (this._pressTimer) { clearTimeout(this._pressTimer); this._pressTimer = null; }
        this._longPressed = false;
        if (this.pressEl) this.pressEl.style.transform = '';
        this.pressAt = null; this.pressEl = null; this.pressIdx = null;
      },

      /** 正式启动拖拽: 快照所有坐标, 避免拖拽中重算 */
      _start(idx, el, pressPoint) {
        const c = this.cells[idx];
        if (!c) return;
        const r    = el.getBoundingClientRect();
        const grid = this.$refs.grid;
        const gr   = grid ? grid.getBoundingClientRect()
                          : { left: 0, top: 0, width: r.width * COLS, height: r.height };
        this.drag = {
          idx,
          key: c.key, t: c.t, icon: c.icon,
          // ghost 初始 translate = 元素当前视口坐标 (position:fixed 坐标系)
          initX: r.left,
          initY: r.top,
          w: r.width,
          h: r.height,
          // 手指按下坐标 (用于计算 delta)
          sx: pressPoint.x,
          sy: pressPoint.y,
          // 悬停目标索引
          target: idx,
          // 快照 grid 坐标系 (防滚动漂移)
          gridLeft:  gr.left,
          gridTop:   gr.top,
          gridWidth: gr.width,
          cellW:     gr.width / COLS,
          cellH:     r.height,
        };
        this.pressAt = null; this.pressEl = null; this.pressIdx = null;
      },

      /** 计算当前手指悬停的目标格索引 (不操作 DOM) */
      _hover(p) {
        if (!this.drag) return;
        const { gridLeft, gridTop, cellW, cellH } = this.drag;
        const rows   = Math.max(1, Math.ceil(this.cells.length / COLS));
        const col    = Math.min(COLS - 1, Math.max(0, Math.floor((p.x - gridLeft) / cellW)));
        const row    = Math.min(rows - 1, Math.max(0, Math.floor((p.y - gridTop)  / cellH)));
        const target = Math.min(this.cells.length - 1, row * COLS + col);
        if (target !== this.drag.target) {
          this.drag.target = target;
          this._preview();
        }
      },

      /** 让位预览: 仅写 transform, DOM 顺序不变, 无 reflow */
      _preview() {
        if (!this.drag) return;
        const { key, target, cellW, cellH } = this.drag;
        const newKeys = this.keys.filter((k) => k !== key);
        newKeys.splice(target, 0, key);
        this.$el.querySelectorAll('.wb-cell[data-key]').forEach((el) => {
          const k = el.dataset.key;
          if (k === key) return; // 源格已隐藏, 跳过
          const ci = this.keys.indexOf(k);
          const ni = newKeys.indexOf(k);
          if (ci < 0 || ni < 0) return;
          const dx = ((ni % COLS) - (ci % COLS)) * cellW;
          const dy = (Math.floor(ni / COLS) - Math.floor(ci / COLS)) * cellH;
          el.style.transform = (dx || dy) ? `translate(${dx}px,${dy}px)` : '';
        });
      },

      /** 松手: 清预览, emit 新顺序 */
      _up2() {
        this._cancelPress();
        if (!this.drag) return;
        const { key, target } = this.drag;
        const newKeys = this.keys.filter((k) => k !== key);
        newKeys.splice(target, 0, key);
        this.$el.querySelectorAll('.wb-cell[data-key]').forEach((el) => { el.style.transform = ''; });
        this.$emit('update:keys', newKeys);
        this.drag    = null;
        this.noClick = true;
        setTimeout(() => { this.noClick = false; }, 300);
      },

      tap(key) {
        if (this.noClick || this.editing) return;
        this.$emit('pick', key);
      },

      del(idx) {
        const ks = this.keys.slice();
        ks.splice(idx, 1);
        this.$emit('update:keys', ks);
      },
    },

    template: [
      '<div class="wb-grid" :class="{ \'wb-grab\': editing, \'wb-dragging\': !!drag }" ref="grid">',
      '  <template v-for="(c, idx) in cells" :key="c.key">',
      '    <div class="wb-cell" :class="{ \'wb-drag-src\': drag && drag.key === c.key }"',
      '         :data-key="c.key"',
      '         @touchstart.passive="down($event, idx)"',
      '         @mousedown="down($event, idx)"',
      '         @click="tap(c.key)">',
      '      <i v-if="editing" class="wb-del" @touchstart.stop @mousedown.stop @click.stop="del(idx)">',
      '        <van-icon name="cross" size="10" color="#ee0a24"/>',
      '      </i>',
      '      <div class="wb-ic">',
      '        <van-badge :content="badges[c.key] || \'\'" :show-zero="false">',
      '          <van-icon :name="c.icon" :size="iconSize"/>',
      '        </van-badge>',
      '      </div>',
      '      <div class="wb-tx">{{ c.t }}</div>',
      '    </div>',
      '  </template>',
      '  <div v-if="drag" ref="ghost" class="wb-cell wb-ghost" :style="ghostStyle">',
      '    <div class="wb-ic"><van-icon :name="drag.icon" :size="iconSize"/></div>',
      '    <div class="wb-tx">{{ drag.t }}</div>',
      '  </div>',
      '</div>',
    ].join('\n'),
  };
})();
