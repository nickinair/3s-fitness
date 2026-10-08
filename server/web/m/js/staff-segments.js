/* 员工端-会员分群名单 (课时不足 / 本周生日 / 满N次 / 期卡)
 * 路由: /staff/segment/:key   数据: GET /member-segments/:key
 * 权限由后端把关: 教练只返回名下会员, 管理员返回全部。
 */
(function () {
  window.Pages.StaffSegment = {
    data() {
      return {
        key: '', title: '', desc: '', sortable: false, sort: '',
        list: [], total: 0, p: 1, size: 20, loading: false, finished: false, first: true,
      };
    },
    computed: {
      // 每个分群在列表右侧展示的关键指标
      metric() {
        return {
          low_lesson: m => ({ v: m.left_total, u: '节', label: '剩余' }),
          trained_10: m => ({ v: m.trained, u: '次', label: '累计训练' }),
          trained_20: m => ({ v: m.trained, u: '次', label: '累计训练' }),
          birthday_week: m => ({ v: H.date ? H.date(m.birthday).slice(5) : String(m.birthday || '').slice(5, 10), u: '', label: '生日' }),
          timecard_active: m => ({ v: m.tc_active, u: '张', label: '有效期卡' }),
          timecard_expired: m => ({ v: m.tc_expired, u: '张', label: '已过期' }),
        }[this.key] || (m => ({ v: m.trained, u: '次', label: '累计训练' }));
      },
      sortText() { return this.sort === 'desc' ? '从多到少' : '从少到多'; },
      // 期卡面板支持直接新增(走快速开卡), 仅有开卡权限的角色可见
      canAddCard() {
        return this.key.startsWith('timecard_')
          && ['admin', 'manager', 'membership', 'reception'].includes((Store.user || {}).role);
      },
    },
    template: [
      '<div class="page">',
      '  <m-nav :title="title || \'会员名单\'"></m-nav>',
      '  <div class="seg-bar">',
      '    <div class="flex1">',
      '      <span style="font-weight:600">共 {{ total }} 人</span>',
      '      <span class="muted" style="font-size:12px;margin-left:8px">{{ desc }}</span>',
      '    </div>',
      '    <div v-if="canAddCard" class="seg-sort" style="margin-right:8px" @click="$router.push(\'/staff/opencard\')">',
      '      <van-icon name="plus" size="14"/> 新增期卡',
      '    </div>',
      '    <div v-if="sortable" class="seg-sort" @click="toggleSort">',
      '      <van-icon :name="sort===\'desc\' ? \'sort\' : \'sort\'" size="14"/> {{ sortText }}',
      '    </div>',
      '  </div>',
      '  <div v-if="first && loading" style="text-align:center;padding:50px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
      '  <van-empty v-else-if="!list.length" description="暂无符合条件的会员"/>',
      '  <van-list v-else v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="load">',
      '    <div class="card-box" style="padding:2px 8px">',
      '      <van-cell v-for="m in list" :key="m.id" is-link center @click="$router.push(\'/staff/member/\'+m.id)">',
      '        <template #icon><m-avatar :name="m.realname||m.nickname" :size="42" style="margin-right:10px"></m-avatar></template>',
      '        <template #title>',
      '          <span style="font-weight:600">{{ m.realname || m.nickname || \'未命名\' }}</span>',
      '          <span class="muted" style="font-size:12px;margin-left:6px">{{ m.phone }}</span>',
      '        </template>',
      '        <template #label>',
      '          <span class="muted" style="font-size:12px">主教练: {{ m.coach_name || \'未指定\' }}</span>',
      '        </template>',
      '        <template #value>',
      '          <div class="seg-metric">',
      '            <div class="mv" :class="{warn: key===\'low_lesson\'}">{{ metric(m).v }}<span class="mu">{{ metric(m).u }}</span></div>',
      '            <div class="ml">{{ metric(m).label }}</div>',
      '          </div>',
      '        </template>',
      '      </van-cell>',
      '    </div>',
      '  </van-list>',
      '</div>',
    ].join('\n'),
    methods: {
      async load() {
        if (this.finished && !this.first) return;
        this.loading = true;
        try {
          const qs = `page=${this.p}&size=${this.size}` + (this.sort ? `&sort=${this.sort}` : '');
          const d = await API.get(`/member-segments/${this.key}?${qs}`);
          this.title = d.title; this.desc = d.desc; this.sortable = d.sortable; this.total = d.total;
          this.list = this.p === 1 ? d.list : this.list.concat(d.list);
          this.finished = this.list.length >= d.total;
          this.p += 1;
        } catch (e) { this.finished = true; } finally { this.loading = false; this.first = false; }
      },
      reload() { this.p = 1; this.list = []; this.finished = false; this.first = true; this.load(); },
      toggleSort() { this.sort = this.sort === 'desc' ? 'asc' : 'desc'; this.reload(); },
    },
    mounted() {
      this.key = this.$route.params.key;
      this.sort = this.$route.query.sort || '';
      this.load();
    },
  };
})();
