/* 员工端-会员列表 / 会员详情(维护) / 录潜客
   对应 PC: server/web/admin/js/pages/members.js, member-detail.js, potentials.js */
window.Pages.StaffMembers = {
  data() {
    return {
      tab: 'active',
      role: (Store.user || {}).role,
      query: {
        keyword: '',
        coach_id: '',
        card_type_id: '',
        club_id: '',
        expire_within: '',
        quick: '',
      },
      list: [],
      stats: null,
      total: 0,
      loading: false,
      listLoading: false,
      finished: false,
      searched: false,
      page: 1,
      pageSize: 20,
      sources: [],
      coaches: [],
      cardTypes: [],
      clubs: [],
      // 批量选择模式
      batchMode: false,
      selectedIds: [],
      // 新增/编辑会员弹窗
      dlg: false,
      dlgTitle: '新增会员',
      form: {},
      saving: false,
      // 通用下拉选择器
      pickerShow: false,
      pickerType: '',
      pickerCols: [],
      // 维护记录弹窗
      mtDlg: false,
      mtMember: null,
      mtList: [],
      mtLoading: false,
      mtForm: { record_type: 1, content: '' },
      mtSaving: false,
      // 更多操作菜单
      moreShow: false,
      moreRow: null,
      // 黑名单原因弹窗
      blackDlg: false,
      blackRow: null,
      blackReason: '',
      blackSaving: false,
      // 批量分配教练弹窗
      assignDlg: false,
      assignForm: { coach_id: null, coach_name: '' },
      assignSaving: false,
      // 专属完善链接弹窗
      profileLinkDlg: false,
      profileLinkData: { url: '', token: '', vipName: '' },
    };
  },
  computed: {
    canManage() { return ['admin', 'manager'].includes(this.role); },
    canAssign() { return ['admin', 'manager', 'membership'].includes(this.role); },
    canBlack() { return ['admin', 'manager', 'reception'].includes(this.role); },
    quickCells() {
      const s = this.stats || {};
      return [
        { k: 'active', l: '在籍', v: s.active_count || 0 },
        { k: 'today_expire', l: '今日到期', v: s.today_expire || 0 },
        { k: 'expired', l: '已过期', v: s.expired_count || 0 },
        { k: 'month_new', l: '本月新增', v: s.month_new || 0 },
      ];
    },
    quickLabel() {
      const c = this.quickCells.find(x => x.k === this.query.quick);
      return c ? c.l : '';
    },
    hasFilters() {
      const q = this.query;
      return !!(q.keyword || q.coach_id !== '' || q.card_type_id !== '' || q.club_id !== '' || q.expire_within !== '' || q.quick);
    },
    coachOpts() {
      return [{ text: '主教练', value: '' }].concat(this.coaches.map(c => ({ text: c.realname, value: c.id })));
    },
    cardTypeOpts() {
      return [{ text: '持有卡型', value: '' }].concat(this.cardTypes.map(c => ({ text: c.title, value: c.id })));
    },
    clubOpts() {
      return [{ text: '所属门店', value: '' }].concat(this.clubs.map(c => ({ text: c.name, value: c.id })));
    },
    expireOpts() {
      return [
        { text: '到期时间', value: '' },
        { text: '7天内到期', value: 7 },
        { text: '15天内到期', value: 15 },
        { text: '30天内到期', value: 30 },
      ];
    },
    isAllSelected() {
      return this.list.length > 0 && this.list.every(m => this.selectedIds.includes(m.id));
    },
    moreActions() {
      if (!this.moreRow) return [];
      const acts = [
        { name: '专属完善链接 (送70分)', cmd: 'profileLink', color: 'var(--brand)' },
      ];
      if (this.canBlack) {
        acts.push({
          name: this.moreRow.is_black ? '移出黑名单' : '加入黑名单',
          cmd: 'black',
          color: this.moreRow.is_black ? '#07c160' : 'var(--danger)',
        });
      }
      if (this.canManage) {
        acts.push({
          name: '禁用会员',
          subname: '逻辑禁用，保留历史消费与合同数据',
          cmd: 'disable',
          color: 'var(--danger)',
        });
      }
      return acts;
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员列表"></m-nav>',
    '  <van-tabs v-model:active="tab" color="var(--brand)" @change="onTab">',
    '    <van-tab title="在籍会员" name="active"></van-tab>',
    '    <van-tab title="过期召回" name="expired"></van-tab>',
    '    <van-tab title="无卡会员" name="none"></van-tab>',
    '    <van-tab title="全部" name="all"></van-tab>',
    '  </van-tabs>',
    // 四个统计可点下钻
    '  <div class="stat-row tapable" v-if="stats" style="margin:10px 12px 8px">',
    '    <div v-for="c in quickCells" :key="c.k" class="stat-cell tap" :class="{on:query.quick===c.k}" @click="pickQuick(c.k)">',
    '      <div class="v">{{ c.v }}</div><div class="l">{{ c.l }}</div>',
    '    </div>',
    '  </div>',
    '  <van-search v-model="query.keyword" placeholder="姓名 / 昵称 / 手机号" show-action @search="reload" @clear="reload">',
    '    <template #action><div @click="reload" style="color:var(--brand)">搜索</div></template>',
    '  </van-search>',
    '  <van-dropdown-menu style="box-shadow:none">',
    '    <van-dropdown-item v-model="query.coach_id" :options="coachOpts" @change="reload"></van-dropdown-item>',
    '    <van-dropdown-item v-model="query.card_type_id" :options="cardTypeOpts" @change="reload"></van-dropdown-item>',
    '    <van-dropdown-item v-model="query.club_id" :options="clubOpts" @change="reload"></van-dropdown-item>',
    '    <van-dropdown-item v-model="query.expire_within" :options="expireOpts" @change="reload"></van-dropdown-item>',
    '  </van-dropdown-menu>',

    // 统计与工具栏
    '  <div class="flex" style="margin:10px 12px 4px;gap:6px;flex-wrap:wrap">',
    '    <div class="flex1 flex" style="gap:6px;flex-wrap:wrap">',
    '      <van-tag v-if="query.quick" type="primary" round size="medium" closeable @close="pickQuick(query.quick)">{{ quickLabel }}</van-tag>',
    '      <span class="muted">共 <b>{{ total }}</b> 人</span>',
    '      <span v-if="hasFilters" class="brand-text" style="font-size:12px;cursor:pointer" @click="resetFilters">重置</span>',
    '    </div>',
    '    <van-button v-if="canAssign || canManage" size="small" round plain @click="toggleBatchMode">{{ batchMode ? \'完成\' : \'批量\' }}</van-button>',
    '    <van-button size="small" round plain icon="down" @click="exportCsv">导出</van-button>',
    '    <van-button size="small" round type="primary" icon="plus" @click="openAdd">新增会员</van-button>',
    '  </div>',

    // 批量操作栏
    '  <div v-if="batchMode" class="card-box flex" style="margin:6px 12px;padding:10px 12px;gap:8px;background:var(--brand-soft);border:1px solid var(--brand-line)">',
    '    <van-checkbox :model-value="isAllSelected" checked-color="var(--brand)" @click="toggleSelectAll">',
    '      <span style="font-size:13px;font-weight:600">全选 ({{ selectedIds.length }})</span>',
    '    </van-checkbox>',
    '    <div class="flex1"></div>',
    '    <van-button v-if="canAssign" size="mini" round type="primary" plain :disabled="!selectedIds.length" @click="openAssign">批量分配教练</van-button>',
    '    <van-button v-if="canManage" size="mini" round type="danger" plain :disabled="!selectedIds.length" @click="batchDelete">批量删除</van-button>',
    '  </div>',

    '  <div v-if="loading && !list.length" style="text-align:center;padding:40px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <van-list v-model:loading="listLoading" :finished="finished" :finished-text="list.length ? \'没有更多会员了\' : \'\'" :offset="100" @load="loadMore">',
    '    <van-empty v-if="searched && !loading && !list.length" description="没有符合条件的会员"/>',
    '    <div v-for="m in list" :key="m.id" class="rec-item" :class="{black:m.is_black}" @click="onCardClick(m)">',
    '      <div class="flex" style="align-items:flex-start">',
    '        <van-checkbox v-if="batchMode" :model-value="selectedIds.includes(m.id)" checked-color="var(--brand)" style="margin:10px 10px 0 0" @click.stop="toggleSelect(m.id)"/>',
    '        <m-avatar :name="m.realname||m.nickname" :size="44" :style="m.is_black?{background:\'var(--danger)\'}:{}"></m-avatar>',
    '        <div class="flex1" style="margin-left:10px">',
    '          <div class="flex" style="flex-wrap:wrap;gap:4px">',
    '            <span class="name">{{ m.realname || m.nickname || \'未命名\' }}</span>',
    '            <span class="muted">{{ DICT.gender[m.gender] }}<template v-if="m.birthday"> · {{ H.dateOf(m.birthday) }}</template></span>',
    '            <van-tag v-if="m.is_black" type="danger" round>黑名单</van-tag>',
    '            <van-tag v-if="m.label_levels" plain type="primary" round>{{ DICT.labelLv[m.label_levels] }}</van-tag>',
    '            <div class="flex1"></div>',
    '            <d-tag dict="expireStatus" :v="m.expire_status"></d-tag>',
    '          </div>',
    '          <div class="muted mt4">{{ m.phone }}<template v-if="m.club_names"> · {{ m.club_names }}</template></div>',
    '        </div>',
    '      </div>',

    // 持卡与权益数据块
    '      <div style="background:var(--c-bg-2);border-radius:8px;padding:8px 10px;margin-top:10px;font-size:12px">',
    '        <div style="color:var(--c-title);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">',
    '          持有卡：<span v-if="m.card_names">{{ m.card_names }} <span class="muted" style="font-weight:400">({{ m.card_count }}张)</span></span><span v-else class="muted" style="font-weight:400">无卡</span>',
    '        </div>',
    '        <div class="flex" style="flex-wrap:wrap;gap:10px;margin-top:4px;color:var(--c-text-2)">',
    '          <span v-if="m.total_counts > 0">剩余/总次数：<b :style="{color: m.total_left_counts > 0 ? \'var(--brand)\' : \'var(--danger)\'}">{{ m.total_left_counts || 0 }}</b>/{{ m.total_counts }}</span>',
    '          <span v-if="m.remaining_value > 0">剩余价值：<b class="price">¥{{ Number(m.remaining_value).toLocaleString() }}</b></span>',
    '          <span v-if="m.expire_time">最近到期：{{ H.dateOf(m.expire_time) }}</span>',
    '          <span v-if="m.last_open_card_time">开卡：{{ H.dateOf(m.last_open_card_time) }}</span>',
    '        </div>',
    '      </div>',

    // 顾问、主教练与来源信息
    '      <div class="muted mt8" style="display:flex;flex-wrap:wrap;gap:6px">',
    '        <span>会籍顾问：{{ m.membership_name || \'无顾问\' }}</span>',
    '        <span>· 主教练：{{ m.coach_name || \'-\' }}</span>',
    '        <span v-if="m.source_name">· 来源：{{ m.source_name }}</span>',
    '        <span v-if="m.last_sign_time">· 最近签到：{{ H.full(m.last_sign_time) }}</span>',
    '      </div>',

    // 操作按钮区
    '      <div class="foot" style="border-top:1px solid var(--c-line-2);padding-top:10px;margin-top:10px" @click.stop>',
    '        <van-button size="mini" round plain @click="$router.push(\'/staff/member/\'+m.id)">详情</van-button>',
    '        <van-button size="mini" round plain type="primary" @click="openEdit(m)">编辑</van-button>',
    '        <van-button size="mini" round plain type="primary" @click="openMaintain(m)">维护</van-button>',
    '        <van-button size="mini" round plain @click="openMore(m)">更多 <van-icon name="arrow-down" size="10"/></van-button>',
    '      </div>',
    '    </div>',
    '  </van-list>',

    // 新增 / 编辑会员弹层
    '  <van-popup v-model:show="dlg" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:18px 16px 24px;max-height:82vh;overflow-y:auto">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:12px">{{ dlgTitle }}</div>',
    '      <van-field v-model="form.realname" label="姓名" required placeholder="请输入会员真实姓名"/>',
    '      <van-field v-model="form.phone" type="tel" maxlength="11" label="手机号" required :readonly="!!form.id" placeholder="请输入11位手机号"/>',
    '      <van-field v-model="form.nickname" label="昵称" placeholder="选填"/>',
    '      <van-field label="性别">',
    '        <template #input>',
    '          <van-radio-group v-model="form.gender" direction="horizontal">',
    '            <van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio><van-radio :name="0">未知</van-radio>',
    '          </van-radio-group>',
    '        </template>',
    '      </van-field>',
    '      <van-field label="生日">',
    '        <template #input><input type="date" v-model="form.birthday" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text);width:100%"/></template>',
    '      </van-field>',
    '      <van-field v-model="form.id_card_number" label="身份证号" placeholder="选填"/>',
    '      <van-field :model-value="form.source_name || \'-\'" label="来源渠道" readonly is-link @click="openPicker(\'source\')"/>',
    '      <van-field label="意向标签">',
    '        <template #input>',
    '          <van-radio-group v-model="form.label_levels" direction="horizontal">',
    '            <van-radio :name="0">无</van-radio><van-radio :name="1">A 高</van-radio><van-radio :name="2">B 中</van-radio><van-radio :name="3">C 低</van-radio>',
    '          </van-radio-group>',
    '        </template>',
    '      </van-field>',
    '      <van-field :model-value="form.coach_name || \'不指定\'" label="主教练" readonly is-link @click="openPicker(\'coach\')"/>',
    '      <van-field :model-value="form.sub_coach_name || \'不指定\'" label="副教练" readonly is-link @click="openPicker(\'subCoach\')"/>',
    '      <van-field v-model="form.address" label="住址" placeholder="选填"/>',
    '      <van-field v-model="form.remark" type="textarea" rows="2" label="备注" placeholder="选填" :border="false"/>',
    '      <div class="mt12 flex" style="gap:10px">',
    '        <van-button plain round block style="flex:1" @click="dlg=false">取消</van-button>',
    '        <van-button type="primary" round block style="flex:2" :loading="saving" @click="saveMember">保存</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',

    // 维护记录弹层
    '  <van-popup v-model:show="mtDlg" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:18px 16px 24px;max-height:82vh;overflow-y:auto">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:10px">维护记录 · {{ mtMember ? (mtMember.realname || mtMember.phone) : \'\' }}</div>',
    '      <div style="background:var(--c-bg-2);border-radius:10px;padding:10px 12px;margin-bottom:14px">',
    '        <div style="font-size:13px;font-weight:600;margin-bottom:8px">新增跟进/回访记录</div>',
    '        <van-radio-group v-model="mtForm.record_type" direction="horizontal" style="margin-bottom:8px">',
    '          <van-radio :name="1">电话</van-radio><van-radio :name="2">到店</van-radio><van-radio :name="3">微信</van-radio><van-radio :name="4">其他</van-radio>',
    '        </van-radio-group>',
    '        <van-field v-model="mtForm.content" type="textarea" rows="2" placeholder="填写本次维护/回访内容" style="border-radius:8px;padding:8px 10px"/>',
    '        <div class="mt8" style="text-align:right">',
    '          <van-button size="small" type="primary" round :loading="mtSaving" @click="saveMaintain">新增记录</van-button>',
    '        </div>',
    '      </div>',
    '      <div class="sec-title" style="margin:6px 0">历史记录（{{ mtList.length }}）</div>',
    '      <van-loading v-if="mtLoading" size="18" style="text-align:center;padding:20px 0">加载中...</van-loading>',
    '      <van-empty v-else-if="!mtList.length" description="暂无维护记录" image-size="60"/>',
    '      <div v-else style="max-height:40vh;overflow-y:auto">',
    '        <van-cell v-for="r in mtList" :key="r.id" :label="(r.membership_name || \'-\') + \' · \' + H.full(r.insert_time)">',
    '          <template #title><van-tag plain type="primary" style="margin-right:6px">{{ DICT.maintainType[r.record_type] || \'其他\' }}</van-tag><span>{{ r.content }}</span></template>',
    '        </van-cell>',
    '      </div>',
    '    </div>',
    '  </van-popup>',

    // 更多操作菜单
    '  <van-action-sheet v-model:show="moreShow" :title="moreRow ? (moreRow.realname || moreRow.phone) : \'更多操作\'" :actions="moreActions" cancel-text="取消" close-on-click-action @select="onMoreSelect"/>',

    // 加入黑名单弹窗
    '  <van-popup v-model:show="blackDlg" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px" v-if="blackRow">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:6px">加入黑名单 · {{ blackRow.realname || blackRow.phone }}</div>',
    '      <div class="muted" style="margin-bottom:10px">加入黑名单后该会员将无法入场、购卡或预约课程</div>',
    '      <van-field v-model="blackReason" type="textarea" rows="2" label="原因" placeholder="请填写加入黑名单原因" :border="false"/>',
    '      <div class="mt12"><van-button type="danger" block round :loading="blackSaving" @click="confirmAddBlack">确认加入黑名单</van-button></div>',
    '    </div>',
    '  </van-popup>',

    // 批量分配教练弹窗
    '  <van-popup v-model:show="assignDlg" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:6px">批量分配教练</div>',
    '      <div class="muted" style="margin-bottom:12px">将为选中的 <b>{{ selectedIds.length }}</b> 名会员统一设置主教练</div>',
    '      <van-field :model-value="assignForm.coach_name || \'请选择教练\'" label="所属教练" readonly is-link @click="openPicker(\'assignCoach\')"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="assignSaving" @click="doAssign">确认分配</van-button></div>',
    '    </div>',
    '  </van-popup>',

    // 专属完善链接弹窗
    '  <van-popup v-model:show="profileLinkDlg" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px;text-align:center">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:4px">会员专属完善资料链接 (免登录)</div>',
    '      <div class="muted" style="font-size:12px;margin-bottom:14px">会员：{{ profileLinkData.vipName }} · 打开即可完善7项健康档案并最高获得 70 积分</div>',
    '      <div id="staff-members-list-qr" style="display:inline-block;padding:10px;background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.08);margin-bottom:14px;min-width:160px;min-height:160px"></div>',
    '      <div style="margin-bottom:12px;background:var(--c-bg-2);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--c-text-2);word-break:break-all;text-align:left">',
    '        {{ profileLinkData.url }}',
    '      </div>',
    '      <div class="flex" style="gap:10px">',
    '        <van-button plain round block @click="profileLinkDlg=false" style="flex:1">关闭</van-button>',
    '        <van-button type="primary" round block @click="copyProfileLink" style="flex:2">复制链接</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',

    // 通用选择器
    '  <van-popup v-model:show="pickerShow" position="bottom" round>',
    '    <van-picker :columns="pickerCols" @confirm="onPickerConfirm" @cancel="pickerShow=false" confirm-button-text="确定"></van-picker>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    onTab() {
      this.reload();
    },
    pickQuick(k) {
      this.query.quick = this.query.quick === k ? '' : k;
      if (this.query.quick) this.tab = 'all';
      this.reload();
    },
    resetFilters() {
      this.query = { keyword: '', coach_id: '', card_type_id: '', club_id: '', expire_within: '', quick: '' };
      this.reload();
    },
    reload() {
      this.page = 1;
      this.finished = false;
      this.list = [];
      this.selectedIds = [];
      this.fetchPage();
    },
    buildQueryParams(forExport) {
      const q = { status: this.tab };
      if (!forExport) {
        q.page = this.page;
        q.size = this.pageSize;
      }
      if (this.query.keyword && this.query.keyword.trim()) q.keyword = this.query.keyword.trim();
      if (this.query.coach_id !== '') q.coach_id = this.query.coach_id;
      if (this.query.card_type_id !== '') q.card_type_id = this.query.card_type_id;
      if (this.query.club_id !== '') q.club_id = this.query.club_id;
      if (this.query.expire_within !== '') q.expire_within = this.query.expire_within;
      if (this.query.quick) q.quick = this.query.quick;
      return q;
    },
    async fetchPage() {
      if (this.page === 1) this.loading = true;
      try {
        const d = await API.get('/members', this.buildQueryParams(false));
        const rows = d.list || [];
        this.stats = d.stats;
        this.total = d.total || 0;
        this.searched = true;
        this.list = this.page === 1 ? rows : this.list.concat(rows);
        if (this.list.length >= this.total || rows.length < this.pageSize) {
          this.finished = true;
        } else {
          this.page++;
        }
      } catch (e) {
        this.finished = true;
      } finally {
        this.loading = false;
        this.listLoading = false;
      }
    },
    loadMore() {
      if (this.finished || this.loading) return;
      this.fetchPage();
    },
    async loadDicts() {
      try {
        const [sources, coaches, cats, clubs] = await Promise.all([
          API.get('/sources', { silent: true }),
          API.get('/coaches', { status: 1, silent: true }),
          API.get('/card-categories', { silent: true }),
          API.get('/clubs', { silent: true }),
        ]);
        this.sources = sources || [];
        this.coaches = (coaches || []).filter(c => c.status !== 0);
        this.cardTypes = cats || [];
        this.clubs = clubs || [];
      } catch (e) { /* ignore */ }
    },
    onCardClick(m) {
      if (this.batchMode) {
        this.toggleSelect(m.id);
        return;
      }
      this.$router.push('/staff/member/' + m.id);
    },
    toggleBatchMode() {
      this.batchMode = !this.batchMode;
      this.selectedIds = [];
    },
    toggleSelect(id) {
      const idx = this.selectedIds.indexOf(id);
      if (idx === -1) this.selectedIds.push(id);
      else this.selectedIds.splice(idx, 1);
    },
    toggleSelectAll() {
      if (this.isAllSelected) {
        this.selectedIds = [];
      } else {
        this.selectedIds = this.list.map(m => m.id);
      }
    },
    exportCsv() {
      const q = this.buildQueryParams(true);
      q.export = 'csv';
      q.token = Store.token;
      const qs = Object.keys(q).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(q[k])).join('&');
      window.open('/api/members?' + qs);
    },
    openAdd() {
      this.dlgTitle = '新增会员';
      this.form = {
        realname: '', phone: '', nickname: '', gender: 0, birthday: '',
        id_card_number: '', source_id: 0, source_name: '', label_levels: 0,
        coach_id: 0, coach_name: '', sub_coach_id: 0, sub_coach_name: '',
        address: '', remark: '',
      };
      this.dlg = true;
    },
    async openEdit(row) {
      this.dlgTitle = '编辑会员 · ' + (row.realname || row.phone);
      try {
        const d = await API.get('/members/' + row.id);
        const p = d.profile || row;
        this.form = Object.assign({}, p, {
          birthday: p.birthday ? H.dateOf(p.birthday) : '',
        });
      } catch (e) {
        this.form = Object.assign({}, row, {
          birthday: row.birthday ? H.dateOf(row.birthday) : '',
        });
      }
      this.dlg = true;
    },
    openPicker(type) {
      this.pickerType = type;
      if (type === 'source') {
        this.pickerCols = [{ text: '无', value: 0 }].concat(this.sources.map(s => ({ text: s.title, value: s.id })));
      } else if (type === 'coach' || type === 'subCoach') {
        this.pickerCols = [{ text: '不指定', value: 0 }].concat(this.coaches.map(c => ({ text: c.realname, value: c.id })));
      } else if (type === 'assignCoach') {
        this.pickerCols = this.coaches.map(c => ({ text: c.realname, value: c.id }));
      }
      this.pickerShow = true;
    },
    onPickerConfirm({ selectedOptions }) {
      const opt = selectedOptions && selectedOptions[0];
      if (opt) {
        if (this.pickerType === 'source') {
          this.form.source_id = opt.value;
          this.form.source_name = opt.value ? opt.text : '';
        } else if (this.pickerType === 'coach') {
          this.form.coach_id = opt.value;
          this.form.coach_name = opt.value ? opt.text : '';
        } else if (this.pickerType === 'subCoach') {
          this.form.sub_coach_id = opt.value;
          this.form.sub_coach_name = opt.value ? opt.text : '';
        } else if (this.pickerType === 'assignCoach') {
          this.assignForm.coach_id = opt.value;
          this.assignForm.coach_name = opt.text;
        }
      }
      this.pickerShow = false;
    },
    async saveMember() {
      if (!this.form.realname || !this.form.realname.trim()) return vant.showToast('请填写姓名');
      if (!this.form.id && !/^1\d{10}$/.test(this.form.phone || '')) return vant.showToast('请填写正确的11位手机号');
      this.saving = true;
      try {
        if (this.form.id) {
          await API.put('/members/' + this.form.id, this.form);
        } else {
          await API.post('/members', this.form);
        }
        vant.showToast({ message: '保存成功', icon: 'success' });
        this.dlg = false;
        this.reload();
      } finally {
        this.saving = false;
      }
    },
    async openMaintain(row) {
      this.mtMember = row;
      this.mtForm = { record_type: 1, content: '' };
      this.mtList = [];
      this.mtDlg = true;
      this.mtLoading = true;
      try {
        const d = await API.get('/maintain-records', { vip_user_id: row.id, vip_user_type: 1, size: 50 });
        this.mtList = (d && d.list) || [];
      } finally {
        this.mtLoading = false;
      }
    },
    async saveMaintain() {
      if (!this.mtForm.content || !this.mtForm.content.trim()) return vant.showToast('请填写维护内容');
      this.mtSaving = true;
      try {
        await API.post('/maintain-records', {
          vip_user_id: this.mtMember.id,
          vip_user_type: 1,
          record_type: this.mtForm.record_type,
          content: this.mtForm.content.trim(),
        });
        vant.showToast({ message: '已记录', icon: 'success' });
        this.mtForm.content = '';
        const d = await API.get('/maintain-records', { vip_user_id: this.mtMember.id, vip_user_type: 1, size: 50 });
        this.mtList = (d && d.list) || [];
      } finally {
        this.mtSaving = false;
      }
    },
    openMore(row) {
      this.moreRow = row;
      this.moreShow = true;
    },
    onMoreSelect(action) {
      const row = this.moreRow;
      if (!row) return;
      if (action.cmd === 'profileLink') this.openProfileLinkDialog(row);
      else if (action.cmd === 'black') this.toggleBlack(row);
      else if (action.cmd === 'disable') this.disableMember(row);
    },
    async openProfileLinkDialog(row) {
      try {
        const res = await API.get('/members/' + row.id + '/profile-link');
        if (!res) return;
        const fullUrl = window.location.origin + '/m/' + (res.link || res.path);
        this.profileLinkData = {
          url: fullUrl,
          token: res.token,
          vipName: res.vip_name || row.realname || '',
        };
        this.profileLinkDlg = true;
        this.$nextTick(() => {
          const el = document.getElementById('staff-members-list-qr');
          if (el) {
            el.innerHTML = '';
            if (window.QRCode) {
              new QRCode(el, { text: fullUrl, width: 160, height: 160, colorDark: H.color('--brand'), colorLight: '#ffffff' });
            }
          }
        });
      } catch (e) {
        vant.showToast(e.message || '获取专属链接失败');
      }
    },
    async copyProfileLink() {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(this.profileLinkData.url);
        } else {
          const ta = document.createElement('textarea');
          ta.value = this.profileLinkData.url;
          ta.style.position = 'fixed';
          ta.style.top = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        vant.showToast({ message: '专属链接已复制', icon: 'success' });
      } catch (e) {
        vant.showToast('复制失败，请长按文本复制');
      }
    },
    async toggleBlack(row) {
      if (row.is_black) {
        try {
          await vant.showConfirmDialog({
            title: '移出黑名单',
            message: '确定将「' + (row.realname || row.phone) + '」移出黑名单吗？',
            confirmButtonColor: 'var(--brand)',
          });
        } catch (e) { return; }
        await API.post('/members/' + row.id + '/blacklist', { is_black: 0 });
        vant.showToast({ message: '已移出黑名单', icon: 'success' });
        this.reload();
      } else {
        this.blackRow = row;
        this.blackReason = '';
        this.blackDlg = true;
      }
    },
    async confirmAddBlack() {
      if (!this.blackRow) return;
      this.blackSaving = true;
      try {
        await API.post('/members/' + this.blackRow.id + '/blacklist', {
          is_black: 1,
          reason: (this.blackReason || '').trim(),
        });
        this.blackDlg = false;
        vant.showToast({ message: '已加入黑名单', icon: 'success' });
        this.reload();
      } finally {
        this.blackSaving = false;
      }
    },
    async disableMember(row) {
      try {
        await vant.showConfirmDialog({
          title: '禁用会员',
          message: '禁用后「' + (row.realname || row.phone) + '」将从会员列表隐藏、无法登录会员端；历史消费与合同数据全部保留。确定禁用吗？',
          confirmButtonColor: 'var(--danger)',
        });
      } catch (e) { return; }
      await API.post('/members/' + row.id + '/disable', { enable: 0 });
      vant.showToast({ message: '已禁用（历史数据保留）', icon: 'success' });
      this.reload();
    },
    openAssign() {
      if (!this.selectedIds.length) return vant.showToast('请先勾选会员');
      this.assignForm = { coach_id: null, coach_name: '' };
      this.assignDlg = true;
    },
    async doAssign() {
      if (!this.assignForm.coach_id) return vant.showToast('请选择教练');
      this.assignSaving = true;
      try {
        await API.post('/members/assign', {
          ids: this.selectedIds,
          type: 'member',
          coach_id: this.assignForm.coach_id,
          coach_name: this.assignForm.coach_name,
        });
        vant.showToast({ message: '分配成功', icon: 'success' });
        this.assignDlg = false;
        this.batchMode = false;
        this.reload();
      } finally {
        this.assignSaving = false;
      }
    },
    async batchDelete() {
      const n = this.selectedIds.length;
      if (!n) return;
      try {
        await vant.showConfirmDialog({
          title: '批量删除会员',
          message: '确定删除选中的 ' + n + ' 名会员吗？删除后会员不再出现在列表和统计中，也无法登录；历史消费、合同与流水会保留。',
          confirmButtonColor: 'var(--danger)',
        });
      } catch (e) { return; }
      const d = await API.post('/members/batch-disable', { ids: this.selectedIds });
      vant.showToast({ message: '已删除 ' + (d.count || n) + ' 名会员', icon: 'success' });
      this.batchMode = false;
      this.reload();
    },
  },
  mounted() {
    this.reload();
    this.loadDicts();
  },
};

window.Pages.StaffMemberDetail = {
  data() {
    return {
      d: null, loading: true, tab: 0,
      mShow: false, mType: 1, mContent: '', mSaving: false,
      bodyRecords: [], bShow: false, bSaving: false,
      bForm: { record_date: H.today(), height: '', weight: '', body_fat: '', muscle: '', waist: '', remark: '' },
      eShow: false, eSaving: false,
      eForm: { realname: '', gender: 0, birthday: '', initial_weight: '', target_weight: '', constellation_mbti: '', training_frequency: '', studio_feedback: '', target_compare_photos: [] },
      linkShow: false, linkData: { url: '', token: '', vipName: '' },
      trainingPhotos: [],
      photoShow: false, photoSaving: false, photoUploading: false,
      photoForm: { photo_url: '', photo_date: H.today(), remark: '' },
    };
  },
  computed: {
    p() { return this.d && this.d.profile; },
    parsedPhotos() {
      const p = this.p && this.p.target_compare_photos;
      if (!p) return [];
      if (Array.isArray(p)) return p;
      try { return JSON.parse(p); } catch { return []; }
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员详情"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="black-warn" v-if="p.is_black"><van-icon name="warning"/> 黑名单会员{{ p.black_reason ? \'：\'+p.black_reason : \'\' }}</div>',
    '    <div class="card-box">',
    '      <div class="flex">',
    '        <m-avatar :name="p.realname||p.nickname" :size="50"></m-avatar>',
    '        <div class="flex1" style="margin-left:12px">',
    '          <div style="font-size:17px;font-weight:700">{{ p.realname || p.nickname }} <span class="muted" style="font-weight:400">{{ DICT.gender[p.gender] }}</span></div>',
    '          <div class="muted mt4">{{ p.phone }}</div>',
    '        </div>',
    '        <div style="text-align:right">',
    '          <d-tag dict="expireStatus" :v="p.expire_status"></d-tag>',
    '          <div style="margin-top:6px;display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">',
    '            <van-button size="mini" plain round type="warning" @click="openProfileLink">完善链接</van-button>',
    '            <van-button size="mini" plain round type="primary" @click="openEditProfile">编辑资料</van-button>',
    '            <van-button size="mini" plain round icon="photograph" style="color:var(--brand);border-color:var(--brand)" @click="openAddPhoto">+ 风采</van-button>',
    '          </div>',
    '        </div>',
    '      </div>',
    '      <van-divider style="margin:10px 0"/>',
    '      <div class="muted" style="line-height:2">',
    '        来源：{{ p.source_name || \'-\' }} · 意向：{{ DICT.labelLv[p.label_levels] }}<br/>',
    '        业绩归属：{{ p.membership_name || \'-\' }} · 主教练：{{ p.coach_name || \'-\' }}<template v-if="p.sub_coach_name"> · 副教练：{{ p.sub_coach_name }}</template><br/>',
    '        <template v-if="p.birthday">生日：{{ H.dateOf(p.birthday) }} · </template><template v-if="p.constellation_mbti">星座/MBTI：{{ p.constellation_mbti }}<br/></template>',
    '        <template v-if="p.initial_weight != null || p.target_weight != null">初始体重：{{ p.initial_weight != null ? (p.initial_weight+\'kg\') : \'-\' }} · 目标体重：{{ p.target_weight != null ? (p.target_weight+\'kg\') : \'-\' }}<br/></template>',
    '        <template v-if="p.training_frequency">期望频次：{{ p.training_frequency }}<br/></template>',
    '        <template v-if="p.studio_feedback">会馆反馈：{{ p.studio_feedback }}<br/></template>',
    '        <template v-if="parsedPhotos.length">',
    '          <div style="margin-top:4px">',
    '            <span style="font-size:12px">目标对比图：</span>',
    '            <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">',
    '              <van-image v-for="(img, idx) in parsedPhotos" :key="idx" :src="img" width="50" height="50" radius="4" fit="cover" @click="previewImg(idx)" />',
    '            </div>',
    '          </div>',
    '        </template>',
    '        <template v-if="p.expire_time">最近到期：{{ H.dateOf(p.expire_time) }}<br/></template>',
    '        <template v-if="p.remark">备注:{{ p.remark }}<br/></template>',
    '        注册时间：{{ H.full(p.insert_time) }}',
    '      </div>',
    '    </div>',
    '    <div class="sec-title">持卡（{{ (d.cards||[]).length }}）</div>',
    '    <van-empty v-if="!(d.cards||[]).length" description="无持卡" image-size="60"/>',
    '    <div class="card-box" v-else style="padding:2px 8px">',
    '      <van-cell v-for="c in d.cards" :key="c.id" :title="c.card_type_name" :label="H.cardLeft(c)+\' · \'+H.cardExp(c)" is-link @click="$router.push(\'/staff/card/\'+c.id)">',
    '        <template #value><d-tag dict="cardStatus" :v="c.status"></d-tag></template>',
    '      </van-cell>',
    '    </div>',
    '    <div class="sec-title">最近流水</div>',
    '    <div class="card-box" style="padding:6px 4px 10px">',
    '      <van-tabs v-model:active="tab" color="var(--brand)">',
    '        <van-tab :title="\'收款(\'+(d.recharges||[]).length+\')\'">',
    '          <van-empty v-if="!(d.recharges||[]).length" description="暂无收款" image-size="60"/>',
    '          <van-cell v-for="r in (d.recharges||[]).slice(0,10)" :key="r.id" :title="(DICT.rechargeType[r.type]||\'\')+\' · \'+r.card_type_name" :label="H.full(r.insert_time)">',
    '            <template #value><span class="price">{{ H.money(r.actual_money) }}</span></template>',
    '          </van-cell>',
    '        </van-tab>',
    '        <van-tab :title="\'耗卡(\'+(d.spends||[]).length+\')\'">',
    '          <van-empty v-if="!(d.spends||[]).length" description="暂无耗卡" image-size="60"/>',
    '          <van-cell v-for="s in (d.spends||[]).slice(0,10)" :key="s.id" :title="DICT.spendScene[s.scene]+\' · \'+s.card_type_name" :label="H.full(s.insert_time)">',
    '            <template #value>{{ H.money(s.spend_money) }}</template>',
    '          </van-cell>',
    '        </van-tab>',
    '        <van-tab :title="\'签到(\'+(d.checkins||[]).length+\')\'">',
    '          <van-empty v-if="!(d.checkins||[]).length" description="暂无签到" image-size="60"/>',
    '          <van-cell v-for="c in (d.checkins||[]).slice(0,10)" :key="c.id" :title="H.dt(c.check_in_time)" :label="c.card_type_name" />',
    '        </van-tab>',
    '      </van-tabs>',
    '    </div>',
    '    <div class="sec-title">维护记录（{{ (d.maintains||[]).length }}）<span class="more brand-text" @click="mShow=true"><van-icon name="add-o"/> 新增维护</span></div>',
    '    <van-empty v-if="!(d.maintains||[]).length" description="暂无维护记录" image-size="60"/>',
    '    <div v-else class="card-box" style="padding:2px 8px">',
    '      <van-cell v-for="m in (d.maintains||[]).slice(0,10)" :key="m.id" :label="(m.membership_name||\'\')+\' · \'+H.full(m.insert_time)">',
    '        <template #title><van-tag plain type="primary">{{ DICT.maintainType[m.record_type]||\'其他\' }}</van-tag> <span style="font-size:14px">{{ m.content }}</span></template>',
    '      </van-cell>',
    '    </div>',

    '    <div class="sec-title">体测数据（{{ bodyRecords.length }}）<span class="more brand-text" @click="openBody"><van-icon name="add-o"/> 录入</span></div>',
    '    <van-empty v-if="!bodyRecords.length" description="暂无体测记录" image-size="60"/>',
    '    <div v-else class="card-box" style="padding:2px 8px">',
    '      <van-cell v-for="b in bodyRecords" :key="b.id" :title="H.dateOf(b.record_date)" :label="(b.remark||\'\')+(b.coach_name?(b.remark?\' · \':\'\')+b.coach_name+\' 录入\':\'\')">',
    '        <template #value><span style="font-size:13px">体重 <b>{{ b.weight!=null?H.num(b.weight):\'-\' }}</b>kg · 体脂 <b>{{ b.body_fat!=null?H.num(b.body_fat):\'-\' }}</b>%</span></template>',
    '      </van-cell>',
    '    </div>',
    '    <div class="sec-title">训练风采（{{ trainingPhotos.length }}）<span class="more brand-text" @click="openAddPhoto"><van-icon name="photograph"/> 添加风采</span></div>',
    '    <van-empty v-if="!trainingPhotos.length" description="暂无训练风采照片" image-size="60">',
    '      <template #bottom>',
    '        <van-button size="small" round type="primary" icon="photograph" @click="openAddPhoto" style="margin-top:8px">上传训练风采照片</van-button>',
    '      </template>',
    '    </van-empty>',
    '    <div v-else class="card-box" style="padding:12px">',
    '      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch">',
    '        <div @click="openAddPhoto" style="flex-shrink:0;width:84px;height:84px;border:1.5px dashed var(--brand);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--brand-soft);color:var(--brand);cursor:pointer">',
    '          <van-icon name="plus" size="20"/>',
    '          <span style="font-size:11px;font-weight:600;margin-top:3px">添加风采</span>',
    '        </div>',
    '        <div v-for="(p, idx) in trainingPhotos" :key="p.id" style="flex-shrink:0;width:84px;position:relative" @click="previewTrainingPhoto(idx)">',
    '          <van-image :src="p.photo_url" width="84" height="84" radius="8" fit="cover" style="box-shadow:0 1px 4px rgba(0,0,0,0.08)"/>',
    '          <div @click.stop="delTrainingPhoto(p)" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.55);color:#fff;border-radius:50%;width:18px;height:18px;line-height:17px;text-align:center;font-size:12px;cursor:pointer">×</div>',
    '          <div class="muted" style="font-size:11px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">{{ p.remark || H.dateOf(p.photo_date) }}</div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </template>',
    '  <van-popup v-model:show="bShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">录入体测数据</div>',
    '      <van-field label="日期">',
    '        <template #input><input type="date" v-model="bForm.record_date" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text)"/></template>',
    '      </van-field>',
    '      <van-field v-model="bForm.height" type="number" label="身高(cm)" placeholder="如 165"/>',
    '      <van-field v-model="bForm.weight" type="number" label="体重(kg)" placeholder="如 52.5"/>',
    '      <van-field v-model="bForm.body_fat" type="number" label="体脂率(%)" placeholder="如 24.1"/>',
    '      <van-field v-model="bForm.muscle" type="number" label="肌肉量(kg)" placeholder="选填"/>',
    '      <van-field v-model="bForm.waist" type="number" label="腰围(cm)" placeholder="选填"/>',
    '      <van-field v-model="bForm.remark" label="备注" placeholder="选填" :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="bSaving" @click="saveBody">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="mShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">新增维护记录</div>',
    '      <van-field label="方式">',
    '        <template #input>',
    '          <van-radio-group v-model="mType" direction="horizontal">',
    '            <van-radio :name="1">电话</van-radio><van-radio :name="2">到店</van-radio><van-radio :name="3">微信</van-radio><van-radio :name="4">其他</van-radio>',
    '          </van-radio-group>',
    '        </template>',
    '      </van-field>',
    '      <van-field v-model="mContent" type="textarea" rows="3" label="内容" placeholder="沟通内容 / 跟进要点" maxlength="200" show-word-limit/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="mSaving" @click="saveMaintain">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="eShow" position="bottom" round safe-area-inset-bottom style="max-height:85vh">',
    '    <div style="padding:18px 16px 24px;overflow-y:auto;max-height:80vh">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:var(--c-title)">编辑会员资料</div>',
    '      <van-field v-model="eForm.realname" label="姓名" placeholder="真实姓名"/>',
    '      <van-field label="性别">',
    '        <template #input>',
    '          <van-radio-group v-model="eForm.gender" direction="horizontal">',
    '            <van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio><van-radio :name="0">未知</van-radio>',
    '          </van-radio-group>',
    '        </template>',
    '      </van-field>',
    '      <van-field label="生日">',
    '        <template #input><input type="date" v-model="eForm.birthday" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text)"/></template>',
    '      </van-field>',
    '      <van-field v-model="eForm.initial_weight" type="number" label="初始体重(kg)" placeholder="如 70.5"/>',
    '      <van-field v-model="eForm.target_weight" type="number" label="目标体重(kg)" placeholder="如 62.0"/>',
    '      <van-field v-model="eForm.constellation_mbti" label="星座/MBTI" placeholder="如 天蝎座 / INTJ"/>',
    '      <van-field v-model="eForm.training_frequency" label="训练频次" placeholder="如 每周3-4次"/>',
    '      <van-field v-model="eForm.studio_feedback" type="textarea" rows="2" label="会馆反馈" placeholder="对场馆/课程/教练的建议与反馈"/>',
    '      <div style="padding:10px 16px 4px">',
    '        <div style="font-size:14px;color:var(--c-text-2);margin-bottom:8px">目标对比图</div>',
    '        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">',
    '          <div v-for="(img, idx) in eForm.target_compare_photos" :key="idx" style="position:relative;width:56px;height:56px;border-radius:6px;overflow:hidden;border:1px solid var(--c-line)">',
    '            <van-image :src="img" width="56" height="56" fit="cover"/>',
    '            <div @click="removeEditPhoto(idx)" style="position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);color:#fff;width:18px;height:18px;line-height:18px;text-align:center;font-size:12px">×</div>',
    '          </div>',
    '          <van-uploader :after-read="afterReadPhoto" accept="image/*" max-count="9">',
    '            <div style="width:56px;height:56px;border:1px dashed var(--c-text-4);border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--c-text-3)">',
    '              <van-icon name="plus" size="18"/><span style="font-size:10px;margin-top:2px">上传</span>',
    '            </div>',
    '          </van-uploader>',
    '        </div>',
    '      </div>',
    '      <div class="mt12"><van-button type="primary" block round :loading="eSaving" @click="saveProfile">保存资料</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="linkShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px;text-align:center">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:4px">专属资料完善链接 (免登录)</div>',
    '      <div class="muted" style="font-size:12px;margin-bottom:14px">学员：{{ linkData.vipName }} · 打开即送最高 70 积分</div>',
    '      <div id="staff-member-profile-qr" style="display:inline-block;padding:10px;background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.08);margin-bottom:14px;min-width:160px;min-height:160px"></div>',
    '      <div style="margin-bottom:12px;background:var(--c-bg-2);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--c-text-2);word-break:break-all;text-align:left">',
    '        {{ linkData.url }}',
    '      </div>',
    '      <div style="display:flex;gap:10px">',
    '        <van-button plain round block @click="linkShow=false" style="flex:1">关闭</van-button>',
    '        <van-button type="primary" round block @click="copyLink" style="flex:2;background:var(--brand);border-color:var(--brand)">复制链接</van-button>',
    '      </div>',
    '      <div class="muted" style="font-size:11px;margin-top:12px;line-height:1.5">',
    '        可将链接复制后直接在微信中发送给学员，学员无需输入密码即可直接进入完善档案。',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '  <!-- 上传训练风采弹层 -->',
    '  <van-popup v-model:show="photoShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 28px">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:4px;color:var(--c-title)">添加训练风采照片</div>',
    '      <div class="muted" style="font-size:12px;margin-bottom:14px">学员：{{ p ? (p.realname || p.nickname) : \'\' }} · 照片将同步展示于学员端「训练风采」相册</div>',
    '      <van-field label="拍摄日期">',
    '        <template #input><input type="date" v-model="photoForm.photo_date" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text)"/></template>',
    '      </van-field>',
    '      <div style="padding:12px 16px 4px">',
    '        <div style="font-size:14px;color:var(--c-text-2);margin-bottom:8px">照片 <span style="color:var(--danger)">*</span></div>',
    '        <div v-if="photoForm.photo_url" style="position:relative;display:inline-block;width:100px;height:100px;border-radius:8px;overflow:hidden;border:1px solid var(--c-line)">',
    '          <van-image :src="photoForm.photo_url" width="100" height="100" fit="cover"/>',
    '          <div @click="photoForm.photo_url=\'\'" style="position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);color:#fff;width:22px;height:22px;line-height:20px;text-align:center;font-size:14px;cursor:pointer">×</div>',
    '        </div>',
    '        <van-uploader v-else :after-read="afterReadTrainingPhoto" accept="image/*" :max-size="20 * 1024 * 1024" @oversize="vant.showToast(\'图片不能超过20MB\')">',
    '          <div style="width:100px;height:100px;border:1.5px dashed var(--brand);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--brand);background:var(--brand-soft)">',
    '            <van-icon name="photograph" size="28"/>',
    '            <span style="font-size:11px;font-weight:600;margin-top:4px">{{ photoUploading ? \'上传中...\' : \'选择照片\' }}</span>',
    '          </div>',
    '        </van-uploader>',
    '      </div>',
    '      <van-field v-model="photoForm.remark" label="心得/备注" placeholder="如：深蹲姿势进步显著 / 训练打卡记录" maxlength="50" show-word-limit/>',
    '      <div class="mt16" style="display:flex;gap:10px">',
    '        <van-button plain round block @click="photoShow=false" style="flex:1">取消</van-button>',
    '        <van-button type="primary" round block :loading="photoSaving" @click="saveTrainingPhoto" style="flex:2">保存风采</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await API.get('/members/' + this.$route.params.id); }
      finally { this.loading = false; }
      this.loadBody();
      this.loadTrainingPhotos();
    },
    async loadBody() {
      try { this.bodyRecords = (await API.get('/body-records?vip_id=' + this.$route.params.id, { silent: true })) || []; }
      catch (e) { /* ignore */ }
    },
    openBody() {
      this.bForm = { record_date: H.today(), height: '', weight: '', body_fat: '', muscle: '', waist: '', remark: '' };
      this.bShow = true;
    },
    async saveBody() {
      if (!this.bForm.record_date) return vant.showToast('请选择日期');
      if (!this.bForm.weight && !this.bForm.body_fat) return vant.showToast('请至少填写体重或体脂率');
      this.bSaving = true;
      try {
        await API.post('/body-records', {
          vip_id: Number(this.$route.params.id),
          record_date: this.bForm.record_date,
          height: this.bForm.height === '' ? null : Number(this.bForm.height),
          weight: this.bForm.weight === '' ? null : Number(this.bForm.weight),
          body_fat: this.bForm.body_fat === '' ? null : Number(this.bForm.body_fat),
          muscle: this.bForm.muscle === '' ? null : Number(this.bForm.muscle),
          waist: this.bForm.waist === '' ? null : Number(this.bForm.waist),
          remark: this.bForm.remark,
        });
        this.bShow = false;
        vant.showToast({ message: '已录入', icon: 'success' });
        this.loadBody();
      } finally { this.bSaving = false; }
    },
    async saveMaintain() {
      if (!this.mContent.trim()) return vant.showToast('请填写维护内容');
      this.mSaving = true;
      try {
        await API.post('/maintain-records', { vip_user_id: this.p.id, vip_user_type: 1, record_type: this.mType, content: this.mContent.trim() });
        this.mShow = false; this.mContent = '';
        vant.showToast({ message: '已保存', icon: 'success' });
        this.load();
      } finally { this.mSaving = false; }
    },
    previewImg(idx) {
      vant.showImagePreview({ images: this.parsedPhotos, startPosition: idx });
    },
    openEditProfile() {
      const p = this.p || {};
      let photos = [];
      if (Array.isArray(p.target_compare_photos)) photos = [...p.target_compare_photos];
      else if (typeof p.target_compare_photos === 'string') {
        try { photos = JSON.parse(p.target_compare_photos); } catch { photos = []; }
      }
      this.eForm = {
        realname: p.realname || '',
        gender: p.gender || 0,
        birthday: p.birthday ? H.dateOf(p.birthday) : '',
        initial_weight: p.initial_weight != null ? p.initial_weight : '',
        target_weight: p.target_weight != null ? p.target_weight : '',
        constellation_mbti: p.constellation_mbti || '',
        training_frequency: p.training_frequency || '',
        studio_feedback: p.studio_feedback || '',
        target_compare_photos: photos,
      };
      this.eShow = true;
    },
    async afterReadPhoto(file) {
      try {
        const url = await API.upload(file.file);
        this.eForm.target_compare_photos.push(url);
        vant.showToast({ message: '已上传', icon: 'success' });
      } catch (e) {
        vant.showToast(e.message || '上传失败');
      }
    },
    removeEditPhoto(idx) {
      this.eForm.target_compare_photos.splice(idx, 1);
    },
    async saveProfile() {
      if (!this.eForm.realname.trim()) return vant.showToast('请填写姓名');
      this.eSaving = true;
      try {
        const body = {
          ...this.p,
          realname: this.eForm.realname.trim(),
          gender: this.eForm.gender,
          birthday: this.eForm.birthday || null,
          initial_weight: this.eForm.initial_weight === '' ? null : Number(this.eForm.initial_weight),
          target_weight: this.eForm.target_weight === '' ? null : Number(this.eForm.target_weight),
          constellation_mbti: this.eForm.constellation_mbti.trim() || null,
          training_frequency: this.eForm.training_frequency.trim() || null,
          studio_feedback: this.eForm.studio_feedback.trim() || null,
          target_compare_photos: this.eForm.target_compare_photos,
        };
        await API.put('/members/' + this.p.id, body);
        vant.showToast({ message: '资料已更新', icon: 'success' });
        this.eShow = false;
        this.load();
      } finally { this.eSaving = false; }
    },
    async openProfileLink() {
      try {
        const res = await API.get('/members/' + this.$route.params.id + '/profile-link');
        if (!res) return;
        const fullUrl = window.location.origin + '/m/' + (res.link || res.path);
        this.linkData = {
          url: fullUrl,
          token: res.token,
          vipName: res.vip_name || this.p.realname || '',
        };
        this.linkShow = true;
        this.$nextTick(() => {
          const el = document.getElementById('staff-member-profile-qr');
          if (el) {
            el.innerHTML = '';
            if (window.QRCode) {
              new QRCode(el, { text: fullUrl, width: 160, height: 160, colorDark: H.color('--brand'), colorLight: '#ffffff' });
            }
          }
        });
      } catch (e) {
        vant.showToast(e.message || '获取专属链接失败');
      }
    },
    async copyLink() {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(this.linkData.url);
        } else {
          const ta = document.createElement('textarea');
          ta.value = this.linkData.url;
          ta.style.position = 'fixed';
          ta.style.top = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        vant.showToast({ message: '链接已复制到剪贴板', icon: 'success' });
      } catch (e) {
        vant.showToast('复制失败，请长按文本复制');
      }
    },
    async loadTrainingPhotos() {
      try {
        this.trainingPhotos = (await API.get('/members/' + this.$route.params.id + '/training-photos', { silent: true })) || [];
      } catch (e) {
        this.trainingPhotos = [];
      }
    },
    previewTrainingPhoto(idx) {
      vant.showImagePreview({ images: this.trainingPhotos.map(p => p.photo_url), startPosition: idx, closeable: true });
    },
    openAddPhoto() {
      this.photoForm = { photo_url: '', photo_date: H.today(), remark: '' };
      this.photoUploading = false;
      this.photoShow = true;
    },
    async afterReadTrainingPhoto(file) {
      this.photoUploading = true;
      try {
        const url = await API.upload(file.file);
        this.photoForm.photo_url = url;
        vant.showToast({ message: '照片已上传', icon: 'success' });
      } catch (e) {
        vant.showToast(e.message || '照片上传失败');
      } finally {
        this.photoUploading = false;
      }
    },
    async saveTrainingPhoto() {
      if (!this.photoForm.photo_url) return vant.showToast('请先选择照片上传');
      this.photoSaving = true;
      try {
        await API.post('/members/' + this.$route.params.id + '/training-photos', {
          photo_url: this.photoForm.photo_url,
          photo_date: this.photoForm.photo_date || H.today(),
          remark: this.photoForm.remark ? this.photoForm.remark.trim() : null,
        });
        vant.showToast({ message: '训练风采已添加', icon: 'success' });
        this.photoShow = false;
        this.loadTrainingPhotos();
      } catch (e) {
        vant.showToast(e.message || '保存失败');
      } finally {
        this.photoSaving = false;
      }
    },
    delTrainingPhoto(p) {
      vant.showConfirmDialog({
        title: '删除训练风采',
        message: '确定要删除这张训练风采照片吗？',
      }).then(async () => {
        try {
          await API.del('/members/' + this.$route.params.id + '/training-photos/' + p.id);
          vant.showToast({ message: '已删除', icon: 'success' });
          this.loadTrainingPhotos();
        } catch (e) {
          vant.showToast(e.message || '删除失败');
        }
      }).catch(() => {});
    },
  },
  mounted() { this.load(); },
};

window.Pages.StaffPotential = {
  data() {
    return {
      form: { realname: '', phone: '', gender: 1, source_id: 0, source_name: '', label_levels: 1, remark: '' },
      sources: [], srcShow: false, saving: false,
    };
  },
  computed: { srcCols() { return this.sources.map(s => ({ text: s.title, value: s.id })); } },
  template: [
    '<div class="page">',
    '  <m-nav title="录入潜客"></m-nav>',
    '  <div class="card-box" style="padding:6px 0">',
    '    <van-field v-model="form.realname" label="姓名" placeholder="潜客姓名" />',
    '    <van-field v-model="form.phone" type="tel" maxlength="11" label="手机号" placeholder="11位手机号" />',
    '    <van-field label="性别">',
    '      <template #input><van-radio-group v-model="form.gender" direction="horizontal"><van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio></van-radio-group></template>',
    '    </van-field>',
    '    <van-field :model-value="form.source_name" label="来源" placeholder="选择来源渠道" readonly is-link @click="srcShow=true"/>',
    '    <van-field label="意向等级">',
    '      <template #input>',
    '        <van-radio-group v-model="form.label_levels" direction="horizontal">',
    '          <van-radio :name="1">A 高</van-radio><van-radio :name="2">B 中</van-radio><van-radio :name="3">C 低</van-radio>',
    '        </van-radio-group>',
    '      </template>',
    '    </van-field>',
    '    <van-field v-model="form.remark" type="textarea" rows="2" label="备注" placeholder="需求 / 训练目标 / 跟进要点" :border="false"/>',
    '  </div>',
    '  <div style="margin:20px 16px">',
    '    <van-button type="primary" block round :loading="saving" @click="save">保存潜客</van-button>',
    '  </div>',
    '  <van-popup v-model:show="srcShow" position="bottom" round><van-picker :columns="srcCols" @confirm="onSrc" @cancel="srcShow=false" confirm-button-text="确定"/></van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    onSrc(v) { this.form.source_id = v.selectedOptions[0].value; this.form.source_name = v.selectedOptions[0].text; this.srcShow = false; },
    async save() {
      if (!this.form.realname) return vant.showToast('请填写姓名');
      if (!/^1\d{10}$/.test(this.form.phone)) return vant.showToast('请输入正确的手机号');
      this.saving = true;
      try {
        await API.post('/potentials', this.form);
        vant.showToast({ message: '潜客已录入', icon: 'success' });
        this.form = { realname: '', phone: '', gender: 1, source_id: 0, source_name: '', label_levels: 1, remark: '' };
      } finally { this.saving = false; }
    },
  },
  async mounted() {
    try { this.sources = await API.get('/sources', { silent: true }); } catch (e) { /* ignore */ }
  },
};
