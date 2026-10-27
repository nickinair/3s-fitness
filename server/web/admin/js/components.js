/* 共享组件 */
(function () {
  window.AppComponents = {};

  /* ECharts 容器 */
  window.AppComponents.VChart = {
    name: 'VChart',
    props: { option: { type: Object, default: null }, height: { type: String, default: '300px' } },
    template: '<div :style="{ height: height, width: \'100%\' }" ref="el"></div>',
    watch: { option: { deep: true, handler() { this.render(); } } },
    mounted() {
      this.initChart();
      this._onResize = () => this.chart && this.chart.resize();
      window.addEventListener('resize', this._onResize);
      this._onTheme = () => this.initChart(); // 主题切换后按新主题重建
      window.addEventListener('fit-theme-change', this._onTheme);
    },
    beforeUnmount() {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('fit-theme-change', this._onTheme);
      if (this.chart) { this.chart.dispose(); this.chart = null; }
    },
    methods: {
      initChart() {
        if (this.chart) this.chart.dispose();
        const dark = document.documentElement.classList.contains('dark');
        this.chart = echarts.init(this.$refs.el, dark ? 'dark' : null);
        this.render();
      },
      render() {
        if (this.chart && this.option) {
          // 没指定 color 的图表(如饼图)默认用灰阶调色板, 不用 ECharts 自带彩色
          this.chart.setOption(Object.assign({ backgroundColor: 'transparent', color: themePalette() }, this.option), true);
        }
      },
    },
  };

  /* 字典标签 */
  window.AppComponents.DictTag = {
    name: 'DictTag',
    props: { dict: String, value: [Number, String], size: { type: String, default: 'small' } },
    computed: {
      label() {
        const m = window.DICT[this.dict] || {};
        return m[this.value] != null ? m[this.value] : (this.value == null ? '-' : String(this.value));
      },
      type() {
        const m = window.DICT[this.dict + 'Tag'] || {};
        return m[this.value] || 'info';
      },
    },
    template: '<el-tag :type="type" :size="size" disable-transitions>{{ label }}</el-tag>',
  };

  /* 会员远程搜索下拉 */
  window.AppComponents.MemberSelect = {
    name: 'MemberSelect',
    props: {
      modelValue: [Number, String],
      placeholder: { type: String, default: '姓名/手机号搜索会员' },
      initial: { type: Object, default: null }, // 编辑回显: {id, realname, phone}
    },
    emits: ['update:modelValue', 'select'],
    data() { return { options: this.initial ? [this.initial] : [], loading: false }; },
    watch: { initial(v) { if (v && !this.options.find(x => x.id === v.id)) this.options = [v]; } },
    template: [
      '<el-select :model-value="modelValue" filterable remote clearable :remote-method="search" :loading="loading"',
      ' :placeholder="placeholder" style="width: 100%" @update:model-value="onChange">',
      '  <el-option v-for="m in options" :key="m.id" :value="m.id" :label="m.realname + \' \' + m.phone" />',
      '</el-select>',
    ].join(''),
    methods: {
      async search(kw) {
        if (!kw) { this.options = []; return; }
        this.loading = true;
        try {
          const d = await api.get('/members', { keyword: kw, size: 20, status: 'all' });
          this.options = d.list || [];
        } finally { this.loading = false; }
      },
      onChange(v) {
        this.$emit('update:modelValue', v);
        const m = this.options.find(x => x.id === v);
        this.$emit('select', m || null);
      },
    },
  };
})();

/* 报表门店选择器: admin 可切换 全部/各门店; 非 admin 不渲染(后端固定本店口径) */
window.AppComponents.ClubPicker = {
  name: 'ClubPicker',
  props: { modelValue: { type: [String, Number], default: 'all' } },
  emits: ['update:modelValue', 'change'],
  data() { return { clubs: [], isAdmin: ((Auth.getUser() || {}).role === 'admin') }; },
  template: `
    <el-select v-if="isAdmin" :model-value="modelValue" style="width:150px" @update:modelValue="v => { $emit('update:modelValue', v); $emit('change', v); }">
      <template #prefix><el-icon><OfficeBuilding /></el-icon></template>
      <el-option value="all" label="全部门店" />
      <el-option v-for="c in clubs" :key="c.id" :value="c.id" :label="c.name" />
    </el-select>
    <el-tag v-else type="info" effect="plain">本店口径</el-tag>`,
  async created() { if (this.isAdmin) { try { this.clubs = await api.get('/clubs'); } catch (e) {} } },
};

/* 报表门店默认值: 跟随顶栏门店选择(admin), 未选=全部门店 */
window.clubDefault = function () { const v = Auth.getClubId(); return v && v !== 'all' ? Number(v) : 'all'; };
